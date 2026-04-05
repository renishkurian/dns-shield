from django.db import models
from django.contrib.auth.models import User


class UserProfile(models.Model):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('viewer', 'Viewer'),
    ]
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='viewer')
    group = models.ForeignKey('blocks.BlockGroup', on_delete=models.SET_NULL, null=True, blank=True, related_name='profiles')
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def is_admin(self):
        return self.role == 'admin'

    def __str__(self):
        return f"{self.user.username} ({self.role})"
