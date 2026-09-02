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


class LogExclusionsTests(TestCase):
    def setUp(self):
        from django.contrib.auth.models import User
        self.user = User.objects.create_user(username='admin', password='password123', is_staff=True)
        from users.models import UserProfile
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        profile.role = 'admin'
        profile.save()

    def test_log_exclusion_manager_matches(self):
        from dns.models import LogExcludedDomain
        from dns_proxy.log_exclusions import get_log_exclusion_manager

        LogExcludedDomain.objects.create(domain='api2.cursor.sh', rule_type='exact', enabled=True)
        LogExcludedDomain.objects.create(domain='local', rule_type='wildcard', enabled=True)
        LogExcludedDomain.objects.create(domain=r'^telemetry\..*', rule_type='regex', enabled=True)

        mgr = get_log_exclusion_manager()
        mgr.reload()

        self.assertTrue(mgr.is_excluded('api2.cursor.sh'))
        self.assertTrue(mgr.is_excluded('API2.CURSOR.SH.'))
        self.assertFalse(mgr.is_excluded('cursor.sh'))

        self.assertTrue(mgr.is_excluded('device.local'))
        self.assertTrue(mgr.is_excluded('my.home.local'))

        self.assertTrue(mgr.is_excluded('telemetry.company.com'))
        self.assertFalse(mgr.is_excluded('google.com'))

    def test_log_exclusion_api(self):
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.user)

        # POST create
        res = client.post('/api/system/log-exclusions', {
            'domain': 'api2.cursor.sh',
            'rule_type': 'exact',
            'comment': 'Cursor noise',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        pk = res.json()['id']

        # GET list
        res = client.get('/api/system/log-exclusions')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 1)

        # POST test match
        res = client.post('/api/system/log-exclusions/test', {'domain': 'api2.cursor.sh'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['is_excluded'])

        # PATCH toggle
        res = client.patch(f'/api/system/log-exclusions/{pk}', {'enabled': False}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.json()['enabled'])

        # DELETE
        res = client.delete(f'/api/system/log-exclusions/{pk}')
        self.assertEqual(res.status_code, 204)


class ModernAdblockAndUncloakingTests(TestCase):
    def test_psl_domain_extraction(self):
        from dns_proxy.matcher import extract_domain_parts, get_matcher
        sub, dom, suf = extract_domain_parts('ads.track.example.co.uk')
        self.assertEqual(dom, 'example')

        matcher = get_matcher()
        # High entropy base domain should be detected
        self.assertTrue(matcher.is_dga('wq79xp01zqabc9dfghj123456789.com'))
        # Standard english domain should not be flagged
        self.assertFalse(matcher.is_dga('wikipedia.org'))

    def test_canary_domains(self):
        from dns_proxy.proxy import CANARY_DOMAINS
        self.assertIn('use-application-dns.net', CANARY_DOMAINS)
        self.assertIn('mask.icloud.com', CANARY_DOMAINS)
        self.assertIn('mask-h2.icloud.com', CANARY_DOMAINS)

    def test_cname_uncloaking_resolution(self):
        from unittest.mock import patch
        import dnslib
        from dns_proxy.forwarder import resolve_cnames
        mock_req = dnslib.DNSRecord.question('tracker.example.com', qtype='CNAME')
        mock_resp = mock_req.reply()
        mock_resp.add_answer(dnslib.RR('tracker.example.com', dnslib.QTYPE.CNAME, rdata=dnslib.CNAME('adnetwork.criteo.com'), ttl=300))
        with patch('dns_proxy.forwarder.forward', return_value=mock_resp):
            targets = resolve_cnames('tracker.example.com')
            self.assertEqual(targets, ['adnetwork.criteo.com'])

    def test_module_toggles_in_matcher(self):
        from dns.models import SystemSetting
        from dns_proxy.matcher import Matcher

        # Disable all modules
        SystemSetting.objects.update_or_create(key='module_cname_uncloaking', defaults={'value': 'false'})
        SystemSetting.objects.update_or_create(key='module_canary_blocking', defaults={'value': 'false'})
        SystemSetting.objects.update_or_create(key='module_dga_protection', defaults={'value': 'false'})
        SystemSetting.objects.update_or_create(key='module_adblock_engine', defaults={'value': 'false'})
        SystemSetting.objects.update_or_create(key='module_rebinding_protection', defaults={'value': 'false'})
        SystemSetting.objects.update_or_create(key='module_https_ech_protection', defaults={'value': 'false'})
        SystemSetting.objects.update_or_create(key='module_rate_limiting', defaults={'value': 'false'})

        m = Matcher()
        self.assertFalse(m.cname_uncloaking_enabled)
        self.assertFalse(m.canary_blocking_enabled)
        self.assertFalse(m.dga_protection_enabled)
        self.assertFalse(m.adblock_engine_enabled)
        self.assertFalse(m.rebinding_protection_enabled)
        self.assertFalse(m.https_ech_protection_enabled)
        self.assertFalse(m.rate_limiting_enabled)

        # Enable them back
        SystemSetting.objects.update_or_create(key='module_cname_uncloaking', defaults={'value': 'true'})
        SystemSetting.objects.update_or_create(key='module_canary_blocking', defaults={'value': 'true'})
        SystemSetting.objects.update_or_create(key='module_rebinding_protection', defaults={'value': 'true'})
        SystemSetting.objects.update_or_create(key='module_https_ech_protection', defaults={'value': 'true'})
        SystemSetting.objects.update_or_create(key='module_rate_limiting', defaults={'value': 'true'})
        m.reload()
        self.assertTrue(m.cname_uncloaking_enabled)
        self.assertTrue(m.canary_blocking_enabled)
        self.assertTrue(m.rebinding_protection_enabled)
        self.assertTrue(m.https_ech_protection_enabled)
        self.assertTrue(m.rate_limiting_enabled)

        # Test module hit increment and counts info
        m.increment_module_hit('cname')
        m.increment_module_hit('cname')
        m.increment_module_hit('canary')
        m.increment_module_hit('rebinding')
        m.increment_module_hit('https_ech')
        m.increment_module_hit('rate_limit')
        info = m.get_modules_info()
        self.assertEqual(info['counts']['cname']['total'], 2)
        self.assertEqual(info['counts']['canary']['total'], 1)
        self.assertEqual(info['counts']['dga']['total'], 0)
        self.assertEqual(info['counts']['rebinding']['total'], 1)
        self.assertEqual(info['counts']['https_ech']['total'], 1)
        self.assertEqual(info['counts']['rate_limit']['total'], 1)

    def test_query_log_module_filter(self):
        from rest_framework.test import APIClient
        from django.contrib.auth.models import User
        from users.models import UserProfile
        from dns.models import QueryLog

        user = User.objects.create_user(username='loguser', password='password123', is_staff=True)
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = 'admin'
        profile.save()

        client = APIClient()
        client.force_authenticate(user=user)

        QueryLog.objects.create(
            domain='cname-ad.test',
            client_ip='192.168.1.10',
            status='blocked_list',
            query_type='A',
            matched_rule='CNAME (Gravity) -> tracker.com',
            resolved_by='Blocked (CNAME Uncloaking)'
        )
        QueryLog.objects.create(
            domain='malicious-rebinding.test',
            client_ip='192.168.1.10',
            status='blocked_domain',
            query_type='A',
            matched_rule='DNS Rebinding: Private IP (192.168.1.1)',
            resolved_by='Blocked (DNS Rebinding)'
        )

        # Filter by cname
        res_cname = client.get('/api/queries?module=cname')
        self.assertEqual(res_cname.status_code, 200)
        self.assertEqual(res_cname.json()['count'], 1)
        self.assertEqual(res_cname.json()['results'][0]['domain'], 'cname-ad.test')

        # Filter by rebinding
        res_rebinding = client.get('/api/queries?module=rebinding')
        self.assertEqual(res_rebinding.status_code, 200)
        self.assertEqual(res_rebinding.json()['count'], 1)
        self.assertEqual(res_rebinding.json()['results'][0]['domain'], 'malicious-rebinding.test')


class HostnameResolverTests(TestCase):
    def test_clean_hostname_strips_suffixes(self):
        from dns.hostname_resolver import _clean_hostname
        self.assertEqual(_clean_hostname('Galaxy-A36-5G.local'), 'Galaxy-A36-5G')
        self.assertEqual(_clean_hostname('nicky-IdeaPad-Pro-5-14IMH9.lan'), 'nicky-IdeaPad-Pro-5-14IMH9')
        self.assertEqual(_clean_hostname('unknown'), '')
        self.assertEqual(_clean_hostname('192-168-0-215'), '')

    def test_enrich_host_info_fills_missing_hostname(self):
        from unittest.mock import patch
        from dns.hostname_resolver import enrich_host_info

        with patch('dns.hostname_resolver.resolve_hostname', return_value=('SM-R861', 'mdns')):
            result = enrich_host_info({'ip': '192.168.0.159', 'mac': '6A:63:1E:1B:0B:3A'})
        self.assertEqual(result['hostname'], 'SM-R861')
        self.assertEqual(result['hostname_source'], 'mdns')

    def test_enrich_host_info_preserves_existing_hostname(self):
        from dns.hostname_resolver import enrich_host_info
        info = {'ip': '192.168.0.40', 'hostname': 'nicky-IdeaPad-Pro-5-14IMH9'}
        self.assertEqual(enrich_host_info(info)['hostname'], 'nicky-IdeaPad-Pro-5-14IMH9')


