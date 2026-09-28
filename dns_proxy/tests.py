"""Tests for the TCP/cache/block-mode/XFF hardening. Run: python -m unittest dns_proxy.tests"""
import socket
import struct
import threading
import time
import unittest

import dnslib

from dns_proxy import cache as cache_mod
from dns_proxy import forwarder
from dns_proxy.proxy import _block_reply


def _q(name='example.com', qtype='A', do=False):
    r = dnslib.DNSRecord.question(name, qtype)
    if do:
        r.add_ar(dnslib.EDNS0(flags='do', udp_len=4096))
    return r


class FakeUpstream:
    """UDP replies truncated; TCP replies with a full answer."""
    def __init__(self):
        self.udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.udp.bind(('127.0.0.1', 0))
        self.port = self.udp.getsockname()[1]
        self.tcp = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.tcp.bind(('127.0.0.1', self.port))
        self.tcp.listen(5)
        threading.Thread(target=self._udp, daemon=True).start()
        threading.Thread(target=self._tcp, daemon=True).start()

    def _answer(self, data, tc):
        req = dnslib.DNSRecord.parse(data)
        rep = req.reply()
        rep.header.tc = 1 if tc else 0
        if not tc:
            rep.add_answer(dnslib.RR(req.q.qname, ttl=60, rdata=dnslib.A('1.2.3.4')))
        return rep.pack()

    def _udp(self):
        while True:
            data, addr = self.udp.recvfrom(4096)
            self.udp.sendto(self._answer(data, True), addr)

    def _tcp(self):
        while True:
            conn, _ = self.tcp.accept()
            (n,) = struct.unpack('!H', conn.recv(2))
            data = conn.recv(n)
            out = self._answer(data, False)
            conn.sendall(struct.pack('!H', len(out)) + out)
            conn.close()


class ForwarderTests(unittest.TestCase):
    def test_tcp_retry_on_truncation(self):
        up = FakeUpstream()
        reply = forwarder.forward(_q(), '127.0.0.1', up.port)
        self.assertFalse(reply.header.tc)
        self.assertEqual(str(reply.rr[0].rdata), '1.2.3.4')


class CacheTests(unittest.TestCase):
    def _reply(self, req, ttl=60):
        rep = req.reply()
        rep.add_answer(dnslib.RR(req.q.qname, ttl=ttl, rdata=dnslib.A('9.9.9.9')))
        return rep

    def test_hit_updates_id_and_returns_independent_objects(self):
        c = cache_mod.DNSCache(max_size=10)
        req = _q(); req.header.id = 111
        c.put(req, self._reply(req))
        req2 = _q(); req2.header.id = 222
        a, b = c.get(req2), c.get(req2)
        self.assertEqual(a.header.id, 222)
        self.assertIsNot(a, b)

    def test_ttl_counts_down(self):
        c = cache_mod.DNSCache(max_size=10)
        req = _q(); c.put(req, self._reply(req, ttl=60))
        key = c._make_key(req)
        packed, stored_at, expiry = c._cache[key]
        c._cache[key] = (packed, stored_at - 10, expiry)
        self.assertLessEqual(c.get(req).rr[0].ttl, 50)

    def test_do_bit_separates_entries(self):
        c = cache_mod.DNSCache(max_size=10)
        plain, do = _q(), _q(do=True)
        c.put(plain, self._reply(plain))
        self.assertIsNone(c.get(do))
        self.assertIsNotNone(c.get(plain))

    def test_lru_eviction_and_no_cache_of_errors(self):
        c = cache_mod.DNSCache(max_size=2)
        for n in ('a.test', 'b.test', 'c.test'):
            r = _q(n); c.put(r, self._reply(r))
        self.assertIsNone(c.get(_q('a.test')))
        bad = _q('bad.test'); rep = bad.reply(); rep.header.rcode = dnslib.RCODE.SERVFAIL
        rep.add_answer(dnslib.RR(bad.q.qname, ttl=60, rdata=dnslib.A('1.1.1.1')))
        c.put(bad, rep)
        self.assertIsNone(c.get(bad))


class BlockModeTests(unittest.TestCase):
    def test_modes(self):
        self.assertEqual(_block_reply(_q(), 'nxdomain').header.rcode, dnslib.RCODE.NXDOMAIN)
        self.assertEqual(_block_reply(_q(), 'refused').header.rcode, dnslib.RCODE.REFUSED)
        r = _block_reply(_q(), 'null_ip')
        self.assertEqual(str(r.rr[0].rdata), '0.0.0.0')
        r6 = _block_reply(_q(qtype='AAAA'), 'null_ip')
        self.assertEqual(str(r6.rr[0].rdata), '::')
        self.assertEqual(len(_block_reply(_q(qtype='MX'), 'null_ip').rr), 0)


class ClientIpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from django.conf import settings
        if not settings.configured:
            settings.configure(TRUSTED_PROXIES=['127.0.0.1', '::1'])

    def _req(self, remote, xff=None):
        class R:
            META = {'REMOTE_ADDR': remote}
        if xff:
            R.META['HTTP_X_FORWARDED_FOR'] = xff
        return R

    def test_untrusted_peer_cannot_spoof(self):
        from dns.net_utils import get_client_ip
        self.assertEqual(get_client_ip(self._req('203.0.113.5', '10.0.0.1')), '203.0.113.5')

    def test_trusted_proxy_uses_real_client(self):
        from dns.net_utils import get_client_ip
        self.assertEqual(get_client_ip(self._req('127.0.0.1', '192.168.1.50')), '192.168.1.50')

    def test_spoofed_leading_entry_ignored(self):
        from dns.net_utils import get_client_ip
        self.assertEqual(get_client_ip(self._req('127.0.0.1', '10.9.9.9, 198.51.100.7')), '198.51.100.7')


if __name__ == '__main__':
    unittest.main()
