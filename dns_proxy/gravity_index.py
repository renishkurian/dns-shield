"""
Compact gravity domain index.

Storing ~2.5M domain strings in a Python set costs ~700MB–1GB of RSS.
This index stores sorted 64-bit blake2b hashes in an array.array('Q'):
  ~2.5M × 8 bytes ≈ 20MB steady state, with O(log n) membership checks.
"""
from __future__ import annotations

import array
import bisect
import hashlib
from collections.abc import Iterable


def domain_hash(domain: str) -> int:
    """64-bit blake2b digest of a lowercased domain (false-positive rate ~negligible)."""
    return int.from_bytes(
        hashlib.blake2b(
            domain.encode('utf-8', errors='ignore'),
            digest_size=8,
        ).digest(),
        'big',
    )


class GravityIndex:
    """Immutable sorted hash table for gravity lookups."""

    __slots__ = ('_hashes',)

    def __init__(self, hashes: array.array | None = None):
        self._hashes: array.array = hashes if hashes is not None else array.array('Q')

    @classmethod
    def from_domains(cls, domains: Iterable[str]) -> GravityIndex:
        # Dedup via set of ints (much smaller than set of domain strings), then pack.
        seen: set[int] = set()
        for raw in domains:
            domain = (raw or '').strip().lower()
            if domain:
                seen.add(domain_hash(domain))
        if not seen:
            return cls()
        return cls(array.array('Q', sorted(seen)))

    def __contains__(self, domain: str) -> bool:
        key = domain_hash(domain.lower() if domain else '')
        idx = bisect.bisect_left(self._hashes, key)
        return idx < len(self._hashes) and self._hashes[idx] == key

    def __len__(self) -> int:
        return len(self._hashes)

    def contains_domain_or_parent(self, domain: str) -> bool:
        """True if domain or any parent label is in the gravity list."""
        domain_lower = (domain or '').strip().lower()
        if not domain_lower:
            return False
        if domain_lower in self:
            return True
        parts = domain_lower.split('.')
        for i in range(1, len(parts)):
            if '.'.join(parts[i:]) in self:
                return True
        return False
