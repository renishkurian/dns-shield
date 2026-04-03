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
    name = models.CharField(max_length=100, blank=True)
    group = models.CharField(max_length=100, blank=True)
    comment = models.TextField(blank=True)

    def __str__(self):
        return self.name or self.ip
