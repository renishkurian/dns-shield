import os
from django.apps import AppConfig

class DnsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'dns'

    def ready(self):
        # Only start scheduler in the main process, not during migrations or reload
        if os.environ.get('RUN_MAIN') == 'true' or os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
            try:
                from .scheduler import start_scheduler
                start_scheduler()
            except ImportError:
                pass
