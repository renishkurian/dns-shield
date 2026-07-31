"""
In-memory Local DNS (A/AAAA) and CNAME records for the DNS proxy.
Reloaded when matcher_reload_token bumps (same path as block rules).
"""
import ipaddress
import logging
import threading

import dnslib
from dnslib import RR, QTYPE, A, AAAA, CNAME

logger = logging.getLogger('dns_proxy')


class LocalDnsStore:
    def __init__(self):
        self._lock = threading.RLock()
        self.a_records = {}      # domain.lower() -> {'ip': str, 'ttl': int}
        self.cname_records = {}  # domain.lower() -> {'target': str, 'ttl': int}
        self.reload()

    def reload(self):
        try:
            import django
            django.setup()
            from dns.models import LocalDnsRecord, LocalCnameRecord

            a_map = {}
            for row in LocalDnsRecord.objects.filter(enabled=True):
                domain = (row.domain or '').strip().lower().rstrip('.')
                if not domain:
                    continue
                a_map[domain] = {
                    'ip': str(row.ip),
                    'ttl': int(row.ttl or 300),
                }

            c_map = {}
            for row in LocalCnameRecord.objects.filter(enabled=True):
                domain = (row.domain or '').strip().lower().rstrip('.')
                target = (row.target or '').strip().lower().rstrip('.')
                if not domain or not target:
                    continue
                c_map[domain] = {
                    'target': target,
                    'ttl': int(row.ttl or 300),
                }

            with self._lock:
                self.a_records = a_map
                self.cname_records = c_map

            logger.info(
                'Local DNS reloaded: %s A/AAAA, %s CNAME',
                len(a_map), len(c_map),
            )
        except Exception as exc:
            logger.error('Local DNS reload failed: %s', exc)

    def resolve(self, request: dnslib.DNSRecord):
        """
        If the queried name has a local A/AAAA or CNAME, return a synthetic reply.
        Returns None when no local record matches.
        """
        domain = str(request.q.qname).rstrip('.').lower()
        qtype = request.q.qtype

        with self._lock:
            cname = self.cname_records.get(domain)
            arec = self.a_records.get(domain)

        # CNAME takes precedence for the name (Pi-hole style)
        if cname:
            target = cname['target']
            ttl = cname['ttl']
            reply = request.reply()
            reply.add_answer(RR(domain, QTYPE.CNAME, rdata=CNAME(target), ttl=ttl))

            # Chase one level into local A/AAAA when useful
            with self._lock:
                target_a = self.a_records.get(target)

            if target_a and qtype in (QTYPE.A, QTYPE.AAAA, QTYPE.ANY, QTYPE.CNAME):
                ip = target_a['ip']
                t_ttl = target_a['ttl']
                try:
                    parsed = ipaddress.ip_address(ip)
                    if isinstance(parsed, ipaddress.IPv4Address) and qtype in (QTYPE.A, QTYPE.ANY, QTYPE.CNAME):
                        reply.add_answer(RR(target, QTYPE.A, rdata=A(ip), ttl=t_ttl))
                    elif isinstance(parsed, ipaddress.IPv6Address) and qtype in (QTYPE.AAAA, QTYPE.ANY, QTYPE.CNAME):
                        reply.add_answer(RR(target, QTYPE.AAAA, rdata=AAAA(ip), ttl=t_ttl))
                except ValueError:
                    pass

            return reply, target_a['ip'] if target_a else None, 'Local CNAME'

        if arec:
            ip = arec['ip']
            ttl = arec['ttl']
            try:
                parsed = ipaddress.ip_address(ip)
            except ValueError:
                return None

            reply = request.reply()
            if isinstance(parsed, ipaddress.IPv4Address):
                if qtype in (QTYPE.A, QTYPE.ANY):
                    reply.add_answer(RR(domain, QTYPE.A, rdata=A(ip), ttl=ttl))
                    return reply, ip, 'Local DNS'
                if qtype == QTYPE.AAAA:
                    # Name exists locally but no AAAA — NODATA
                    return reply, None, 'Local DNS'
            else:
                if qtype in (QTYPE.AAAA, QTYPE.ANY):
                    reply.add_answer(RR(domain, QTYPE.AAAA, rdata=AAAA(ip), ttl=ttl))
                    return reply, ip, 'Local DNS'
                if qtype == QTYPE.A:
                    return reply, None, 'Local DNS'

        return None


_store = None
_store_lock = threading.Lock()


def get_local_dns() -> LocalDnsStore:
    global _store
    if _store is None:
        with _store_lock:
            if _store is None:
                _store = LocalDnsStore()
    return _store


def reload_local_dns():
    get_local_dns().reload()
