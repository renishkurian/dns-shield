"""
Management command: python manage.py create_default_settings

Populates SystemSetting and SafeSearch with sensible defaults
on first install. Safe to run multiple times (uses update_or_create).
"""
from django.core.management.base import BaseCommand
from dns.models import SafeSearch, SystemSetting


DEFAULTS = {
    'upstream_dns': ('127.0.0.1', 'Unbound upstream IP'),
    'upstream_port': ('5335', 'Unbound upstream port'),
    'proxy_host': ('0.0.0.0', 'DNS proxy bind address'),
    'proxy_port': ('53', 'DNS proxy bind port'),
    'session_timeout': ('28800', 'Session timeout in seconds (8 hours)'),
    'log_retention_days': ('30', 'Days to keep query logs'),
    'unbound_config_path': ('/etc/unbound/unbound.conf.d/dns-shield.conf', 'Unbound config file'),
}

SAFE_SEARCH_DEFAULTS = ['google', 'bing', 'youtube', 'duckduckgo', 'yandex']

DEFAULT_ADLISTS = [
    {
        'url': 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
        'name': 'StevenBlack Ads+Malware',
    },
    {
        'url': 'https://adaway.org/hosts.txt',
        'name': 'AdAway Default Blocklist',
    },
]


class Command(BaseCommand):
    help = 'Create default system settings on first install'

    def handle(self, *args, **options):
        for key, (value, description) in DEFAULTS.items():
            _, created = SystemSetting.objects.update_or_create(
                key=key,
                defaults={'value': value, 'description': description}
            )
            if created:
                self.stdout.write(f'  Created setting: {key}')

        for engine in SAFE_SEARCH_DEFAULTS:
            SafeSearch.objects.get_or_create(
                engine=engine,
                defaults={'enabled': False, 'level': 'strict'}
            )

        # Default adlists
        from blocks.models import Adlist
        from django.contrib.auth.models import User
        admin_user = User.objects.filter(is_superuser=True).first()
        for al in DEFAULT_ADLISTS:
            Adlist.objects.get_or_create(
                url=al['url'],
                defaults={'name': al['name'], 'enabled': True, 'created_by': admin_user}
            )

        self.stdout.write(self.style.SUCCESS('Default settings created successfully.'))
