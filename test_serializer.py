import dnslib
from django.test import TestCase
from dns.serializers import (
    ClientSerializer,
    BlockedDomainSerializer,
    AllowedDomainSerializer,
    _normalize_block_domain,
)
from rest_framework.exceptions import ValidationError
from dns_proxy.cache import DNSCache, get_cache
from dns_proxy.matcher import Matcher


class DNSCacheAndMatcherTests(TestCase):
    def test_dns_cache_clear(self):
        cache = DNSCache()
        req = dnslib.DNSRecord.question('example.com')
        resp = req.reply()
        resp.add_answer(dnslib.RR('example.com', dnslib.QTYPE.A, rdata=dnslib.A('1.2.3.4'), ttl=300))
        cache.put(req, resp)
        self.assertIsNotNone(cache.get(req))

        cache.clear()
        self.assertIsNone(cache.get(req))

    def test_matcher_reload_clears_cache(self):
        cache = get_cache()
        req = dnslib.DNSRecord.question('cached-domain.com')
        resp = req.reply()
        resp.add_answer(dnslib.RR('cached-domain.com', dnslib.QTYPE.A, rdata=dnslib.A('1.2.3.4'), ttl=300))
        cache.put(req, resp)
        self.assertIsNotNone(cache.get(req))

        matcher = Matcher()
        self.assertIsNone(cache.get(req))


class RegexDomainValidationTests(TestCase):
    def test_normalize_block_domain_rejects_scheme_in_regex(self):
        with self.assertRaises(ValidationError) as ctx:
            _normalize_block_domain('https://googleads.g.doubleclick.net/', allow_regex=True)
        self.assertIn('regex rules are matched against the bare hostname only', str(ctx.exception))

        with self.assertRaises(ValidationError) as ctx:
            _normalize_block_domain('http://example.com/test', allow_regex=True)
        self.assertIn('regex rules are matched against the bare hostname only', str(ctx.exception))

    def test_normalize_block_domain_accepts_valid_regex(self):
        res = _normalize_block_domain(r'doubleclick\.net$', allow_regex=True)
        self.assertEqual(res, r'doubleclick\.net$')

        res = _normalize_block_domain(r'^ads\..*\.com$', allow_regex=True)
        self.assertEqual(res, r'^ads\..*\.com$')

    def test_blocked_domain_serializer_rejects_regex_url(self):
        s_bad = BlockedDomainSerializer(data={
            'domain': 'https://googleads.g.doubleclick.net/',
            'block_type': 'regex',
        })
        self.assertFalse(s_bad.is_valid())
        self.assertTrue(
            any('regex rules are matched against the bare hostname only' in str(err)
                for err in s_bad.errors.get('non_field_errors', []))
        )

        s_good = BlockedDomainSerializer(data={
            'domain': r'doubleclick\.net$',
            'block_type': 'regex',
        })
        self.assertTrue(s_good.is_valid(), s_good.errors)
        self.assertEqual(s_good.validated_data['domain'], r'doubleclick\.net$')

    def test_allowed_domain_serializer_rejects_regex_url(self):
        s_bad = AllowedDomainSerializer(data={
            'domain': 'https://allowed.example.com/',
            'allow_type': 'regex',
        })
        self.assertFalse(s_bad.is_valid())
        self.assertTrue(
            any('regex rules are matched against the bare hostname only' in str(err)
                for err in s_bad.errors.get('non_field_errors', []))
        )

        s_good = AllowedDomainSerializer(data={
            'domain': r'example\.com$',
            'allow_type': 'regex',
        })
        self.assertTrue(s_good.is_valid(), s_good.errors)
        self.assertEqual(s_good.validated_data['domain'], r'example\.com$')


class SystemStatusViewTests(TestCase):
    def test_system_status_endpoint(self):
        from rest_framework.test import APIClient
        client = APIClient()
        response = client.get('/api/system/status')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('client_ip', data)
        self.assertIn('is_client_connected', data)
        self.assertIn('server_ip', data)
        self.assertIn('proxy_running', data)
        self.assertIn('unbound', data)
        self.assertIn('total_queries_24h', data)

    def test_system_diagnostics_endpoint(self):
        from rest_framework.test import APIClient
        client = APIClient()
        response = client.post('/api/system/diagnostics')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('proxy_test', data)
        self.assertIn('block_test', data)
        self.assertIn('upstream_test', data)
