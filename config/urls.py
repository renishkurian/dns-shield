from django.contrib import admin
from django.urls import path, include, re_path
from dns import page_views, views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('dns.api_urls')),

    # DoH / DNS-over-HTTPS endpoints (RFC 8484 & JSON)
    path('dns-query', views.DoHQueryView.as_view(), name='doh-query'),
    path('resolve', views.DoHQueryView.as_view(), name='doh-resolve'),

    # Page routes
    path('login', page_views.login_page, name='login'),
    path('', page_views.dashboard, name='dashboard'),
    path('queries', page_views.queries_view, name='queries'),
    path('blocks/domains', page_views.blocks_domains_view, name='blocks-domains'),
    path('blocks/patterns', page_views.blocks_patterns_view, name='blocks-patterns'),
    path('blocks/allowlist', page_views.blocks_allowlist_view, name='blocks-allowlist'),
    path('lists', page_views.lists_view, name='lists'),
    path('clients', page_views.clients_view, name='clients'),
    path('safesearch', page_views.safesearch_view, name='safesearch'),
    path('local-dns', page_views.local_dns_view, name='local-dns'),
    path('settings/dns', page_views.settings_dns_view, name='settings-dns'),
    path('settings/network', page_views.settings_network_view, name='settings-network'),
    path('settings/doh', page_views.settings_doh_view, name='settings-doh'),
    path('settings/backup', page_views.settings_backup_view, name='settings-backup'),
    path('settings/ai', page_views.settings_ai_view, name='settings-ai'),
    path('settings/ai-usage', page_views.ai_usage_view, name='settings-ai-usage'),
    path('settings/trusted-dns', page_views.trusted_dns_view, name='settings-trusted-dns'),
    path('users', page_views.users_view, name='users'),
    path('profile', page_views.profile_view, name='profile'),

    # v2.0
    path('blocks/groups', page_views.block_groups_view, name='block-groups'),
    path('vpn', page_views.vpn_view, name='vpn'),
    path('blocks/apps', page_views.app_firewall_view, name='app-firewall'),
    path('network/map', page_views.network_map_view, name='network-map'),
    path('docs', page_views.documentation_view, name='docs'),

    # Phase 21+
    path('tools', page_views.tools_view, name='tools'),
    path('ai-report', page_views.ai_report_view, name='ai-report'),
    path('settings/system-log', page_views.system_log_view, name='system-log'),
        path('audit', page_views.audit_log_view, name='audit'),
    path('settings/health', page_views.system_health_view, name='system-health'),
    path('settings/api-token', page_views.api_token_view, name='api-token'),
    path('settings/appearance', page_views.appearance_view, name='appearance'),
    
    # Phase 22-29 Pages
    path('clients/<int:pk>', page_views.client_detail_view, name='client-detail'),
    path('schedules', page_views.schedules_view, name='schedules'),
    path('settings/alerts', page_views.alerts_view, name='alerts'),
    path('domains/detail', page_views.domain_detail_view, name='domain-detail'),
    path('settings/threat-feeds', page_views.threat_feeds_view, name='threat-feeds'),
    path('notifications', page_views.notifications_view, name='notifications'),
]
