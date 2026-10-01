"""
DNS proxy core — DNSShieldResolver + broadcast to WebSocket channel layer.
Uses dnslib's synchronous server with a thread pool for concurrency.
"""
import time
import threading
import logging
import asyncio
import ipaddress
import dnslib
from dnslib.server import DNSServer, BaseResolver, DNSHandler

logger = logging.getLogger('dns_proxy')

# Canary domains to disable DoH and Apple iCloud Private Relay, forcing local DNS proxy usage
CANARY_DOMAINS = {
    'use-application-dns.net',      # Firefox DoH canary
    'mask.icloud.com',              # Apple iCloud Private Relay canary
    'mask-h2.icloud.com',           # Apple iCloud Private Relay canary (HTTP/2)
}

_rate_limiter = {}
_rate_limiter_lock = threading.Lock()


def _check_rate_limit(client_ip: str, limit: int = 300, window_sec: float = 5.0) -> bool:
    """Return True if request is allowed, False if client rate limit exceeded."""
    now = time.monotonic()
    with _rate_limiter_lock:
        timestamps = _rate_limiter.get(client_ip, [])
        cutoff = now - window_sec
        timestamps = [t for t in timestamps if t > cutoff]
        if len(timestamps) >= limit:
            _rate_limiter[client_ip] = timestamps
            return False
        timestamps.append(now)
        _rate_limiter[client_ip] = timestamps
        return True


def _block_reply(request: dnslib.DNSRecord, mode: str, matcher=None) -> dnslib.DNSRecord:
    """Build the reply for a blocked query: nxdomain | refused | null_ip | custom_ip."""
    reply = request.reply()
    if mode == 'refused':
        reply.header.rcode = dnslib.RCODE.REFUSED
    elif mode in ('null_ip', 'custom_ip'):
        ip_v4 = getattr(matcher, 'block_ip_v4', '0.0.0.0') if mode == 'custom_ip' else '0.0.0.0'
        ip_v6 = getattr(matcher, 'block_ip_v6', '::') if mode == 'custom_ip' else '::'
        qtype = request.q.qtype
        if qtype == dnslib.QTYPE.A:
            reply.add_answer(dnslib.RR(request.q.qname, dnslib.QTYPE.A, ttl=60,
                                       rdata=dnslib.A(ip_v4)))
        elif qtype == dnslib.QTYPE.AAAA:
            reply.add_answer(dnslib.RR(request.q.qname, dnslib.QTYPE.AAAA, ttl=60,
                                       rdata=dnslib.AAAA(ip_v6)))
        # other types: NOERROR / NODATA
    else:
        reply.header.rcode = dnslib.RCODE.NXDOMAIN
    return reply


def _forward(matcher, request: dnslib.DNSRecord, up_host: str, up_port: int):
    """
    Forward a request upstream, taking into account any additional upstream
    servers and the fallback/fastest mode configured in Settings → DNS.
    Tor-routed clients (up_host == TOR_DNS_HOST) always go straight through
    the single Tor resolver, bypassing the extra-server list.
    """
    from dns_proxy import forwarder
    extra = list(getattr(matcher, 'upstream_extra_servers', []) or [])
    if up_host == TOR_DNS_HOST or not extra:
        return forwarder.forward(request, up_host, up_port)
    servers = [(up_host, up_port)] + extra
    mode = getattr(matcher, 'upstream_mode', 'fallback')
    return forwarder.forward_multi(request, servers, mode=mode)


def _contains_bogus_ip(reply: dnslib.DNSRecord, bogus_ips: set) -> bool:
    """True if any A/AAAA answer in reply matches a configured bogus-NXDOMAIN IP
    (commonly used by hijacking ISP resolvers to intercept NXDOMAIN answers)."""
    if not bogus_ips:
        return False
    for rr in reply.rr:
        if rr.rtype in (dnslib.QTYPE.A, dnslib.QTYPE.AAAA) and str(rr.rdata) in bogus_ips:
            return True
    return False


def _anonymized_ip(client_ip: str, enabled: bool) -> str:
    """Mask the last IPv4 octet / IPv6 interface identifier for logging when enabled."""
    if not enabled:
        return client_ip
    try:
        ip_obj = ipaddress.ip_address(client_ip)
        if ip_obj.version == 4:
            parts = client_ip.split('.')
            parts[-1] = '0'
            return '.'.join(parts)
        # IPv6: zero out the low 64 bits (interface identifier)
        packed = bytearray(ip_obj.packed)
        for i in range(8, 16):
            packed[i] = 0
        return str(ipaddress.ip_address(bytes(packed)))
    except ValueError:
        return client_ip


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
        qtype = dnslib.QTYPE.get(request.q.qtype, str(request.q.qtype))
        client_ip = handler.client_address[0]
        log_ip = _anonymized_ip(client_ip, getattr(self.matcher, 'anonymize_client_ip_enabled', False))
        up_host, up_port = _upstream_for_client(client_ip, self.upstream_host, self.upstream_port)

        # -0.01 Access control — allowed/disallowed client CIDR lists (Settings → DNS → Access Control)
        if hasattr(self.matcher, 'is_client_allowed') and not self.matcher.is_client_allowed(client_ip):
            elapsed = (time.monotonic() - start) * 1000
            dns_logger.log_query(domain, log_ip, 'blocked_client', qtype,
                                 matched_rule='Client not in allowed access list', response_time_ms=elapsed,
                                 resolved_by='Blocked (Access Control)')
            _broadcast(domain, log_ip, 'blocked_client', qtype, 'Access Control', elapsed,
                       resolved_by='Blocked (Access Control)')
            reply = request.reply()
            reply.header.rcode = dnslib.RCODE.REFUSED
            return reply

        # 0.00 Rate Limit Guard — flood & amplification attack protection
        if getattr(self.matcher, 'rate_limiting_enabled', True):
            if not _check_rate_limit(client_ip):
                if hasattr(self.matcher, 'increment_module_hit'):
                    self.matcher.increment_module_hit('rate_limit')
                elapsed = (time.monotonic() - start) * 1000
                dns_logger.log_query(domain, log_ip, 'blocked_client', qtype,
                                     matched_rule='Rate Limit Exceeded (>300 queries/5s)',
                                     response_time_ms=elapsed,
                                     resolved_by='Blocked (Rate Limit)')
                _broadcast(domain, log_ip, 'blocked_client', qtype,
                           'Rate Limit Exceeded (>300 queries/5s)', elapsed,
                           resolved_by='Blocked (Rate Limit)')
                reply = request.reply()
                reply.header.rcode = dnslib.RCODE.REFUSED
                return reply

        # 0.005 Disable IPv6 — respond NODATA to AAAA queries (Settings → DNS)
        if getattr(self.matcher, 'disable_ipv6_enabled', False) and request.q.qtype == dnslib.QTYPE.AAAA:
            elapsed = (time.monotonic() - start) * 1000
            dns_logger.log_query(domain, log_ip, 'allowed', qtype,
                                 response_time_ms=elapsed, resolved_by='Blocked (IPv6 Disabled)')
            _broadcast(domain, log_ip, 'allowed', qtype, 'IPv6 disabled', elapsed,
                       resolved_by='Blocked (IPv6 Disabled)')
            return request.reply()  # NOERROR, no answers

        # 0. Check Shield Status (global)
        from dns.shield import is_shield_active
        if not is_shield_active():
            reply = _forward(self.matcher, request, up_host, up_port)
            elapsed = (time.monotonic() - start) * 1000
            resolved_ip = _extract_ip(reply)
            dns_logger.log_query(domain, log_ip, 'allowed', qtype,
                                 response_time_ms=elapsed, resolved_ip=resolved_ip,
                                 resolved_by=f"{up_host} (Shield Off)", ttl=_get_min_ttl(reply))
            _broadcast(domain, log_ip, 'allowed', qtype, '', elapsed,
                       resolved_ip=resolved_ip, resolved_by=f"{up_host} (Shield Off)")
            return reply

        # 0.04 Per-client shield bypass — forward everything for this IP
        if _is_client_bypassed(client_ip):
            reply = _forward(self.matcher, request, up_host, up_port)
            elapsed = (time.monotonic() - start) * 1000
            resolved_ip = _extract_ip(reply)
            dns_logger.log_query(domain, log_ip, 'allowed', qtype,
                                 response_time_ms=elapsed, resolved_ip=resolved_ip,
                                 resolved_by=f"{up_host} (Client Bypass)", ttl=_get_min_ttl(reply))
            _broadcast(domain, log_ip, 'allowed', qtype, 'Client shield bypass', elapsed,
                       resolved_ip=resolved_ip, resolved_by=f"{up_host} (Client Bypass)")
            return reply

        # 0.05 Full client ban — block all DNS for this IP
        if _is_client_blocked(client_ip):
            elapsed = (time.monotonic() - start) * 1000
            dns_logger.log_query(domain, log_ip, 'blocked_client', qtype,
                                 matched_rule='Client blocked', response_time_ms=elapsed,
                                 resolved_by='Blocked (Client)')
            _broadcast(domain, log_ip, 'blocked_client', qtype, 'Client blocked', elapsed,
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
            dns_logger.log_query(domain, log_ip, 'allowed', qtype,
                                 response_time_ms=elapsed, resolved_ip=resolved_ip,
                                 resolved_by=source, ttl=ttl)
            _broadcast(domain, log_ip, 'allowed', qtype, source, elapsed,
                       resolved_ip=resolved_ip, resolved_by=source, ttl=ttl)
            return reply

        # 0.07 Canary domains (prevent DoH and Apple iCloud Private Relay bypass)
        domain_lower = domain.lower()
        if getattr(self.matcher, 'canary_blocking_enabled', True) and domain_lower in CANARY_DOMAINS:
            if hasattr(self.matcher, 'increment_module_hit'):
                self.matcher.increment_module_hit('canary')
            elapsed = (time.monotonic() - start) * 1000
            dns_logger.log_query(domain, log_ip, 'blocked_domain', qtype,
                                 matched_rule='Canary (DoH/iCloud Bypass)', response_time_ms=elapsed,
                                 resolved_by='Blocked (Canary)')
            _broadcast(domain, log_ip, 'blocked_domain', qtype, 'Canary (DoH/iCloud Bypass)', elapsed,
                       resolved_by='Blocked (Canary)')
            return nxdomain()

        # 0.1 Check Cache
        cached_resp = dns_cache.get(request)
        if cached_resp:
            elapsed = (time.monotonic() - start) * 1000
            resolved_ip = _extract_ip(cached_resp)
            ttl = _get_min_ttl(cached_resp)
            dns_logger.log_query(domain, log_ip, 'allowed', qtype, 
                                 response_time_ms=elapsed, resolved_ip=resolved_ip,
                                 resolved_by='Cache', ttl=ttl)
            _broadcast(domain, log_ip, 'allowed', qtype, '', elapsed, 
                       resolved_ip=resolved_ip, resolved_by='Cache', ttl=ttl)
            return cached_resp

        # 0.1 Resolve Identity
        group_id = _resolve_identity(client_ip)

        def nxdomain():
            return _block_reply(request, getattr(self.matcher, 'block_mode', 'nxdomain'), matcher=self.matcher)

        # 1. Allowlist — always forward
        if self.matcher.is_allowed(domain, group_id=group_id):
            reply = _forward(self.matcher, request, up_host, up_port)
            elapsed = (time.monotonic() - start) * 1000
            resolved_ip = _extract_ip(reply)
            dnssec = _get_dnssec_status(reply)
            ttl = _get_min_ttl(reply)
            dns_logger.log_query(domain, log_ip, 'allowed', qtype,
                                 response_time_ms=elapsed, resolved_ip=resolved_ip,
                                 resolved_by=up_host, dnssec_status=dnssec, ttl=ttl)
            _broadcast(domain, log_ip, 'allowed', qtype, '', elapsed,
                       resolved_ip=resolved_ip, resolved_by=up_host,
                       dnssec_status=dnssec, ttl=ttl)
            dns_cache.put(request, reply)
            return reply

        # 2. Pattern match
        pattern_match = self.matcher.match_pattern(domain, group_id=group_id)
        if pattern_match:
            pid, pname = pattern_match
            elapsed = (time.monotonic() - start) * 1000
            dns_logger.log_query(domain, log_ip, 'blocked_pattern', qtype,
                                 matched_rule=pname, response_time_ms=elapsed,
                                 resolved_by='Blocked (Pattern)')
            _broadcast(domain, log_ip, 'blocked_pattern', qtype, pname, elapsed, 
                       resolved_by='Blocked (Pattern)')
            _increment_pattern_hit(pid)
            return nxdomain()

        # 3. Domain blocklist
        domain_match = self.matcher.match_domain(domain, group_id=group_id)
        if domain_match:
            elapsed = (time.monotonic() - start) * 1000
            dns_logger.log_query(domain, log_ip, 'blocked_domain', qtype,
                                 matched_rule=domain_match, response_time_ms=elapsed,
                                 resolved_by='Blocked (Domain)')
            _broadcast(domain, log_ip, 'blocked_domain', qtype, domain_match, elapsed,
                       resolved_by='Blocked (Domain)')
            _increment_domain_hit(domain_match)
            return nxdomain()

        # 4. Gravity (adlists)
        if self.matcher.in_gravity(domain):
            elapsed = (time.monotonic() - start) * 1000
            dns_logger.log_query(domain, log_ip, 'blocked_list', qtype,
                                 response_time_ms=elapsed, resolved_by='Blocked (Gravity)')
            _broadcast(domain, log_ip, 'blocked_list', qtype, '', elapsed, 
                       resolved_by='Blocked (Gravity)')
            return nxdomain()

        # 4.5 AI Heuristic (DGA)
        if getattr(self.matcher, 'dga_protection_enabled', True) and self.matcher.is_dga(domain):
            if hasattr(self.matcher, 'increment_module_hit'):
                self.matcher.increment_module_hit('dga')
            elapsed = (time.monotonic() - start) * 1000
            dns_logger.log_query(domain, log_ip, 'blocked_ai', qtype,
                                 matched_rule='AI: High Entropy (DGA)', response_time_ms=elapsed,
                                 resolved_by='Blocked (AI)')
            _broadcast(domain, log_ip, 'blocked_ai', qtype, 'AI: High Entropy (DGA)', elapsed,
                       resolved_by='Blocked (AI)')
            return nxdomain()

        # 4.6 Native Adblock engine match
        if getattr(self.matcher, 'adblock_engine_enabled', True):
            adblock_match = self.matcher.match_adblock(domain)
            if adblock_match:
                if hasattr(self.matcher, 'increment_module_hit'):
                    self.matcher.increment_module_hit('adblock')
                elapsed = (time.monotonic() - start) * 1000
                dns_logger.log_query(domain, log_ip, 'blocked_list', qtype,
                                     matched_rule=f"Adblock: {adblock_match}", response_time_ms=elapsed,
                                     resolved_by='Blocked (Adblock)')
                _broadcast(domain, log_ip, 'blocked_list', qtype, f"Adblock: {adblock_match}", elapsed,
                           resolved_by='Blocked (Adblock)')
                return nxdomain()

        # 5. Forward to upstream
        reply = _forward(self.matcher, request, up_host, up_port)
        elapsed = (time.monotonic() - start) * 1000

        # 5.01 Upstream outage protection — serve a stale cached answer instead of SERVFAIL
        if reply.header.rcode == dnslib.RCODE.SERVFAIL:
            stale_resp, is_stale = dns_cache.get_stale(request)
            if stale_resp is not None:
                elapsed = (time.monotonic() - start) * 1000
                resolved_ip = _extract_ip(stale_resp)
                ttl = _get_min_ttl(stale_resp)
                dns_logger.log_query(domain, log_ip, 'allowed', qtype,
                                     response_time_ms=elapsed, resolved_ip=resolved_ip,
                                     resolved_by='Cache (stale — upstream unreachable)', ttl=ttl)
                _broadcast(domain, log_ip, 'allowed', qtype, '', elapsed,
                           resolved_ip=resolved_ip, resolved_by='Cache (stale — upstream unreachable)', ttl=ttl)
                return stale_resp

        # 5.02 Bogus-NXDOMAIN — treat known ISP-hijack sinkhole IPs as NXDOMAIN
        bogus_ips = getattr(self.matcher, 'bogus_nxdomain_ips', None)
        if bogus_ips and reply.header.rcode == dnslib.RCODE.NOERROR and _contains_bogus_ip(reply, bogus_ips):
            elapsed = (time.monotonic() - start) * 1000
            dns_logger.log_query(domain, log_ip, 'nxdomain', qtype,
                                 matched_rule='Bogus NXDOMAIN (ISP hijack IP)', response_time_ms=elapsed,
                                 resolved_by='Blocked (Bogus NXDOMAIN)')
            _broadcast(domain, log_ip, 'nxdomain', qtype, 'Bogus NXDOMAIN (ISP hijack IP)', elapsed,
                       resolved_by='Blocked (Bogus NXDOMAIN)')
            reply = request.reply()
            reply.header.rcode = dnslib.RCODE.NXDOMAIN
            return reply

        # 5.1 CNAME Uncloaking — inspect resolved CNAME chain to catch cloaked 3rd-party trackers
        if getattr(self.matcher, 'cname_uncloaking_enabled', True) and reply.header.rcode == dnslib.RCODE.NOERROR and reply.rr:
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
                        if hasattr(self.matcher, 'increment_module_hit'):
                            self.matcher.increment_module_hit('cname')
                        dns_logger.log_query(domain, log_ip, 'blocked_list', qtype,
                                             matched_rule=reason, response_time_ms=elapsed,
                                             resolved_by='Blocked (CNAME Uncloaking)', ttl=0)
                        _broadcast(domain, log_ip, 'blocked_list', qtype, reason, elapsed,
                                   resolved_by='Blocked (CNAME Uncloaking)', ttl=0)
                        return nxdomain()

        # 5.2 DNS Rebinding Protection — block public domains resolving to RFC1918 / loopback / link-local addresses
        if getattr(self.matcher, 'rebinding_protection_enabled', True) and reply.header.rcode == dnslib.RCODE.NOERROR and reply.rr:
            has_private_ip = False
            leaked_ip = ''
            for rr in reply.rr:
                if rr.rtype in (dnslib.QTYPE.A, dnslib.QTYPE.AAAA):
                    ip_str = str(rr.rdata).strip()
                    try:
                        ip_obj = ipaddress.ip_address(ip_str)
                        if (ip_obj.is_private or ip_obj.is_loopback or 
                            ip_obj.is_link_local or ip_obj.is_reserved or 
                            ip_obj.is_unspecified):
                            has_private_ip = True
                            leaked_ip = ip_str
                            break
                    except ValueError:
                        pass

            if has_private_ip:
                if hasattr(self.matcher, 'increment_module_hit'):
                    self.matcher.increment_module_hit('rebinding')
                dns_logger.log_query(domain, log_ip, 'blocked_domain', qtype,
                                     matched_rule=f"DNS Rebinding: Private IP ({leaked_ip})",
                                     response_time_ms=elapsed,
                                     resolved_by='Blocked (DNS Rebinding)', ttl=0)
                _broadcast(domain, log_ip, 'blocked_domain', qtype,
                           f"DNS Rebinding: Private IP ({leaked_ip})", elapsed,
                           resolved_by='Blocked (DNS Rebinding)', ttl=0)
                return nxdomain()

        # 5.3 HTTPS (Type 65) / SVCB (Type 64) ECH Evasion Protection
        is_https_svcb = qtype in ('HTTPS', 'SVCB') or getattr(request.q, 'qtype', 0) in (64, 65)
        if is_https_svcb and getattr(self.matcher, 'https_ech_protection_enabled', True):
            if hasattr(self.matcher, 'increment_module_hit'):
                self.matcher.increment_module_hit('https_ech')
            dns_logger.log_query(domain, log_ip, 'allowed', qtype,
                                 response_time_ms=elapsed, resolved_ip=_extract_ip(reply),
                                 resolved_by=f"{up_host} (ECH Guard)", dnssec_status=_get_dnssec_status(reply),
                                 ttl=_get_min_ttl(reply))
            _broadcast(domain, log_ip, 'allowed', qtype, 'ECH Guard', elapsed,
                       resolved_ip=_extract_ip(reply), resolved_by=f"{up_host} (ECH Guard)",
                       dnssec_status=_get_dnssec_status(reply), ttl=_get_min_ttl(reply))
            return reply

        status = 'nxdomain' if reply.header.rcode == dnslib.RCODE.NXDOMAIN else 'allowed'
        resolved_ip = _extract_ip(reply)
        dnssec = _get_dnssec_status(reply)
        ttl = _get_min_ttl(reply)
        dns_logger.log_query(domain, log_ip, status, qtype,
                             response_time_ms=elapsed, resolved_ip=resolved_ip,
                             resolved_by=up_host, dnssec_status=dnssec, ttl=ttl)
        _broadcast(domain, log_ip, status, qtype, '', elapsed,
                   resolved_ip=resolved_ip, resolved_by=up_host,
                   dnssec_status=dnssec, ttl=ttl)
        # Cache both positive and negative (NXDOMAIN) answers; DNSCache.put()
        # applies the configured min/max/negative TTL rules and ignores
        # anything else (SERVFAIL, REFUSED, truncated).
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


def _broadcast(domain, log_ip, status, qtype, matched_rule, elapsed, 
               resolved_ip=None, resolved_by='', dnssec_status='N/A', ttl=0):
    """Fire-and-forget broadcast to WebSocket channel layer."""
    try:
        from dns_proxy.log_exclusions import is_domain_log_excluded
        if is_domain_log_excluded(domain):
            return
    except Exception:
        pass

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


# ─── DNS-over-TLS (DoT) server — RFC 7858 ───────────────────────────────────

import ssl
import struct
import asyncio

DOT_PORT = 853


class DoTServer:
    """
    Async DNS-over-TLS listener on port 853.
    Wraps DNSShieldResolver so all filtering/logging applies equally to DoT queries.
    Each DNS message is length-prefixed with a 2-byte big-endian header (RFC 7858).
    """

    def __init__(self, resolver: 'DNSShieldResolver', host: str, certfile: str, keyfile: str):
        self.resolver = resolver
        self.host = host
        self.certfile = certfile
        self.keyfile = keyfile
        self._server = None
        self._thread = None

    async def _handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        peer = writer.get_extra_info('peername')
        client_ip = peer[0] if peer else '0.0.0.0'
        try:
            while True:
                # Read 2-byte length prefix
                length_bytes = await reader.readexactly(2)
                msg_len = struct.unpack('!H', length_bytes)[0]
                if msg_len == 0:
                    break
                raw = await reader.readexactly(msg_len)

                try:
                    dns_req = dnslib.DNSRecord.parse(raw)
                except Exception:
                    break

                class _Handler:
                    client_address = (client_ip, DOT_PORT)

                reply = self.resolver.resolve(dns_req, _Handler())
                packed = reply.pack()
                # Write 2-byte length prefix + reply
                writer.write(struct.pack('!H', len(packed)) + packed)
                await writer.drain()
        except (asyncio.IncompleteReadError, ConnectionResetError):
            pass
        except Exception as exc:
            logger.debug(f"DoT handler error from {client_ip}: {exc}")
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    def _build_ssl_ctx(self) -> ssl.SSLContext:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        ctx.load_cert_chain(certfile=self.certfile, keyfile=self.keyfile)
        return ctx

    async def _serve(self):
        try:
            ssl_ctx = self._build_ssl_ctx()
        except Exception as exc:
            logger.error(f"DoT: failed to load TLS cert/key — {exc}. DoT disabled.")
            return

        self._server = await asyncio.start_server(
            self._handle,
            host=self.host,
            port=DOT_PORT,
            ssl=ssl_ctx,
        )
        logger.info(f"DoT listener on {self.host}:{DOT_PORT} (TLS)")
        async with self._server:
            await self._server.serve_forever()

    def start_thread(self):
        """Start the DoT server in a daemon thread with its own event loop."""
        def _run():
            asyncio.run(self._serve())

        self._thread = threading.Thread(target=_run, name='dot-server', daemon=True)
        self._thread.start()

    def stop(self):
        if self._server:
            self._server.close()


def _dot_cert_paths() -> tuple[str | None, str | None]:
    """
    Return (certfile, keyfile) from DB settings or well-known paths.
    Returns (None, None) if no cert is found — DoT will be skipped.
    """
    from dns.models import SystemSetting
    try:
        cert = SystemSetting.objects.filter(key='dot_cert_path').first()
        key = SystemSetting.objects.filter(key='dot_key_path').first()
        if cert and key and cert.value and key.value:
            import os
            if os.path.exists(cert.value) and os.path.exists(key.value):
                return cert.value, key.value
    except Exception:
        pass

    # Well-known fallback paths (Let's Encrypt / Cloudflare origin cert)
    import os
    candidates = [
        ('/etc/letsencrypt/live/shield.rklab.online/fullchain.pem',
         '/etc/letsencrypt/live/shield.rklab.online/privkey.pem'),
        ('/etc/ssl/dns-shield/fullchain.pem',
         '/etc/ssl/dns-shield/privkey.pem'),
    ]
    for c, k in candidates:
        if os.path.exists(c) and os.path.exists(k):
            return c, k
    return None, None


# ─── Singleton server ────────────────────────────────────────────────────────

_server: DNSServer | None = None
_tcp_server: DNSServer | None = None
_dot_server: DoTServer | None = None
_server_lock = threading.Lock()


def start_proxy(host: str, port: int, upstream_host: str, upstream_port: int,
                matcher) -> DNSServer:
    global _server, _tcp_server, _dot_server
    with _server_lock:
        if _server is not None or _tcp_server is not None:
            return _server
        resolver = DNSShieldResolver(matcher, upstream_host, upstream_port)

        # DNS over UDP
        _server = DNSServer(
            resolver,
            address=host,
            port=port,
            tcp=False,
        )

        # DNS over TCP
        _tcp_server = DNSServer(
            resolver,
            address=host,
            port=port,
            tcp=True,
        )

        _server.start_thread()
        _tcp_server.start_thread()

        logger.info(
            f"DNS proxy listening on {host}:{port} "
            f"(UDP + TCP) → {upstream_host}:{upstream_port}"
        )

        # DNS-over-TLS on port 853 (optional — requires cert)
        certfile, keyfile = _dot_cert_paths()
        if certfile and keyfile:
            _dot_server = DoTServer(resolver, host, certfile, keyfile)
            _dot_server.start_thread()
        else:
            logger.info(
                "DoT (port 853) disabled — no TLS cert found. "
                "Set dot_cert_path / dot_key_path in System Settings or place cert at "
                "/etc/ssl/dns-shield/fullchain.pem + privkey.pem"
            )

        return _server


def stop_proxy():
    global _server, _tcp_server, _dot_server
    with _server_lock:
        if _server:
            _server.stop()
            _server = None
        if _tcp_server:
            _tcp_server.stop()
            _tcp_server = None
        if _dot_server:
            _dot_server.stop()
            _dot_server = None
