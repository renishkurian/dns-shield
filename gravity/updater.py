"""
Gravity update system — replaces Pi-hole gravity.
Fetches adlists, parses domains, bulk-inserts to GravityDomain,
and broadcasts progress to admin WebSocket clients.
"""
import asyncio
import logging
from datetime import datetime, timezone

import httpx
from asgiref.sync import sync_to_async
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)

_gravity_running = False


async def broadcast(message: str, level: str = 'info'):
    """Send a message to all admin WebSocket clients watching the gravity update."""
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        await channel_layer.group_send('gravity', {
            'type': 'gravity_output',
            'data': {
                'message': message,
                'level': level,
                'timestamp': datetime.now(timezone.utc).isoformat(),
            }
        })
    except Exception as exc:
        logger.warning(f"Gravity broadcast error: {exc}")


def parse_list(text: str) -> set:
    """Parse an adlist (hosts format, ABP, or plain domains)."""
    domains = set()
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('#') or line.startswith('!'):
            continue
        # Hosts format: 0.0.0.0 domain.com or 127.0.0.1 domain.com
        if line.startswith(('0.0.0.0 ', '127.0.0.1 ')):
            parts = line.split()
            if len(parts) >= 2 and parts[1] not in ('localhost', '0.0.0.0', '127.0.0.1', '::1'):
                domains.add(parts[1].lower())
        # ABP format: ||domain.com^
        elif line.startswith('||') and line.endswith('^'):
            d = line[2:-1].lower()
            if '/' not in d and d:
                domains.add(d)
        # Plain domain
        elif '/' not in line and ' ' not in line and '.' in line:
            domains.add(line.lower())
    return domains


async def run_gravity_update():
    global _gravity_running
    if _gravity_running:
        await broadcast("Gravity update already running.", level='warning')
        return

    _gravity_running = True
    try:
        from blocks.models import Adlist, GravityDomain
        from django.utils import timezone as dj_timezone

        adlists = await sync_to_async(list)(Adlist.objects.filter(enabled=True))
        await broadcast(f"Starting gravity update for {len(adlists)} lists...", level='info')

        total_domains = 0
        for adlist in adlists:
            await broadcast(f"Fetching {adlist.name}: {adlist.url}")
            try:
                async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                    r = await client.get(adlist.url)
                    r.raise_for_status()
                domains = parse_list(r.text)

                await broadcast(f"  Parsed {len(domains):,} domains from {adlist.name}")

                # Bulk upsert in sync context
                @sync_to_async
                def save_domains(adlist_obj, domain_set):
                    GravityDomain.objects.filter(adlist=adlist_obj).delete()
                    GravityDomain.objects.bulk_create(
                        [GravityDomain(domain=d, adlist=adlist_obj) for d in domain_set],
                        batch_size=10000,
                        ignore_conflicts=True
                    )
                    adlist_obj.domain_count = len(domain_set)
                    adlist_obj.last_updated = dj_timezone.now()
                    adlist_obj.last_error = ''
                    adlist_obj.save(update_fields=['domain_count', 'last_updated', 'last_error'])

                await save_domains(adlist, domains)
                total_domains += len(domains)
                await broadcast(f"  ✓ {adlist.name}: {len(domains):,} domains", level='success')

            except Exception as exc:
                error_msg = str(exc)
                logger.error(f"Error fetching {adlist.url}: {error_msg}")
                await sync_to_async(lambda: setattr(adlist, 'last_error', error_msg) or adlist.save(update_fields=['last_error']))()
                await broadcast(f"  ✗ {adlist.name}: {error_msg}", level='error')

        # 2. Calculate and store global uniqueness
        from blocks.models import GravityDomain
        from dns.models import SystemSetting
        
        all_unique_count = await sync_to_async(GravityDomain.objects.values('domain').distinct().count)()
        await sync_to_async(SystemSetting.objects.update_or_create)(
            key='gravity_unique_count',
            defaults={'value': str(all_unique_count), 'description': 'Total unique domains in gravity cache'}
        )

        # 3. Reload matcher cache
        from dns_proxy.matcher import get_matcher
        matcher = get_matcher()
        await sync_to_async(matcher.reload)()
        await broadcast(
            f"Gravity update complete. {total_domains:,} total fetched, {all_unique_count:,} unique domains loaded. Proxy cache reloaded.",
            level='success'
        )

    except Exception as exc:
        logger.exception(f"Gravity update failed: {exc}")
        await broadcast(f"Gravity update failed: {exc}", level='error')
        from dns.alerts import notify_event
        await notify_event('gravity_fail', f"Gravity update failed: {str(exc)}")
    finally:
        _gravity_running = False
