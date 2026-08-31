"""
Thread-safe in-memory cache and matcher for Query Log Exclusions.
Allows high-frequency, noisy domains (e.g. IDE telemetry, local service broadcasts)
to be excluded from being written to QueryLog without impacting DNS performance.
"""
import re
import threading
import logging

logger = logging.getLogger('dns_proxy')


class LogExclusionManager:
    _instance = None
    _lock = threading.RLock()

    def __init__(self):
        self.exact_exclusions = set()
        self.wildcard_exclusions = []
        self.regex_exclusions = []
        self.loaded = False
        self.reload()

    def reload(self):
        """Atomically reload all enabled log exclusion rules from database."""
        try:
            from dns.models import LogExcludedDomain
            exact = set()
            wildcard = []
            regex = []

            for item in LogExcludedDomain.objects.filter(enabled=True):
                dom = (item.domain or '').strip().lower()
                if not dom:
                    continue
                if item.rule_type == 'exact':
                    exact.add(dom.rstrip('.'))
                elif item.rule_type == 'wildcard':
                    clean = dom.lstrip('*').lstrip('.').rstrip('.')
                    if clean:
                        wildcard.append(clean)
                elif item.rule_type == 'regex':
                    try:
                        regex.append((re.compile(item.domain, re.IGNORECASE), item.id))
                    except re.error as e:
                        logger.warning(f"Invalid regex log exclusion: {item.domain} - {e}")

            with self._lock:
                self.exact_exclusions = exact
                self.wildcard_exclusions = wildcard
                self.regex_exclusions = regex
                self.loaded = True

            logger.info(
                f"Log exclusions reloaded: {len(exact)} exact, "
                f"{len(wildcard)} wildcard, {len(regex)} regex"
            )
        except Exception as e:
            logger.error(f"Error loading log exclusions: {e}")

    def is_excluded(self, domain: str) -> bool:
        """Check if a domain matches any active exclusion rule."""
        if not domain:
            return False
        clean = domain.strip().lower().rstrip('.')

        with self._lock:
            # 1. Exact match
            if clean in self.exact_exclusions:
                return True

            # 2. Wildcard match (e.g. cursor.sh matches cursor.sh and api2.cursor.sh)
            for w in self.wildcard_exclusions:
                if clean == w or clean.endswith('.' + w):
                    return True

            # 3. Regex match
            for r, _ in self.regex_exclusions:
                if r.search(clean):
                    return True

        return False


_manager = None


def get_log_exclusion_manager() -> LogExclusionManager:
    global _manager
    if _manager is None:
        _manager = LogExclusionManager()
    return _manager


def is_domain_log_excluded(domain: str) -> bool:
    try:
        return get_log_exclusion_manager().is_excluded(domain)
    except Exception:
        return False
