"""
API token authentication matching the UI docs:

    Authorization: Token YOUR_TOKEN

Tokens are stored in SystemSetting as api_token_<user_id>.
"""
import secrets

from django.contrib.auth.models import User
from rest_framework import authentication, exceptions

from dns.models import SystemSetting


class ApiTokenAuthentication(authentication.BaseAuthentication):
    keyword = 'Token'

    def authenticate(self, request):
        auth = authentication.get_authorization_header(request).decode('utf-8')
        if not auth:
            return None

        parts = auth.split()
        if not parts or parts[0] != self.keyword:
            return None
        if len(parts) == 1:
            raise exceptions.AuthenticationFailed('Invalid token header. No credentials provided.')
        if len(parts) > 2:
            raise exceptions.AuthenticationFailed('Invalid token header. Token string should not contain spaces.')

        return self.authenticate_credentials(parts[1])

    def authenticate_credentials(self, key):
        # Tokens are hex(32) → 64 chars; reject obviously wrong values early
        if not key or len(key) > 128:
            raise exceptions.AuthenticationFailed('Invalid token.')

        settings = SystemSetting.objects.filter(key__startswith='api_token_')
        matched = None
        for setting in settings:
            if secrets.compare_digest(setting.value, key):
                matched = setting
                break

        if matched is None:
            raise exceptions.AuthenticationFailed('Invalid token.')

        try:
            user_id = int(matched.key.rsplit('_', 1)[-1])
            user = User.objects.get(pk=user_id)
        except (ValueError, User.DoesNotExist):
            raise exceptions.AuthenticationFailed('Invalid token.')

        if not user.is_active:
            raise exceptions.AuthenticationFailed('User inactive or deleted.')

        return (user, key)
