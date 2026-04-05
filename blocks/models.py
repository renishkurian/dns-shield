from django.db import models
from django.contrib.auth.models import User


class BlockGroup(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class BlockedDomain(models.Model):
    domain = models.CharField(max_length=255, unique=True)
    block_type = models.CharField(choices=[
        ('exact', 'Exact match'),
        ('wildcard', 'Wildcard (blocks all subdomains)'),
        ('regex', 'Regular expression'),
    ], max_length=10)
    layer = models.CharField(choices=[
        ('proxy', 'DNS proxy (fastest)'),
        ('unbound', 'Unbound local-zone'),
    ], max_length=10, default='proxy')
    enabled = models.BooleanField(default=True)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    hit_count = models.IntegerField(default=0)
    last_hit = models.DateTimeField(null=True, blank=True)
    group = models.ForeignKey(BlockGroup, on_delete=models.SET_NULL, null=True, blank=True, related_name='blocked_domains')

    def __str__(self):
        return f"{self.domain} ({self.block_type})"


class Pattern(models.Model):
    name = models.CharField(max_length=100)
    pattern = models.CharField(max_length=255)
    pattern_type = models.CharField(choices=[
        ('extension', 'File extension (e.g. .js, .gif)'),
        ('keyword', 'Domain keyword (e.g. ads, track)'),
        ('regex', 'Full regex on domain'),
        ('path_keyword', 'URL path keyword'),
    ], max_length=15)
    enabled = models.BooleanField(default=True)
    comment = models.TextField(blank=True)
    hit_count = models.IntegerField(default=0)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    group = models.ForeignKey(BlockGroup, on_delete=models.SET_NULL, null=True, blank=True, related_name='patterns')

    def __str__(self):
        return f"{self.name} ({self.pattern_type})"


class Adlist(models.Model):
    url = models.URLField(unique=True)
    name = models.CharField(max_length=255)
    enabled = models.BooleanField(default=True)
    domain_count = models.IntegerField(default=0)
    last_updated = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True)
    comment = models.TextField(blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    group = models.ForeignKey(BlockGroup, on_delete=models.SET_NULL, null=True, blank=True, related_name='adlists')

    def __str__(self):
        return self.name


class GravityDomain(models.Model):
    domain = models.CharField(max_length=255, db_index=True)
    adlist = models.ForeignKey(Adlist, on_delete=models.CASCADE)

    class Meta:
        indexes = [models.Index(fields=['domain'])]
        unique_together = [('domain', 'adlist')]


class AllowedDomain(models.Model):
    domain = models.CharField(max_length=255, unique=True)
    allow_type = models.CharField(choices=[
        ('exact', 'Exact'),
        ('wildcard', 'Wildcard'),
        ('regex', 'Regex'),
    ], max_length=10)
    enabled = models.BooleanField(default=True)
    comment = models.TextField(blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    group = models.ForeignKey(BlockGroup, on_delete=models.SET_NULL, null=True, blank=True, related_name='allowed_domains')

    def __str__(self):
        return f"{self.domain} ({self.allow_type})"


class AppCategory(models.Model):
    name = models.CharField(max_length=100, unique=True)
    domains = models.TextField(help_text="Comma-separated list of domains or patterns")
    icon = models.CharField(max_length=50, blank=True)

    def __str__(self):
        return self.name

    def get_domains(self):
        return [d.strip() for d in self.domains.split(',') if d.strip()]


class AppControl(models.Model):
    category = models.ForeignKey(AppCategory, on_delete=models.CASCADE, related_name='controls')
    group = models.ForeignKey(BlockGroup, on_delete=models.CASCADE, related_name='app_controls')
    enabled = models.BooleanField(default=True)

    class Meta:
        unique_together = [('category', 'group')]

    def __str__(self):
        return f"{self.category.name} for {self.group.name}"
