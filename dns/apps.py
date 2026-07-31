import os
from django.apps import AppConfig


class DnsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'dns'

    def ready(self):
        # Start under Daphne/production and runserver child; skip migrate etc.
        from .scheduler import should_start_on_ready, start_scheduler
        if not should_start_on_ready():
            return
        # Prevent double-start if ready() is invoked more than once
        if os.environ.get('DNS_SHIELD_SCHEDULER_STARTED') == '1':
            return
        try:
            start_scheduler()
            os.environ['DNS_SHIELD_SCHEDULER_STARTED'] = '1'
        except Exception:
            pass
