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

from dns.models import (
    QueryLog, SafeSearch, SystemSetting, Client, VPNServer, VPNPeer,
    ScheduledRule, AlertConfig, SystemEvent, AIUsageLog
)
from dns.permissions import IsAdminRole
from dns.serializers import (
    LoginSerializer, QueryLogSerializer, BlockedDomainSerializer,
    PatternSerializer, AllowedDomainSerializer, AdlistSerializer,
    SafeSearchSerializer, SystemSettingSerializer, ClientSerializer, UserSerializer,
    BlockGroupSerializer, VPNServerSerializer, VPNPeerSerializer,
    AppCategorySerializer, AppControlSerializer,
    ScheduledRuleSerializer, AlertConfigSerializer, SystemEventSerializer,
    AIUsageLogSerializer
)

class AIUsageLogListView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = AIUsageLog.objects.all()
        return Response(AIUsageLogSerializer(qs, many=True).data)

    def delete(self, request):
        AIUsageLog.objects.all().delete()
        return Response(status=204)

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

def _get_since(request):
    """Helper to get 'since' timestamp from query params."""
    try:
        r = request.query_params.get('range', '24h')
        if r == '7d': return dj_timezone.now() - timedelta(days=7)
        if r == '30d': return dj_timezone.now() - timedelta(days=30)
        if r == 'all': return dj_timezone.now() - timedelta(days=365*10)
        return dj_timezone.now() - timedelta(hours=24)
    except Exception:
        return dj_timezone.now() - timedelta(hours=24)


class StatsSummaryView(APIView):
    def get(self, request):
        from dns.models import SystemSetting
        since = _get_since(request)
        qs = QueryLog.objects.filter(timestamp__gte=since)
        total = qs.count()
        blocked = qs.filter(status__in=['blocked_pattern', 'blocked_domain', 'blocked_list', 'blocked_ai']).count()
        avg_latency = qs.aggregate(a=Avg('response_time_ms'))['a'] or 0
        
        # Total domains on adlists (gravity)
        grav = SystemSetting.objects.filter(key='gravity_unique_count').first()
        total_gravity = int(grav.value) if grav else 0

        return Response({
            'queries': total,
            'blocked': blocked,
            'block_percent': round(blocked / total * 100, 1) if total else 0,
            'avg_latency_ms': round(avg_latency, 2),
            'total_gravity': total_gravity,
        })


class StatsHourlyView(APIView):
    def get(self, request):
        since = _get_since(request)
        qs = QueryLog.objects.filter(timestamp__gte=since)
        data = {}
        # For long ranges, group by day instead of hour
        r = request.query_params.get('range', '24h')
        group_field = 'timestamp__day' if r in ['7d', '30d', 'all'] else 'timestamp__hour'
        
        for entry in qs.values(group_field, 'status').annotate(count=Count('id')):
            val = entry[group_field]
            if r in ['7d', '30d', 'all']:
                # Get first match to find the actual date
                first = qs.filter(**{group_field: val}).first()
                label = first.timestamp.strftime('%b %d') if first else str(val)
            else:
                label = f"{val:02d}:00"
            
            if val not in data:
                data[val] = {'label': label, 'allowed': 0, 'blocked': 0, 'hour': val}
            
            if entry['status'] in ('blocked_pattern', 'blocked_domain', 'blocked_list', 'blocked_ai'):
                data[val]['blocked'] += entry['count']
            else:
                data[val]['allowed'] += entry['count']
        
        return Response(sorted(data.values(), key=lambda x: x['hour']))


class StatsTopDomainsView(APIView):
    def get(self, request):
        since = _get_since(request)
        data = (
            QueryLog.objects.filter(
                timestamp__gte=since,
                status__in=['blocked_pattern', 'blocked_domain', 'blocked_list', 'blocked_ai']
            )
            .values('domain')
            .annotate(count=Count('id'))
            .order_by('-count')[:10]
        )
        return Response(list(data))


class StatsTopAllowedDomainsView(APIView):
    def get(self, request):
        since = _get_since(request)
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
        since = _get_since(request)
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


class StatsQueryTypesView(APIView):
    def get(self, request):
        since = _get_since(request)
        data = (
            QueryLog.objects.filter(timestamp__gte=since)
            .values('query_type')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
        return Response(list(data))


class StatsUpstreamServersView(APIView):
    def get(self, request):
        since = _get_since(request)
        data = (
            QueryLog.objects.filter(timestamp__gte=since)
            .values('resolved_by')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
        formatted = []
        for d in data:
             label = d['resolved_by']
             if not label: label = 'Blocked'
             formatted.append({ 'label': label, 'count': d['count'] })
        return Response(formatted)


class StatsAIThreatInsightView(APIView):
    def get(self, request):
        # We analyze the last 50 blocked queries
        qs = QueryLog.objects.filter(
            status__in=['blocked_pattern', 'blocked_domain', 'blocked_list', 'blocked_ai']
        ).order_by('-timestamp')[:50]
        
        if not qs.exists():
            return Response({'insight': 'No threats detected recently.', 'score': 0})
            
        domains = [q.domain for q in qs]
        from dns.ai_service import ask_ai
        
        system_prompt = (
            "You are a network security analyst. Analyze a list of 50 blocked DNS domains "
            "and categorize the current threat level of the network. "
            "Return a JSON object with: 'insight' (short human sentence summary), "
            "'risk_score' (0-100), and 'top_categories' (array of strings, e.g. ['Adware', 'Phishing']). "
            "Do not return markdown, just raw JSON."
        )
        user_prompt = f"Domains blocked recently: {', '.join(domains)}"
        
        try:
            res_text = ask_ai(system_prompt, user_prompt, feature='threat_insight')
            # Clean possible markdown
            clean_text = res_text.replace("```json", "").replace("```", "").strip()
            data = json.loads(clean_text)
            return Response(data)
        except Exception as e:
            return Response({'error': str(e)}, status=500)


# ─── QUERY LOG ────────────────────────────────────────────────────────────────

class QueryLogListView(APIView):
    def get(self, request):
        qs = QueryLog.objects.all()
        status_filter = request.query_params.get('status')
        client = request.query_params.get('client')
        domain = request.query_params.get('domain')
        from_dt = request.query_params.get('from')
        to_dt = request.query_params.get('to')

        if status_filter == 'blocked':
            qs = qs.filter(status__in=[
                'blocked_pattern', 'blocked_domain', 'blocked_list', 'blocked_ai',
            ])
        elif status_filter:
            qs = qs.filter(status=status_filter)
        if client:
            qs = qs.filter(client_ip__icontains=client)
        if domain:
            qs = qs.filter(domain__icontains=domain)
        if from_dt:
            qs = qs.filter(timestamp__gte=from_dt)
        if to_dt:
            qs = qs.filter(timestamp__lte=to_dt)

        try:
            page = max(int(request.query_params.get('page', 1)), 1)
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = min(max(int(request.query_params.get('page_size', 50)), 10), 200)
        except (TypeError, ValueError):
            page_size = 50

        total = qs.count()
        total_pages = max((total + page_size - 1) // page_size, 1)
        if page > total_pages:
            page = total_pages
        offset = (page - 1) * page_size
        rows = qs.order_by('-timestamp')[offset:offset + page_size]

        return Response({
            'results': QueryLogSerializer(rows, many=True).data,
            'count': total,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
        })


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


class AIUsageLogExportView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = AIUsageLog.objects.all().order_by('-timestamp')[:5000]
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            'timestamp', 'user', 'user_id', 'feature', 'query', 'prompt', 'response', 'tokens_estimate'
        ])
        writer.writeheader()
        for entry in qs:
            writer.writerow({
                'timestamp': entry.timestamp.isoformat(),
                'user': entry.user.username if entry.user else 'System',
                'user_id': entry.user.id if entry.user else '',
                'feature': entry.feature,
                'query': entry.query,
                'prompt': entry.prompt,
                'response': entry.response,
                'tokens_estimate': entry.tokens_estimate,
            })
        response = HttpResponse(output.getvalue(), content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="ai_usage_audit.csv"'
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
            domains = generate_app_domains(app_name, user=request.user)
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
            explanation = ask_ai(system_prompt, user_prompt, user=request.user, feature='domain_explain', query=domain)
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


class SeedDataView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request):
        from django.conf import settings
        if not settings.DEBUG:
            return Response({'error': 'Seed is disabled in production.'}, status=403)
        from django.core.management import call_command
        count = request.data.get('count', 50)
        try:
            call_command('seed_data', queries=count)
            return Response({'status': 'ok', 'message': f'Seeded {count} queries'})
        except Exception as e:
            return Response({'error': str(e)}, status=500)


class ClearQueryLogView(APIView):
    def post(self, request):
        from dns.models import QueryLog
        try:
            QueryLog.objects.all().delete()
            return Response({'status': 'ok', 'message': 'Cleared all logs'})
        except Exception as e:
            return Response({'error': str(e)}, status=500)
    
    def delete(self, request):
        return self.post(request)


class ShieldStatusView(APIView):
    def get(self, request):
        from .shield import is_shield_active, _shield_cache
        import time
        active = is_shield_active()
        remaining = 0
        if not active and _shield_cache['disabled_until'] > 0:
            remaining = int(_shield_cache['disabled_until'] - time.time())
            if remaining < 0: remaining = 0
        
        return Response({
            'active': active,
            'remaining_seconds': remaining,
            'disabled_until': _shield_cache['disabled_until']
        })


class ShieldToggleView(APIView):
    def post(self, request):
        from .shield import set_shield_status
        active = request.data.get('active', True)
        duration = request.data.get('duration', 0) # in minutes
        
        set_shield_status(active, duration_minutes=duration)
        
        return Response({
            'status': 'ok',
            'active': active,
            'duration': duration
        })



# ─── DOMAIN SEARCH TOOL ────────────────────────────────────────────────────────

class DomainSearchView(APIView):
    def get(self, request):
        import re as re_module
        domain = request.query_params.get('q', '').strip().lower()
        if not domain:
            return Response({'error': 'Missing query parameter q'}, status=400)

        results = []

        for bd in BlockedDomain.objects.filter(domain__icontains=domain, enabled=True)[:10]:
            results.append({'type': 'blocklist', 'source': 'Exact Block', 'domain': bd.domain,
                            'match': bd.block_type, 'action': 'blocked'})

        for al in AllowedDomain.objects.filter(domain__icontains=domain, enabled=True)[:5]:
            results.append({'type': 'allowlist', 'source': 'Allowlist', 'domain': al.domain,
                            'match': al.allow_type, 'action': 'allowed'})

        grav_matches = GravityDomain.objects.filter(domain__icontains=domain).select_related('adlist')[:10]
        for gd in grav_matches:
            results.append({'type': 'gravity', 'source': gd.adlist.name, 'domain': gd.domain,
                            'match': 'gravity', 'action': 'blocked'})

        for pat in Pattern.objects.filter(enabled=True):
            try:
                if re_module.search(pat.pattern, domain, re_module.IGNORECASE):
                    results.append({'type': 'pattern', 'source': pat.name, 'domain': domain,
                                    'match': pat.pattern_type, 'action': 'blocked'})
            except Exception:
                pass

        return Response({'query': domain, 'results': results, 'total': len(results)})


# ─── SYSTEM HEALTH ─────────────────────────────────────────────────────────────

class SystemHealthView(APIView):
    def get(self, request):
        import shutil, os
        health = {}

        try:
            usage = shutil.disk_usage('/')
            health['disk'] = {
                'total_gb': round(usage.total / 1e9, 1),
                'used_gb': round(usage.used / 1e9, 1),
                'free_gb': round(usage.free / 1e9, 1),
                'percent': round(usage.used / usage.total * 100, 1),
            }
        except Exception:
            health['disk'] = {}

        try:
            with open('/proc/meminfo') as f:
                lines = {}
                for l in f:
                    if ':' in l:
                        k, v = l.split(':', 1)
                        lines[k.strip()] = int(v.strip().split()[0])
            total = lines.get('MemTotal', 0)
            available = lines.get('MemAvailable', 0)
            used = total - available
            health['memory'] = {
                'total_mb': round(total / 1024),
                'used_mb': round(used / 1024),
                'free_mb': round(available / 1024),
                'percent': round(used / total * 100, 1) if total else 0,
            }
        except Exception:
            health['memory'] = {}

        try:
            with open('/sys/class/thermal/thermal_zone0/temp') as f:
                health['cpu_temp_c'] = round(int(f.read()) / 1000, 1)
        except Exception:
            health['cpu_temp_c'] = None

        try:
            with open('/proc/uptime') as f:
                uptime_sec = float(f.read().split()[0])
            health['uptime'] = {
                'seconds': int(uptime_sec),
                'days': int(uptime_sec // 86400),
                'hours': int((uptime_sec % 86400) // 3600),
                'minutes': int((uptime_sec % 3600) // 60),
            }
        except Exception:
            health['uptime'] = {}

        try:
            from django.conf import settings
            db_path = str(settings.DATABASES['default']['NAME'])
            health['db_size_mb'] = round(os.path.getsize(db_path) / 1e6, 2)
        except Exception:
            health['db_size_mb'] = 0

        health['total_queries'] = QueryLog.objects.count()
        return Response(health)


# ─── HISTORICAL STATS ──────────────────────────────────────────────────────────

class StatsHistoryView(APIView):
    def get(self, request):
        days = min(max(int(request.query_params.get('days', 7)), 1), 30)
        since = dj_timezone.now() - timedelta(days=days)
        data = (
            QueryLog.objects.filter(timestamp__gte=since)
            .extra(select={'day': "date(timestamp)"})
            .values('day')
            .annotate(
                total=Count('id'),
                blocked=Count('id', filter=Q(status__in=['blocked_pattern', 'blocked_domain', 'blocked_list', 'blocked_ai']))
            )
            .order_by('day')
        )
        return Response(list(data))


# ─── AUDIT LOG ─────────────────────────────────────────────────────────────────

class AuditLogView(APIView):
    def get(self, request):
        since = dj_timezone.now() - timedelta(hours=72)
        blocked_domains = (
            QueryLog.objects.filter(
                timestamp__gte=since,
                status__in=['blocked_list', 'blocked_domain', 'blocked_pattern', 'blocked_ai']
            )
            .values('domain')
            .annotate(count=Count('id'))
            .order_by('-count')[:50]
        )
        user_blocked = set(BlockedDomain.objects.values_list('domain', flat=True))
        user_allowed = set(AllowedDomain.objects.values_list('domain', flat=True))

        results = []
        for item in blocked_domains:
            d = item['domain']
            if d not in user_blocked and d not in user_allowed:
                source = 'Unknown'
                gd = GravityDomain.objects.filter(domain=d).select_related('adlist').first()
                if gd:
                    source = f"Gravity: {gd.adlist.name}"
                results.append({'domain': d, 'count': item['count'], 'source': source})
        return Response(results)


# ─── API TOKEN ─────────────────────────────────────────────────────────────────

class ApiTokenView(APIView):
    def get(self, request):
        token = SystemSetting.objects.filter(key=f'api_token_{request.user.id}').first()
        return Response({'token': token.value if token else None, 'user': request.user.username})

    def post(self, request):
        import secrets
        token = secrets.token_hex(32)
        SystemSetting.objects.update_or_create(
            key=f'api_token_{request.user.id}',
            defaults={'value': token, 'description': f'API token for {request.user.username}'}
        )
        return Response({'token': token})

    def delete(self, request):
        SystemSetting.objects.filter(key=f'api_token_{request.user.id}').delete()
        return Response({'status': 'revoked'})


# ─── PER-CLIENT HISTORY (Phase 22) ──────────────────────────────────────────

class ClientHistoryView(APIView):
    def get(self, request, pk):
        try:
            client = Client.objects.get(pk=pk)
        except Client.DoesNotExist:
            return Response({'error': 'Client not found'}, status=404)
        
        qs = QueryLog.objects.filter(client_ip=client.ip)
        # Apply more filters if needed
        qs = qs[:500]
        return Response(QueryLogSerializer(qs, many=True).data)


class ClientStatsView(APIView):
    def get(self, request, pk):
        try:
            client = Client.objects.get(pk=pk)
        except Client.DoesNotExist:
            return Response({'error': 'Client not found'}, status=404)
        
        since = dj_timezone.now() - timedelta(hours=24)
        qs = QueryLog.objects.filter(client_ip=client.ip, timestamp__gte=since)
        
        total = qs.count()
        blocked = qs.filter(status__in=['blocked_pattern', 'blocked_domain', 'blocked_list', 'blocked_ai']).count()
        
        top_domains = (
            qs.values('domain')
            .annotate(count=Count('id'))
            .order_by('-count')[:10]
        )
        
        hourly = {}
        for entry in qs.values('timestamp__hour', 'status').annotate(count=Count('id')):
            hour = entry['timestamp__hour']
            if hour not in hourly:
                hourly[hour] = {'hour': hour, 'allowed': 0, 'blocked': 0}
            if entry['status'] in ('blocked_pattern', 'blocked_domain', 'blocked_list', 'blocked_ai'):
                hourly[hour]['blocked'] += entry['count']
            else:
                hourly[hour]['allowed'] += entry['count']
        
        return Response({
            'total': total,
            'blocked': blocked,
            'top_domains': list(top_domains),
            'hourly': sorted(hourly.values(), key=lambda x: x['hour']),
            'client': ClientSerializer(client).data
        })


# ─── SCHEDULED BLOCKING (Phase 23) ──────────────────────────────────────────

class ScheduledRuleListView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        return Response(ScheduledRuleSerializer(ScheduledRule.objects.all(), many=True).data)

    def post(self, request):
        ser = ScheduledRuleSerializer(data=request.data)
        if ser.is_valid():
            ser.save()
            return Response(ser.data, status=201)
        return Response(ser.errors, status=400)


class ScheduledRuleDetailView(APIView):
    permission_classes = [IsAdminRole]

    def patch(self, request, pk):
        try:
            obj = ScheduledRule.objects.get(pk=pk)
        except ScheduledRule.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        ser = ScheduledRuleSerializer(obj, data=request.data, partial=True)
        if ser.is_valid():
            ser.save()
            return Response(ser.data)
        return Response(ser.errors, status=400)

    def delete(self, request, pk):
        try:
            ScheduledRule.objects.get(pk=pk).delete()
            return Response(status=204)
        except ScheduledRule.DoesNotExist:
            return Response(status=404)


# ─── ALERTS (Phase 24) ──────────────────────────────────────────────────────

class AlertConfigListView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        return Response(AlertConfigSerializer(AlertConfig.objects.all(), many=True).data)

    def post(self, request):
        ser = AlertConfigSerializer(data=request.data)
        if ser.is_valid():
            ser.save()
            return Response(ser.data, status=201)
        return Response(ser.errors, status=400)


class AlertConfigDetailView(APIView):
    permission_classes = [IsAdminRole]

    def patch(self, request, pk):
        try:
            obj = AlertConfig.objects.get(pk=pk)
        except AlertConfig.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        ser = AlertConfigSerializer(obj, data=request.data, partial=True)
        if ser.is_valid():
            ser.save()
            return Response(ser.data)
        return Response(ser.errors, status=400)

    def delete(self, request, pk):
        try:
            AlertConfig.objects.get(pk=pk).delete()
            return Response(status=204)
        except AlertConfig.DoesNotExist:
            return Response(status=404)


# ─── GLOBAL SEARCH (Phase 25) ────────────────────────────────────────────────

class GlobalSearchView(APIView):
    def get(self, request):
        q = request.query_params.get('q', '').strip()
        if not q or len(q) < 2:
            return Response([])
        
        results = []
        # Search Clients
        clients = Client.objects.filter(Q(ip__icontains=q) | Q(name__icontains=q) | Q(hostname__icontains=q))[:5]
        for c in clients:
            results.append({'type': 'client', 'id': c.id, 'label': c.name or c.hostname or c.ip, 'sub': c.ip, 'href': f'/clients/{c.id}'})
        
        # Search Patterns
        patterns = Pattern.objects.filter(Q(name__icontains=q) | Q(pattern__icontains=q))[:5]
        for p in patterns:
            results.append({'type': 'pattern', 'id': p.id, 'label': p.name, 'sub': p.pattern, 'href': '/blocks/patterns'})
        
        # Search Blocked Domains
        domains = BlockedDomain.objects.filter(domain__icontains=q)[:5]
        for d in domains:
            results.append({'type': 'domain', 'id': d.id, 'label': d.domain, 'sub': 'Blocked Domain', 'href': '/blocks/domains'})
        
        # Search App categories
        apps = AppCategory.objects.filter(name__icontains=q)[:3]
        for a in apps:
            results.append({'type': 'app', 'id': a.id, 'label': a.name, 'sub': 'App Category', 'href': '/blocks/apps'})
            
        return Response(results)


# ─── DOMAIN ANALYTICS (Phase 27) ─────────────────────────────────────────────

class DomainAnalyticsView(APIView):
    def get(self, request):
        domain = request.query_params.get('domain')
        if not domain:
            return Response({'error': 'Domain required'}, status=400)

        since = dj_timezone.now() - timedelta(days=30)
        qs = QueryLog.objects.filter(domain=domain, timestamp__gte=since)

        total = qs.count()
        status_split = qs.values('status').annotate(count=Count('id'))
        top_clients = qs.values('client_ip').annotate(count=Count('id')).order_by('-count')[:5]

        # Daily breakdown for 30d — fill every day so the chart always has a series
        from django.db.models.functions import TruncDate
        daily_rows = (
            qs.annotate(day=TruncDate('timestamp'))
            .values('day')
            .annotate(count=Count('id'))
            .order_by('day')
        )
        by_day = {}
        for row in daily_rows:
            if row['day'] is not None:
                by_day[row['day'].isoformat()] = row['count']

        today = dj_timezone.localdate()
        history = []
        for i in range(29, -1, -1):
            d = today - timedelta(days=i)
            history.append({'day': d.isoformat(), 'count': by_day.get(d.isoformat(), 0)})

        # Check current rules
        from dns_proxy.matcher import get_matcher
        matcher = get_matcher()
        is_blocked = not matcher.is_allowed(domain) and (
            matcher.match_pattern(domain) or
            matcher.match_domain(domain) or
            matcher.in_gravity(domain)
        )

        return Response({
            'domain': domain,
            'total_hits_30d': total,
            'status_split': list(status_split),
            'top_clients': list(top_clients),
            'history': history,
            'is_blocked': is_blocked
        })


# ─── THREAT FEEDS (Phase 28) ───────────────────────────────────────────────

class ThreatFeedListView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        # We handle threat feeds as adlists with a specific comment or flag
        feeds = Adlist.objects.filter(comment__startswith='[THREAT_FEED]')
        return Response(AdlistSerializer(feeds, many=True).data)


# ─── NOTIFICATIONS (Phase 29) ──────────────────────────────────────────────

class NotificationsView(APIView):
    def get(self, request):
        qs = SystemEvent.objects.all()[:50]
        return Response(SystemEventSerializer(qs, many=True).data)

    def post(self, request):
        # Mark all as read
        SystemEvent.objects.filter(read=False).update(read=True)
        return Response({'ok': True})


class DnsCacheFlushView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request):
        try:
            # Requires unbound-control configured
            subprocess.run(['sudo', 'unbound-control', 'flush_all'], check=False)
            return Response({'ok': True})
        except Exception as e:
            return Response({'error': str(e)}, status=500)


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def _reload_matcher():
    """Reload the DNS matcher cache after a rules change.

    The web process (Daphne) and DNS proxy are separate processes. Bump a
    shared version token so the proxy picks up new rules on its next poll,
    and also reload locally for in-process Test APIs.
    """
    try:
        import time
        from dns.models import SystemSetting
        SystemSetting.objects.update_or_create(
            key='matcher_reload_token',
            defaults={
                'value': str(time.time()),
                'description': 'Bump to signal DNS proxy to reload rules',
            },
        )
    except Exception:
        pass
    try:
        from dns_proxy.matcher import get_matcher
        import threading
        threading.Thread(target=get_matcher().reload, daemon=True).start()
    except Exception:
        pass
