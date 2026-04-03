"""
Shared permissions and helpers for DNS Shield API views.
"""
from rest_framework.permissions import BasePermission


class IsAdminRole(BasePermission):
    """Allows only users with admin role (via UserProfile.is_admin)."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        try:
            return request.user.profile.is_admin
        except Exception:
            return request.user.is_superuser


class IsViewer(BasePermission):
    """Any authenticated user (admin or viewer)."""

    def has_permission(self, request, view):
        return request.user.is_authenticated
