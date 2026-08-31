import time
import threading
import dnslib
from collections import OrderedDict

class DNSCache:
    def __init__(self, max_size=1000):
        self._cache = OrderedDict()
        self._lock = threading.Lock()
        self.max_size = max_size

    def get(self, request: dnslib.DNSRecord):
        key = self._make_key(request)
        with self._lock:
            if key in self._cache:
                resp, expiry = self._cache[key]
                if time.time() < expiry:
                    self._cache.move_to_end(key)
                    # Update ID to match request
                    resp.header.id = request.header.id
                    return resp
                else:
                    del self._cache[key]
        return None

    def clear(self):
        with self._lock:
            self._cache.clear()

    def put(self, request: dnslib.DNSRecord, response: dnslib.DNSRecord):
        key = self._make_key(request)
        # Find min TTL in response RRs
        ttls = [rr.ttl for rr in response.rr if rr.ttl > 0]
        if not ttls:
            return # Don't cache if no TTL
        
        min_ttl = min(ttls)
        if min_ttl <= 0:
            return
            
        expiry = time.time() + min_ttl
        with self._lock:
            self._cache[key] = (response, expiry)
            self._cache.move_to_end(key)
            if len(self._cache) > self.max_size:
                self._cache.popitem(last=False)

    def _make_key(self, request: dnslib.DNSRecord):
        return (str(request.q.qname).lower(), request.q.qtype)

_cache = DNSCache()

def get_cache() -> DNSCache:
    return _cache
