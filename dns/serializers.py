"""
All REST API serializers for DNS Shield.
"""
from rest_framework import serializers
from django.contrib.auth.models import User
from dns.models import (
    QueryLog, SafeSearch, SystemSetting, Client, VPNServer, VPNPeer,
    ScheduledRule, AlertConfig, SystemEvent, AIUsageLog
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

class BlockedDomainSerializer(serializers.ModelSerializer):
    created_by_username = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = BlockedDomain
        fields = ['id', 'domain', 'block_type', 'layer', 'enabled', 'comment',
                  'created_at', 'created_by', 'created_by_username', 'hit_count', 'last_hit', 'group']
        read_only_fields = ['created_at', 'created_by', 'hit_count', 'last_hit']

    def get_created_by_username(self, obj):
        return obj.created_by.username if obj.created_by else None


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


# ─── Settings ────────────────────────────────────────────────────────────────

class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = ['key', 'value', 'description']


# ─── Clients ─────────────────────────────────────────────────────────────────

class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ['id', 'ip', 'mac', 'name', 'hostname', 'user', 'group', 
                  'vendor', 'os_hint', 'last_seen', 'nickname', 'device_type', 'icon', 'comment']
        read_only_fields = ['last_seen']


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
        fields = ['id', 'user', 'username', 'feature', 'query', 'prompt', 'response', 'tokens_estimate', 'timestamp']
        read_only_fields = ['timestamp']
