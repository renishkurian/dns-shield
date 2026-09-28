"""Network helpers shared by views."""
import ipaddress

from django.conf import settings


def _is_trusted(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return False
    for entry in getattr(settings, 'TRUSTED_PROXIES', ['127.0.0.1', '::1']):
        try:
            if '/' in entry:
                if ip in ipaddress.ip_network(entry, strict=False):
                    return True
            elif ip == ipaddress.ip_address(entry):
                return True
        except ValueError:
            continue
    return False


def get_client_ip(request) -> str:
    """
    Real client IP. X-Forwarded-For is honoured only when the direct peer is a
    trusted proxy, and is walked right-to-left so client-supplied (spoofed)
    leading entries are ignored.
    """
    remote = request.META.get('REMOTE_ADDR', '127.0.0.1')
    if not _is_trusted(remote):
        return remote
    xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
    hops = [h.strip() for h in xff.split(',') if h.strip()]
    for hop in reversed(hops):
        try:
            ipaddress.ip_address(hop)
        except ValueError:
            continue
        if not _is_trusted(hop):
            return hop
    return remote
