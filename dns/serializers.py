"""
All REST API serializers for DNS Shield.
"""
from rest_framework import serializers
from django.contrib.auth.models import User
from dns.models import (
    QueryLog, SafeSearch, SystemSetting, Client, VPNServer, VPNPeer,
    ScheduledRule, AlertConfig, SystemEvent, AIUsageLog, DomainTrust,
    AIReportCache, DomainCategory, LocalDnsRecord, LocalCnameRecord,
)
from blocks.models import BlockedDomain, Pattern, Adlist, GravityDomain, AllowedDomain, BlockGroup, AppCategory, AppControl
from users.models import UserProfile


# ─── Auth ────────────────────────────────────────────────────────────────────

class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField()
    remember_me = serializers.BooleanField(default=False)


# ─── Query Log ───────────────────────────────────────────────────────────────

class QueryLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = QueryLog
        fields = ['id', 'timestamp', 'domain', 'client_ip', 'status',
                  'matched_rule', 'response_time_ms', 'resolved_ip', 
                  'resolved_by', 'dnssec_status', 'query_type', 'ttl']


# ─── Block Group ─────────────────────────────────────────────────────────────

class BlockGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlockGroup
        fields = ['id', 'name', 'description', 'created_at']


# ─── Blocks ──────────────────────────────────────────────────────────────────

def _normalize_block_domain(value: str, *, allow_regex: bool = False) -> str:
    """
    Turn pasted URLs into bare hostnames for DNS matching.
    DNS only sees hostnames (e.g. ads.example.com), never https:// or paths.
    """
    from urllib.parse import urlparse

    raw = (value or '').strip()
    if not raw:
        raise serializers.ValidationError('Enter a domain name (e.g. ads.example.com).')

    # Regex rules are patterns — only trim whitespace; do not strip URL parts.
    if allow_regex:
        return raw

    candidate = raw
    if '://' in candidate or candidate.startswith('//'):
        parsed = urlparse(candidate if '://' in candidate else f'https:{candidate}')
        candidate = parsed.hostname or parsed.path.split('/')[0]
    else:
        # Strip path / query / fragment if someone pasted example.com/foo?x=1
        candidate = candidate.split('/')[0].split('?')[0].split('#')[0]

    domain = (candidate or '').strip().lower().rstrip('.')
    # Drop accidental port (example.com:443)
    if domain.count(':') == 1 and not domain.startswith('['):
        host, _, port = domain.partition(':')
        if port.isdigit():
            domain = host

    if domain.startswith('www.'):
        # Keep www — exact match is intentional; only strip scheme/path above.
        pass

    if not domain or ' ' in domain or '/' in domain or '://' in domain:
        raise serializers.ValidationError(
            'Enter a bare domain only (e.g. fsiblogxx.com), not a full URL.'
        )
    return domain


class BlockedDomainSerializer(serializers.ModelSerializer):
    created_by_username = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = BlockedDomain
        fields = ['id', 'domain', 'block_type', 'layer', 'enabled', 'comment',
                  'created_at', 'created_by', 'created_by_username', 'hit_count', 'last_hit', 'group']
        read_only_fields = ['created_at', 'created_by', 'hit_count', 'last_hit']

    def get_created_by_username(self, obj):
        return obj.created_by.username if obj.created_by else None

    def validate(self, attrs):
        block_type = attrs.get('block_type') or getattr(self.instance, 'block_type', 'exact')
        if 'domain' in attrs:
            attrs['domain'] = _normalize_block_domain(
                attrs['domain'],
                allow_regex=(block_type == 'regex'),
            )
        return attrs


class PatternSerializer(serializers.ModelSerializer):
    created_by_username = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Pattern
        fields = ['id', 'name', 'pattern', 'pattern_type', 'enabled',
                  'comment', 'hit_count', 'created_by', 'created_by_username', 'group']
        read_only_fields = ['hit_count', 'created_by']

    def get_created_by_username(self, obj):
        return obj.created_by.username if obj.created_by else None


class AllowedDomainSerializer(serializers.ModelSerializer):
    class Meta:
        model = AllowedDomain
        fields = ['id', 'domain', 'allow_type', 'enabled', 'comment', 'created_by', 'group']
        read_only_fields = ['created_by']

    def validate(self, attrs):
        allow_type = attrs.get('allow_type') or getattr(self.instance, 'allow_type', 'exact')
        if 'domain' in attrs:
            attrs['domain'] = _normalize_block_domain(
                attrs['domain'],
                allow_regex=(allow_type == 'regex'),
            )
        return attrs


# ─── Lists / Adlists ─────────────────────────────────────────────────────────

class AdlistSerializer(serializers.ModelSerializer):
    class Meta:
        model = Adlist
        fields = ['id', 'url', 'name', 'enabled', 'domain_count',
                  'last_updated', 'last_error', 'comment', 'created_by', 'group']
        read_only_fields = ['domain_count', 'last_updated', 'last_error', 'created_by']


# ─── SafeSearch ──────────────────────────────────────────────────────────────

class SafeSearchSerializer(serializers.ModelSerializer):
    class Meta:
        model = SafeSearch
        fields = ['id', 'engine', 'enabled', 'level']


class LocalDnsRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = LocalDnsRecord
        fields = ['id', 'domain', 'ip', 'ttl', 'comment', 'enabled', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']

    def validate_domain(self, value):
        domain = (value or '').strip().lower().rstrip('.')
        if not domain or ' ' in domain:
            raise serializers.ValidationError('Enter a valid domain name.')
        return domain

    def validate_ttl(self, value):
        if value is None:
            return 300
        if value < 0 or value > 86400:
            raise serializers.ValidationError('TTL must be between 0 and 86400.')
        return value


class LocalCnameRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = LocalCnameRecord
        fields = ['id', 'domain', 'target', 'ttl', 'comment', 'enabled', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']

    def validate_domain(self, value):
        domain = (value or '').strip().lower().rstrip('.')
        if not domain or ' ' in domain:
            raise serializers.ValidationError('Enter a valid domain name.')
        return domain

    def validate_target(self, value):
        target = (value or '').strip().lower().rstrip('.')
        if not target or ' ' in target:
            raise serializers.ValidationError('Enter a valid target domain.')
        return target

    def validate_ttl(self, value):
        if value is None:
            return 300
        if value < 0 or value > 86400:
            raise serializers.ValidationError('TTL must be between 0 and 86400.')
        return value

    def validate(self, attrs):
        domain = attrs.get('domain') or getattr(self.instance, 'domain', '')
        target = attrs.get('target') or getattr(self.instance, 'target', '')
        if domain and target and domain == target:
            raise serializers.ValidationError({'target': 'CNAME target cannot be the same as the domain.'})
        return attrs


# ─── Settings ────────────────────────────────────────────────────────────────

class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = ['key', 'value', 'description']


# ─── Clients ─────────────────────────────────────────────────────────────────

class ClientSerializer(serializers.ModelSerializer):
    is_active = serializers.SerializerMethodField()

    class Meta:
        model = Client
        fields = ['id', 'ip', 'mac', 'name', 'hostname', 'user', 'group', 
                  'vendor', 'os_hint', 'open_ports', 'last_seen', 'nickname', 'device_type', 'icon',
                  'comment', 'is_blocked', 'shield_bypass', 'is_active']
        read_only_fields = ['last_seen']

    def get_is_active(self, obj):
        from django.utils import timezone
        import datetime
        if obj.last_seen:
            return timezone.now() - obj.last_seen < datetime.timedelta(minutes=15)
        return False


# ─── Advanced Features ───────────────────────────────────────────────────────

class ScheduledRuleSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source='group.name', read_only=True)

    class Meta:
        model = ScheduledRule
        fields = '__all__'


class AlertConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlertConfig
        fields = '__all__'


class SystemEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemEvent
        fields = '__all__'


# ─── Users ───────────────────────────────────────────────────────────────────

class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ['role']


class UserSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source='profile.role', default='viewer')
    last_login = serializers.DateTimeField(read_only=True)
    is_active = serializers.BooleanField(default=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name',
                  'role', 'last_login', 'is_active', 'password', 'date_joined']
        read_only_fields = ['date_joined', 'last_login']

    def create(self, validated_data):
        role_data = validated_data.pop('profile', {})
        role = role_data.get('role', 'viewer')
        password = validated_data.pop('password', 'changeme123')
        user = User.objects.create_user(**validated_data)
        user.set_password(password)
        user.save()
        UserProfile.objects.create(user=user, role=role)
        return user

    def update(self, instance, validated_data):
        role_data = validated_data.pop('profile', {})
        role = role_data.get('role')
        if role:
            profile, _ = UserProfile.objects.get_or_create(user=instance)
            profile.role = role
            profile.save()
        password = validated_data.pop('password', None)
        if password:
            instance.set_password(password)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance
# ─── App Firewall ────────────────────────────────────────────────────────────

class AppCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = AppCategory
        fields = ['id', 'name', 'domains', 'icon']


class AppControlSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    group_name = serializers.CharField(source='group.name', read_only=True)

    class Meta:
        model = AppControl
        fields = ['id', 'category', 'category_name', 'group', 'group_name', 'enabled']
        validators = []  # Bypass unique_together DRF check to allow toggling


# ─── VPN ─────────────────────────────────────────────────────────────────────

class VPNServerSerializer(serializers.ModelSerializer):
    class Meta:
        model = VPNServer
        fields = '__all__'
        read_only_fields = ['created_at']


class VPNPeerSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = VPNPeer
        fields = ['id', 'name', 'user', 'username', 'public_key', 'allowed_ips', 'last_handshake', 'enabled', 'created_at']
        read_only_fields = ['created_at', 'last_handshake']


# ─── AI Auditing ─────────────────────────────────────────────────────────────

class AIUsageLogSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = AIUsageLog
        fields = [
            'id', 'user', 'username', 'feature', 'query', 'prompt', 'response',
            'provider', 'model', 'tokens_estimate', 'tokens_input', 'tokens_output',
            'status', 'error_message', 'timestamp',
        ]
        read_only_fields = ['timestamp']


class DomainTrustSerializer(serializers.ModelSerializer):
    is_high_trust = serializers.SerializerMethodField()

    class Meta:
        model = DomainTrust
        fields = [
            'id', 'domain', 'trust_score', 'label', 'reason', 'source',
            'updated_at', 'created_at', 'is_high_trust',
        ]
        read_only_fields = ['updated_at', 'created_at']

    def get_is_high_trust(self, obj):
        return obj.trust_score >= 70


class DomainCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = DomainCategory
        fields = [
            'id', 'domain', 'category', 'site_name', 'url',
            'confidence', 'source', 'hit_count', 'updated_at', 'created_at',
        ]
        read_only_fields = ['updated_at', 'created_at', 'hit_count']


class AIReportCacheListSerializer(serializers.ModelSerializer):
    created_by_username = serializers.SerializerMethodField()
    top_categories = serializers.SerializerMethodField()

    class Meta:
        model = AIReportCache
        fields = [
            'id', 'range_from', 'range_to', 'client_ip', 'summary',
            'domains_found', 'domains_analyzed', 'top_categories',
            'created_by', 'created_by_username', 'created_at',
        ]

    def get_created_by_username(self, obj):
        return obj.created_by.username if obj.created_by else None

    def get_top_categories(self, obj):
        cats = (obj.payload or {}).get('categories') or []
        return cats[:5]


class AIReportCacheDetailSerializer(serializers.ModelSerializer):
    created_by_username = serializers.SerializerMethodField()

    class Meta:
        model = AIReportCache
        fields = [
            'id', 'range_from', 'range_to', 'client_ip', 'summary',
            'domains_found', 'domains_analyzed', 'payload',
            'created_by', 'created_by_username', 'created_at',
        ]

    def get_created_by_username(self, obj):
        return obj.created_by.username if obj.created_by else None
