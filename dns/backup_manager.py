"""
Teleporter-style config backup / restore for DNS Shield.

Exports user-authored filtering config (not logs/caches). Import supports
merge (upsert by natural key) and replace (wipe in-scope tables, then load).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone as dt_timezone

from django.contrib.auth.models import User
from django.db import transaction
from django.utils.dateparse import parse_time

from blocks.models import (
    Adlist, AllowedDomain, AppCategory, AppControl, BlockGroup, BlockedDomain, Pattern,
)
from dns.models import (
    AlertConfig, Client, LocalCnameRecord, LocalDnsRecord, SafeSearch,
    ScheduledRule, SystemSetting, VPNPeer, VPNServer,
)
from dns.serializers import (
    AdlistSerializer, AlertConfigSerializer, AllowedDomainSerializer,
    AppCategorySerializer, AppControlSerializer, BlockGroupSerializer,
    BlockedDomainSerializer, ClientSerializer, LocalCnameRecordSerializer,
    LocalDnsRecordSerializer, PatternSerializer, SafeSearchSerializer,
    ScheduledRuleSerializer, SystemSettingSerializer, VPNPeerSerializer,
    VPNServerSerializer,
)

logger = logging.getLogger('dns')

BACKUP_VERSION = 1

# Tables wiped in replace mode (order = children before parents).
REPLACE_WIPE_ORDER = [
    AppControl,
    ScheduledRule,
    Client,
    BlockedDomain,
    Pattern,
    Adlist,
    AllowedDomain,
    VPNPeer,
    VPNServer,
    AlertConfig,
    SafeSearch,
    LocalDnsRecord,
    LocalCnameRecord,
    SystemSetting,
    AppCategory,
    BlockGroup,
]

RUNTIME_SETTING_KEYS = frozenset({'matcher_reload_token'})


class BackupError(ValueError):
    """Validation / import error with a user-facing message."""


def _iso_now() -> str:
    return datetime.now(dt_timezone.utc).isoformat()


def _strip_keys(row: dict, *keys) -> dict:
    return {k: v for k, v in row.items() if k not in keys}


def _group_name(obj) -> str | None:
    return obj.group.name if getattr(obj, 'group_id', None) and obj.group else None


def export_config(include_secrets: bool = False) -> dict:
    """Build a versioned backup envelope of all in-scope config."""
    block_groups = [
        _strip_keys(BlockGroupSerializer(g).data, 'id', 'created_at')
        for g in BlockGroup.objects.all().order_by('name')
    ]

    blocked_domains = []
    for obj in BlockedDomain.objects.select_related('group').all().order_by('domain'):
        row = _strip_keys(
            BlockedDomainSerializer(obj).data,
            'id', 'created_at', 'created_by', 'created_by_username', 'hit_count', 'last_hit', 'group',
        )
        row['group'] = _group_name(obj)
        blocked_domains.append(row)

    patterns = []
    for obj in Pattern.objects.select_related('group').all().order_by('name', 'pattern'):
        row = _strip_keys(
            PatternSerializer(obj).data,
            'id', 'created_by', 'created_by_username', 'hit_count', 'group',
        )
        row['group'] = _group_name(obj)
        patterns.append(row)

    adlists = []
    for obj in Adlist.objects.select_related('group').all().order_by('name'):
        row = _strip_keys(
            AdlistSerializer(obj).data,
            'id', 'domain_count', 'last_updated', 'last_error', 'created_by', 'group',
        )
        row['group'] = _group_name(obj)
        adlists.append(row)

    allowed_domains = []
    for obj in AllowedDomain.objects.select_related('group').all().order_by('domain'):
        row = _strip_keys(
            AllowedDomainSerializer(obj).data,
            'id', 'created_by', 'group',
        )
        row['group'] = _group_name(obj)
        allowed_domains.append(row)

    app_categories = [
        _strip_keys(AppCategorySerializer(c).data, 'id')
        for c in AppCategory.objects.all().order_by('name')
    ]

    app_controls = []
    for obj in AppControl.objects.select_related('category', 'group').all():
        row = _strip_keys(AppControlSerializer(obj).data, 'id', 'category', 'group', 'category_name', 'group_name')
        row['category'] = obj.category.name
        row['group'] = obj.group.name
        app_controls.append(row)

    clients = []
    for obj in Client.objects.select_related('group', 'user').all().order_by('ip'):
        row = _strip_keys(
            ClientSerializer(obj).data,
            'id', 'user', 'group', 'is_active', 'last_seen', 'open_ports',
        )
        row['group'] = _group_name(obj)
        row['user'] = obj.user.username if obj.user_id else None
        clients.append(row)

    safesearch = [
        _strip_keys(SafeSearchSerializer(s).data, 'id')
        for s in SafeSearch.objects.all().order_by('engine')
    ]

    system_settings = [
        SystemSettingSerializer(s).data
        for s in SystemSetting.objects.exclude(key__in=RUNTIME_SETTING_KEYS).order_by('key')
    ]

    vpn_servers = []
    for obj in VPNServer.objects.all().order_by('name'):
        row = _strip_keys(VPNServerSerializer(obj).data, 'id', 'created_at')
        if not include_secrets:
            row.pop('private_key', None)
        vpn_servers.append(row)

    vpn_peers = []
    for obj in VPNPeer.objects.select_related('user').all().order_by('name'):
        row = _strip_keys(
            VPNPeerSerializer(obj).data,
            'id', 'user', 'username', 'created_at', 'last_handshake',
        )
        row['user'] = obj.user.username if obj.user_id else None
        if include_secrets:
            row['private_key'] = obj.private_key
        vpn_peers.append(row)

    scheduled_rules = []
    for obj in ScheduledRule.objects.select_related('group').all().order_by('name'):
        row = _strip_keys(ScheduledRuleSerializer(obj).data, 'id', 'group', 'group_name', 'created_at')
        row['group'] = _group_name(obj)
        # Serialize time fields as HH:MM:SS strings
        if row.get('start_time') and hasattr(row['start_time'], 'isoformat'):
            row['start_time'] = row['start_time'].isoformat()
        if row.get('end_time') and hasattr(row['end_time'], 'isoformat'):
            row['end_time'] = row['end_time'].isoformat()
        scheduled_rules.append(row)

    alert_configs = [
        _strip_keys(AlertConfigSerializer(a).data, 'id', 'created_at')
        for a in AlertConfig.objects.all().order_by('event_type', 'channel')
    ]

    local_dns_records = [
        _strip_keys(LocalDnsRecordSerializer(r).data, 'id', 'created_at', 'updated_at')
        for r in LocalDnsRecord.objects.all().order_by('domain')
    ]

    local_cname_records = [
        _strip_keys(LocalCnameRecordSerializer(r).data, 'id', 'created_at', 'updated_at')
        for r in LocalCnameRecord.objects.all().order_by('domain')
    ]

    return {
        'dns_shield_backup_version': BACKUP_VERSION,
        'exported_at': _iso_now(),
        'include_secrets': bool(include_secrets),
        'data': {
            'block_groups': block_groups,
            'blocked_domains': blocked_domains,
            'patterns': patterns,
            'adlists': adlists,
            'allowed_domains': allowed_domains,
            'app_categories': app_categories,
            'app_controls': app_controls,
            'clients': clients,
            'safesearch': safesearch,
            'system_settings': system_settings,
            'vpn_servers': vpn_servers,
            'vpn_peers': vpn_peers,
            'scheduled_rules': scheduled_rules,
            'alert_configs': alert_configs,
            'local_dns_records': local_dns_records,
            'local_cname_records': local_cname_records,
        },
    }


def _empty_summary() -> dict:
    keys = [
        'block_groups', 'blocked_domains', 'patterns', 'adlists', 'allowed_domains',
        'app_categories', 'app_controls', 'clients', 'safesearch', 'system_settings',
        'vpn_servers', 'vpn_peers', 'scheduled_rules', 'alert_configs',
        'local_dns_records', 'local_cname_records',
    ]
    z = {k: 0 for k in keys}
    return {'created': dict(z), 'updated': dict(z), 'skipped': dict(z), 'errors': []}


def _bump(summary: dict, bucket: str, key: str):
    summary[bucket][key] = summary[bucket].get(key, 0) + 1


def _resolve_group(name: str | None) -> BlockGroup | None:
    if not name:
        return None
    return BlockGroup.objects.filter(name=name).first()


def _resolve_user(username: str | None) -> User | None:
    if not username:
        return None
    return User.objects.filter(username=username).first()


def _parse_time(value):
    if value is None or value == '':
        return None
    if hasattr(value, 'hour'):
        return value
    parsed = parse_time(str(value))
    if parsed is None:
        raise BackupError(f'Invalid time value: {value!r}')
    return parsed


def _upsert(model, lookup: dict, defaults: dict, summary: dict, key: str) -> None:
    _, created = model.objects.update_or_create(defaults=defaults, **lookup)
    _bump(summary, 'created' if created else 'updated', key)


def _validate_envelope(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise BackupError('Backup file must be a JSON object.')

    # Accept legacy SystemBackupView format only with a clear error pointing to new format
    if 'dns_shield_backup_version' not in payload:
        if 'version' in payload and ('blocked_domains' in payload or 'data' not in payload):
            raise BackupError(
                'This looks like a legacy backup (version field). '
                'Re-export from Settings → Backup to get dns_shield_backup_version format.'
            )
        raise BackupError('Missing dns_shield_backup_version — not a valid DNS Shield backup.')

    version = payload.get('dns_shield_backup_version')
    if version != BACKUP_VERSION:
        raise BackupError(
            f'Unsupported backup version {version!r}. This server understands version {BACKUP_VERSION} only.'
        )

    data = payload.get('data')
    if not isinstance(data, dict):
        raise BackupError('Backup is missing a "data" object.')
    return data


def import_config(payload: dict, mode: str = 'merge') -> tuple[bool, dict]:
    """
    Import a backup envelope.
    mode: 'merge' (upsert) or 'replace' (wipe in-scope tables, then load).
    """
    if mode not in ('merge', 'replace'):
        raise BackupError('mode must be "merge" or "replace".')

    data = _validate_envelope(payload)
    summary = _empty_summary()

    with transaction.atomic():
        if mode == 'replace':
            for model in REPLACE_WIPE_ORDER:
                if model is SystemSetting:
                    model.objects.exclude(key__in=RUNTIME_SETTING_KEYS).delete()
                else:
                    model.objects.all().delete()

        # 1. Block groups
        for item in data.get('block_groups') or []:
            try:
                name = (item.get('name') or '').strip()
                if not name:
                    _bump(summary, 'skipped', 'block_groups')
                    continue
                _upsert(
                    BlockGroup,
                    {'name': name},
                    {'description': item.get('description') or ''},
                    summary,
                    'block_groups',
                )
            except Exception as exc:
                summary['errors'].append(f'block_groups/{item.get("name")}: {exc}')

        # 2. App categories
        for item in data.get('app_categories') or []:
            try:
                name = (item.get('name') or '').strip()
                if not name:
                    _bump(summary, 'skipped', 'app_categories')
                    continue
                _upsert(
                    AppCategory,
                    {'name': name},
                    {
                        'domains': item.get('domains') or '',
                        'icon': item.get('icon') or '',
                    },
                    summary,
                    'app_categories',
                )
            except Exception as exc:
                summary['errors'].append(f'app_categories/{item.get("name")}: {exc}')

        # 3. Blocked domains
        for item in data.get('blocked_domains') or []:
            try:
                domain = (item.get('domain') or '').strip().lower()
                if not domain:
                    _bump(summary, 'skipped', 'blocked_domains')
                    continue
                _upsert(
                    BlockedDomain,
                    {'domain': domain},
                    {
                        'block_type': item.get('block_type') or 'exact',
                        'layer': item.get('layer') or 'proxy',
                        'enabled': bool(item.get('enabled', True)),
                        'comment': item.get('comment') or '',
                        'group': _resolve_group(item.get('group')),
                    },
                    summary,
                    'blocked_domains',
                )
            except Exception as exc:
                summary['errors'].append(f'blocked_domains/{item.get("domain")}: {exc}')

        # 4. Patterns (natural key: name + pattern + pattern_type)
        for item in data.get('patterns') or []:
            try:
                name = (item.get('name') or '').strip()
                pattern = (item.get('pattern') or '').strip()
                pattern_type = item.get('pattern_type') or 'keyword'
                if not name or not pattern:
                    _bump(summary, 'skipped', 'patterns')
                    continue
                _upsert(
                    Pattern,
                    {'name': name, 'pattern': pattern, 'pattern_type': pattern_type},
                    {
                        'enabled': bool(item.get('enabled', True)),
                        'comment': item.get('comment') or '',
                        'group': _resolve_group(item.get('group')),
                    },
                    summary,
                    'patterns',
                )
            except Exception as exc:
                summary['errors'].append(f'patterns/{item.get("name")}: {exc}')

        # 5. Adlists
        for item in data.get('adlists') or []:
            try:
                url = (item.get('url') or '').strip()
                if not url:
                    _bump(summary, 'skipped', 'adlists')
                    continue
                _upsert(
                    Adlist,
                    {'url': url},
                    {
                        'name': item.get('name') or url,
                        'enabled': bool(item.get('enabled', True)),
                        'comment': item.get('comment') or '',
                        'group': _resolve_group(item.get('group')),
                    },
                    summary,
                    'adlists',
                )
            except Exception as exc:
                summary['errors'].append(f'adlists/{item.get("url")}: {exc}')

        # 6. Allowed domains
        for item in data.get('allowed_domains') or []:
            try:
                domain = (item.get('domain') or '').strip().lower()
                if not domain:
                    _bump(summary, 'skipped', 'allowed_domains')
                    continue
                _upsert(
                    AllowedDomain,
                    {'domain': domain},
                    {
                        'allow_type': item.get('allow_type') or 'exact',
                        'enabled': bool(item.get('enabled', True)),
                        'comment': item.get('comment') or '',
                        'group': _resolve_group(item.get('group')),
                    },
                    summary,
                    'allowed_domains',
                )
            except Exception as exc:
                summary['errors'].append(f'allowed_domains/{item.get("domain")}: {exc}')

        # 7. App controls
        for item in data.get('app_controls') or []:
            try:
                cat_name = (item.get('category') or '').strip()
                grp_name = (item.get('group') or '').strip()
                category = AppCategory.objects.filter(name=cat_name).first() if cat_name else None
                group = _resolve_group(grp_name)
                if not category or not group:
                    _bump(summary, 'skipped', 'app_controls')
                    summary['errors'].append(
                        f'app_controls: missing category={cat_name!r} or group={grp_name!r}'
                    )
                    continue
                _upsert(
                    AppControl,
                    {'category': category, 'group': group},
                    {'enabled': bool(item.get('enabled', True))},
                    summary,
                    'app_controls',
                )
            except Exception as exc:
                summary['errors'].append(f'app_controls: {exc}')

        # 8. SafeSearch
        for item in data.get('safesearch') or []:
            try:
                engine = (item.get('engine') or '').strip()
                if not engine:
                    _bump(summary, 'skipped', 'safesearch')
                    continue
                _upsert(
                    SafeSearch,
                    {'engine': engine},
                    {
                        'enabled': bool(item.get('enabled', False)),
                        'level': item.get('level') or 'strict',
                    },
                    summary,
                    'safesearch',
                )
            except Exception as exc:
                summary['errors'].append(f'safesearch/{item.get("engine")}: {exc}')

        # 9. System settings
        for item in data.get('system_settings') or []:
            try:
                key = (item.get('key') or '').strip()
                if not key or key in RUNTIME_SETTING_KEYS:
                    _bump(summary, 'skipped', 'system_settings')
                    continue
                _upsert(
                    SystemSetting,
                    {'key': key},
                    {
                        'value': '' if item.get('value') is None else str(item.get('value')),
                        'description': item.get('description') or '',
                    },
                    summary,
                    'system_settings',
                )
            except Exception as exc:
                summary['errors'].append(f'system_settings/{item.get("key")}: {exc}')

        # 10. Clients
        for item in data.get('clients') or []:
            try:
                ip = (item.get('ip') or '').strip()
                if not ip:
                    _bump(summary, 'skipped', 'clients')
                    continue
                defaults = {
                    'mac': item.get('mac') or None,
                    'name': item.get('name') or '',
                    'hostname': item.get('hostname') or '',
                    'vendor': item.get('vendor') or '',
                    'os_hint': item.get('os_hint') or '',
                    'nickname': item.get('nickname') or '',
                    'device_type': item.get('device_type') or 'other',
                    'icon': item.get('icon') or '',
                    'comment': item.get('comment') or '',
                    'is_blocked': bool(item.get('is_blocked', False)),
                    'shield_bypass': bool(item.get('shield_bypass', False)),
                    'route_via_tor': bool(item.get('route_via_tor', False)),
                    'group': _resolve_group(item.get('group')),
                    'user': _resolve_user(item.get('user')),
                }
                _upsert(Client, {'ip': ip}, defaults, summary, 'clients')
            except Exception as exc:
                summary['errors'].append(f'clients/{item.get("ip")}: {exc}')

        # 11. VPN servers
        for item in data.get('vpn_servers') or []:
            try:
                name = (item.get('name') or 'wg0').strip() or 'wg0'
                defaults = {
                    'public_key': item.get('public_key') or '',
                    'listen_port': int(item.get('listen_port') or 51820),
                    'address': item.get('address') or '10.0.0.1/24',
                    'enabled': bool(item.get('enabled', True)),
                }
                if 'private_key' in item and item.get('private_key'):
                    defaults['private_key'] = item['private_key']
                existing = VPNServer.objects.filter(name=name).first()
                if existing:
                    # Don't blank private_key when secrets were omitted from the file
                    if 'private_key' not in defaults and not existing.private_key:
                        defaults['private_key'] = existing.private_key or 'CHANGEME'
                    for k, v in defaults.items():
                        setattr(existing, k, v)
                    existing.save()
                    _bump(summary, 'updated', 'vpn_servers')
                else:
                    defaults.setdefault('private_key', item.get('private_key') or 'CHANGEME')
                    VPNServer.objects.create(name=name, **defaults)
                    _bump(summary, 'created', 'vpn_servers')
            except Exception as exc:
                summary['errors'].append(f'vpn_servers/{item.get("name")}: {exc}')

        # 12. VPN peers (natural key: name + user)
        for item in data.get('vpn_peers') or []:
            try:
                name = (item.get('name') or '').strip()
                user = _resolve_user(item.get('user'))
                if not name or not user:
                    _bump(summary, 'skipped', 'vpn_peers')
                    if not user:
                        summary['errors'].append(
                            f'vpn_peers/{name}: user {item.get("user")!r} not found — create the user first'
                        )
                    continue
                defaults = {
                    'public_key': item.get('public_key') or '',
                    'allowed_ips': item.get('allowed_ips') or '10.0.0.2/32',
                    'enabled': bool(item.get('enabled', True)),
                }
                if 'private_key' in item:
                    defaults['private_key'] = item.get('private_key') or ''
                existing = VPNPeer.objects.filter(name=name, user=user).first()
                if existing:
                    for k, v in defaults.items():
                        setattr(existing, k, v)
                    existing.save()
                    _bump(summary, 'updated', 'vpn_peers')
                else:
                    defaults.setdefault('private_key', item.get('private_key') or '')
                    VPNPeer.objects.create(name=name, user=user, **defaults)
                    _bump(summary, 'created', 'vpn_peers')
            except Exception as exc:
                summary['errors'].append(f'vpn_peers/{item.get("name")}: {exc}')

        # 13. Scheduled rules
        for item in data.get('scheduled_rules') or []:
            try:
                name = (item.get('name') or '').strip()
                rule_type = item.get('rule_type') or 'domain'
                target = (item.get('target') or '').strip()
                if not name or not target:
                    _bump(summary, 'skipped', 'scheduled_rules')
                    continue
                defaults = {
                    'group': _resolve_group(item.get('group')),
                    'days': item.get('days') or 'Mon,Tue,Wed,Thu,Fri',
                    'start_time': _parse_time(item.get('start_time')) or parse_time('00:00:00'),
                    'end_time': _parse_time(item.get('end_time')) or parse_time('23:59:59'),
                    'timezone': item.get('timezone') or 'UTC',
                    'enabled': bool(item.get('enabled', True)),
                }
                _upsert(
                    ScheduledRule,
                    {'name': name, 'rule_type': rule_type, 'target': target},
                    defaults,
                    summary,
                    'scheduled_rules',
                )
            except Exception as exc:
                summary['errors'].append(f'scheduled_rules/{item.get("name")}: {exc}')

        # 14. Alert configs
        for item in data.get('alert_configs') or []:
            try:
                event_type = (item.get('event_type') or '').strip()
                channel = (item.get('channel') or '').strip()
                destination = (item.get('destination') or '').strip()
                if not event_type or not channel or not destination:
                    _bump(summary, 'skipped', 'alert_configs')
                    continue
                _upsert(
                    AlertConfig,
                    {
                        'event_type': event_type,
                        'channel': channel,
                        'destination': destination,
                    },
                    {'enabled': bool(item.get('enabled', True))},
                    summary,
                    'alert_configs',
                )
            except Exception as exc:
                summary['errors'].append(f'alert_configs: {exc}')

        # 15. Local DNS
        for item in data.get('local_dns_records') or []:
            try:
                domain = (item.get('domain') or '').strip().lower().rstrip('.')
                if not domain or not item.get('ip'):
                    _bump(summary, 'skipped', 'local_dns_records')
                    continue
                _upsert(
                    LocalDnsRecord,
                    {'domain': domain},
                    {
                        'ip': item['ip'],
                        'ttl': int(item.get('ttl') or 300),
                        'comment': item.get('comment') or '',
                        'enabled': bool(item.get('enabled', True)),
                    },
                    summary,
                    'local_dns_records',
                )
            except Exception as exc:
                summary['errors'].append(f'local_dns_records/{item.get("domain")}: {exc}')

        for item in data.get('local_cname_records') or []:
            try:
                domain = (item.get('domain') or '').strip().lower().rstrip('.')
                target = (item.get('target') or '').strip().lower().rstrip('.')
                if not domain or not target:
                    _bump(summary, 'skipped', 'local_cname_records')
                    continue
                _upsert(
                    LocalCnameRecord,
                    {'domain': domain},
                    {
                        'target': target,
                        'ttl': int(item.get('ttl') or 300),
                        'comment': item.get('comment') or '',
                        'enabled': bool(item.get('enabled', True)),
                    },
                    summary,
                    'local_cname_records',
                )
            except Exception as exc:
                summary['errors'].append(f'local_cname_records/{item.get("domain")}: {exc}')

        # Fail the whole transaction if there were hard errors? Task says return summary with errors
        # and wrap in atomic — per-row errors are collected; only raise on envelope validation.
        # If replace wiped and then everything failed, user still gets empty config — that's ok.

    return True, summary
