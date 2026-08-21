import logging
import os
import sys

from apscheduler.schedulers.background import BackgroundScheduler
from django.utils import timezone as dj_timezone

logger = logging.getLogger(__name__)

_scheduler = None


def check_scheduled_rules():
    """
    Check all scheduled rules and enable/disable target blocks.
    Runs every minute.
    """
    from dns.models import ScheduledRule, SystemEvent
    from blocks.models import BlockedDomain, Pattern, AppControl
    from dns.views import _reload_matcher

    now = dj_timezone.now()
    current_time = now.time()
    current_day = now.strftime('%a')  # Mon, Tue, etc.

    rules = ScheduledRule.objects.filter(enabled=True)
    changed = False

    for rule in rules:
        if current_day not in rule.days:
            continue

        is_active = False
        if rule.start_time <= rule.end_time:
            is_active = rule.start_time <= current_time <= rule.end_time
        else:
            is_active = current_time >= rule.start_time or current_time <= rule.end_time

        try:
            if rule.rule_type == 'domain':
                targets = BlockedDomain.objects.filter(domain=rule.target, group=rule.group)
                for t in targets:
                    if t.enabled != is_active:
                        t.enabled = is_active
                        t.save()
                        changed = True
            elif rule.rule_type == 'pattern':
                targets = Pattern.objects.filter(name=rule.target, group=rule.group)
                for t in targets:
                    if t.enabled != is_active:
                        t.enabled = is_active
                        t.save()
                        changed = True
            elif rule.rule_type == 'app_category':
                targets = AppControl.objects.filter(category__name=rule.target, group=rule.group)
                for t in targets:
                    if t.enabled != is_active:
                        t.enabled = is_active
                        t.save()
                        changed = True

            if changed:
                msg = f"Schedule '{rule.name}' {'activated' if is_active else 'deactivated'} for {rule.target}"
                logger.info(msg)
                SystemEvent.objects.create(
                    type='schedule_event',
                    message=msg,
                    severity='info',
                    data={'rule_id': rule.id, 'active': is_active},
                )
        except Exception as e:
            logger.error(f'Error applying schedule rule {rule.id}: {str(e)}')

    if changed:
        _reload_matcher()


def check_ai_auto_profiler():
    """Run Smart AI behavioral profiler when the configured interval is due."""
    try:
        from dns.ai_worker import maybe_run_auto_profiler
        maybe_run_auto_profiler()
    except Exception as e:
        logger.error('AI auto profiler tick failed: %s', e)


def cleanup_old_query_logs():
    """
    Delete query logs older than log_retention_days (default 30).
    Batched deletes keep SQLite responsive under large tables (~1M+ rows).
    """
    from datetime import timedelta

    from dns.models import QueryLog, SystemSetting

    try:
        row = SystemSetting.objects.filter(key='log_retention_days').first()
        days = int(row.value) if row and str(row.value).isdigit() else 30
    except Exception:
        days = 30

    if days <= 0:
        return

    cutoff = dj_timezone.now() - timedelta(days=days)
    batch_size = 5000
    total = 0
    while True:
        ids = list(
            QueryLog.objects.filter(timestamp__lt=cutoff)
            .values_list('id', flat=True)[:batch_size]
        )
        if not ids:
            break
        deleted, _ = QueryLog.objects.filter(id__in=ids).delete()
        total += deleted
        if deleted < batch_size:
            break

    if total:
        logger.info('Purged %s query logs older than %s days', total, days)


def start_scheduler():
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    _scheduler = BackgroundScheduler()
    _scheduler.add_job(check_scheduled_rules, 'interval', minutes=1, id='check_schedules', replace_existing=True)
    _scheduler.add_job(check_ai_auto_profiler, 'interval', minutes=1, id='ai_auto_profiler', replace_existing=True)
    _scheduler.add_job(
        cleanup_old_query_logs,
        'interval',
        hours=6,
        id='query_log_retention',
        replace_existing=True,
    )
    _scheduler.start()
    logger.info('DNS Shield background scheduler started (rules + AI + log retention).')
    return _scheduler


def should_start_on_ready() -> bool:
    """Avoid starting during migrate/collectstatic and Django autoreload parent."""
    skip_cmds = {
        'migrate', 'makemigrations', 'collectstatic', 'shell', 'test',
        'createsuperuser', 'create_default_settings',
    }
    if any(cmd in sys.argv for cmd in skip_cmds):
        return False
    # Django runserver: only start in the reloader child
    if 'runserver' in sys.argv and os.environ.get('RUN_MAIN') != 'true':
        return False
    return True
