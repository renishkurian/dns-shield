"""
Thread-safe DNS domain matcher that loads rules from DB into memory.
Reload is non-disruptive — uses a lock so the proxy is never blocked.
"""
import re
import threading
import logging

logger = logging.getLogger('dns_proxy')


class Matcher:
    def __init__(self):
        self._lock = threading.RLock()
        self.exact_blocks: set = set()
        self.wildcard_blocks: list = []
        self.regex_blocks: list = []
        self.exact_allows: set = set()
        self.wildcard_allows: list = []
        self.regex_allows: list = []
        self.patterns: list = []
        self.gravity: set = set()
        self.reload()

    def reload(self):
        """Atomically reload all rules from the database."""
        import django
        django.setup()  # safe to call multiple times
        from blocks.models import BlockedDomain, AllowedDomain, Pattern, GravityDomain

        try:
            new_exact_blocks = set(
                BlockedDomain.objects.filter(enabled=True, block_type='exact')
                .values_list('domain', flat=True)
            )
            new_wildcard_blocks = list(
                BlockedDomain.objects.filter(enabled=True, block_type='wildcard')
                .values_list('domain', flat=True)
            )
            new_regex_blocks = []
            for d in BlockedDomain.objects.filter(enabled=True, block_type='regex'):
                try:
                    new_regex_blocks.append((re.compile(d.domain, re.IGNORECASE), d.domain))
                except re.error:
                    logger.warning(f"Invalid regex block: {d.domain}")

            new_exact_allows = set(
                AllowedDomain.objects.filter(enabled=True, allow_type='exact')
                .values_list('domain', flat=True)
            )
            new_wildcard_allows = list(
                AllowedDomain.objects.filter(enabled=True, allow_type='wildcard')
                .values_list('domain', flat=True)
            )
            new_regex_allows = []
            for d in AllowedDomain.objects.filter(enabled=True, allow_type='regex'):
                try:
                    new_regex_allows.append((re.compile(d.domain, re.IGNORECASE), d.domain))
                except re.error:
                    logger.warning(f"Invalid regex allow: {d.domain}")

            new_patterns = list(
                Pattern.objects.filter(enabled=True)
                .values('id', 'pattern', 'pattern_type', 'name')
            )

            new_gravity = set(
                GravityDomain.objects.values_list('domain', flat=True)
            )

            with self._lock:
                self.exact_blocks = new_exact_blocks
                self.wildcard_blocks = new_wildcard_blocks
                self.regex_blocks = new_regex_blocks
                self.exact_allows = new_exact_allows
                self.wildcard_allows = new_wildcard_allows
                self.regex_allows = new_regex_allows
                self.patterns = new_patterns
                self.gravity = new_gravity

            logger.info(
                f"Matcher reloaded: {len(new_exact_blocks)} exact blocks, "
                f"{len(new_gravity)} gravity domains, "
                f"{len(new_patterns)} patterns"
            )
        except Exception as exc:
            logger.error(f"Matcher reload failed: {exc}")

    def is_allowed(self, domain: str) -> bool:
        with self._lock:
            if domain in self.exact_allows:
                return True
            for w in self.wildcard_allows:
                if domain == w or domain.endswith('.' + w):
                    return True
            for pattern, _ in self.regex_allows:
                if pattern.search(domain):
                    return True
        return False

    def match_domain(self, domain: str):
        """Return the matched rule string or None."""
        with self._lock:
            if domain in self.exact_blocks:
                return domain
            for w in self.wildcard_blocks:
                if domain == w or domain.endswith('.' + w):
                    return w
            for pattern, raw in self.regex_blocks:
                if pattern.search(domain):
                    return raw
        return None

    def match_pattern(self, domain: str):
        """Return (pattern_id, name) tuple or None."""
        domain_lower = domain.lower()
        with self._lock:
            for p in self.patterns:
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
        with self._lock:
            if domain in self.gravity:
                return True
            # Check parent domains for wildcard-style coverage
            parts = domain.split('.')
            for i in range(1, len(parts)):
                parent = '.'.join(parts[i:])
                if parent in self.gravity:
                    return True
        return False


# Singleton shared by proxy and management commands
_matcher = None
_matcher_lock = threading.Lock()


def get_matcher() -> Matcher:
    global _matcher
    if _matcher is None:
        with _matcher_lock:
            if _matcher is None:
                _matcher = Matcher()
    return _matcher
