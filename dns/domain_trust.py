"""Domain trust scores — persist AI judgements and skip high-trust names on later scans."""
from __future__ import annotations

HIGH_TRUST_THRESHOLD = 70  # score >= this → skip from next AI domain lists


def normalize_domain(domain: str) -> str:
    d = (domain or '').strip().lower().rstrip('.')
    if d.startswith('*.'):
        d = d[2:]
    return d


def dedupe_domains(domains) -> list[str]:
    """Preserve first-seen order, drop empties/dupes."""
    seen = set()
    out = []
    for raw in domains or []:
        d = normalize_domain(raw if isinstance(raw, str) else str(raw or ''))
        if not d or d in seen:
            continue
        seen.add(d)
        out.append(d)
    return out


def trusted_domain_set(min_score: int = HIGH_TRUST_THRESHOLD) -> set[str]:
    from dns.models import DomainTrust
    return set(
        DomainTrust.objects.filter(trust_score__gte=min_score).values_list('domain', flat=True)
    )


def filter_untrusted_domains(domains, min_score: int = HIGH_TRUST_THRESHOLD) -> list[str]:
    """Dedupe then drop domains already marked high-trust in DB."""
    unique = dedupe_domains(domains)
    if not unique:
        return []
    trusted = trusted_domain_set(min_score)
    if not trusted:
        return unique
    return [d for d in unique if d not in trusted]


def get_domain_trust(domain: str) -> dict | None:
    from dns.models import DomainTrust
    d = normalize_domain(domain)
    if not d:
        return None
    row = DomainTrust.objects.filter(domain=d).first()
    if not row:
        return None
    return {
        'domain': row.domain,
        'trust_score': row.trust_score,
        'label': row.label,
        'reason': row.reason,
        'source': row.source,
        'updated_at': row.updated_at.isoformat() if row.updated_at else None,
        'is_high_trust': row.trust_score >= HIGH_TRUST_THRESHOLD,
    }


def upsert_domain_trust(
    domain: str,
    trust_score: int,
    *,
    label: str = 'unknown',
    reason: str = '',
    source: str = '',
) -> dict:
    from dns.models import DomainTrust

    d = normalize_domain(domain)
    if not d:
        raise ValueError('domain required')

    try:
        score = int(trust_score)
    except (TypeError, ValueError):
        score = 50
    score = max(0, min(100, score))

    label = (label or 'unknown').lower().strip()
    allowed = {c[0] for c in DomainTrust.LABELS}
    if label not in allowed:
        # Map common AI phrases
        if 'malicious' in label or 'malware' in label or 'phish' in label:
            label = 'malicious'
        elif 'track' in label or 'ad' in label:
            label = 'tracking'
        elif 'safe' in label or 'benign' in label or 'legit' in label:
            label = 'safe'
        else:
            label = 'unknown'

    row, _ = DomainTrust.objects.update_or_create(
        domain=d,
        defaults={
            'trust_score': score,
            'label': label,
            'reason': (reason or '')[:2000],
            'source': (source or '')[:40],
        },
    )
    return get_domain_trust(row.domain)


def bump_domains_trust(domains, score: int, *, label: str, reason: str, source: str):
    """Raise trust for a batch (won't lower an existing higher score)."""
    for d in dedupe_domains(domains):
        existing = get_domain_trust(d)
        if existing and existing['trust_score'] >= score:
            continue
        upsert_domain_trust(d, score, label=label, reason=reason, source=source)


def parse_label_from_text(text: str) -> tuple[str, int]:
    """Heuristic label + score from free-text AI explanation."""
    t = (text or '').lower()
    if any(w in t for w in ('malicious', 'malware', 'c2', 'phishing', 'botnet', 'trojan')):
        return 'malicious', 10
    if any(w in t for w in ('tracking', 'tracker', 'analytics', 'adware', 'telemetry', 'ads.')):
        return 'tracking', 40
    if any(w in t for w in ('safe', 'legitimate', 'benign', 'cdn', 'trusted', 'harmless')):
        return 'safe', 85
    return 'unknown', 50
