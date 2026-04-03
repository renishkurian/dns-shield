from django.contrib import admin
from django.urls import path, include, re_path
from dns import page_views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('dns.api_urls')),

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
    path('settings/dns', page_views.settings_dns_view, name='settings-dns'),
    path('settings/network', page_views.settings_network_view, name='settings-network'),
    path('settings/doh', page_views.settings_doh_view, name='settings-doh'),
    path('settings/backup', page_views.settings_backup_view, name='settings-backup'),
    path('users', page_views.users_view, name='users'),
    path('profile', page_views.profile_view, name='profile'),
]
