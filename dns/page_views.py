"""
Django Inertia-style view integration.
All pages are served by a single catch-all view that renders the React SPA
with page-specific props injected as JSON into the HTML template.
Authentication is enforced at view level.
"""
import json
from functools import wraps
from django.shortcuts import redirect, render
from django.contrib.auth.decorators import login_required
from django.utils import timezone as dj_timezone
from datetime import timedelta
from django.views.decorators.http import require_http_methods
from django.http import JsonResponse

from dns.models import QueryLog, SafeSearch, SystemSetting, Client
from blocks.models import BlockedDomain, Pattern, Adlist, AllowedDomain
from users.models import UserProfile
from django.contrib.auth.models import User


def _user_props(user):
    if not user.is_authenticated:
        return None
    role = 'admin' if user.is_superuser else 'viewer'
    try:
        role = user.profile.role
    except Exception:
        pass
    return {
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'role': role,
    }


def render_inertia(request, page_name, props):
    """
    Helper to render an Inertia response.
    Returns JSON if X-Inertia header is present, else renders index.html.
    """
    from django.conf import settings
    from dns.vite_assets import get_vite_assets

    props = {**props, 'debug': bool(settings.DEBUG)}
    page_data = {
        'component': page_name,
        'props': props,
        'url': request.get_full_path(),
        'version': '1',
    }

    if request.headers.get('X-Inertia'):
        return JsonResponse(page_data, headers={'X-Inertia': 'true'})

    # Template puts this in data-page="..."; Django auto-escapes quotes/&/<>.
    # Do not mark_safe — |safe previously broke on apostrophes in AI prompts.
    page_json = json.dumps(page_data, default=str, ensure_ascii=False)

    assets = get_vite_assets()
    return render(request, 'index.html', {
        'page': page_name,
        'page_json': page_json,
        'vite_js': assets['js'],
        'vite_css': assets['css'],
        'debug': bool(settings.DEBUG),
    })


def inertia_page(page_name, get_props=None, admin_only=False):
    """Decorator factory that wraps a view to render an Inertia page."""
    def decorator(view_func):
        @wraps(view_func)
        @login_required(login_url='/login')
        def wrapper(request, *args, **kwargs):
            user = request.user
            if admin_only:
                try:
                    is_admin = user.profile.role == 'admin'
                except Exception:
                    is_admin = user.is_superuser
                if not is_admin:
                    return redirect('/')
            props = {}
            if get_props:
                props = get_props(request) or {}
            props['user'] = _user_props(user)
            return render_inertia(request, page_name, props)
        return wrapper
    return decorator


@require_http_methods(['GET'])
def login_page(request):
    if request.user.is_authenticated:
        return redirect('/')
    return render_inertia(request, 'Login', {'user': None})


@login_required(login_url='/login')
def dashboard(request):
    from dns.views import (
        StatsSummaryView, StatsHourlyView, StatsTopDomainsView,
        StatsTopAllowedDomainsView, StatsTopClientsView, SystemStatusView
    )
    summary = _call_view(StatsSummaryView, request)
    hourly = _call_view(StatsHourlyView, request)
    top_domains = _call_view(StatsTopDomainsView, request)
    top_allowed_domains = _call_view(StatsTopAllowedDomainsView, request)
    top_clients = _call_view(StatsTopClientsView, request)
    system_status = _call_view(SystemStatusView, request)
    user_data = _user_props(request.user)

    return render_inertia(request, 'Dashboard', {
        'user': user_data,
        'summary': summary,
        'hourly': hourly,
        'topDomains': top_domains,
        'topAllowedDomains': top_allowed_domains,
        'topClients': top_clients,
        'systemStatus': system_status,
    })


def _call_view(ViewClass, request, *args, **kwargs):
    """Call an APIView's get() method and return the response data."""
    try:
        from rest_framework.request import Request
        drf_request = request if isinstance(request, Request) else Request(request)
        view = ViewClass()
        view.request = drf_request
        view.format_kwarg = None
        response = view.get(drf_request, *args, **kwargs)
        return response.data
    except Exception:
        return None


def _query_log_props(request):
    qs = QueryLog.objects.all().order_by('-timestamp')[:50]
    from dns.serializers import QueryLogSerializer
    return {'initialQueries': QueryLogSerializer(qs, many=True).data}


queries_view = inertia_page('QueryLog', _query_log_props)(lambda r: None)


def _blocks_domains_props(request):
    from dns.serializers import BlockedDomainSerializer
    return {'domains': BlockedDomainSerializer(BlockedDomain.objects.all(), many=True).data}


def _patterns_props(request):
    from dns.serializers import PatternSerializer
    return {'patterns': PatternSerializer(Pattern.objects.all(), many=True).data}


def _allowlist_props(request):
    from dns.serializers import AllowedDomainSerializer
    return {'allowlist': AllowedDomainSerializer(AllowedDomain.objects.all(), many=True).data}


def _lists_props(request):
    from dns.serializers import AdlistSerializer
    from dns.models import SystemSetting
    unique_count = SystemSetting.objects.filter(key='gravity_unique_count').first()
    return {
        'lists': AdlistSerializer(Adlist.objects.all(), many=True).data,
        'uniqueCount': int(unique_count.value) if unique_count else 0
    }


def _safesearch_props(request):
    from dns.serializers import SafeSearchSerializer
    return {'safesearch': SafeSearchSerializer(SafeSearch.objects.all(), many=True).data}


def _local_dns_props(request):
    from dns.models import LocalDnsRecord, LocalCnameRecord
    from dns.serializers import LocalDnsRecordSerializer, LocalCnameRecordSerializer
    return {
        'records': LocalDnsRecordSerializer(LocalDnsRecord.objects.all(), many=True).data,
        'cnames': LocalCnameRecordSerializer(LocalCnameRecord.objects.all(), many=True).data,
    }


def _clients_props(request):
    from dns.serializers import ClientSerializer
    return {'clients': ClientSerializer(Client.objects.all(), many=True).data}


def _users_props(request):
    from dns.serializers import UserSerializer
    from blocks.models import BlockGroup
    from dns.serializers import BlockGroupSerializer
    return {
        'users': UserSerializer(User.objects.select_related('profile').all(), many=True).data,
        'groups': BlockGroupSerializer(BlockGroup.objects.all(), many=True).data
    }


def _block_groups_props(request):
    from blocks.models import BlockGroup
    from dns.serializers import BlockGroupSerializer
    return {'groups': BlockGroupSerializer(BlockGroup.objects.all(), many=True).data}


def _vpn_props(request):
    from dns.models import VPNServer, VPNPeer
    from dns.serializers import VPNServerSerializer, VPNPeerSerializer
    server = VPNServer.objects.all().first()
    peers = VPNPeer.objects.all()
    return {
        'server': VPNServerSerializer(server).data if server else None,
        'peers': VPNPeerSerializer(peers, many=True).data,
    }


def _app_firewall_props(request):
    from blocks.models import AppCategory, AppControl, BlockGroup
    from dns.serializers import AppCategorySerializer, AppControlSerializer, BlockGroupSerializer
    return {
        'categories': AppCategorySerializer(AppCategory.objects.all(), many=True).data,
        'controls': AppControlSerializer(AppControl.objects.all(), many=True).data,
        'groups': BlockGroupSerializer(BlockGroup.objects.all(), many=True).data
    }


def _network_map_props(request):
    from dns.serializers import ClientSerializer
    return {'clients': ClientSerializer(Client.objects.all(), many=True).data}


def _client_detail_props(request):
    pk = request.resolver_match.kwargs.get('pk')
    from dns.views import ClientStatsView
    return _call_view(ClientStatsView, request, pk=pk)


def _schedules_props(request):
    from dns.models import ScheduledRule
    from dns.serializers import ScheduledRuleSerializer
    from blocks.models import BlockGroup
    from dns.serializers import BlockGroupSerializer
    return {
        'schedules': ScheduledRuleSerializer(ScheduledRule.objects.all(), many=True).data,
        'groups': BlockGroupSerializer(BlockGroup.objects.all(), many=True).data
    }


def _alerts_props(request):
    from dns.models import AlertConfig
    from dns.serializers import AlertConfigSerializer
    return {'configs': AlertConfigSerializer(AlertConfig.objects.all(), many=True).data}


def _domain_detail_props(request):
    domain = request.GET.get('domain')
    if not domain: return {}
    from dns.views import DomainAnalyticsView
    return _call_view(DomainAnalyticsView, request)


def _system_log_props(request):
    from dns.models import SystemEvent
    from dns.serializers import SystemEventSerializer
    events = SystemEvent.objects.all()[:100]
    return {'events': SystemEventSerializer(events, many=True).data}


def _ai_usage_props(request):
    # List UI loads full rows (incl. prompt/response) via /api/ai/usage.
    # Keep SSR payload light and avoid embedding huge text in data-page.
    return {'logs': []}


def _trusted_dns_props(request):
    return {'domains': []}


def _threat_feeds_props(request):
    from blocks.models import Adlist
    from dns.serializers import AdlistSerializer
    feeds = Adlist.objects.filter(comment__startswith='[THREAT_FEED]')
    return {'feeds': AdlistSerializer(feeds, many=True).data}


def _settings_dns_props(request):
    from dns.models import SystemSetting
    settings = {s.key: s.value for s in SystemSetting.objects.all()}
    return {'settings': settings}


# ─── Wire up all page views ───────────────────────────────────────────────────

blocks_domains_view = inertia_page('blocks/Domains', _blocks_domains_props)(lambda r: None)
blocks_patterns_view = inertia_page('blocks/Patterns', _patterns_props)(lambda r: None)
blocks_allowlist_view = inertia_page('blocks/Allowlist', _allowlist_props)(lambda r: None)
lists_view = inertia_page('Lists', _lists_props)(lambda r: None)
safesearch_view = inertia_page('SafeSearch', _safesearch_props)(lambda r: None)
local_dns_view = inertia_page('LocalDNS', _local_dns_props)(lambda r: None)
clients_view = inertia_page('Clients', _clients_props)(lambda r: None)
settings_dns_view = inertia_page('settings/DNS', _settings_dns_props)(lambda r: None)
settings_network_view = inertia_page('settings/Network')(lambda r: None)
settings_doh_view = inertia_page('settings/DoH')(lambda r: None)
settings_backup_view = inertia_page('settings/Backup')(lambda r: None)
settings_ai_view = inertia_page('settings/AI')(lambda r: None)
users_view = inertia_page('Users', _users_props, admin_only=True)(lambda r: None)
profile_view = inertia_page('Profile')(lambda r: None)

# v2.0 Pages
block_groups_view = inertia_page('blocks/Groups', _block_groups_props, admin_only=True)(lambda r: None)
vpn_view = inertia_page('VPN', _vpn_props, admin_only=True)(lambda r: None)
app_firewall_view = inertia_page('blocks/AppFirewall', _app_firewall_props)(lambda r: None)
network_map_view = inertia_page('NetworkMap', _network_map_props)(lambda r: None)

# Docs
documentation_view = inertia_page('Documentation')(lambda r: None)

# Phase 21+ Pages
tools_view = inertia_page('Tools')(lambda r: None)
ai_report_view = inertia_page('AIReport', admin_only=True)(lambda r: None)
audit_log_view = inertia_page('AuditLog')(lambda r: None)
system_health_view = inertia_page('settings/SystemHealth')(lambda r: None)
api_token_view = inertia_page('settings/ApiToken')(lambda r: None)
appearance_view = inertia_page('settings/Appearance')(lambda r: None)
system_log_view = inertia_page('settings/SystemLog', _system_log_props)(lambda r: None)
ai_usage_view = inertia_page('settings/AIUsage', _ai_usage_props, admin_only=True)(lambda r: None)
trusted_dns_view = inertia_page('settings/TrustedDNS', _trusted_dns_props, admin_only=True)(lambda r: None)

# Phase 22-29 Pages
client_detail_view = inertia_page('ClientDetail', _client_detail_props)(lambda r: None)
schedules_view = inertia_page('Schedules', _schedules_props)(lambda r: None)
alerts_view = inertia_page('settings/Alerts', _alerts_props)(lambda r: None)
domain_detail_view = inertia_page('DomainDetail', _domain_detail_props)(lambda r: None)
threat_feeds_view = inertia_page('settings/ThreatFeeds', _threat_feeds_props)(lambda r: None)
notifications_view = inertia_page('Notifications')(lambda r: None)
