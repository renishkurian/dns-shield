"""
UDP forwarder — forwards DNS requests to Unbound (or any upstream resolver).
Uses a thread-local socket pool to avoid contention.
"""
import ipaddress
import socket
import struct
import threading
import logging
import time
import dnslib

logger = logging.getLogger('dns_proxy')

_local = threading.local()

UDP_TIMEOUT = 5.0
TCP_TIMEOUT = 5.0


def _family(host: str) -> int:
    try:
        return socket.AF_INET6 if ipaddress.ip_address(host).version == 6 else socket.AF_INET
    except ValueError:
        return socket.AF_INET


def _get_socket(host: str, port: int) -> socket.socket:
    key = f'{host}:{port}'.replace(':', '_').replace('.', '_')
    sock = getattr(_local, key, None)
    if sock is None:
        sock = socket.socket(_family(host), socket.SOCK_DGRAM)
        sock.settimeout(UDP_TIMEOUT)
        setattr(_local, key, sock)
    return sock


def _recv_exact(sock: socket.socket, n: int) -> bytes:
    buf = b''
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError('upstream closed TCP connection')
        buf += chunk
    return buf


def _forward_tcp(data: bytes, host: str, port: int) -> bytes:
    """RFC 7766 DNS-over-TCP exchange (2-byte length prefix)."""
    with socket.socket(_family(host), socket.SOCK_STREAM) as sock:
        sock.settimeout(TCP_TIMEOUT)
        sock.connect((host, port))
        sock.sendall(struct.pack('!H', len(data)) + data)
        (length,) = struct.unpack('!H', _recv_exact(sock, 2))
        return _recv_exact(sock, length)


def forward(request: dnslib.DNSRecord, host: str, port: int) -> dnslib.DNSRecord:
    """Forward a DNS request to upstream (UDP, retrying over TCP if truncated)."""
    data = request.pack()
    sock = _get_socket(host, port)
    try:
        sock.sendto(data, (host, port))
        # Discard stale/mismatched datagrams left over from earlier timeouts.
        deadline = time.monotonic() + UDP_TIMEOUT
        while True:
            response_data, _ = sock.recvfrom(4096)
            if len(response_data) >= 2 and response_data[:2] == data[:2]:
                break
            if time.monotonic() > deadline:
                raise socket.timeout()
        reply = dnslib.DNSRecord.parse(response_data)
        if reply.header.tc:
            try:
                reply = dnslib.DNSRecord.parse(_forward_tcp(data, host, port))
            except Exception as exc:
                logger.warning(f"TCP retry failed for {request.q.qname}: {exc}")
        return reply
    except socket.timeout:
        logger.warning(f"Upstream DNS timeout for {request.q.qname}")
        reply = request.reply()
        reply.header.rcode = dnslib.RCODE.SERVFAIL
        return reply
    except Exception as exc:
        logger.error(f"Forward error: {exc}")
        reply = request.reply()
        reply.header.rcode = dnslib.RCODE.SERVFAIL
        return reply


def resolve_cnames(domain: str, host: str = '127.0.0.1', port: int = 5335) -> list[str]:
    """
    Resolve CNAME targets for domain to support deep uncloaking.
    Returns list of canonical alias target domains.
    """
    targets = []
    current = (domain or '').strip().lower()
    for _ in range(5):
        try:
            req = dnslib.DNSRecord.question(current, qtype='CNAME')
            resp = forward(req, host, port)
            if not resp or not hasattr(resp, 'rr') or not resp.rr:
                break
            found = False
            for rr in resp.rr:
                if rr.rtype == dnslib.QTYPE.CNAME:
                    t = str(rr.rdata).rstrip('.').lower()
                    if t and t != current and t not in targets:
                        targets.append(t)
                        current = t
                        found = True
                        break
            if not found:
                break
        except Exception:
            break
    return targets
