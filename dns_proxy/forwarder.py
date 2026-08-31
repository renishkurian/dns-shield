"""
UDP forwarder — forwards DNS requests to Unbound (or any upstream resolver).
Uses a thread-local socket pool to avoid contention.
"""
import socket
import threading
import logging
import time
import dnslib

logger = logging.getLogger('dns_proxy')

_local = threading.local()


def _get_socket(host: str, port: int) -> socket.socket:
    key = f'{host}:{port}'
    sock = getattr(_local, key.replace(':', '_'), None)
    if sock is None:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(5.0)
        setattr(_local, key.replace(':', '_'), sock)
    return sock


def forward(request: dnslib.DNSRecord, host: str, port: int) -> dnslib.DNSRecord:
    """Forward a DNS request to upstream and return the reply."""
    data = request.pack()
    sock = _get_socket(host, port)
    try:
        sock.sendto(data, (host, port))
        response_data, _ = sock.recvfrom(4096)
        return dnslib.DNSRecord.parse(response_data)
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
