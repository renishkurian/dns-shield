"""
Management command: python manage.py run_proxy
Starts the DNS proxy and the background query log writer.
Runs forever until SIGINT/SIGTERM.
"""
import os
import signal
import time
import django

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Run the DNS Shield DNS proxy'

    def add_arguments(self, parser):
        parser.add_argument('--host', default=None)
        parser.add_argument('--port', type=int, default=None)

    def handle(self, *args, **options):
        import threading
        from django.conf import settings
        from dns_proxy.matcher import get_matcher
        from dns_proxy import dns_logger, proxy

        host = options['host'] or settings.DNS_PROXY_HOST
        port = options['port'] or settings.DNS_PROXY_PORT
        upstream_host = settings.UPSTREAM_DNS
        upstream_port = settings.UPSTREAM_DNS_PORT

        self.stdout.write(self.style.SUCCESS(
            f'Starting DNS Shield proxy on {host}:{port} → {upstream_host}:{upstream_port}'
        ))

        # Start the async query log writer
        dns_logger.start()

        # Load matcher
        matcher = get_matcher()

        # Start server
        server = proxy.start_proxy(host, port, upstream_host, upstream_port, matcher)

        stop = threading.Event()
        last_token = None

        def _current_reload_token():
            try:
                from dns.models import SystemSetting
                row = SystemSetting.objects.filter(key='matcher_reload_token').first()
                return row.value if row else None
            except Exception:
                return None

        def _shutdown(signum, frame):
            self.stdout.write('\nShutting down DNS proxy...')
            stop.set()

        signal.signal(signal.SIGINT, _shutdown)
        signal.signal(signal.SIGTERM, _shutdown)

        self.stdout.write(self.style.SUCCESS('DNS proxy running. Press Ctrl+C to stop.'))
        last_token = _current_reload_token()

        while not stop.is_set():
            time.sleep(1)
            token = _current_reload_token()
            if token is not None and token != last_token:
                self.stdout.write('Rules changed — reloading matcher…')
                matcher.reload()
                try:
                    from dns_proxy.local_dns import reload_local_dns
                    reload_local_dns()
                except Exception as exc:
                    self.stderr.write(f'Local DNS reload failed: {exc}')
                try:
                    from dns_proxy.log_exclusions import get_log_exclusion_manager
                    get_log_exclusion_manager().reload()
                except Exception as exc:
                    self.stderr.write(f'Log exclusions reload failed: {exc}')
                last_token = token

        proxy.stop_proxy()
        dns_logger.stop()
        self.stdout.write(self.style.SUCCESS('DNS proxy stopped.'))
