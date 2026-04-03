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
