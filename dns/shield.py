import time
import threading
import logging
from django.utils import timezone
from dns.models import SystemSetting

logger = logging.getLogger('dns_proxy')

# Simple in-memory cache to avoid DB hits on every DNS query
_shield_cache = {
    'active': True,
    'disabled_until': 0,
    'last_check': 0
}
_lock = threading.Lock()

def is_shield_active():
    """
    Check if the DNS Shield is currently active.
    Refreshes state from DB every 5 seconds to maintain high performance.
    """
    now = time.time()
    with _lock:
        if now - _shield_cache['last_check'] < 5:
            if not _shield_cache['active']:
                # If disabled, check if it has expired
                if _shield_cache['disabled_until'] > 0 and now > _shield_cache['disabled_until']:
                    _shield_cache['active'] = True
                    _shield_cache['disabled_until'] = 0
            return _shield_cache['active']

    # Refresh from DB
    try:
        active_setting = SystemSetting.objects.filter(key='dns_shield_active').first()
        until_setting = SystemSetting.objects.filter(key='dns_shield_disabled_until').first()
        
        active = active_setting.value == 'true' if active_setting else True
        disabled_until = float(until_setting.value) if until_setting and until_setting.value else 0
        
        # Check expiry
        if not active and disabled_until > 0 and now > disabled_until:
            active = True
            disabled_until = 0
            # Auto-reactivate in DB
            if active_setting:
                active_setting.value = 'true'
                active_setting.save()

        with _lock:
            _shield_cache['active'] = active
            _shield_cache['disabled_until'] = disabled_until
            _shield_cache['last_check'] = now
            
        return active
    except Exception as e:
        # Fallback to active on error to ensure protection
        logger.error(f"Error checking shield status: {e}")
        return True

def set_shield_status(active, duration_minutes=0):
    """
    Update the shield status in the DB.
    duration_minutes: 0 for permanent, or > 0 for timed disable.
    """
    disabled_until = 0
    if not active and duration_minutes > 0:
        disabled_until = time.time() + (duration_minutes * 60)
    
    SystemSetting.objects.update_or_create(
        key='dns_shield_active',
        defaults={'value': 'true' if active else 'false', 'description': 'Main toggle for DNS filtering'}
    )
    SystemSetting.objects.update_or_create(
        key='dns_shield_disabled_until',
        defaults={'value': str(disabled_until), 'description': 'Timestamp when shield should re-enable'}
    )
    
    # Invalidate cache
    with _lock:
        _shield_cache['last_check'] = 0
