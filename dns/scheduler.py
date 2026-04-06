import logging
from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from django.utils import timezone as dj_timezone
from django.db.models import Q

logger = logging.getLogger(__name__)

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
    current_day = now.strftime('%a') # Mon, Tue, etc.
    
    rules = ScheduledRule.objects.filter(enabled=True)
    changed = False
    
    for rule in rules:
        # Check if today is a scheduled day
        if current_day not in rule.days:
            continue
            
        # Check if current time is within window
        is_active = False
        if rule.start_time <= rule.end_time:
            is_active = rule.start_time <= current_time <= rule.end_time
        else: # Overnights e.g. 22:00 to 06:00
            is_active = current_time >= rule.start_time or current_time <= rule.end_time
            
        # Apply the rule to the target
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
                    data={'rule_id': rule.id, 'active': is_active}
                )
        except Exception as e:
            logger.error(f"Error applying schedule rule {rule.id}: {str(e)}")

    if changed:
        _reload_matcher()

def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(check_scheduled_rules, 'interval', minutes=1, id='check_schedules')
    scheduler.start()
    logger.info("DNS Shield background scheduler started.")
