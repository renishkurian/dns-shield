import time
import threading
import dnslib
from collections import OrderedDict


def _dnssec_ok(request: dnslib.DNSRecord) -> bool:
    """True if the request carries an EDNS0 OPT record with the DO bit set."""
    for rr in request.ar:
        if rr.rtype == dnslib.QTYPE.OPT and (rr.ttl & 0x8000):
            return True
    return False


class DNSCache:
    """
    Thread-safe LRU response cache.

    Entries are stored as wire bytes and re-parsed on every hit, so concurrent
    threads never share (and mutate) the same DNSRecord. TTLs in cached answers
    are reduced to the remaining lifetime. The key includes class and the DO bit
    so DNSSEC and non-DNSSEC answers are not mixed.
    """

    def __init__(self, max_size=None):
        if max_size is None:
            try:
                from django.conf import settings
                max_size = int(getattr(settings, 'DNS_CACHE_SIZE', 10000))
            except Exception:
                max_size = 10000
        self._cache = OrderedDict()
        self._lock = threading.Lock()
        self.max_size = max_size

    def get(self, request: dnslib.DNSRecord):
        key = self._make_key(request)
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                return None
            packed, stored_at, expiry = entry
            now = time.time()
            if now >= expiry:
                del self._cache[key]
                return None
            self._cache.move_to_end(key)
        try:
            resp = dnslib.DNSRecord.parse(packed)
        except Exception:
            return None
        elapsed = int(now - stored_at)
        for rr in resp.rr + resp.auth:
            rr.ttl = max(1, rr.ttl - elapsed)
        resp.header.id = request.header.id
        return resp

    def clear(self):
        with self._lock:
            self._cache.clear()

    def put(self, request: dnslib.DNSRecord, response: dnslib.DNSRecord):
        if response.header.tc or response.header.rcode not in (dnslib.RCODE.NOERROR,):
            return
        ttls = [rr.ttl for rr in response.rr if rr.ttl > 0]
        if not ttls:
            return  # Don't cache if no TTL
        min_ttl = min(ttls)
        key = self._make_key(request)
        now = time.time()
        with self._lock:
            self._cache[key] = (response.pack(), now, now + min_ttl)
            self._cache.move_to_end(key)
            while len(self._cache) > self.max_size:
                self._cache.popitem(last=False)

    def _make_key(self, request: dnslib.DNSRecord):
        q = request.q
        return (str(q.qname).lower(), q.qtype, q.qclass, _dnssec_ok(request))


_cache = DNSCache()


def get_cache() -> DNSCache:
    return _cache
