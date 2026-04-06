import json
import logging
import httpx
from django.conf import settings
from django.core.mail import send_mail
from dns.models import AlertConfig, SystemEvent

logger = logging.getLogger(__name__)

async def notify_event(event_type, message, data=None):
    """
    Core alert dispatcher. Checks AlertConfig and sends to appropriate channels.
    """
    # 1. Create a SystemEvent for the UI Notification Centre
    severity = 'info'
    if event_type in ['malware_hit', 'gravity_fail']:
        severity = 'critical'
    elif event_type in ['shield_expire', 'high_volume']:
        severity = 'warning'
        
    event = SystemEvent.objects.create(
        type=event_type,
        message=message,
        severity=severity,
        data=data or {}
    )

    # 2. Get active external alert configs for this event type
    configs = AlertConfig.objects.filter(event_type=event_type, enabled=True)
    if not configs.exists():
        return

    for config in configs:
        try:
            if config.channel == 'email':
                _send_email_alert(config.destination, event_type, message)
            elif config.channel == 'slack':
                await _send_webhook_alert(config.destination, {"text": f"🚨 *DNS Shield Alert*: {message}"})
            elif config.channel == 'telegram':
                token = getattr(settings, 'TELEGRAM_BOT_TOKEN', None)
                if token:
                    url = f"https://api.telegram.org/bot{token}/sendMessage"
                    await _send_webhook_alert(url, {"chat_id": config.destination, "text": f"🚨 DNS Shield Alert: {message}"})
            elif config.channel == 'webhook':
                await _send_webhook_alert(config.destination, {
                    "event": event_type,
                    "message": message,
                    "severity": severity,
                    "data": data,
                    "timestamp": event.created_at.isoformat()
                })
        except Exception as e:
            logger.error(f"Failed to send alert via {config.channel}: {str(e)}")

def _send_email_alert(to_email, event_type, message):
    subject = f"[DNS Shield] ALERT: {event_type.replace('_', ' ').capitalize()}"
    body = f"Event: {event_type}\nMessage: {message}\n\nManage your alert settings at DNS Shield dashboard."
    send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [to_email], fail_silently=True)

async def _send_webhook_alert(url, payload):
    async with httpx.AsyncClient(timeout=10) as client:
        await client.post(url, json=payload)
