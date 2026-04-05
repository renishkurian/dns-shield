import random
import time
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from dns.models import QueryLog

DOMAINS = [
    ('google.com', 'allowed', '8.8.8.8'),
    ('facebook.com', 'allowed', '1.1.1.1'),
    ('doubleclick.net', 'blocked_list', 'Blocked (Gravity)'),
    ('ads.google.com', 'blocked_list', 'Blocked (Gravity)'),
    ('analytics.samsung.com', 'blocked_pattern', 'Blocked (Pattern)'),
    ('malware-site.net', 'blocked_domain', 'Blocked (Domain)'),
    ('suspicious-dga-123.com', 'blocked_ai', 'Blocked (AI)'),
    ('github.com', 'allowed', 'Cache'),
    ('openai.com', 'allowed', '1.1.1.1'),
    ('netflix.com', 'allowed', '8.8.4.4'),
    ('tracking.samsung.com', 'blocked_pattern', 'Blocked (Pattern)'),
    ('example.org', 'allowed', 'Cache'),
]

CLIENTS = ['192.168.1.10', '192.168.1.15', '192.168.1.20', '10.0.0.5']
QTYPES = ['A', 'AAAA', 'HTTPS', 'TXT']
DNSSEC_STATUSES = ['SECURE', 'INSECURE', 'N/A']

class Command(BaseCommand):
    help = 'Seed the database with test data for Query Log diagnostics'

    def add_arguments(self, parser):
        parser.add_argument('--queries', type=int, default=50, help='Number of query logs to seed')
        parser.add_argument('--clear', action='store_true', help='Clear all query logs')

    def handle(self, *args, **options):
        if options['clear']:
            QueryLog.objects.all().delete()
            self.stdout.write(self.style.SUCCESS('Successfully cleared all Query Logs.'))
            if not options['queries']:
                return

        count = options['queries']
        self.stdout.write(f'Seeding {count} queries...')

        now = timezone.now()
        logs = []
        for i in range(count):
            domain, status, resolved_by = random.choice(DOMAINS)
            # Randomize some 'allowed' to be 'Cache' hits
            if status == 'allowed' and random.random() > 0.7:
                resolved_by = 'Cache'
            
            # DNSSEC logic
            dnssec = 'N/A'
            if status == 'allowed':
                dnssec = random.choice(DNSSEC_STATUSES)
            
            # Timestamp randomization
            ts = now - timedelta(minutes=random.randint(0, 1440)) # last 24 hours

            logs.append(QueryLog(
                domain=domain,
                client_ip=random.choice(CLIENTS),
                status=status,
                query_type=random.choice(QTYPES),
                matched_rule=domain if status.startswith('blocked') else '',
                response_time_ms=random.uniform(0.1, 80.0) if resolved_by != 'Cache' else random.uniform(0.01, 0.5),
                resolved_ip='1.2.3.4' if status == 'allowed' else None,
                resolved_by=resolved_by,
                dnssec_status=dnssec,
                ttl=random.randint(60, 3600),
                timestamp=ts
            ))

        QueryLog.objects.bulk_create(logs)
        self.stdout.write(self.style.SUCCESS(f'Successfully seeded {count} Query Logs.'))
