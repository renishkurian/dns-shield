"""
API URL routing for DNS Shield.
"""
from django.urls import path
from dns import views

urlpatterns = [
    # Auth
    path('auth/login', views.LoginView.as_view()),
    path('auth/logout', views.LogoutView.as_view()),
    path('auth/me', views.MeView.as_view()),

    # Stats
    path('stats/summary', views.StatsSummaryView.as_view()),
    path('stats/hourly', views.StatsHourlyView.as_view()),
    path('stats/top-domains', views.StatsTopDomainsView.as_view()),
    path('stats/top-allowed-domains', views.StatsTopAllowedDomainsView.as_view()),
    path('stats/top-clients', views.StatsTopClientsView.as_view()),
    path('stats/query-types', views.StatsQueryTypesView.as_view()),
    path('stats/upstream-servers', views.StatsUpstreamServersView.as_view()),

    # Query Log
    path('queries', views.QueryLogListView.as_view()),
    path('queries/export', views.QueryLogExportView.as_view()),

    # Blocks — domains
    path('blocks/domains', views.BlockedDomainListView.as_view()),
    path('blocks/domains/<int:pk>', views.BlockedDomainDetailView.as_view()),
    path('blocks/domains/test', views.BlockedDomainTestView.as_view()),

    # Blocks — patterns
    path('blocks/patterns', views.PatternListView.as_view()),
    path('blocks/patterns/<int:pk>', views.PatternDetailView.as_view()),
    path('blocks/patterns/test', views.PatternTestView.as_view()),

    # Blocks — allowlist
    path('blocks/allowlist', views.AllowlistView.as_view()),
    path('blocks/allowlist/<int:pk>', views.AllowlistDetailView.as_view()),

    # Adlists
    path('lists', views.AdlistView.as_view()),
    path('lists/<int:pk>', views.AdlistDetailView.as_view()),
    path('lists/gravity', views.GravityUpdateView.as_view()),

    # SafeSearch
    path('safesearch', views.SafeSearchView.as_view()),

    # Clients
    path('clients', views.ClientView.as_view()),
    path('clients/<int:pk>', views.ClientDetailView.as_view()),

    # Settings
    path('settings', views.SettingsView.as_view()),

    # Network / iptables
    path('network/iptables', views.NetworkIPTablesView.as_view()),
    path('network/iptables/apply', views.NetworkIPTablesApplyView.as_view()),
    path('network/iptables/save', views.NetworkIPTablesSaveView.as_view()),
    path('network/scan', views.NetworkScanView.as_view()),

    # Users (admin only)
    path('users', views.UserListView.as_view()),
    path('users/<int:pk>', views.UserDetailView.as_view()),
    path('users/<int:pk>/force-logout', views.UserForceLogoutView.as_view()),

    # Block Groups
    path('blocks/groups', views.BlockGroupListView.as_view()),
    path('blocks/groups/<int:pk>', views.BlockGroupDetailView.as_view()),

    # App Firewall
    path('blocks/apps/categories', views.AppCategoryListView.as_view()),
    path('blocks/apps/categories/<int:pk>', views.AppCategoryDetailView.as_view()),
    path('blocks/apps/controls', views.AppControlView.as_view()),

    # VPN (Wireguard)
    path('vpn/server', views.VPNServerView.as_view()),
    path('vpn/peers', views.VPNPeerView.as_view()),
    path('vpn/peers/<int:pk>', views.VPNPeerDetailView.as_view()),
    path('vpn/peers/<int:pk>/config', views.VPNConfigView.as_view()),
    path('vpn/sync', views.VPNSyncView.as_view()),
    path('vpn/status', views.VPNStatusView.as_view()),

    # AI Integration
    path('ai/explain', views.AIExplainView.as_view()),
    path('ai/generate-app', views.AIGenerateAppView.as_view()),

    # System
    path('system/status', views.SystemStatusView.as_view()),
    path('system/reload-proxy', views.SystemReloadProxyView.as_view()),
    path('system/unbound/detect', views.UnboundDetectView.as_view()),
    path('system/backup', views.SystemBackupView.as_view()),
    
    # Diagnostics
    path('system/seed-data', views.SeedDataView.as_view()),
    path('system/clear-queries', views.ClearQueryLogView.as_view()),

    # Shield Control
    path('system/shield-status', views.ShieldStatusView.as_view()),
    path('system/shield-toggle', views.ShieldToggleView.as_view()),
]
