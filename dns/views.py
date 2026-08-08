"""
All REST API views for DNS Shield.
Organized by feature area with role-based access control.
"""
import csv
import io
import json
import re
import subprocess
import asyncio
import time
from datetime import datetime, timedelta, timezone

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db.models import Count, Avg, Q, Max
from django.http import HttpResponse, StreamingHttpResponse
from django.utils import timezone as dj_timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from dns.models import (
    QueryLog, SafeSearch, SystemSetting, Client, VPNServer, VPNPeer,
    ScheduledRule, AlertConfig, SystemEvent, AIUsageLog, DomainTrust,
    AIReportCache, DomainCategory, LocalDnsRecord, LocalCnameRecord,
)
from dns.permissions import IsAdminRole
from dns.serializers import (
    LoginSerializer, QueryLogSerializer, BlockedDomainSerializer,
    PatternSerializer, AllowedDomainSerializer, AdlistSerializer,
    SafeSearchSerializer, SystemSettingSerializer, ClientSerializer, UserSerializer,
    BlockGroupSerializer, VPNServerSerializer, VPNPeerSerializer,
    AppCategorySerializer, AppControlSerializer,
    ScheduledRuleSerializer, AlertConfigSerializer, SystemEventSerializer,
    AIUsageLogSerializer, DomainTrustSerializer,
    AIReportCacheListSerializer, AIReportCacheDetailSerializer,
    DomainCategorySerializer,
    LocalDnsRecordSerializer, LocalCnameRecordSerializer,
)

class AIUsageLogListView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = AIUsageLog.objects.all().order_by('-timestamp')
        feature = request.query_params.get('feature')
        provider = request.query_params.get('provider')
        status_f = request.query_params.get('status')
        q = request.query_params.get('q')
        if feature:
            qs = qs.filter(feature=feature)
        if provider:
            qs = qs.filter(provider=provider)
        if status_f:
            qs = qs.filter(status=status_f)
        if q:
            qs = qs.filter(
                Q(query__icontains=q)
                | Q(prompt__icontains=q)
                | Q(response__icontains=q)
                | Q(model__icontains=q)
                | Q(feature__icontains=q)
            )
        return Response(AIUsageLogSerializer(qs[:500], many=True).data)

    def delete(self, request):
        AIUsageLog.objects.all().delete()
        return Response(status=204)


class DomainTrustListView(APIView):
    """List / clear AI domain trust scores."""
    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = DomainTrust.objects.all().order_by('-trust_score', 'domain')
        q = request.query_params.get('q')
        label = request.query_params.get('label')
        high_only = request.query_params.get('high_only') in ('1', 'true', 'yes')
        if q:
            qs = qs.filter(Q(domain__icontains=q) | Q(reason__icontains=q) | Q(source__icontains=q))
        if label:
            qs = qs.filter(label=label)
        if high_only:
            qs = qs.filter(trust_score__gte=70)
        return Response(DomainTrustSerializer(qs[:2000], many=True).data)

    def delete(self, request):
        DomainTrust.objects.all().delete()
        return Response(status=204)


class DomainTrustDetailView(APIView):
    permission_classes = [IsAdminRole]

    def delete(self, request, pk):
        deleted, _ = DomainTrust.objects.filter(pk=pk).delete()
        if not deleted:
            return Response({'error': 'Not found'}, status=404)
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
        blocked = qs.filter(status__in=['blocked_pattern', 'blocked_domain', 'blocked_list', 'blocked_ai', 'blocked_client']).count()
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
            
            if entry['status'] in ('blocked_pattern', 'blocked_domain', 'blocked_list', 'blocked_ai', 'blocked_client'):
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
                status__in=['blocked_pattern', 'blocked_domain', 'blocked_list', 'blocked_ai', 'blocked_client']
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
    """Dashboard AI threat summary. Cached + single-flight to avoid duplicate Claude calls."""

    CACHE_TTL = 600  # 10 minutes
    LOCK_TTL = 180   # hold while a call is in progress

    def get(self, request):
        import hashlib
        import time
        from django.core.cache import cache
        from dns.domain_trust import (
            dedupe_domains, trusted_domain_set, upsert_domain_trust, HIGH_TRUST_THRESHOLD,
        )
        from dns.ai_service import ask_ai

        force = str(request.query_params.get('refresh', '')).lower() in ('1', 'true', 'yes')

        qs = QueryLog.objects.filter(
            status__in=['blocked_pattern', 'blocked_domain', 'blocked_list', 'blocked_ai', 'blocked_client']
        ).order_by('-timestamp')[:200]

        if not qs.exists():
            return Response({'insight': 'No threats detected recently.', 'score': 0, 'domains_analyzed': 0})

        unique_all = dedupe_domains([q.domain for q in qs])
        trusted = trusted_domain_set(HIGH_TRUST_THRESHOLD)
        skipped_trusted = [d for d in unique_all if d in trusted]
        domains = [d for d in unique_all if d not in trusted][:50]

        if not domains:
            return Response({
                'insight': 'All recent blocked domains are already high-trust; nothing new to analyze.',
                'score': 0,
                'domains_analyzed': 0,
                'skipped_trusted': len(skipped_trusted),
            })

        domain_key = hashlib.sha256(','.join(sorted(domains)).encode()).hexdigest()[:24]
        cache_key = f'ai_threat_insight:{domain_key}'
        lock_key = f'ai_threat_insight_lock:{domain_key}'

        if not force:
            cached = cache.get(cache_key)
            if cached:
                cached = dict(cached)
                cached['cached'] = True
                return Response(cached)

        # Single-flight: if another request is already calling the AI for this set, wait for it
        if not force:
            got_lock = cache.add(lock_key, '1', timeout=self.LOCK_TTL)
            if not got_lock:
                for _ in range(90):  # up to ~90s
                    time.sleep(1)
                    cached = cache.get(cache_key)
                    if cached:
                        cached = dict(cached)
                        cached['cached'] = True
                        return Response(cached)
                    if cache.add(lock_key, '1', timeout=self.LOCK_TTL):
                        got_lock = True
                        break
                if not got_lock:
                    stale = cache.get(cache_key)
                    if stale:
                        stale = dict(stale)
                        stale['cached'] = True
                        return Response(stale)
                    return Response({
                        'insight': 'Threat analysis is already running. Try again shortly.',
                        'score': 0,
                        'domains_analyzed': 0,
                        'pending': True,
                    })
        else:
            cache.delete(lock_key)
            cache.add(lock_key, '1', timeout=self.LOCK_TTL)

        system_prompt = (
            "You are a network security analyst. Analyze a deduplicated list of blocked DNS domains "
            "and categorize the current threat level of the network. "
            "Return a JSON object with: 'insight' (short human sentence summary), "
            "'risk_score' (0-100), 'top_categories' (array of strings, e.g. ['Adware', 'Phishing']), "
            "and 'domain_scores' (array of up to 25 objects: "
            "{'domain': str, 'trust_score': 0-100 where 100=very safe/benign, "
            "'label': 'safe'|'tracking'|'malicious'|'unknown', 'reason': short string}). "
            "Do not return markdown, just raw JSON."
        )
        user_prompt = f"Unique domains blocked recently ({len(domains)}): {', '.join(domains)}"

        try:
            res_text = ask_ai(
                system_prompt, user_prompt,
                feature='threat_insight', query=f'{len(domains)} domains',
            )
            clean_text = res_text.replace('```json', '').replace('```', '').strip()
            data = json.loads(clean_text)
            saved = 0
            for item in data.get('domain_scores') or []:
                if not isinstance(item, dict) or not item.get('domain'):
                    continue
                try:
                    upsert_domain_trust(
                        item['domain'],
                        item.get('trust_score', 50),
                        label=item.get('label') or 'unknown',
                        reason=item.get('reason') or '',
                        source='threat_insight',
                    )
                    saved += 1
                except Exception:
                    pass
            data['domains_analyzed'] = len(domains)
            data['skipped_trusted'] = len(skipped_trusted)
            data['trust_scores_saved'] = saved
            data['cached'] = False
            cache.set(cache_key, data, timeout=self.CACHE_TTL)
            return Response(data)
        except Exception as e:
            return Response({'error': str(e)}, status=500)
        finally:
            cache.delete(lock_key)


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
                'blocked_pattern', 'blocked_domain', 'blocked_list', 'blocked_ai', 'blocked_client',
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


class AIRunProfilerView(APIView):
    """Manually trigger the auto intelligence behavioral profiler."""
    permission_classes = [IsAdminRole]

    def post(self, request):
        from dns.ai_worker import run_profiler
        from dns.ai_service import get_ai_config

        enabled, provider, _, _ = get_ai_config()
        if not enabled or not provider:
            return Response(
                {'error': 'Enable Smart AI and choose a provider first.'},
                status=400,
            )
        try:
            message = run_profiler(force=True)
            last = SystemSetting.objects.filter(key='ai_auto_last_run').values_list('value', flat=True).first()
            return Response({
                'ok': True,
                'message': message,
                'last_run': last or '',
            })
        except Exception as e:
            return Response({'error': str(e)}, status=500)


class AIUsageLogExportView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = AIUsageLog.objects.all().order_by('-timestamp')[:5000]
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            'timestamp', 'user', 'user_id', 'feature', 'query', 'provider', 'model',
            'status', 'tokens_estimate', 'tokens_input', 'tokens_output',
            'prompt', 'response', 'error_message',
        ])
        writer.writeheader()
        for entry in qs:
            writer.writerow({
                'timestamp': entry.timestamp.isoformat(),
                'user': entry.user.username if entry.user else 'System',
                'user_id': entry.user.id if entry.user else '',
                'feature': entry.feature,
                'query': entry.query,
                'provider': entry.provider,
                'model': entry.model,
                'status': entry.status,
                'tokens_estimate': entry.tokens_estimate,
                'tokens_input': entry.tokens_input,
                'tokens_output': entry.tokens_output,
                'prompt': entry.prompt,
                'response': entry.response,
                'error_message': entry.error_message,
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


# ─── LOCAL DNS (A/AAAA + CNAME) ───────────────────────────────────────────────

class LocalDnsRecordListView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAdminRole()]

    def get(self, request):
        return Response(LocalDnsRecordSerializer(LocalDnsRecord.objects.all(), many=True).data)

    def post(self, request):
        ser = LocalDnsRecordSerializer(data=request.data)
        if ser.is_valid():
            domain = ser.validated_data['domain']
            if LocalCnameRecord.objects.filter(domain=domain).exists():
                return Response(
                    {'domain': ['A CNAME already exists for this domain. Remove it first.']},
                    status=400,
                )
            obj, _ = LocalDnsRecord.objects.update_or_create(
                domain=domain,
                defaults={k: v for k, v in ser.validated_data.items() if k != 'domain'},
            )
            _reload_matcher()
            return Response(LocalDnsRecordSerializer(obj).data, status=201)
        return Response(ser.errors, status=400)


class LocalDnsRecordDetailView(APIView):
    permission_classes = [IsAdminRole]

    def patch(self, request, pk):
        try:
            obj = LocalDnsRecord.objects.get(pk=pk)
        except LocalDnsRecord.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        ser = LocalDnsRecordSerializer(obj, data=request.data, partial=True)
        if ser.is_valid():
            domain = ser.validated_data.get('domain', obj.domain)
            if LocalCnameRecord.objects.filter(domain=domain).exclude(pk=obj.pk).exists():
                return Response(
                    {'domain': ['A CNAME already exists for this domain.']},
                    status=400,
                )
            ser.save()
            _reload_matcher()
            return Response(ser.data)
        return Response(ser.errors, status=400)

    def delete(self, request, pk):
        try:
            obj = LocalDnsRecord.objects.get(pk=pk)
        except LocalDnsRecord.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        obj.delete()
        _reload_matcher()
        return Response(status=204)


class LocalCnameRecordListView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAdminRole()]

    def get(self, request):
        return Response(LocalCnameRecordSerializer(LocalCnameRecord.objects.all(), many=True).data)

    def post(self, request):
        ser = LocalCnameRecordSerializer(data=request.data)
        if ser.is_valid():
            domain = ser.validated_data['domain']
            if LocalDnsRecord.objects.filter(domain=domain).exists():
                return Response(
                    {'domain': ['An A/AAAA record already exists for this domain. Remove it first.']},
                    status=400,
                )
            obj, _ = LocalCnameRecord.objects.update_or_create(
                domain=domain,
                defaults={k: v for k, v in ser.validated_data.items() if k != 'domain'},
            )
            _reload_matcher()
            return Response(LocalCnameRecordSerializer(obj).data, status=201)
        return Response(ser.errors, status=400)


class LocalCnameRecordDetailView(APIView):
    permission_classes = [IsAdminRole]

    def patch(self, request, pk):
        try:
            obj = LocalCnameRecord.objects.get(pk=pk)
        except LocalCnameRecord.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        ser = LocalCnameRecordSerializer(obj, data=request.data, partial=True)
        if ser.is_valid():
            domain = ser.validated_data.get('domain', obj.domain)
            if LocalDnsRecord.objects.filter(domain=domain).exclude(pk=obj.pk).exists():
                return Response(
                    {'domain': ['An A/AAAA record already exists for this domain.']},
                    status=400,
                )
            ser.save()
            _reload_matcher()
            return Response(ser.data)
        return Response(ser.errors, status=400)

    def delete(self, request, pk):
        try:
            obj = LocalCnameRecord.objects.get(pk=pk)
        except LocalCnameRecord.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)
        obj.delete()
        _reload_matcher()
        return Response(status=204)


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


_QUARANTINE_NAME_RE = re.compile(
    r'^\s*\[(?:AI-)?QUARANTINED\]\s*',
    re.IGNORECASE,
)


def _strip_quarantine_name(name: str, ip: str = '') -> str:
    cleaned = _QUARANTINE_NAME_RE.sub('', name or '').strip()
    if cleaned == ip:
        return ''
    return cleaned


def _release_client_quarantine(client):
    """Clear AI quarantine label, full DNS block, and Quarantine group membership."""
    fields = []
    new_name = _strip_quarantine_name(client.name, client.ip)
    if new_name != (client.name or ''):
        client.name = new_name
        fields.append('name')
    if client.is_blocked:
        client.is_blocked = False
        fields.append('is_blocked')
    if client.group_id and client.group and (client.group.name or '').lower() == 'quarantine':
        client.group = None
        fields.append('group')
    if fields:
        client.save(update_fields=fields)
    return client


class ClientDetailView(APIView):
    permission_classes = [IsAdminRole]

    def patch(self, request, pk):
        try:
            obj = Client.objects.get(pk=pk)
        except Client.DoesNotExist:
            return Response({'error': 'Not found'}, status=404)

        release = request.data.get('release_quarantine') in (True, 'true', '1', 1)
        if release:
            _release_client_quarantine(obj)
            obj.refresh_from_db()
            return Response(ClientSerializer(obj).data)

        ser = ClientSerializer(obj, data=request.data, partial=True)
        if not ser.is_valid():
            return Response(ser.errors, status=400)
        obj = ser.save()
        # Bypass and full-block are mutually exclusive
        if obj.shield_bypass and obj.is_blocked:
            if 'shield_bypass' in request.data and request.data.get('shield_bypass') in (True, 'true', '1', 1):
                obj.is_blocked = False
            else:
                obj.shield_bypass = False
            obj.save(update_fields=['is_blocked', 'shield_bypass'])
        # Unblocking also clears quarantine label so the UI updates
        if 'is_blocked' in request.data and not obj.is_blocked:
            _release_client_quarantine(obj)
            obj.refresh_from_db()
        return Response(ClientSerializer(obj).data)

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

        from dns.domain_trust import (
            get_domain_trust, upsert_domain_trust, parse_label_from_text,
            normalize_domain,
        )
        from dns.ai_service import ask_ai

        domain = normalize_domain(domain)
        existing = get_domain_trust(domain)
        # Skip re-asking AI for high-trust domains unless ?refresh=1
        refresh = request.query_params.get('refresh') in ('1', 'true', 'yes')
        if existing and existing.get('is_high_trust') and not refresh:
            return Response({
                'explanation': existing.get('reason') or f"Cached as {existing['label']} (trust {existing['trust_score']}).",
                'trust': existing,
                'cached': True,
            })

        system_prompt = (
            "You are a network security analyst. Explain what this domain is used for concisely. "
            "Return ONLY raw JSON (no markdown) with keys: "
            "explanation (string), trust_score (0-100, 100=very safe/benign), "
            "label (one of: safe, tracking, malicious, unknown)."
        )
        user_prompt = f'Domain: {domain}'

        try:
            raw = ask_ai(system_prompt, user_prompt, user=request.user, feature='domain_explain', query=domain)
            explanation = raw
            trust_score = None
            label = 'unknown'
            try:
                clean = raw.replace('```json', '').replace('```', '').strip()
                data = json.loads(clean)
                explanation = data.get('explanation') or raw
                trust_score = data.get('trust_score')
                label = data.get('label') or 'unknown'
            except Exception:
                label, trust_score = parse_label_from_text(raw)

            trust = upsert_domain_trust(
                domain,
                50 if trust_score is None else trust_score,
                label=label,
                reason=explanation,
                source='domain_explain',
            )
            return Response({
                'explanation': explanation,
                'trust': trust,
                'cached': False,
            })
        except Exception as e:
            return Response({'error': str(e)}, status=500)


class DomainCategoryListView(APIView):
    """List / clear the AI Report domain→category lookup table."""
    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = DomainCategory.objects.all().order_by('domain')
        try:
            limit = min(max(int(request.query_params.get('limit', 500)), 1), 5000)
        except (TypeError, ValueError):
            limit = 500
        return Response({
            'count': DomainCategory.objects.count(),
            'items': DomainCategorySerializer(qs[:limit], many=True).data,
        })

    def delete(self, request):
        deleted, _ = DomainCategory.objects.all().delete()
        return Response({'ok': True, 'deleted': deleted})


class AIReportView(APIView):
    """
    Date-range browsing report:
    unique DNS domains → local category cache → AI for unknowns only.
    """
    permission_classes = [IsAdminRole]

    # Cap report size; only uncached domains are sent to Claude (BATCH_SIZE each call).
    MAX_DOMAINS = 120
    BATCH_SIZE = 40
    BATCH_PAUSE_SEC = 45
    CATEGORIES = (
        'movies', 'streaming', 'news', 'adult', 'ads', 'shopping', 'social',
        'gaming', 'tech', 'cdn', 'mail', 'education', 'finance', 'search',
        'cloud', 'iot', 'other',
    )

    def post(self, request):
        stream = bool(request.data.get('stream'))
        if not stream:
            status_code, payload = self._execute_report(request)
            return Response(payload, status=status_code)

        import queue
        import threading
        from dns.ai_progress import set_progress_callback, clear_progress_callback

        # Snapshot request data on this thread (request is not thread-safe).
        data = {
            'from': (request.data.get('from') or request.data.get('start') or ''),
            'to': (request.data.get('to') or request.data.get('end') or ''),
            'client_ip': (request.data.get('client_ip') or request.data.get('client') or ''),
        }
        user = request.user

        q = queue.Queue()

        def emit(msg):
            q.put({'type': 'status', 'message': str(msg)})

        def worker():
            from django.db import close_old_connections
            close_old_connections()
            try:
                set_progress_callback(emit)
                emit('Starting AI report…')
                # Fake request-like object for _execute_report
                class _Req:
                    pass
                req = _Req()
                req.data = data
                req.user = user
                status_code, payload = self._execute_report(req, on_status=emit)
                if status_code >= 400 and payload.get('error') and not payload.get('items'):
                    q.put({'type': 'error', 'error': payload.get('error'), 'data': payload})
                else:
                    q.put({'type': 'result', 'data': payload})
            except Exception as exc:
                q.put({'type': 'error', 'error': str(exc)})
            finally:
                clear_progress_callback()
                close_old_connections()
                q.put(None)

        threading.Thread(target=worker, daemon=True).start()

        def event_stream():
            while True:
                item = q.get()
                if item is None:
                    break
                yield json.dumps(item) + '\n'

        response = StreamingHttpResponse(event_stream(), content_type='application/x-ndjson')
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response

    def _execute_report(self, request, on_status=None):
        from dns.domain_trust import dedupe_domains, normalize_domain
        from dns.ai_service import ask_ai
        from django.db.models import F

        def emit(msg):
            if on_status:
                try:
                    on_status(str(msg))
                except Exception:
                    pass

        emit('Fetching DNS query log…')
        start_raw = (request.data.get('from') or request.data.get('start') or '').strip()
        end_raw = (request.data.get('to') or request.data.get('end') or '').strip()
        client_ip = (request.data.get('client_ip') or request.data.get('client') or '').strip()

        if not start_raw or not end_raw:
            return 400, {'error': 'from and to date range are required (YYYY-MM-DD or ISO datetime).'}

        start_dt = self._parse_bound(start_raw, end_of_day=False)
        end_dt = self._parse_bound(end_raw, end_of_day=True)
        if not start_dt or not end_dt:
            return 400, {'error': 'Invalid date range. Use YYYY-MM-DD or ISO datetime.'}
        if start_dt > end_dt:
            return 400, {'error': 'from must be before to.'}
        now = dj_timezone.now()
        if end_dt > now:
            end_dt = now
        if start_dt > now:
            return 400, {'error': 'from cannot be in the future.'}

        qs = QueryLog.objects.filter(timestamp__gte=start_dt, timestamp__lte=end_dt)
        if client_ip:
            qs = qs.filter(client_ip=client_ip)

        # Per domain + client so we can list every visitor
        rows = (
            qs.values('domain', 'client_ip')
            .annotate(hits=Count('id'), last_seen=Max('timestamp'))
            .order_by('-hits')
        )
        hit_map = {}
        last_seen_map = {}
        clients_map = {}  # domain -> {ip: hits}
        for row in rows:
            d = normalize_domain(row['domain'])
            if not d:
                continue
            hits = int(row['hits'] or 0)
            hit_map[d] = hit_map.get(d, 0) + hits
            prev = last_seen_map.get(d)
            if not prev or (row['last_seen'] and row['last_seen'] > prev):
                last_seen_map[d] = row['last_seen']
            ip = (row.get('client_ip') or '').strip()
            if ip:
                bucket = clients_map.setdefault(d, {})
                bucket[ip] = bucket.get(ip, 0) + hits

        domains = dedupe_domains(sorted(hit_map.keys(), key=lambda d: (-hit_map[d], d)))
        total_unique = len(domains)
        if not domains:
            return 200, {
                'summary': 'No DNS queries found in this date range.',
                'from': start_dt.isoformat(),
                'to': end_dt.isoformat(),
                'domains_found': 0,
                'domains_analyzed': 0,
                'categories': [],
                'items': [],
            }

        domains = domains[: self.MAX_DOMAINS]
        emit(f'Found {total_unique} unique domains (analyzing top {len(domains)})…')

        # Resolve friendly client names for IPs that appear in this report
        all_visitor_ips = set()
        for d in domains:
            all_visitor_ips.update(clients_map.get(d, {}).keys())
        name_by_ip = {}
        if all_visitor_ips:
            for c in Client.objects.filter(ip__in=list(all_visitor_ips)):
                label = (c.nickname or c.name or c.hostname or '').strip()
                # Strip quarantine prefix for display cleanliness
                if label.upper().startswith('[QUARANTINED]') or label.upper().startswith('[AI-QUARANTINED]'):
                    label = label.split(']', 1)[-1].strip()
                name_by_ip[c.ip] = label or c.ip

        def _clients_for(domain_name):
            visitors = clients_map.get(domain_name) or {}
            out = []
            for ip, hits in sorted(visitors.items(), key=lambda kv: (-kv[1], kv[0])):
                out.append({
                    'ip': ip,
                    'name': name_by_ip.get(ip) or ip,
                    'hits': hits,
                })
            return out

        items = []
        summary_bits = []
        errors = []

        emit('Checking category cache…')
        # Reuse cached categories — only send unknowns to Claude (saves tokens).
        cached_rows = {
            row.domain: row
            for row in DomainCategory.objects.filter(domain__in=domains)
        }
        from_cache = []
        unknown = []
        for d in domains:
            row = cached_rows.get(d)
            if row and row.category:
                from_cache.append({
                    'domain': d,
                    'url': row.url or f'https://{d}',
                    'site_name': row.site_name or d,
                    'category': row.category,
                    'confidence': row.confidence or 'medium',
                    'source': 'cache',
                })
            else:
                unknown.append(d)

        emit(f'Cache hits: {len(from_cache)} · need AI: {len(unknown)}')
        if from_cache:
            DomainCategory.objects.filter(domain__in=[i['domain'] for i in from_cache]).update(
                hit_count=F('hit_count') + 1
            )
            items.extend(from_cache)

        ai_new = 0
        if unknown:
            batches = list(range(0, len(unknown), self.BATCH_SIZE))
            for bi, i in enumerate(batches):
                if bi > 0:
                    emit(f'Pausing {self.BATCH_PAUSE_SEC}s before next AI batch…')
                    time.sleep(self.BATCH_PAUSE_SEC)
                batch = unknown[i:i + self.BATCH_SIZE]
                try:
                    emit(f'Classifying with AI — batch {bi + 1}/{len(batches)} ({len(batch)} domains)…')
                    batch_items, batch_summary = self._categorize_batch(ask_ai, batch, request.user)
                    for raw_item in batch_items:
                        d = normalize_domain(raw_item.get('domain') or '')
                        if not d:
                            continue
                        cat = (raw_item.get('category') or 'other').strip().lower()
                        if cat not in self.CATEGORIES:
                            cat = 'other'
                        site_name = (raw_item.get('site_name') or d).strip() or d
                        url = (raw_item.get('url') or f'https://{d}').strip() or f'https://{d}'
                        confidence = (raw_item.get('confidence') or 'medium').strip().lower() or 'medium'
                        items.append({
                            'domain': d,
                            'url': url,
                            'site_name': site_name,
                            'category': cat,
                            'confidence': confidence,
                            'source': 'ai',
                        })
                        DomainCategory.objects.update_or_create(
                            domain=d,
                            defaults={
                                'category': cat,
                                'site_name': site_name[:255],
                                'url': url[:512],
                                'confidence': confidence[:16],
                                'source': 'ai',
                            },
                        )
                        ai_new += 1
                    if batch_summary:
                        summary_bits.append(batch_summary)
                    emit(f'Batch {bi + 1}/{len(batches)} done — {ai_new} newly classified')
                except Exception as e:
                    err = str(e).strip()
                    if err and err not in errors:
                        errors.append(err)
                    emit(f'AI batch failed: {err[:120]}')
                    if 'rate limited' in err.lower() or 'All Claude browser accounts failed' in err:
                        break
        elif from_cache:
            emit('All domains served from category cache — skipping Claude')

        emit('Building report…')
        # Merge hit counts / last_seen / clients; fill gaps AI skipped
        by_domain = {}
        for item in items:
            d = normalize_domain(item.get('domain') or '')
            if not d:
                continue
            item['domain'] = d
            item['url'] = item.get('url') or f'https://{d}'
            item['site_name'] = item.get('site_name') or d
            cat = (item.get('category') or 'other').strip().lower()
            if cat not in self.CATEGORIES:
                cat = 'other'
            item['category'] = cat
            item['hits'] = hit_map.get(d, 0)
            ls = last_seen_map.get(d)
            item['last_seen'] = ls.isoformat() if ls else None
            item['clients'] = _clients_for(d)
            by_domain[d] = item

        for d in domains:
            if d not in by_domain:
                by_domain[d] = {
                    'domain': d,
                    'url': f'https://{d}',
                    'site_name': d,
                    'category': 'other',
                    'confidence': 'low',
                    'hits': hit_map.get(d, 0),
                    'last_seen': last_seen_map[d].isoformat() if last_seen_map.get(d) else None,
                    'clients': _clients_for(d),
                    'source': 'fallback',
                }

        items = sorted(by_domain.values(), key=lambda x: (-(x.get('hits') or 0), x.get('domain') or ''))
        cat_counts = {}
        for item in items:
            cat_counts[item['category']] = cat_counts.get(item['category'], 0) + 1
        categories = [
            {'name': name, 'count': cat_counts[name]}
            for name in sorted(cat_counts.keys(), key=lambda n: (-cat_counts[n], n))
        ]

        cache_hits = len(from_cache)
        summary = ' '.join(summary_bits).strip()
        if not summary:
            top = ', '.join(f"{c['name']} ({c['count']})" for c in categories[:5])
            summary = f'Categorized {len(items)} unique domains. Top categories: {top}.'
        summary = (
            f'{summary} '
            f'(cache hits: {cache_hits}, AI classified: {ai_new}, unknown sent: {len(unknown)}).'
        ).strip()

        payload = {
            'summary': summary,
            'from': start_dt.isoformat(),
            'to': end_dt.isoformat(),
            'client_ip': client_ip or None,
            'domains_found': total_unique,
            'domains_analyzed': len(items),
            'truncated': total_unique > len(items),
            'cache_hits': cache_hits,
            'ai_classified': ai_new,
            'unknown_sent': len(unknown),
            'category_cache_size': DomainCategory.objects.count(),
            'categories': categories,
            'items': items,
        }
        if errors and not items:
            return 500, {'error': errors[0], **payload}
        if errors:
            payload['warnings'] = errors

        # Persist for later reopen / clear from the AI Report page
        if items:
            emit('Saving report…')
            cached = AIReportCache.objects.create(
                range_from=start_dt,
                range_to=end_dt,
                client_ip=client_ip or None,
                summary=summary[:4000],
                domains_found=total_unique,
                domains_analyzed=len(items),
                payload=payload,
                created_by=request.user if getattr(request.user, 'is_authenticated', False) else None,
            )
            payload['id'] = cached.id
            payload['cached'] = True
            payload['created_at'] = cached.created_at.isoformat()
        emit('Done')
        return 200, payload


    @staticmethod
    def _parse_bound(value: str, *, end_of_day: bool):
        raw = (value or '').strip()
        if not raw:
            return None
        try:
            if len(raw) == 10 and raw[4] == '-' and raw[7] == '-':
                dt = datetime.strptime(raw, '%Y-%m-%d')
                if end_of_day:
                    dt = dt.replace(hour=23, minute=59, second=59, microsecond=999999)
                return dj_timezone.make_aware(dt) if dj_timezone.is_naive(dt) else dt
            dt = datetime.fromisoformat(raw.replace('Z', '+00:00'))
            if dj_timezone.is_naive(dt):
                dt = dj_timezone.make_aware(dt)
            return dt
        except Exception:
            return None

    def _categorize_batch(self, ask_ai, domains, user):
        cats = ', '.join(self.CATEGORIES)
        system_prompt = (
            'You are a web content classifier for DNS browsing reports. '
            'For each DNS domain, reverse it to the most likely website URL and site name, '
            'then tag it with exactly one content category. '
            f'Allowed categories: {cats}. '
            'Use ads for ad/tracker/analytics domains, cdn for CDNs, cloud for cloud APIs, '
            'adult for pornography, movies for film sites, streaming for video platforms, '
            'shopping for e-commerce, news for news/media, social for social networks. '
            'Return ONLY raw JSON (no markdown) with keys: '
            "summary (short sentence), items (array of objects with "
            "domain, url, site_name, category, confidence as high|medium|low)."
        )
        lines = [f'{i+1}. {d}' for i, d in enumerate(domains)]
        user_prompt = (
            f'Classify these {len(domains)} unique DNS domains from a home network query log:\n'
            + '\n'.join(lines)
        )
        raw = ask_ai(
            system_prompt,
            user_prompt,
            user=user,
            feature='ai_report',
            query=f'{len(domains)} domains',
        )
        clean = (raw or '').replace('```json', '').replace('```', '').strip()
        data = json.loads(clean)
        items = data.get('items') if isinstance(data, dict) else None
        if not isinstance(items, list):
            raise ValueError('AI response missing items array')
        summary = ''
        if isinstance(data, dict):
            summary = (data.get('summary') or '').strip()
        return items, summary


class AIReportCacheListView(APIView):
    """List / clear saved AI reports."""
    permission_classes = [IsAdminRole]

    def get(self, request):
        qs = AIReportCache.objects.all()[:100]
        return Response(AIReportCacheListSerializer(qs, many=True).data)

    def delete(self, request):
        deleted, _ = AIReportCache.objects.all().delete()
        return Response({'ok': True, 'deleted': deleted})


class AIReportCacheDetailView(APIView):
    """Load or delete one saved AI report."""
    permission_classes = [IsAdminRole]

    def get_object(self, pk):
        try:
            return AIReportCache.objects.get(pk=pk)
        except AIReportCache.DoesNotExist:
            return None

    def get(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=404)
        payload = dict(obj.payload or {})
        payload['id'] = obj.id
        payload['cached'] = True
        payload['created_at'] = obj.created_at.isoformat() if obj.created_at else None
        payload.setdefault('summary', obj.summary)
        payload.setdefault('from', obj.range_from.isoformat() if obj.range_from else None)
        payload.setdefault('to', obj.range_to.isoformat() if obj.range_to else None)
        payload.setdefault('client_ip', obj.client_ip)
        payload.setdefault('domains_found', obj.domains_found)
        payload.setdefault('domains_analyzed', obj.domains_analyzed)
        return Response(payload)

    def delete(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Not found'}, status=404)
        obj.delete()
        return Response(status=204)


class ClaudeBrowserAccountListView(APIView):
    """CRUD list for Claude.ai browser-wrapper accounts (sessionKey + org_id)."""
    permission_classes = [IsAdminRole]

    def get(self, request):
        from dns.ai_service import get_claude_browser_accounts
        accounts = get_claude_browser_accounts()
        # Mask session keys in list responses
        safe = []
        for a in accounts:
            sk = a.get('session_key') or ''
            safe.append({
                **a,
                'session_key_masked': (sk[:12] + '…') if len(sk) > 12 else ('***' if sk else ''),
                'has_session_key': bool(sk),
            })
        return Response(safe)

    def post(self, request):
        from dns.ai_service import upsert_claude_account
        try:
            account = upsert_claude_account(request.data)
            return Response(account, status=201)
        except ValueError as e:
            return Response({'error': str(e)}, status=400)


class ClaudeBrowserAccountDetailView(APIView):
    permission_classes = [IsAdminRole]

    def patch(self, request, account_id):
        from dns.ai_service import upsert_claude_account, get_claude_browser_accounts
        data = dict(request.data)
        # Keep existing session_key if client sent blank (masked edit)
        if not (data.get('session_key') or '').strip():
            existing = next((a for a in get_claude_browser_accounts() if a.get('id') == account_id), None)
            if existing:
                data['session_key'] = existing.get('session_key', '')
        try:
            account = upsert_claude_account(data, account_id=account_id)
            return Response(account)
        except ValueError as e:
            return Response({'error': str(e)}, status=400)

    def delete(self, request, account_id):
        from dns.ai_service import delete_claude_account
        try:
            delete_claude_account(account_id)
            return Response(status=204)
        except ValueError as e:
            return Response({'error': str(e)}, status=404)


class ClaudeBrowserAccountTestView(APIView):
    """Validate sessionKey + org_id for one Claude browser account."""
    permission_classes = [IsAdminRole]

    def post(self, request, account_id):
        from dns.ai_service import test_claude_account
        try:
            result = test_claude_account(account_id)
            return Response(result)
        except ValueError as e:
            msg = str(e)
            status = 404 if msg == 'Account not found.' else 400
            return Response({'ok': False, 'error': msg}, status=status)


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


def _iptables_check_cmd(rule_argv):
    """Convert an -A append rule into an -C check rule."""
    cmd = list(rule_argv)
    try:
        idx = cmd.index('-A')
        cmd[idx] = '-C'
    except ValueError:
        pass
    return cmd


def _iptables_active_map():
    """Return {rule_id: bool} for each managed rule currently present in the kernel."""
    active = {}
    for key, rule in IPTABLES_RULES.items():
        try:
            res = subprocess.run(
                ['sudo'] + _iptables_check_cmd(rule),
                capture_output=True, text=True, timeout=5,
            )
            active[key] = res.returncode == 0
        except Exception:
            active[key] = False
    return active


class NetworkIPTablesView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        try:
            # Listing requires root on nf_tables backends
            filter_tbl = subprocess.run(
                ['sudo', 'iptables', '-L', '-n', '-v'],
                capture_output=True, text=True, timeout=5,
            )
            nat_tbl = subprocess.run(
                ['sudo', 'iptables', '-t', 'nat', '-L', '-n', '-v'],
                capture_output=True, text=True, timeout=5,
            )
            parts = []
            if filter_tbl.stdout:
                parts.append('=== filter ===\n' + filter_tbl.stdout.rstrip())
            if nat_tbl.stdout:
                parts.append('=== nat ===\n' + nat_tbl.stdout.rstrip())
            err = (filter_tbl.stderr or nat_tbl.stderr or '').strip()
            ok = filter_tbl.returncode == 0 and nat_tbl.returncode == 0
            return Response({
                'ok': ok,
                'rules': '\n\n'.join(parts) if parts else '',
                'error': err if not ok else '',
                'active': _iptables_active_map(),
            })
        except Exception as exc:
            return Response({'ok': False, 'error': str(exc), 'active': {}}, status=500)


class NetworkIPTablesApplyView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request):
        rule_key = request.data.get('rule')
        rule = IPTABLES_RULES.get(rule_key)
        if not rule:
            return Response({'error': 'Unknown rule'}, status=400)
        try:
            # Skip duplicate inserts when the rule is already present
            check = subprocess.run(
                ['sudo'] + _iptables_check_cmd(rule),
                capture_output=True, text=True, timeout=5,
            )
            if check.returncode == 0:
                return Response({
                    'ok': True,
                    'output': 'Rule already active.',
                    'error': '',
                    'active': _iptables_active_map(),
                })

            result = subprocess.run(
                ['sudo'] + rule,
                capture_output=True, text=True, timeout=10
            )
            ok = result.returncode == 0
            # iptables often returns empty stdout on success — give the UI a clear message
            output = (result.stdout or '').strip()
            error = (result.stderr or '').strip()
            if ok and not output:
                output = f'Applied: {" ".join(rule)}'
            return Response({
                'ok': ok,
                'output': output,
                'error': error,
                'active': _iptables_active_map(),
            })
        except Exception as exc:
            return Response({'ok': False, 'error': str(exc)}, status=500)


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


class TorStatusView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        from dns import tor_manager
        status = tor_manager.get_status()
        if not status.get('installed'):
            status['install_command'] = tor_manager.get_install_command()
        return Response(status)


class TorToggleView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request):
        from dns import tor_manager
        enabled = request.data.get('enabled')
        if enabled not in (True, False, 'true', 'false', '1', '0', 1, 0):
            return Response({'error': 'enabled must be true or false'}, status=400)
        want_on = enabled in (True, 'true', '1', 1)
        ok, output = tor_manager.enable_tor() if want_on else tor_manager.disable_tor()
        return Response({
            'ok': ok,
            'output': output,
            'status': tor_manager.get_status(),
        })


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

    def get(self, request):
        from dns.network_scanner import get_scan_status
        return Response(get_scan_status())

    def post(self, request):
        from dns.network_scanner import run_network_scan, get_scan_status
        import threading

        status = get_scan_status()
        if status.get('running'):
            return Response({'ok': True, 'message': 'Scan already running.', **status})

        deep = str(request.data.get('deep', '1')).lower() not in ('0', 'false', 'no')

        def run():
            run_network_scan(deep=deep)

        threading.Thread(target=run, daemon=True).start()
        return Response({'ok': True, 'message': 'Scan started in background.', 'deep': deep})


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
                blocked=Count('id', filter=Q(status__in=['blocked_pattern', 'blocked_domain', 'blocked_list', 'blocked_ai', 'blocked_client']))
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
        
        qs = QueryLog.objects.filter(client_ip=client.ip).order_by('-timestamp')[:500]
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
        blocked = qs.filter(status__in=['blocked_pattern', 'blocked_domain', 'blocked_list', 'blocked_ai', 'blocked_client']).count()
        
        top_domains = (
            qs.values('domain')
            .annotate(count=Count('id'))
            .order_by('-count')[:10]
        )

        visited_domains = (
            qs.values('domain')
            .annotate(
                count=Count('id'),
                last_seen=Max('timestamp'),
                blocked=Count(
                    'id',
                    filter=Q(status__in=[
                        'blocked_pattern', 'blocked_domain', 'blocked_list', 'blocked_ai', 'blocked_client',
                    ]),
                ),
            )
            .order_by('-count')[:500]
        )
        
        hourly = {}
        for entry in qs.values('timestamp__hour', 'status').annotate(count=Count('id')):
            hour = entry['timestamp__hour']
            if hour not in hourly:
                hourly[hour] = {'hour': hour, 'allowed': 0, 'blocked': 0}
            if entry['status'] in ('blocked_pattern', 'blocked_domain', 'blocked_list', 'blocked_ai', 'blocked_client'):
                hourly[hour]['blocked'] += entry['count']
            else:
                hourly[hour]['allowed'] += entry['count']
        
        return Response({
            'total': total,
            'blocked': blocked,
            'top_domains': list(top_domains),
            'visited_domains': list(visited_domains),
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
        try:
            # Search Clients
            clients = Client.objects.filter(
                Q(ip__icontains=q) | Q(name__icontains=q) | Q(hostname__icontains=q) | Q(nickname__icontains=q)
            )[:5]
            for c in clients:
                results.append({
                    'type': 'client',
                    'id': c.id,
                    'label': c.nickname or c.name or c.hostname or c.ip,
                    'sub': c.ip,
                    'href': f'/clients/{c.id}',
                })

            # Search Patterns
            patterns = Pattern.objects.filter(Q(name__icontains=q) | Q(pattern__icontains=q))[:5]
            for p in patterns:
                results.append({
                    'type': 'pattern',
                    'id': p.id,
                    'label': p.name,
                    'sub': p.pattern,
                    'href': '/blocks/patterns',
                })

            # Search Blocked Domains
            domains = BlockedDomain.objects.filter(domain__icontains=q)[:5]
            for d in domains:
                results.append({
                    'type': 'domain',
                    'id': d.id,
                    'label': d.domain,
                    'sub': 'Blocked Domain',
                    'href': '/blocks/domains',
                })

            # Search App categories
            apps = AppCategory.objects.filter(name__icontains=q)[:3]
            for a in apps:
                results.append({
                    'type': 'app',
                    'id': a.id,
                    'label': a.name,
                    'sub': 'App Category',
                    'href': '/blocks/apps',
                })
        except Exception as exc:
            return Response({'error': str(exc)}, status=500)

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
        from dns.domain_trust import get_domain_trust
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
            'is_blocked': is_blocked,
            'trust': get_domain_trust(domain),
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
    try:
        from dns_proxy.local_dns import reload_local_dns
        import threading
        threading.Thread(target=reload_local_dns, daemon=True).start()
    except Exception:
        pass
