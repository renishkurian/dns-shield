"""
Auto-create UserProfile for new users and ensure superusers get admin role.
"""
from django.db.models.signals import post_save
from django.contrib.auth.models import User
from django.dispatch import receiver
from users.models import UserProfile


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        role = 'admin' if instance.is_superuser else 'viewer'
        UserProfile.objects.get_or_create(user=instance, defaults={'role': role})
    elif instance.is_superuser:
        try:
            if instance.profile.role != 'admin':
                instance.profile.role = 'admin'
                instance.profile.save()
        except UserProfile.DoesNotExist:
            UserProfile.objects.create(user=instance, role='admin')
