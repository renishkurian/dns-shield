"""
All REST API views for DNS Shield.
Organized by feature area with role-based access control.
"""
import csv
import io
import json
import subprocess
import asyncio
from datetime import datetime, timedelta, timezone

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db.models import Count, Avg, Q
from django.http import HttpResponse, StreamingHttpResponse
from django.utils import timezone as dj_timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from dns.models import QueryLog, SafeSearch, SystemSetting, Client, VPNServer, VPNPeer
from dns.permissions import IsAdminRole
from dns.serializers import (
    LoginSerializer, QueryLogSerializer, BlockedDomainSerializer,
    PatternSerializer, AllowedDomainSerializer, AdlistSerializer,
    SafeSearchSerializer, SystemSettingSerializer, ClientSerializer, UserSerializer,
    BlockGroupSerializer, VPNServerSerializer, VPNPeerSerializer,
    AppCategorySerializer, AppControlSerializer
)
from blocks.models import BlockedDomain, Pattern, Adlist, GravityDomain, AllowedDomain, BlockGroup, AppCategory, AppControl
from users.models import UserProfile


# ─── AUTH ─────────────────────────────────────────────────────────────────────

class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        username = serializer.validated_data['username']
        password = serializer.validated_data['password']
        remember_me = serializer.validated_data.get('remember_me', False)

        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response({'error': 'Invalid credentials'}, status=401)
        if not user.is_active:
            return Response({'error': 'Account disabled'}, status=403)

        login(request, user)
        if remember_me:
            request.session.set_expiry(30 * 24 * 60 * 60)  # 30 days
        else:
            request.session.set_expiry(0)

        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'role': _get_role(user),
        })


class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response({'ok': True})


class MeView(APIView):
    def get(self, request):
        user = request.user
        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'role': _get_role(user),
        })


def _get_role(user):
    try:
        return user.profile.role
    except Exception:
        return 'admin' if user.is_superuser else 'viewer'


# ─── STATS ────────────────────────────────────────────────────────────────────

class StatsSummaryView(APIView):
    def get(self, request):
        from dns.models import SystemSetting
        today = dj_timezone.now().date()
        qs = QueryLog.objects.filter(timestamp__date=today)
        total = qs.count()
        blocked = qs.filter(status__in=['blocked_pattern', 'blocked_domain', 'blocked_list']).count()
        avg_latency = qs.aggregate(a=Avg('response_time_ms'))['a'] or 0
        
        # Total domains on adlists (gravity)
        grav = SystemSetting.objects.filter(key='gravity_unique_count').first()
        total_gravity = int(grav.value) if grav else 0

        return Response({
            'queries_today': total,
            'blocked_today': blocked,
            'block_percent': round(blocked / total * 100, 1) if total else 0,
            'avg_latency_ms': round(avg_latency, 2),
            'total_gravity': total_gravity,
        })


class StatsHourlyView(APIView):
    def get(self, request):
        since = dj_timezone.now() - timedelta(hours=24)
        qs = QueryLog.objects.filter(timestamp__gte=since)
        data = {}
        for entry in qs.values('timestamp__hour', 'status').annotate(count=Count('id')):
            hour = entry['timestamp__hour']
            if hour not in data:
                data[hour] = {'hour': hour, 'allowed': 0, 'blocked': 0}
            if entry['status'] in ('blocked_pattern', 'blocked_domain', 'blocked_list'):
                data[hour]['blocked'] += entry['count']
            else:
                data[hour]['allowed'] += entry['count']
        return Response(sorted(data.values(), key=lambda x: x['hour']))


class StatsTopDomainsView(APIView):
    def get(self, request):
        since = dj_timezone.now() - timedelta(hours=24)
        data = (
            QueryLog.objects.filter(
                timestamp__gte=since,
                status__in=['blocked_pattern', 'blocked_domain', 'blocked_list']
            )
            .values('domain')
            .annotate(count=Count('id'))
            .order_by('-count')[:10]
        )
        return Response(list(data))


class StatsTopAllowedDomainsView(APIView):
    def get(self, request):
        since = dj_timezone.now() - timedelta(hours=24)
        data = (
            QueryLog.objects.filter(
                timestamp__gte=since,
                status='allowed'
            )
            .values('domain')
            .annotate(count=Count('id'))
            .order_by('-count')[:10]
        )
        return Response(list(data))


class StatsTopClientsView(APIView):
    def get(self, request):
        since = dj_timezone.now() - timedelta(hours=24)
        data = (
            QueryLog.objects.filter(timestamp__gte=since)
            .values('client_ip')
            .annotate(count=Count('id'))
            .order_by('-count')[:5]
        )
        results = []
        for item in data:
            try:
                name = Client.objects.get(ip=item['client_ip']).name
            except Client.DoesNotExist:
                name = ''
            results.append({**item, 'name': name})
        return Response(results)


# ─── QUERY LOG ────────────────────────────────────────────────────────────────

class QueryLogListView(APIView):
    def get(self, request):
        qs = QueryLog.objects.all()
        status_filter = request.query_params.get('status')
        client = request.query_params.get('client')
        domain = request.query_params.get('domain')
        from_dt = request.query_params.get('from')
        to_dt = request.query_params.get('to')

        if status_filter:
            qs = qs.filter(status=status_filter)
        if client:
            qs = qs.filter(client_ip=client)
        if domain:
            qs = qs.filter(domain__icontains=domain)
        if from_dt:
            qs = qs.filter(timestamp__gte=from_dt)
        if to_dt:
            qs = qs.filter(timestamp__lte=to_dt)

        qs = qs[:500]
        return Response(QueryLogSerializer(qs, many=True).data)


class QueryLogExportView(APIView):
    def get(self, request):
        qs = QueryLog.objects.all()[:10000]
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            'timestamp', 'domain', 'client_ip', 'status',
            'matched_rule', 'response_time_ms', 'resolved_ip', 'query_type'
        ])
        writer.writeheader()
        for entry in qs:
            writer.writerow({
                'timestamp': entry.timestamp.isoformat(),
                'domain': entry.domain,
                'client_ip': entry.client_ip,
                'status': entry.status,
                'matched_rule': entry.matched_rule,
                'response_time_ms': entry.response_time_ms,
                'resolved_ip': entry.resolved_ip or '',
                'query_type': entry.query_type,
            })
        response = HttpResponse(output.getvalue(), content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="dns_queries.csv"'
        return response


# ─── BLOCKED DOMAINS ──────────────────────────────────────────────────────────

class BlockedDomainListView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAdminRole()]

    def get(self, request):
        qs = BlockedDomain.objects.all().order_by('-created_at')
        return Response(BlockedDomainSerializer(qs, many=True).data)

    def post(self, request):
        ser = BlockedDomainSerializer(data=request.data)
        if ser.is_valid():
            obj = ser.save(created_by=request.user)
            _reload_matcher()
            return Response(BlockedDomainSerializer(obj).data, status=201)
        return Response(ser.errors, status=400)


class BlockedDomainDetailView(APIView):
    permission_classes = [IsAdminRole]

    def get_object(self, pk):
        try:
            return BlockedDomain.objects.get(pk=pk)
        except BlockedDomain.DoesNotExist:
            return None

    def patch(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=404)
        ser = BlockedDomainSerializer(obj, data=request.data, partial=True)
        if ser.is_valid():
            ser.save()
            _reload_matcher()
            return Response(ser.data)
        return Response(ser.errors, status=400)

    def delete(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=404)
        obj.delete()
        _reload_matcher()
        return Response(status=204)


class BlockedDomainTestView(APIView):
    def post(self, request):
        domain = request.data.get('domain', '').strip()
        if not domain:
            return Response({'error': 'domain required'}, status=400)
        from dns_proxy.matcher import get_matcher
        matcher = get_matcher()
        if matcher.is_allowed(domain):
            return Response({'result': 'allowed', 'rule': 'allowlist'})
        p = matcher.match_pattern(domain)
        if p:
            return Response({'result': 'blocked_pattern', 'rule': p[1]})
        d = matcher.match_domain(domain)
        if d:
            return Response({'result': 'blocked_domain', 'rule': d})
        if matcher.in_gravity(domain):
            return Response({'result': 'blocked_list', 'rule': 'gravity'})
        return Response({'result': 'allowed', 'rule': None})


# ─── PATTERNS ─────────────────────────────────────────────────────────────────

class PatternListView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAdminRole()]

    def get(self, request):
        return Response(PatternSerializer(Pattern.objects.all(), many=True).data)

    def post(self, request):
        ser = PatternSerializer(data=request.data)
        if ser.is_valid():
            obj = ser.save(created_by=request.user)
            _reload_matcher()
            return Response(PatternSerializer(obj).data, status=201)
        return Response(ser.errors, status=400)


class PatternDetailView(APIView):
    permission_classes = [IsAdminRole]

    def get_object(self, pk):
        try:
            return Pattern.objects.get(pk=pk)
        except Pattern.DoesNotExist:
            return None

    def patch(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=404)
        ser = PatternSerializer(obj, data=request.data, partial=True)
        if ser.is_valid():
            ser.save()
            _reload_matcher()
            return Response(ser.data)
        return Response(ser.errors, status=400)

    def delete(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=404)
        obj.delete()
        _reload_matcher()
        return Response(status=204)


class PatternTestView(APIView):
    def post(self, request):
        domain = request.data.get('domain', '').strip()
        if not domain:
            return Response({'error': 'domain required'}, status=400)
        from dns_proxy.matcher import get_matcher
        matcher = get_matcher()
        result = matcher.match_pattern(domain)
        if result:
            return Response({'matched': True, 'pattern_id': result[0], 'name': result[1]})
        return Response({'matched': False})


# ─── ALLOWLIST ────────────────────────────────────────────────────────────────

class AllowlistView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAdminRole()]

    def get(self, request):
        return Response(AllowedDomainSerializer(AllowedDomain.objects.all(), many=True).data)

    def post(self, request):
        ser = AllowedDomainSerializer(data=request.data)
        if ser.is_valid():
            obj = ser.save(created_by=request.user)
            _reload_matcher()
            return Response(AllowedDomainSerializer(obj).data, status=201)
        return Response(ser.errors, status=400)


class AllowlistDetailView(APIView):
    permission_classes = [IsAdminRole]

    def delete(self, request, pk):
        try:
            AllowedDomain.objects.get(pk=pk).delete()
            _reload_matcher()
            return Response(status=204)
        except AllowedDomain.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)


# ─── ADLISTS ──────────────────────────────────────────────────────────────────

class AdlistView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAdminRole()]

    def get(self, request):
        from dns.models import SystemSetting
        uc = SystemSetting.objects.filter(key='gravity_unique_count').first()
        return Response({
            'lists': AdlistSerializer(Adlist.objects.all(), many=True).data,
            'uniqueCount': int(uc.value) if uc else 0
        })

    def post(self, request):
        ser = AdlistSerializer(data=request.data)
        if ser.is_valid():
            obj = ser.save(created_by=request.user)
            return Response(AdlistSerializer(obj).data, status=201)
        return Response(ser.errors, status=400)


class AdlistDetailView(APIView):
    permission_classes = [IsAdminRole]

    def get_object(self, pk):
        try:
            return Adlist.objects.get(pk=pk)
        except Adlist.DoesNotExist:
            return None

    def patch(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=404)
        ser = AdlistSerializer(obj, data=request.data, partial=True)
        if ser.is_valid():
            ser.save()
            return Response(ser.data)
        return Response(ser.errors, status=400)

    def delete(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=404)
        obj.delete()
        return Response(status=204)


class GravityUpdateView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request):
        from gravity.updater import run_gravity_update
        from asgiref.sync import async_to_sync
        import threading

        def run():
            asyncio.run(run_gravity_update())

        threading.Thread(target=run, daemon=True).start()
        return Response({'ok': True, 'message': 'Gravity update started. Watch WebSocket /ws/gravity for progress.'})


# ─── SAFESEARCH ───────────────────────────────────────────────────────────────

class SafeSearchView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAdminRole()]

    def get(self, request):
        return Response(SafeSearchSerializer(SafeSearch.objects.all(), many=True).data)

    def post(self, request):
        engine = request.data.get('engine')
        obj, _ = SafeSearch.objects.get_or_create(engine=engine)
        ser = SafeSearchSerializer(obj, data=request.data, partial=True)
        if ser.is_valid():
            ser.save()
            return Response(ser.data)
        return Response(ser.errors, status=400)


# ─── CLIENTS ──────────────────────────────────────────────────────────────────

class ClientView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAdminRole()]

    def get(self, request):
        return Response(ClientSerializer(Client.objects.all(), many=True).data)

    def post(self, request):
        ser = ClientSerializer(data=request.data)
        if ser.is_valid():
            obj, _ = Client.objects.update_or_create(
                ip=ser.validated_data['ip'],
                defaults={k: v for k, v in ser.validated_data.items() if k != 'ip'}
            )
            return Response(ClientSerializer(obj).data, status=201)
        return Response(ser.errors, status=400)


class ClientDetailView(APIView):
    permission_classes = [IsAdminRole]

    def patch(self, request, pk):
        try:
            obj = Client.objects.get(pk=pk)
        except Client.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        ser = ClientSerializer(obj, data=request.data, partial=True)
        if ser.is_valid():
            ser.save()
            return Response(ser.data)
        return Response(ser.errors, status=400)


# ─── SETTINGS ─────────────────────────────────────────────────────────────────

class SettingsView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAdminRole()]

    def get(self, request):
        settings = {s.key: s.value for s in SystemSetting.objects.all()}
        return Response(settings)

    def patch(self, request):
        for key, value in request.data.items():
            SystemSetting.objects.update_or_create(key=key, defaults={'value': str(value)})
        return Response({'ok': True})


# ─── BLOCK GROUPS ─────────────────────────────────────────────────────────────

class BlockGroupListView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        return Response(BlockGroupSerializer(BlockGroup.objects.all(), many=True).data)

    def post(self, request):
        ser = BlockGroupSerializer(data=request.data)
        if ser.is_valid():
            obj = ser.save()
            return Response(BlockGroupSerializer(obj).data, status=201)
        return Response(ser.errors, status=400)


class BlockGroupDetailView(APIView):
    permission_classes = [IsAdminRole]

    def delete(self, request, pk):
        try:
            BlockGroup.objects.get(pk=pk).delete()
            return Response(status=204)
        except BlockGroup.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)


# ─── APP FIREWALL ─────────────────────────────────────────────────────────────

class AppCategoryListView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        return Response(AppCategorySerializer(AppCategory.objects.all(), many=True).data)

    def post(self, request):
        ser = AppCategorySerializer(data=request.data)
        if ser.is_valid():
            obj = ser.save()
            return Response(AppCategorySerializer(obj).data, status=201)
        return Response(ser.errors, status=400)


class AppCategoryDetailView(APIView):
    permission_classes = [IsAdminRole]

    def delete(self, request, pk):
        try:
            category = AppCategory.objects.get(pk=pk)
            category.delete()
            return Response(status=204)
        except AppCategory.DoesNotExist:
            return Response(status=404)


class AppControlView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        group_id = request.query_params.get('group')
        qs = AppControl.objects.all()
        if group_id:
            qs = qs.filter(group_id=group_id)
        return Response(AppControlSerializer(qs, many=True).data)

    def post(self, request):
        ser = AppControlSerializer(data=request.data)
        if ser.is_valid():
            # Check for existing record to toggle
            obj, _ = AppControl.objects.update_or_create(
                category=ser.validated_data['category'],
                group=ser.validated_data['group'],
                defaults={'enabled': ser.validated_data['enabled']}
            )
            _reload_matcher()
            return Response(AppControlSerializer(obj).data)
        return Response(ser.errors, status=400)


# ─── SMART AI ─────────────────────────────────────────────────────────────────

class AIGenerateAppView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        app_name = request.query_params.get('name')
        if not app_name:
            return Response({'error': 'name parameter required'}, status=400)
            
        from dns.ai_service import generate_app_domains
        try:
            domains = generate_app_domains(app_name)
            return Response({'domains': domains})
        except Exception as e:
            return Response({'error': str(e)}, status=500)


class AIExplainView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        domain = request.query_params.get('domain')
        if not domain:
            return Response({'error': 'domain parameter required'}, status=400)
            
        system_prompt = "You are a network security analyst. Explain what this domain is used for concisely. Tell me if it's safe, tracking, or malicious."
        user_prompt = f"Domain: {domain}"
        
        from dns.ai_service import ask_ai
        try:
            explanation = ask_ai(system_prompt, user_prompt)
            return Response({'explanation': explanation})
        except Exception as e:
            return Response({'error': str(e)}, status=500)


# ─── NETWORK / IPTABLES ───────────────────────────────────────────────────────

IPTABLES_RULES = {
    'redirect_dns': [
        'iptables', '-t', 'nat', '-A', 'PREROUTING',
        '-p', 'udp', '--dport', '53', '-j', 'REDIRECT', '--to-port', '53'
    ],
    'block_dot': [
        'iptables', '-A', 'FORWARD', '-p', 'tcp', '--dport', '853', '-j', 'DROP'
    ],
    'block_doh_google': [
        'iptables', '-A', 'OUTPUT', '-d', '8.8.8.8', '-p', 'tcp', '--dport', '443', '-j', 'DROP'
    ],
}


class NetworkIPTablesView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        try:
            result = subprocess.run(
                ['iptables', '-L', '-n', '-v'],
                capture_output=True, text=True, timeout=5
            )
            return Response({'rules': result.stdout, 'error': result.stderr})
        except Exception as exc:
            return Response({'error': str(exc)}, status=500)


class NetworkIPTablesApplyView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request):
        rule_key = request.data.get('rule')
        rule = IPTABLES_RULES.get(rule_key)
        if not rule:
            return Response({'error': 'Unknown rule'}, status=400)
        try:
            result = subprocess.run(
                ['sudo'] + rule,
                capture_output=True, text=True, timeout=10
            )
            ok = result.returncode == 0
            return Response({'ok': ok, 'output': result.stdout, 'error': result.stderr})
        except Exception as exc:
            return Response({'error': str(exc)}, status=500)


class NetworkIPTablesSaveView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request):
        try:
            result = subprocess.run(
                ['sudo', 'netfilter-persistent', 'save'],
                capture_output=True, text=True, timeout=15
            )
            return Response({'ok': result.returncode == 0, 'output': result.stdout})
        except Exception as exc:
            return Response({'error': str(exc)}, status=500)


# ─── USERS ────────────────────────────────────────────────────────────────────

class UserListView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        users = User.objects.select_related('profile').all()
        return Response(UserSerializer(users, many=True).data)

    def post(self, request):
        ser = UserSerializer(data=request.data)
        if ser.is_valid():
            user = ser.save()
            return Response(UserSerializer(user).data, status=201)
        return Response(ser.errors, status=400)


class UserDetailView(APIView):
    permission_classes = [IsAdminRole]

    def get_object(self, pk):
        try:
            return User.objects.get(pk=pk)
        except User.DoesNotExist:
            return None

    def patch(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=404)
        ser = UserSerializer(obj, data=request.data, partial=True)
        if ser.is_valid():
            user = ser.save()
            return Response(UserSerializer(user).data)
        return Response(ser.errors, status=400)

    def delete(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=404)
        if obj == request.user:
            return Response({'error': 'Cannot delete yourself'}, status=400)
        obj.delete()
        return Response(status=204)


class UserForceLogoutView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        from django.contrib.sessions.models import Session
        from django.utils import timezone
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        # Delete all unexpired sessions for this user
        for session in Session.objects.filter(expire_date__gte=timezone.now()):
            data = session.get_decoded()
            if data.get('_auth_user_id') == str(user.id):
                session.delete()
        return Response({'ok': True})


# ─── NETWORK DISCOVERY ────────────────────────────────────────────────────────

class NetworkScanView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request):
        from dns.network_scanner import run_network_scan
        import threading
        
        def run():
            run_network_scan()
            
        threading.Thread(target=run, daemon=True).start()
        return Response({'ok': True, 'message': 'Scan started in background.'})


# ─── SYSTEM STATUS ────────────────────────────────────────────────────────────

class SystemStatusView(APIView):
    def get(self, request):
        def check_service(name):
            try:
                r = subprocess.run(['systemctl', 'is-active', name],
                                   capture_output=True, text=True, timeout=3)
                return r.stdout.strip() == 'active'
            except Exception:
                return False

        def check_redis():
            try:
                import redis
                r = redis.Redis()
                r.ping()
                return True
            except Exception:
                return False

        return Response({
            'proxy_running': True,  # If this endpoint responds, proxy mgmt is up
            'unbound': check_service('unbound'),
            'redis': check_redis(),
        })


class SystemReloadProxyView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request):
        from dns_proxy.matcher import get_matcher
        matcher = get_matcher()
        matcher.reload()
        return Response({'ok': True})


class SystemBackupView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        from datetime import datetime, timezone
        data = {
            'version': '1.0',
            'exported_at': datetime.now(timezone.utc).isoformat(),
            'blocked_domains': list(BlockedDomain.objects.values(
                'domain', 'block_type', 'layer', 'enabled', 'comment'
            )),
            'patterns': list(Pattern.objects.values(
                'name', 'pattern', 'pattern_type', 'enabled', 'comment'
            )),
            'adlists': list(Adlist.objects.values('url', 'name', 'enabled', 'comment')),
            'allowlist': list(AllowedDomain.objects.values(
                'domain', 'allow_type', 'enabled', 'comment'
            )),
            'safesearch': list(SafeSearch.objects.values('engine', 'enabled', 'level')),
            'settings': {s.key: s.value for s in SystemSetting.objects.all()},
            'clients': list(Client.objects.values('ip', 'name', 'group', 'comment')),
        }
        response = HttpResponse(json.dumps(data, indent=2), content_type='application/json')
        response['Content-Disposition'] = 'attachment; filename="dns-shield-backup.json"'
        return response

    def post(self, request):
        """Restore from backup JSON."""
        try:
            data = json.loads(request.body)
            _restore_backup(data, request.user)
            return Response({'ok': True})
        except Exception as exc:
            return Response({'error': str(exc)}, status=400)


def _restore_backup(data, user):
    """Restore all backup data."""
    # Blocked domains
    for item in data.get('blocked_domains', []):
        BlockedDomain.objects.update_or_create(
            domain=item['domain'],
            defaults={**{k: v for k, v in item.items() if k != 'domain'}, 'created_by': user}
        )
    # Patterns
    Pattern.objects.all().delete()
    for item in data.get('patterns', []):
        Pattern.objects.create(**{**item, 'created_by': user})
    # Adlists
    for item in data.get('adlists', []):
        Adlist.objects.update_or_create(
            url=item['url'],
            defaults={**{k: v for k, v in item.items() if k != 'url'}, 'created_by': user}
        )
    # Allowlist
    for item in data.get('allowlist', []):
        AllowedDomain.objects.update_or_create(
            domain=item['domain'],
            defaults={**{k: v for k, v in item.items() if k != 'domain'}, 'created_by': user}
        )
    # Safe search
    for item in data.get('safesearch', []):
        SafeSearch.objects.update_or_create(engine=item['engine'], defaults=item)
    # Settings
    for key, value in data.get('settings', {}).items():
        SystemSetting.objects.update_or_create(key=key, defaults={'value': str(value)})
    # Clients
    for item in data.get('clients', []):
        Client.objects.update_or_create(ip=item['ip'], defaults=item)

    from dns_proxy.matcher import get_matcher
    get_matcher().reload()


# ─── VPN ──────────────────────────────────────────────────────────────────────

class VPNServerView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        server = VPNServer.objects.all().first()
        if not server:
            return Response({'error': 'No VPN server configured'}, status=404)
        return Response(VPNServerSerializer(server).data)

    def post(self, request):
        from dns.vpn_manager import gen_keypair
        priv, pub = gen_keypair()
        obj, _ = VPNServer.objects.update_or_create(
            name=request.data.get('name', 'wg0'),
            defaults={
                'private_key': priv,
                'public_key': pub,
                'listen_port': request.data.get('listen_port', 51820),
                'address': request.data.get('address', '10.0.0.1/24'),
            }
        )
        return Response(VPNServerSerializer(obj).data)


class VPNPeerView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        return Response(VPNPeerSerializer(VPNPeer.objects.all(), many=True).data)

    def post(self, request):
        from dns.vpn_manager import gen_keypair
        priv, pub = gen_keypair()
        ser = VPNPeerSerializer(data=request.data)
        if ser.is_valid():
            obj = ser.save(private_key=priv, public_key=pub)
            return Response(VPNPeerSerializer(obj).data, status=201)
        return Response(ser.errors, status=400)


class VPNPeerDetailView(APIView):
    permission_classes = [IsAdminRole]

    def delete(self, request, pk):
        try:
            VPNPeer.objects.get(pk=pk).delete()
            return Response(status=204)
        except VPNPeer.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)


class VPNConfigView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request, pk):
        from dns.vpn_manager import generate_peer_config
        try:
            peer = VPNPeer.objects.get(pk=pk)
            server = VPNServer.objects.all().first()
            config = generate_peer_config(server, peer)
            return Response({'config': config})
        except Exception as e:
            return Response({'error': str(e)}, status=400)


class VPNSyncView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request):
        from dns.vpn_manager import sync_config
        ok, msg = sync_config()
        return Response({'ok': ok, 'message': msg})


class VPNStatusView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        from dns.vpn_manager import get_status
        status_data = get_status()
        return Response(status_data)


class UnboundDetectView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        import subprocess
        try:
            # Check if binary exists
            which = subprocess.run(['which', 'unbound'], capture_output=True, text=True)
            installed = which.returncode == 0
            
            # Check if active
            status = "inactive"
            if installed:
                res = subprocess.run(['systemctl', 'is-active', 'unbound'], capture_output=True, text=True)
                status = res.stdout.strip()
            
            return Response({
                'installed': installed,
                'status': status,
                'recommendation': {
                    'host': '127.0.0.1',
                    'port': '5335'
                }
            })
        except Exception as e:
            return Response({'error': str(e)}, status=500)


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def _reload_matcher():
    """Reload the DNS matcher cache after a rules change."""
    try:
        from dns_proxy.matcher import get_matcher
        import threading
        threading.Thread(target=get_matcher().reload, daemon=True).start()
    except Exception:
        pass
