import os
import logging
from datetime import timedelta

from django.utils import timezone

# Initialize django if run as a script
if __name__ == '__main__':
    import django
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    django.setup()

from dns.models import QueryLog, Client, SystemSetting, SystemEvent
from blocks.models import BlockGroup
from dns.ai_service import get_ai_config, ask_ai
from dns.domain_trust import (
    filter_untrusted_domains, bump_domains_trust, HIGH_TRUST_THRESHOLD,
)

logger = logging.getLogger('dns.ai_worker')

INTERVAL_HOURS_KEY = 'ai_auto_interval_hours'
AUTO_ENABLED_KEY = 'ai_auto_enabled'
LAST_RUN_KEY = 'ai_auto_last_run'


def get_auto_interval_hours() -> int:
    raw = SystemSetting.objects.filter(key=INTERVAL_HOURS_KEY).values_list('value', flat=True).first()
    try:
        hours = int(raw or '24')
    except (TypeError, ValueError):
        hours = 24
    return max(1, hours)


def is_auto_enabled() -> bool:
    return SystemSetting.objects.filter(key=AUTO_ENABLED_KEY, value='true').exists()


def mark_last_run(when=None):
    when = when or timezone.now()
    SystemSetting.objects.update_or_create(
        key=LAST_RUN_KEY,
        defaults={
            'value': when.isoformat(),
            'description': 'Last auto intelligence profiler run (ISO timestamp)',
        },
    )
    return when


def should_run_auto_profiler() -> bool:
    """True when scheduled auto intelligence is due."""
    enabled, provider, _, _ = get_ai_config()
    if not enabled or not provider or not is_auto_enabled():
        return False

    interval = timedelta(hours=get_auto_interval_hours())
    last_raw = SystemSetting.objects.filter(key=LAST_RUN_KEY).values_list('value', flat=True).first()
    if not last_raw:
        return True
    try:
        from django.utils.dateparse import parse_datetime
        last = parse_datetime(last_raw)
        if last is None:
            return True
        if timezone.is_naive(last):
            last = timezone.make_aware(last, timezone.get_current_timezone())
    except Exception:
        return True
    return timezone.now() >= last + interval


def run_profiler(lookback_hours=None, force=False):
    """
    Run the AI behavioral profiler over recent DNS queries.
    Returns a short status message.
    """
    enabled, provider, _api_key, _model = get_ai_config()
    if not enabled:
        msg = 'Smart AI is disabled. Skipping profiling.'
        logger.info(msg)
        return msg

    if lookback_hours is None:
        lookback_hours = min(get_auto_interval_hours(), 24)

    logger.info('Running Smart AI Behavioral Profiler (lookback=%sh)...', lookback_hours)

    time_threshold = timezone.now() - timedelta(hours=lookback_hours)
    recent_logs = QueryLog.objects.filter(
        timestamp__gte=time_threshold,
        status='allowed',
    ).values('client_ip', 'domain')

    if not recent_logs.exists():
        msg = 'No recent queries to analyze.'
        logger.info(msg)
        mark_last_run()
        return msg

    client_profiles = {}
    for log in recent_logs:
        ip = log['client_ip']
        client_profiles.setdefault(ip, set()).add(log['domain'])

    system_prompt = (
        'You are an advanced autonomous network security orchestrator. '
        'I will provide a list of unique domains visited by a specific IP '
        '(high-trust/known-safe domains have already been removed). '
        'You must evaluate if this behavior indicates the host is COMPROMISED (malware beaconing, botnet C2, '
        'excessive shady domains), VIOLATING tracking limits, or is SAFE. '
        'If they are compromised or actively malicious, reply strictly with the word: QUARANTINE. '
        'To provide a reason, put it after a colon. '
        'Example output: QUARANTINE: Client contacting multiple known Emotet C2 endpoints. '
        'If safe, reply: SAFE: brief reason.'
    )

    evaluated = 0
    quarantined = 0

    for ip, domains in client_profiles.items():
        # Dedupe + skip domains already scored as high-trust
        domain_list = filter_untrusted_domains(domains)
        if len(domain_list) < 5:
            continue

        prompt_domains = domain_list[:100]
        user_prompt = f'Client IP: {ip}\nVisited Domains ({len(prompt_domains)} unique): {", ".join(prompt_domains)}'

        try:
            response = ask_ai(
                system_prompt,
                user_prompt,
                feature='auto_intelligence',
                query=ip,
            )
            response = (response or '').strip()
            evaluated += 1

            if response.upper().startswith('QUARANTINE'):
                reason = response.split(':', 1)[-1].strip() if ':' in response else 'Behavioral anomalies detected.'
                logger.warning('[AI THREAT INTEL] Flagging %s — %s', ip, reason)
                quarantined += 1

                BlockGroup.objects.get_or_create(
                    name='Quarantine',
                    defaults={'description': 'Automatically isolated by Smart AI.'},
                )
                client, _ = Client.objects.get_or_create(ip=ip)
                if '[AI-QUARANTINED]' not in (client.name or ''):
                    client.name = f'[AI-QUARANTINED] {(client.name or ip).strip()}'
                    client.save(update_fields=['name'])

                SystemEvent.objects.create(
                    type='ai_quarantine',
                    message=f'AI flagged {ip} for quarantine: {reason}',
                    severity='warning',
                    data={'ip': ip, 'reason': reason},
                )
                # Mark suspicious domains low trust so they stay in future scans
                bump_domains_trust(
                    prompt_domains[:20],
                    25,
                    label='malicious',
                    reason=reason,
                    source='auto_intelligence',
                )
            elif response.upper().startswith('SAFE'):
                reason = response.split(':', 1)[-1].strip() if ':' in response else 'Behavioral profile looks safe.'
                # Promote seen domains so next runs skip them
                bump_domains_trust(
                    prompt_domains,
                    HIGH_TRUST_THRESHOLD,
                    label='safe',
                    reason=reason,
                    source='auto_intelligence',
                )
        except Exception as e:
            logger.error('Error evaluating %s: %s', ip, e)

    mark_last_run()
    msg = f'Auto intelligence finished: evaluated {evaluated} client(s), quarantined {quarantined}.'
    logger.info(msg)
    SystemEvent.objects.create(
        type='ai_profiler',
        message=msg,
        severity='info',
        data={'evaluated': evaluated, 'quarantined': quarantined, 'force': force},
    )
    return msg


def maybe_run_auto_profiler():
    """Called from the minute scheduler; runs only when due."""
    if not should_run_auto_profiler():
        return None
    try:
        return run_profiler()
    except Exception as e:
        logger.error('Auto profiler failed: %s', e)
        return None


def start_worker(interval=300):
    """Legacy standalone loop (manage.py / CLI). Prefer APScheduler via dns.scheduler."""
    import time
    logger.info('Started AI Profiling Worker thread (interval=%ss)...', interval)
    while True:
        try:
            run_profiler()
        except Exception as e:
            logger.error('Worker crashed: %s', e)
        time.sleep(interval)


if __name__ == '__main__':
    start_worker()
