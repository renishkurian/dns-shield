"""
Thread-safe DNS domain matcher that loads rules from DB into memory.
Reload is non-disruptive — uses a lock so the proxy is never blocked.
Supports per-group blocking rules.

Gravity domains use a compact hash index (~20MB for millions of domains)
instead of a Python set of strings (~1GB).
"""
import re
import threading
import logging
import math
from collections import defaultdict

from dns_proxy.gravity_index import GravityIndex

try:
    import tldextract
    _tld_extractor = tldextract.TLDExtract(cache_dir='/tmp/tldextract_cache', suffix_list_urls=())
except Exception:
    _tld_extractor = None

try:
    import adblock
except ImportError:
    adblock = None

logger = logging.getLogger('dns_proxy')


def extract_domain_parts(domain: str) -> tuple[str, str, str]:
    """
    Return (subdomain, domain, suffix) using PSL (Public Suffix List).
    Falls back to simple dot split if tldextract is unavailable.
    """
    clean_domain = (domain or '').strip().lower()
    if not clean_domain:
        return '', '', ''
    if _tld_extractor:
        try:
            ext = _tld_extractor(clean_domain)
            return ext.subdomain, ext.domain, ext.suffix
        except Exception:
            pass
    parts = clean_domain.split('.')
    if len(parts) >= 2:
        return '.'.join(parts[:-2]), parts[-2], parts[-1]
    return '', clean_domain, ''


class Matcher:
    def __init__(self):
        self._lock = threading.RLock()
        # All rules are dicts mapping group_id (int or None) to rule data
        self.exact_blocks = defaultdict(set)
        self.wildcard_blocks = defaultdict(list)
        self.regex_blocks = defaultdict(list)
        self.exact_allows = defaultdict(set)
        self.wildcard_allows = defaultdict(list)
        self.regex_allows = defaultdict(list)
        self.patterns = defaultdict(list)
        self.app_blocks = defaultdict(set) # group_id -> set of domains
        self.adblock_engine = None
        self.gravity = GravityIndex()  # compact global gravity index
        self.ai_threshold = 4.0 # Default Shannon entropy threshold (bits per char)
        self.cname_uncloaking_enabled = True
        self.canary_blocking_enabled = True
        self.dga_protection_enabled = True
        self.adblock_engine_enabled = True
        self.reload()

    def reload(self):
        """Atomically reload all rules from the database."""
        import django
        django.setup()
        from blocks.models import BlockedDomain, AllowedDomain, Pattern, GravityDomain, AppCategory, AppControl
        from dns.models import SystemSetting

        try:
            # Read module toggles from SystemSetting
            settings_dict = {s.key: s.value.strip().lower() for s in SystemSetting.objects.all()}
            cname_enabled = settings_dict.get('module_cname_uncloaking', 'true') != 'false'
            canary_enabled = settings_dict.get('module_canary_blocking', 'true') != 'false'
            dga_enabled = settings_dict.get('module_dga_protection', 'true') != 'false'
            adblock_enabled = settings_dict.get('module_adblock_engine', 'true') != 'false'

            # Clear current state (will be replaced within lock)
            new_exact_blocks = defaultdict(set)
            new_wildcard_blocks = defaultdict(list)
            new_regex_blocks = defaultdict(list)
            new_exact_allows = defaultdict(set)
            new_wildcard_allows = defaultdict(list)
            new_regex_allows = defaultdict(list)
            new_patterns = defaultdict(list)

            # Load Blocked Domains
            for d in BlockedDomain.objects.filter(enabled=True):
                gid = d.group_id # Django ForeignKey _id field
                domain = (d.domain or '').strip().lower()
                if not domain:
                    continue
                if d.block_type == 'exact':
                    new_exact_blocks[gid].add(domain)
                elif d.block_type == 'wildcard':
                    new_wildcard_blocks[gid].append(domain)
                elif d.block_type == 'regex':
                    try:
                        new_regex_blocks[gid].append((re.compile(d.domain, re.IGNORECASE), d.domain))
                    except re.error:
                        logger.warning(f"Invalid regex block: {d.domain}")

            # Load Allowed Domains
            for d in AllowedDomain.objects.filter(enabled=True):
                gid = d.group_id
                domain = (d.domain or '').strip().lower()
                if not domain:
                    continue
                if d.allow_type == 'exact':
                    new_exact_allows[gid].add(domain)
                elif d.allow_type == 'wildcard':
                    new_wildcard_allows[gid].append(domain)
                elif d.allow_type == 'regex':
                    try:
                        new_regex_allows[gid].append((re.compile(d.domain, re.IGNORECASE), d.domain))
                    except re.error:
                        logger.warning(f"Invalid regex allow: {d.domain}")

            # Load Patterns
            for p in Pattern.objects.filter(enabled=True):
                gid = p.group_id
                new_patterns[gid].append({
                    'id': p.id,
                    'pattern': p.pattern,
                    'pattern_type': p.pattern_type,
                    'name': p.name
                })

            # Load App Firewall Controls
            new_app_blocks = defaultdict(set)
            active_controls = AppControl.objects.filter(enabled=True).select_related('category')
            for ctrl in active_controls:
                gid = ctrl.group_id
                domains = ctrl.category.get_domains()
                for d in domains:
                    new_app_blocks[gid].add(d.lower())

            # Gravity: stream domains and pack into a compact hash index.
            # Avoids holding ~2.5M Python strings in a set (~1GB RSS).
            new_gravity = GravityIndex.from_domains(
                GravityDomain.objects.values_list('domain', flat=True).iterator(chunk_size=20000)
            )

            # Optional: initialize native adblock engine if adblock is available
            new_adblock_engine = None
            if adblock is not None:
                try:
                    filter_lines = []
                    for b in BlockedDomain.objects.filter(enabled=True):
                        d = (b.domain or '').strip()
                        if not d:
                            continue
                        if b.block_type == 'wildcard':
                            filter_lines.append(f"||{d}^")
                    for a in AllowedDomain.objects.filter(enabled=True):
                        d = (a.domain or '').strip()
                        if not d:
                            continue
                        if a.allow_type == 'wildcard':
                            filter_lines.append(f"@@||{d}^")
                    if filter_lines:
                        fset = adblock.FilterSet()
                        fset.add_filter_list(filter_lines)
                        new_adblock_engine = adblock.Engine(fset)
                except Exception as ab_err:
                    logger.warning(f"Adblock engine build skipped: {ab_err}")

            with self._lock:
                self.exact_blocks = new_exact_blocks
                self.wildcard_blocks = new_wildcard_blocks
                self.regex_blocks = new_regex_blocks
                self.exact_allows = new_exact_allows
                self.wildcard_allows = new_wildcard_allows
                self.regex_allows = new_regex_allows
                self.patterns = new_patterns
                self.app_blocks = new_app_blocks
                self.adblock_engine = new_adblock_engine
                self.gravity = new_gravity
                self.cname_uncloaking_enabled = cname_enabled
                self.canary_blocking_enabled = canary_enabled
                self.dga_protection_enabled = dga_enabled
                self.adblock_engine_enabled = adblock_enabled

            from dns_proxy.cache import get_cache
            get_cache().clear()

            from dns_proxy.log_exclusions import get_log_exclusion_manager
            get_log_exclusion_manager().reload()

            logger.info(
                f"Matcher reloaded: {len(new_exact_blocks)} groups with rules, "
                f"{len(new_gravity)} gravity domains (compact index)"
            )
        except Exception as exc:
            logger.error(f"Matcher reload failed: {exc}")

    def is_allowed(self, domain: str, group_id: int = None) -> bool:
        """Check if domain is explicitly allowed for this group or globally."""
        domain_lower = domain.lower()
        with self._lock:
            # Check global allows (None) and group-specific allows
            for gid in [None, group_id]:
                if gid not in self.exact_allows and gid not in self.wildcard_allows and gid not in self.regex_allows:
                    continue
                if domain_lower in self.exact_allows[gid]:
                    return True
                for w in self.wildcard_allows[gid]:
                    if domain_lower == w or domain_lower.endswith('.' + w):
                        return True
                for pattern, _ in self.regex_allows[gid]:
                    if pattern.search(domain):
                        return True
        return False

    def match_domain(self, domain: str, group_id: int = None):
        """Return the matched rule string or None."""
        domain_lower = domain.lower()
        with self._lock:
            # 1. Check direct domain blocks
            for gid in [None, group_id]:
                if gid not in self.exact_blocks and gid not in self.wildcard_blocks and gid not in self.regex_blocks:
                    continue
                if domain_lower in self.exact_blocks[gid]:
                    return domain
                for w in self.wildcard_blocks[gid]:
                    if domain_lower == w.lower() or domain_lower.endswith('.' + w.lower()):
                        return w
                for pattern, raw in self.regex_blocks[gid]:
                    if pattern.search(domain):
                        return raw
            
            # 2. Check App Firewall blocks
            if group_id in self.app_blocks:
                blocked_apps = self.app_blocks[group_id]
                if domain_lower in blocked_apps:
                    return f"App Firewall: {domain}"
                # Check parent domains for wildcard-style app blocking
                parts = domain_lower.split('.')
                for i in range(1, len(parts)):
                    parent = '.'.join(parts[i:])
                    if parent in blocked_apps:
                        return f"App Firewall: {parent}"

        return None

    def match_pattern(self, domain: str, group_id: int = None):
        """Return (pattern_id, name) tuple or None."""
        domain_lower = domain.lower()
        with self._lock:
            for gid in [None, group_id]:
                if gid not in self.patterns:
                    continue
                for p in self.patterns[gid]:
                    pt = p['pattern_type']
                    pat = p['pattern']
                    if pt == 'extension':
                        if domain_lower.endswith(pat.lower()):
                            return p['id'], p['name']
                    elif pt == 'keyword':
                        if pat.lower() in domain_lower:
                            return p['id'], p['name']
                    elif pt == 'regex':
                        try:
                            if re.search(pat, domain_lower, re.IGNORECASE):
                                return p['id'], p['name']
                        except re.error:
                            pass
        return None

    def in_gravity(self, domain: str) -> bool:
        """Gravity check is currently global (domain or any parent label)."""
        with self._lock:
            return self.gravity.contains_domain_or_parent(domain)

    def match_adblock(self, domain: str) -> str | None:
        """Check domain against native Adblock engine if initialized."""
        with self._lock:
            engine = self.adblock_engine
        if not engine:
            return None
        try:
            domain_clean = (domain or '').strip().lower()
            res = engine.check_network_urls(
                url=f"http://{domain_clean}/",
                source_url="",
                request_type="other"
            )
            if res.matched:
                return res.filter or "Adblock Filter"
        except Exception:
            pass
        return None

    def is_dga(self, domain: str) -> bool:
        """
        Check if domain is likely Algorithmically Generated (DGA) 
        using Shannon entropy analysis of the base domain name (PSL-aware).
        """
        subdomain, base, _ = extract_domain_parts(domain)
        if not base or len(base) < 8: # Short domains often have high entropy naturally
            return False

        ent = self._calculate_entropy(base)
        if ent > self.ai_threshold:
            return True
        # Check randomized tracking subdomains (e.g. dynamic beacons)
        if subdomain:
            first_sub = subdomain.split('.')[0]
            if len(first_sub) >= 12 and self._calculate_entropy(first_sub) > (self.ai_threshold + 0.3):
                return True
        return False

    def _calculate_entropy(self, text: str) -> float:
        """Standard Shannon entropy calculation."""
        if not text:
            return 0.0
        counts = defaultdict(int)
        for char in text:
            counts[char] += 1
        
        entropy = 0.0
        length = len(text)
        for count in counts.values():
            p = count / length
            entropy -= p * math.log2(p)
        return entropy


_matcher = None
_matcher_lock = threading.Lock()


def get_matcher() -> Matcher:
    global _matcher
    if _matcher is None:
        with _matcher_lock:
            if _matcher is None:
                _matcher = Matcher()
    return _matcher
