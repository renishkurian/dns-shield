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
    page_data = {
        'component': page_name,
        'props': props,
        'url': request.get_full_path(),
        'version': '1',
    }
    
    if request.headers.get('X-Inertia'):
        return JsonResponse(page_data, headers={'X-Inertia': 'true'})
    
    return render(request, 'index.html', {
        'page': page_name,
        'props': json.dumps(props, default=str),
        'page_json': json.dumps(page_data, default=str),
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


def _call_view(ViewClass, request):
    """Call an APIView's get() method and return the response data."""
    try:
        view = ViewClass()
        view.request = request
        response = view.get(request)
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


# ─── Wire up all page views ───────────────────────────────────────────────────

blocks_domains_view = inertia_page('blocks/Domains', _blocks_domains_props)(lambda r: None)
blocks_patterns_view = inertia_page('blocks/Patterns', _patterns_props)(lambda r: None)
blocks_allowlist_view = inertia_page('blocks/Allowlist', _allowlist_props)(lambda r: None)
lists_view = inertia_page('Lists', _lists_props)(lambda r: None)
safesearch_view = inertia_page('SafeSearch', _safesearch_props)(lambda r: None)
clients_view = inertia_page('Clients', _clients_props)(lambda r: None)
settings_dns_view = inertia_page('settings/DNS')(lambda r: None)
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
