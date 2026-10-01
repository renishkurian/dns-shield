"""
UDP forwarder — forwards DNS requests to Unbound (or any upstream resolver).
Uses a thread-local socket pool to avoid contention.
"""
import ipaddress
import socket
import struct
import threading
import queue as queue_module
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


def forward_multi(request: dnslib.DNSRecord, servers: list[tuple[str, int]], mode: str = 'fallback'):
    """
    Forward to one primary server plus any number of extra upstream servers.

    servers: list of (host, port) tuples, primary first.
    mode:
      - 'fallback' (default): try servers in order, moving to the next only
        when a server times out or returns SERVFAIL. This is the safest mode
        and matches the previous single-upstream behavior when only one
        server is configured.
      - 'fastest': query every server concurrently and return whichever
        non-SERVFAIL answer comes back first (AdGuard Home's "fastest IP"
        upstream mode). Falls back to the first response received if every
        server returns SERVFAIL.
    """
    if not servers:
        raise ValueError('forward_multi requires at least one server')

    if len(servers) == 1 or mode == 'fallback':
        last_reply = None
        for host, port in servers:
            reply = forward(request, host, port)
            last_reply = reply
            if reply.header.rcode != dnslib.RCODE.SERVFAIL:
                return reply
        return last_reply

    # 'fastest' mode: race all servers, return the first usable answer.
    results: queue_module.Queue = queue_module.Queue()

    def _query(host, port):
        try:
            results.put(forward(request, host, port))
        except Exception as exc:
            logger.warning(f"forward_multi: {host}:{port} failed: {exc}")

    threads = [threading.Thread(target=_query, args=(h, p), daemon=True) for h, p in servers]
    for t in threads:
        t.start()

    deadline = time.monotonic() + max(UDP_TIMEOUT, TCP_TIMEOUT) + 0.5
    fallback_reply = None
    seen = 0
    while seen < len(servers) and time.monotonic() < deadline:
        try:
            reply = results.get(timeout=0.25)
        except Exception:
            continue
        seen += 1
        if reply.header.rcode != dnslib.RCODE.SERVFAIL:
            return reply
        fallback_reply = fallback_reply or reply

    if fallback_reply is not None:
        return fallback_reply
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
