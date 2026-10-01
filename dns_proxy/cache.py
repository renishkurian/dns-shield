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
        # Configurable via SystemSetting through Matcher.reload() -> configure()
        self.min_ttl = 0          # floor applied to every cached positive TTL
        self.max_ttl = 0          # 0 = no ceiling
        self.negative_ttl = 60    # how long to cache NXDOMAIN answers
        self.stale_grace_seconds = 3600  # serve expired entries this long if upstream fails

    def configure(self, min_ttl=0, max_ttl=0, negative_ttl=60, stale_grace_seconds=3600):
        with self._lock:
            self.min_ttl = max(0, int(min_ttl or 0))
            self.max_ttl = max(0, int(max_ttl or 0))
            self.negative_ttl = max(0, int(negative_ttl or 0))
            self.stale_grace_seconds = max(0, int(stale_grace_seconds or 0))

    def get(self, request: dnslib.DNSRecord):
        """Return a fresh cached response, or None if missing/expired."""
        resp, _stale = self._get_internal(request, allow_stale=False)
        return resp

    def get_stale(self, request: dnslib.DNSRecord):
        """
        Return a cached response even if its TTL has expired, as long as it's
        within stale_grace_seconds of expiry. Used when the upstream resolver
        fails (timeout/SERVFAIL) so an outage doesn't break already-cached names.
        Returns (response, is_stale) or (None, False).
        """
        return self._get_internal(request, allow_stale=True)

    def _get_internal(self, request: dnslib.DNSRecord, allow_stale: bool):
        key = self._make_key(request)
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                return None, False
            packed, stored_at, expiry = entry
            now = time.time()
            is_stale = now >= expiry
            if is_stale:
                # Keep expired entries around until the grace window fully elapses,
                # so a later get_stale() call (triggered by an upstream failure)
                # can still serve them even though a plain get() already reported
                # them as expired.
                if now >= expiry + self.stale_grace_seconds:
                    del self._cache[key]
                    return None, False
                if not allow_stale:
                    return None, False
            else:
                self._cache.move_to_end(key)
        try:
            resp = dnslib.DNSRecord.parse(packed)
        except Exception:
            return None, False
        elapsed = int(now - stored_at)
        for rr in resp.rr + resp.auth:
            rr.ttl = max(1, rr.ttl - elapsed) if not is_stale else 1
        resp.header.id = request.header.id
        return resp, is_stale

    def clear(self):
        with self._lock:
            self._cache.clear()

    def put(self, request: dnslib.DNSRecord, response: dnslib.DNSRecord):
        with self._lock:
            min_ttl_floor = self.min_ttl
            max_ttl_ceiling = self.max_ttl
            negative_ttl = self.negative_ttl

        if response.header.tc:
            return

        if response.header.rcode == dnslib.RCODE.NXDOMAIN:
            # Negative caching: no records to hold TTLs, so use the configured window.
            if negative_ttl <= 0:
                return
            ttl = negative_ttl
        elif response.header.rcode == dnslib.RCODE.NOERROR:
            ttls = [rr.ttl for rr in response.rr if rr.ttl > 0]
            if not ttls:
                return  # Don't cache if no TTL (e.g. empty NODATA with no SOA minimum)
            ttl = min(ttls)
            if min_ttl_floor:
                ttl = max(ttl, min_ttl_floor)
            if max_ttl_ceiling:
                ttl = min(ttl, max_ttl_ceiling)
        else:
            return

        key = self._make_key(request)
        now = time.time()
        with self._lock:
            self._cache[key] = (response.pack(), now, now + ttl)
            self._cache.move_to_end(key)
            while len(self._cache) > self.max_size:
                self._cache.popitem(last=False)

    def _make_key(self, request: dnslib.DNSRecord):
        q = request.q
        return (str(q.qname).lower(), q.qtype, q.qclass, _dnssec_ok(request))


_cache = DNSCache()


def get_cache() -> DNSCache:
    return _cache
