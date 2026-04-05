from django.db import models
from django.contrib.auth.models import User


class QueryLog(models.Model):
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    domain = models.CharField(max_length=255, db_index=True)
    client_ip = models.GenericIPAddressField(db_index=True)
    status = models.CharField(choices=[
        ('allowed', 'Allowed'),
        ('blocked_pattern', 'Blocked by pattern'),
        ('blocked_domain', 'Blocked by domain rule'),
        ('blocked_list', 'Blocked by blocklist'),
        ('blocked_ai', 'Blocked by AI heuristic'),
        ('nxdomain', 'NXDOMAIN from upstream'),
    ], max_length=20)
    matched_rule = models.CharField(max_length=255, blank=True)
    response_time_ms = models.FloatField(default=0)
    resolved_ip = models.GenericIPAddressField(null=True, blank=True)
    query_type = models.CharField(max_length=10, default='A')

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['-timestamp']),
            models.Index(fields=['client_ip', '-timestamp']),
            models.Index(fields=['status', '-timestamp']),
        ]

    def __str__(self):
        return f"{self.domain} ({self.status}) @ {self.timestamp}"


class SafeSearch(models.Model):
    engine = models.CharField(max_length=50, unique=True)
    enabled = models.BooleanField(default=False)
    level = models.CharField(choices=[
        ('strict', 'Strict'),
        ('moderate', 'Moderate'),
    ], max_length=10, default='strict')

    def __str__(self):
        return f"{self.engine} ({'on' if self.enabled else 'off'})"


class SystemSetting(models.Model):
    key = models.CharField(max_length=100, unique=True)
    value = models.TextField()
    description = models.TextField(blank=True)

    def __str__(self):
        return self.key


class Client(models.Model):
    ip = models.GenericIPAddressField(unique=True)
    mac = models.CharField(max_length=17, blank=True, null=True, db_index=True)
    name = models.CharField(max_length=100, blank=True)
    hostname = models.CharField(max_length=255, blank=True)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='clients')
    group = models.ForeignKey('blocks.BlockGroup', on_delete=models.SET_NULL, null=True, blank=True, related_name='clients')
    vendor = models.CharField(max_length=100, blank=True)
    os_hint = models.CharField(max_length=100, blank=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    comment = models.TextField(blank=True)

    def __str__(self):
        return self.name or self.hostname or self.ip


class VPNServer(models.Model):
    name = models.CharField(max_length=100, default='wg0')
    private_key = models.CharField(max_length=100) # Should be encrypted in production
    public_key = models.CharField(max_length=100)
    listen_port = models.IntegerField(default=51820)
    address = models.CharField(max_length=50, default='10.0.0.1/24')
    enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class VPNPeer(models.Model):
    name = models.CharField(max_length=100)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='vpn_peers')
    private_key = models.CharField(max_length=100, blank=True)
    public_key = models.CharField(max_length=100)
    allowed_ips = models.CharField(max_length=100, default='10.0.0.2/32')
    last_handshake = models.DateTimeField(null=True, blank=True)
    enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.user.username})"
