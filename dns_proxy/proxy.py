"""
DNS proxy core — DNSShieldResolver + broadcast to WebSocket channel layer.
Uses dnslib's synchronous server with a thread pool for concurrency.
"""
import time
import threading
import logging
import asyncio
import dnslib
from dnslib.server import DNSServer, BaseResolver, DNSHandler

logger = logging.getLogger('dns_proxy')

# Canary domains to disable DoH and Apple iCloud Private Relay, forcing local DNS proxy usage
CANARY_DOMAINS = {
    'use-application-dns.net',      # Firefox DoH canary
    'mask.icloud.com',              # Apple iCloud Private Relay canary
    'mask-h2.icloud.com',           # Apple iCloud Private Relay canary (HTTP/2)
}


class DNSShieldResolver(BaseResolver):
    def __init__(self, matcher, upstream_host: str, upstream_port: int):
        self.matcher = matcher
        self.upstream_host = upstream_host
        self.upstream_port = upstream_port

    def resolve(self, request: dnslib.DNSRecord, handler) -> dnslib.DNSRecord:
        from dns_proxy import forwarder, dns_logger, cache
        dns_cache = cache.get_cache()

        start = time.monotonic()
        domain = str(request.q.qname).rstrip('.')
        qtype = dnslib.QTYPE[request.q.qtype]
        client_ip = handler.client_address[0]
        up_host, up_port = _upstream_for_client(client_ip, self.upstream_host, self.upstream_port)

        # 0. Check Shield Status (global)
        from dns.shield import is_shield_active
        if not is_shield_active():
            reply = forwarder.forward(request, up_host, up_port)
            elapsed = (time.monotonic() - start) * 1000
            resolved_ip = _extract_ip(reply)
            dns_logger.log_query(domain, client_ip, 'allowed', qtype,
                                 response_time_ms=elapsed, resolved_ip=resolved_ip,
                                 resolved_by=f"{up_host} (Shield Off)", ttl=_get_min_ttl(reply))
            _broadcast(domain, client_ip, 'allowed', qtype, '', elapsed,
                       resolved_ip=resolved_ip, resolved_by=f"{up_host} (Shield Off)")
            return reply

        # 0.04 Per-client shield bypass — forward everything for this IP
        if _is_client_bypassed(client_ip):
            reply = forwarder.forward(request, up_host, up_port)
            elapsed = (time.monotonic() - start) * 1000
            resolved_ip = _extract_ip(reply)
            dns_logger.log_query(domain, client_ip, 'allowed', qtype,
                                 response_time_ms=elapsed, resolved_ip=resolved_ip,
                                 resolved_by=f"{up_host} (Client Bypass)", ttl=_get_min_ttl(reply))
            _broadcast(domain, client_ip, 'allowed', qtype, 'Client shield bypass', elapsed,
                       resolved_ip=resolved_ip, resolved_by=f"{up_host} (Client Bypass)")
            return reply

        # 0.05 Full client ban — block all DNS for this IP
        if _is_client_blocked(client_ip):
            elapsed = (time.monotonic() - start) * 1000
            dns_logger.log_query(domain, client_ip, 'blocked_client', qtype,
                                 matched_rule='Client blocked', response_time_ms=elapsed,
                                 resolved_by='Blocked (Client)')
            _broadcast(domain, client_ip, 'blocked_client', qtype, 'Client blocked', elapsed,
                       resolved_by='Blocked (Client)')
            reply = request.reply()
            reply.header.rcode = dnslib.RCODE.NXDOMAIN
            return reply

        # 0.06 Local DNS / CNAME (authoritative for configured names)
        from dns_proxy.local_dns import get_local_dns
        local = get_local_dns().resolve(request)
        if local is not None:
            reply, resolved_ip, source = local
            elapsed = (time.monotonic() - start) * 1000
            ttl = _get_min_ttl(reply) if reply.rr else 0
            dns_logger.log_query(domain, client_ip, 'allowed', qtype,
                                 response_time_ms=elapsed, resolved_ip=resolved_ip,
                                 resolved_by=source, ttl=ttl)
            _broadcast(domain, client_ip, 'allowed', qtype, source, elapsed,
                       resolved_ip=resolved_ip, resolved_by=source, ttl=ttl)
            return reply

        # 0.07 Canary domains (prevent DoH and Apple iCloud Private Relay bypass)
        domain_lower = domain.lower()
        if domain_lower in CANARY_DOMAINS:
            elapsed = (time.monotonic() - start) * 1000
            dns_logger.log_query(domain, client_ip, 'blocked_domain', qtype,
                                 matched_rule='Canary (DoH/iCloud Bypass)', response_time_ms=elapsed,
                                 resolved_by='Blocked (Canary)')
            _broadcast(domain, client_ip, 'blocked_domain', qtype, 'Canary (DoH/iCloud Bypass)', elapsed,
                       resolved_by='Blocked (Canary)')
            return nxdomain()

        # 0.1 Check Cache
        cached_resp = dns_cache.get(request)
        if cached_resp:
            elapsed = (time.monotonic() - start) * 1000
            resolved_ip = _extract_ip(cached_resp)
            ttl = _get_min_ttl(cached_resp)
            dns_logger.log_query(domain, client_ip, 'allowed', qtype, 
                                 response_time_ms=elapsed, resolved_ip=resolved_ip,
                                 resolved_by='Cache', ttl=ttl)
            _broadcast(domain, client_ip, 'allowed', qtype, '', elapsed, 
                       resolved_ip=resolved_ip, resolved_by='Cache', ttl=ttl)
            return cached_resp

        # 0.1 Resolve Identity
        group_id = _resolve_identity(client_ip)

        def nxdomain():
            reply = request.reply()
            reply.header.rcode = dnslib.RCODE.NXDOMAIN
            return reply

        # 1. Allowlist — always forward
        if self.matcher.is_allowed(domain, group_id=group_id):
            reply = forwarder.forward(request, up_host, up_port)
            elapsed = (time.monotonic() - start) * 1000
            resolved_ip = _extract_ip(reply)
            dnssec = _get_dnssec_status(reply)
            ttl = _get_min_ttl(reply)
            dns_logger.log_query(domain, client_ip, 'allowed', qtype,
                                 response_time_ms=elapsed, resolved_ip=resolved_ip,
                                 resolved_by=up_host, dnssec_status=dnssec, ttl=ttl)
            _broadcast(domain, client_ip, 'allowed', qtype, '', elapsed,
                       resolved_ip=resolved_ip, resolved_by=up_host,
                       dnssec_status=dnssec, ttl=ttl)
            dns_cache.put(request, reply)
            return reply

        # 2. Pattern match
        pattern_match = self.matcher.match_pattern(domain, group_id=group_id)
        if pattern_match:
            pid, pname = pattern_match
            elapsed = (time.monotonic() - start) * 1000
            dns_logger.log_query(domain, client_ip, 'blocked_pattern', qtype,
                                 matched_rule=pname, response_time_ms=elapsed,
                                 resolved_by='Blocked (Pattern)')
            _broadcast(domain, client_ip, 'blocked_pattern', qtype, pname, elapsed, 
                       resolved_by='Blocked (Pattern)')
            _increment_pattern_hit(pid)
            return nxdomain()

        # 3. Domain blocklist
        domain_match = self.matcher.match_domain(domain, group_id=group_id)
        if domain_match:
            elapsed = (time.monotonic() - start) * 1000
            dns_logger.log_query(domain, client_ip, 'blocked_domain', qtype,
                                 matched_rule=domain_match, response_time_ms=elapsed,
                                 resolved_by='Blocked (Domain)')
            _broadcast(domain, client_ip, 'blocked_domain', qtype, domain_match, elapsed,
                       resolved_by='Blocked (Domain)')
            _increment_domain_hit(domain_match)
            return nxdomain()

        # 4. Gravity (adlists)
        if self.matcher.in_gravity(domain):
            elapsed = (time.monotonic() - start) * 1000
            dns_logger.log_query(domain, client_ip, 'blocked_list', qtype,
                                 response_time_ms=elapsed, resolved_by='Blocked (Gravity)')
            _broadcast(domain, client_ip, 'blocked_list', qtype, '', elapsed, 
                       resolved_by='Blocked (Gravity)')
            return nxdomain()

        # 4.5 AI Heuristic (DGA)
        if self.matcher.is_dga(domain):
            elapsed = (time.monotonic() - start) * 1000
            dns_logger.log_query(domain, client_ip, 'blocked_ai', qtype,
                                 matched_rule='AI: High Entropy (DGA)', response_time_ms=elapsed,
                                 resolved_by='Blocked (AI)')
            _broadcast(domain, client_ip, 'blocked_ai', qtype, 'AI: High Entropy (DGA)', elapsed,
                       resolved_by='Blocked (AI)')
            return nxdomain()

        # 4.6 Native Adblock engine match
        adblock_match = self.matcher.match_adblock(domain)
        if adblock_match:
            elapsed = (time.monotonic() - start) * 1000
            dns_logger.log_query(domain, client_ip, 'blocked_list', qtype,
                                 matched_rule=f"Adblock: {adblock_match}", response_time_ms=elapsed,
                                 resolved_by='Blocked (Adblock)')
            _broadcast(domain, client_ip, 'blocked_list', qtype, f"Adblock: {adblock_match}", elapsed,
                       resolved_by='Blocked (Adblock)')
            return nxdomain()

        # 5. Forward to upstream
        reply = forwarder.forward(request, up_host, up_port)
        elapsed = (time.monotonic() - start) * 1000

        # 5.1 CNAME Uncloaking — inspect resolved CNAME chain to catch cloaked 3rd-party trackers
        if reply.header.rcode == dnslib.RCODE.NOERROR and reply.rr:
            for rr in reply.rr:
                if rr.rtype == dnslib.QTYPE.CNAME:
                    cname_target = str(rr.rdata).rstrip('.').lower()
                    if not cname_target or self.matcher.is_allowed(cname_target, group_id=group_id):
                        continue

                    cname_blocked = False
                    reason = ''
                    if self.matcher.in_gravity(cname_target):
                        cname_blocked = True
                        reason = f"CNAME (Gravity) -> {cname_target}"
                    elif (d_match := self.matcher.match_domain(cname_target, group_id=group_id)):
                        cname_blocked = True
                        reason = f"CNAME (Domain: {d_match}) -> {cname_target}"
                    elif (p_match := self.matcher.match_pattern(cname_target, group_id=group_id)):
                        cname_blocked = True
                        reason = f"CNAME (Pattern: {p_match[1]}) -> {cname_target}"
                    elif (ab_match := self.matcher.match_adblock(cname_target)):
                        cname_blocked = True
                        reason = f"CNAME (Adblock: {ab_match}) -> {cname_target}"

                    if cname_blocked:
                        dns_logger.log_query(domain, client_ip, 'blocked_list', qtype,
                                             matched_rule=reason, response_time_ms=elapsed,
                                             resolved_by='Blocked (CNAME Uncloaking)', ttl=0)
                        _broadcast(domain, client_ip, 'blocked_list', qtype, reason, elapsed,
                                   resolved_by='Blocked (CNAME Uncloaking)', ttl=0)
                        return nxdomain()

        status = 'nxdomain' if reply.header.rcode == dnslib.RCODE.NXDOMAIN else 'allowed'
        resolved_ip = _extract_ip(reply)
        dnssec = _get_dnssec_status(reply)
        ttl = _get_min_ttl(reply)
        dns_logger.log_query(domain, client_ip, status, qtype,
                             response_time_ms=elapsed, resolved_ip=resolved_ip,
                             resolved_by=up_host, dnssec_status=dnssec, ttl=ttl)
        _broadcast(domain, client_ip, status, qtype, '', elapsed,
                   resolved_ip=resolved_ip, resolved_by=up_host,
                   dnssec_status=dnssec, ttl=ttl)
        if status == 'allowed':
            dns_cache.put(request, reply)
        return reply


TOR_DNS_HOST = '127.0.0.1'
TOR_DNS_PORT = 9053

_blocked_clients_cache = {
    'ips': set(),
    'last_check': 0,
}

_bypass_clients_cache = {
    'ips': set(),
    'last_check': 0,
}

_tor_clients_cache = {
    'ips': set(),
    'last_check': 0,
}


def _is_client_blocked(client_ip: str) -> bool:
    """Return True if this client IP is fully DNS-banned. Refreshes every 5s."""
    now = time.time()
    if now - _blocked_clients_cache['last_check'] >= 5:
        try:
            from dns.models import Client
            _blocked_clients_cache['ips'] = set(
                Client.objects.filter(is_blocked=True).values_list('ip', flat=True)
            )
        except Exception as exc:
            logger.error(f"Failed to refresh blocked clients: {exc}")
        _blocked_clients_cache['last_check'] = now
    return client_ip in _blocked_clients_cache['ips']


def _is_client_bypassed(client_ip: str) -> bool:
    """Return True if DNS Shield filtering is disabled for this client IP."""
    now = time.time()
    if now - _bypass_clients_cache['last_check'] >= 5:
        try:
            from dns.models import Client
            _bypass_clients_cache['ips'] = set(
                Client.objects.filter(shield_bypass=True).values_list('ip', flat=True)
            )
        except Exception as exc:
            logger.error(f"Failed to refresh bypass clients: {exc}")
        _bypass_clients_cache['last_check'] = now
    return client_ip in _bypass_clients_cache['ips']


def _is_client_tor_routed(client_ip: str) -> bool:
    """Return True if this client IP should resolve DNS via Tor. Refreshes every 5s."""
    now = time.time()
    if now - _tor_clients_cache['last_check'] >= 5:
        try:
            from dns.models import Client
            _tor_clients_cache['ips'] = set(
                Client.objects.filter(route_via_tor=True).values_list('ip', flat=True)
            )
        except Exception as exc:
            logger.error(f"Failed to refresh Tor-routed clients: {exc}")
        _tor_clients_cache['last_check'] = now
    return client_ip in _tor_clients_cache['ips']


def _upstream_for_client(client_ip: str, host: str, port: int) -> tuple[str, int]:
    """Return Tor DNSPort when client is flagged; otherwise the normal upstream."""
    if _is_client_tor_routed(client_ip):
        return TOR_DNS_HOST, TOR_DNS_PORT
    return host, port


def _resolve_identity(client_ip: str) -> int | None:
    """Map client IP to a group ID via UserProfile."""
    # Note: In production, this should be cached in Redis/memory
    try:
        from dns.models import Client
        from users.models import UserProfile
        client = Client.objects.filter(ip=client_ip).first()
        if client and client.user:
            return client.user.profile.group_id
        # Fallback to direct UserProfile check if it's a fixed IP bypass
        return None
    except Exception:
        return None


def _extract_ip(reply: dnslib.DNSRecord) -> str | None:
    for rr in reply.rr:
        if rr.rtype in (dnslib.QTYPE.A, dnslib.QTYPE.AAAA):
            return str(rr.rdata)
    return None


def _get_min_ttl(reply: dnslib.DNSRecord) -> int:
    ttls = [rr.ttl for rr in reply.rr if rr.ttl > 0]
    return min(ttls) if ttls else 0


def _get_dnssec_status(reply: dnslib.DNSRecord) -> str:
    """Very basic DNSSEC detection — checking for AD bit or DO bit presence isn't enough, 
    but we look if the record has any RRSIG or DNSKEY types in additional records."""
    ad_bit = reply.header.ad
    if ad_bit:
        return 'SECURE'
    # Fallback to checking for signatures
    for rr in reply.auth + reply.ar:
        if rr.rtype in (dnslib.QTYPE.RRSIG, dnslib.QTYPE.DNSKEY, dnslib.QTYPE.DS):
            return 'INSECURE' # Present but not validated by us
    return 'N/A'


def _broadcast(domain, client_ip, status, qtype, matched_rule, elapsed, 
               resolved_ip=None, resolved_by='', dnssec_status='N/A', ttl=0):
    """Fire-and-forget broadcast to WebSocket channel layer."""
    import importlib
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        data = {
            'type': 'query_event',
            'data': {
                'domain': domain,
                'client_ip': client_ip,
                'status': status,
                'query_type': qtype,
                'matched_rule': matched_rule,
                'response_time_ms': round(elapsed, 2),
                'resolved_ip': resolved_ip,
                'resolved_by': resolved_by,
                'dnssec_status': dnssec_status,
                'ttl': ttl,
                'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            }
        }
        async_to_sync(channel_layer.group_send)('query_log', data)
    except Exception:
        pass  # WebSocket broadcast is best-effort


def _increment_pattern_hit(pattern_id: int):
    def _do():
        try:
            from django.db.models import F
            from blocks.models import Pattern
            Pattern.objects.filter(pk=pattern_id).update(hit_count=F('hit_count') + 1)
        except Exception:
            pass
    threading.Thread(target=_do, daemon=True).start()


def _increment_domain_hit(domain: str):
    def _do():
        try:
            from django.db.models import F
            from django.utils import timezone
            from blocks.models import BlockedDomain
            BlockedDomain.objects.filter(domain=domain).update(
                hit_count=F('hit_count') + 1,
                last_hit=timezone.now()
            )
        except Exception:
            pass
    threading.Thread(target=_do, daemon=True).start()


# ─── Singleton server ────────────────────────────────────────────────────────

_server: DNSServer | None = None
_server_lock = threading.Lock()


def start_proxy(host: str, port: int, upstream_host: str, upstream_port: int,
                matcher) -> DNSServer:
    global _server
    with _server_lock:
        if _server is not None:
            return _server
        resolver = DNSShieldResolver(matcher, upstream_host, upstream_port)
        _server = DNSServer(resolver, address=host, port=port, tcp=False)
        _server.start_thread()
        logger.info(f"DNS proxy listening on {host}:{port} → {upstream_host}:{upstream_port}")
        return _server


def stop_proxy():
    global _server
    with _server_lock:
        if _server:
            _server.stop()
            _server = None
