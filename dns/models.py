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
        ('blocked_client', 'Blocked by client ban'),
        ('nxdomain', 'NXDOMAIN from upstream'),
    ], max_length=20)
    matched_rule = models.CharField(max_length=255, blank=True)
    response_time_ms = models.FloatField(default=0)
    resolved_ip = models.GenericIPAddressField(null=True, blank=True)
    resolved_by = models.CharField(max_length=255, blank=True, null=True, db_index=True)
    dnssec_status = models.CharField(max_length=20, default='N/A', db_index=True)
    query_type = models.CharField(max_length=10, default='A')
    ttl = models.IntegerField(default=0)

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
    open_ports = models.CharField(max_length=255, blank=True)
    last_seen = models.DateTimeField(null=True, blank=True)
    nickname = models.CharField(max_length=100, blank=True)
    device_type = models.CharField(max_length=20, default='other')
    icon = models.CharField(max_length=50, blank=True)
    comment = models.TextField(blank=True)
    is_blocked = models.BooleanField(default=False, db_index=True)
    shield_bypass = models.BooleanField(
        default=False,
        db_index=True,
        help_text='When true, DNS Shield filtering is fully disabled for this client IP',
    )
    route_via_tor = models.BooleanField(
        default=False,
        db_index=True,
        help_text='When true, DNS queries for this client are resolved via Tor (127.0.0.1:9053) instead of Unbound',
    )

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


class ScheduledRule(models.Model):
    RULE_TYPES = [('domain', 'Domain'), ('pattern', 'Pattern'), ('app_category', 'App Category')]
    DAYS = [('Mon','Mon'),('Tue','Tue'),('Wed','Wed'),('Thu','Thu'),('Fri','Fri'),('Sat','Sat'),('Sun','Sun')]
    name = models.CharField(max_length=100)
    group = models.ForeignKey('blocks.BlockGroup', on_delete=models.SET_NULL, null=True, blank=True)
    rule_type = models.CharField(max_length=20, choices=RULE_TYPES)
    target = models.CharField(max_length=255, help_text='Domain, pattern text, or app category name')
    days = models.CharField(max_length=50, default='Mon,Tue,Wed,Thu,Fri')
    start_time = models.TimeField()
    end_time = models.TimeField()
    timezone = models.CharField(max_length=50, default='UTC')
    enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class AlertConfig(models.Model):
    EVENT_TYPES = [
        ('malware_hit', 'Malware/Threat Domain Hit'),
        ('new_device', 'New Device Joined Network'),
        ('shield_expire', 'Shield Disable Expired'),
        ('gravity_fail', 'Gravity Update Failed'),
        ('high_volume', 'Unusually High Query Volume'),
    ]
    CHANNELS = [('email', 'Email'), ('slack', 'Slack'), ('telegram', 'Telegram'), ('webhook', 'Webhook')]
    event_type = models.CharField(max_length=30, choices=EVENT_TYPES)
    channel = models.CharField(max_length=20, choices=CHANNELS)
    destination = models.CharField(max_length=500, help_text='Email, webhook URL, Telegram chat ID, or Slack webhook')
    enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.event_type} → {self.channel}"


class SystemEvent(models.Model):
    SEVERITIES = [('info', 'Info'), ('warning', 'Warning'), ('critical', 'Critical')]
    type = models.CharField(max_length=50)
    message = models.TextField()
    severity = models.CharField(max_length=10, choices=SEVERITIES, default='info')
    read = models.BooleanField(default=False, db_index=True)
    data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

class AIUsageLog(models.Model):
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    feature = models.CharField(max_length=50, help_text='e.g., domain_explain, app_generator')
    query = models.CharField(max_length=255, help_text='The domain or app name being processed')
    prompt = models.TextField(blank=True)
    response = models.TextField(blank=True)
    provider = models.CharField(max_length=40, blank=True, default='')
    model = models.CharField(max_length=100, blank=True, default='')
    tokens_estimate = models.IntegerField(default=0)
    tokens_input = models.IntegerField(default=0)
    tokens_output = models.IntegerField(default=0)
    status = models.CharField(max_length=20, default='ok')  # ok | error
    error_message = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"AI Query: {self.query} ({self.feature}) @ {self.timestamp}"


class DomainTrust(models.Model):
    """Persisted AI/heuristic trust score per DNS name (0–100, higher = safer)."""
    LABELS = [
        ('safe', 'Safe'),
        ('tracking', 'Tracking'),
        ('malicious', 'Malicious'),
        ('unknown', 'Unknown'),
    ]
    domain = models.CharField(max_length=255, unique=True, db_index=True)
    trust_score = models.PositiveSmallIntegerField(default=50, db_index=True)
    label = models.CharField(max_length=20, choices=LABELS, default='unknown')
    reason = models.TextField(blank=True)
    source = models.CharField(max_length=40, blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-trust_score', 'domain']

    def __str__(self):
        return f'{self.domain} ({self.trust_score})'


class AIReportCache(models.Model):
    """Saved AI browsing classification reports for later reopen / clear."""
    range_from = models.DateTimeField(db_index=True)
    range_to = models.DateTimeField(db_index=True)
    client_ip = models.GenericIPAddressField(null=True, blank=True)
    summary = models.TextField(blank=True)
    domains_found = models.PositiveIntegerField(default=0)
    domains_analyzed = models.PositiveIntegerField(default=0)
    payload = models.JSONField(default=dict)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'AI Report {self.range_from.date()} → {self.range_to.date()} ({self.domains_analyzed})'


class DomainCategory(models.Model):
    """
    Persistent domain → content category lookup for AI Report.
    Known domains are reused so Claude only classifies new names (saves tokens).
    """
    domain = models.CharField(max_length=255, unique=True, db_index=True)
    category = models.CharField(max_length=40, db_index=True, default='other')
    site_name = models.CharField(max_length=255, blank=True)
    url = models.CharField(max_length=512, blank=True)
    confidence = models.CharField(max_length=16, blank=True, default='medium')
    source = models.CharField(max_length=40, blank=True, default='ai')
    hit_count = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['domain']
        verbose_name_plural = 'domain categories'

    def __str__(self):
        return f'{self.domain} → {self.category}'


class LocalDnsRecord(models.Model):
    """Pi-hole-style local A/AAAA record: domain → IP."""
    domain = models.CharField(max_length=255, unique=True, db_index=True)
    ip = models.GenericIPAddressField()
    ttl = models.PositiveIntegerField(default=300)
    comment = models.CharField(max_length=255, blank=True)
    enabled = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['domain']

    def __str__(self):
        return f'{self.domain} → {self.ip}'


class LocalCnameRecord(models.Model):
    """Pi-hole-style local CNAME: domain → target domain."""
    domain = models.CharField(max_length=255, unique=True, db_index=True)
    target = models.CharField(max_length=255)
    ttl = models.PositiveIntegerField(default=300)
    comment = models.CharField(max_length=255, blank=True)
    enabled = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['domain']

    def __str__(self):
        return f'{self.domain} → {self.target}'


class LogExcludedDomain(models.Model):
    """
    Domains or patterns excluded from being recorded into QueryLog.
    Excluded queries are resolved and filtered normally, but no row is saved in SQLite.
    """
    domain = models.CharField(max_length=255, unique=True, db_index=True)
    rule_type = models.CharField(
        max_length=15,
        choices=[
            ('exact', 'Exact match'),
            ('wildcard', 'Wildcard (includes subdomains)'),
            ('regex', 'Regular expression'),
        ],
        default='exact'
    )
    enabled = models.BooleanField(default=True, db_index=True)
    comment = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    hit_count = models.PositiveIntegerField(default=0)
    last_hit = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.domain} ({self.rule_type})"

