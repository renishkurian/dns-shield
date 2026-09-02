"""
Resolve LAN device hostnames using multiple sources.

Routers (e.g. TP-Link) learn names from DHCP Option 12 and show them in the DHCP
client list. nmap reverse DNS alone often misses these — especially phones and IoT
with privacy MACs. This module tries router PTR, system reverse DNS, mDNS, and NetBIOS.
"""
from __future__ import annotations

import logging
import re
import socket
import struct
import subprocess

logger = logging.getLogger('dns')

_INVALID_NAMES = {
    '', 'localhost', 'unknown', '(unknown)', 'unknown device',
}
_GENERIC_SUFFIXES = ('.local', '.lan', '.home', '.localdomain')


def get_gateway_ip() -> str:
    """Return default gateway IP, or subnet .1 fallback."""
    try:
        with open('/proc/net/route', encoding='utf-8') as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 3 and parts[1] == '00000000':
                    return socket.inet_ntoa(struct.pack('<L', int(parts[2], 16)))
    except Exception:
        pass
    try:
        parts = get_local_ip().split('.')
        if len(parts) == 4:
            return f'{parts[0]}.{parts[1]}.{parts[2]}.1'
    except Exception:
        pass
    return '192.168.0.1'


def get_local_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        return s.getsockname()[0]
    except Exception:
        return '127.0.0.1'
    finally:
        s.close()


def _clean_hostname(raw: str) -> str:
    name = (raw or '').strip().rstrip('.')
    if not name:
        return ''
    lower = name.lower()
    if lower in _INVALID_NAMES:
        return ''
    # Strip common LAN suffixes
    for suffix in _GENERIC_SUFFIXES:
        if lower.endswith(suffix):
            name = name[: -len(suffix)]
            break
    # Reject PTR-style garbage
    if re.match(r'^\d{1,3}(-\d{1,3}){3}', name):
        return ''
    if re.match(r'^ip-[\d-]+', name, re.I):
        return ''
    return name.split('.')[0].strip()


def _resolve_ptr_socket(ip: str) -> str:
    try:
        host, _, _ = socket.gethostbyaddr(ip)
        return _clean_hostname(host)
    except Exception:
        return ''


def _resolve_ptr_dns(ip: str, nameserver: str) -> str:
    try:
        import dns.reversename
        import dns.resolver
        rev = dns.reversename.from_address(ip)
        resolver = dns.resolver.Resolver(configure=False)
        resolver.nameservers = [nameserver]
        resolver.lifetime = 2.0
        resolver.timeout = 2.0
        answers = resolver.resolve(rev, 'PTR')
        for rdata in answers:
            cleaned = _clean_hostname(str(rdata))
            if cleaned:
                return cleaned
    except Exception:
        pass
    return ''


def _resolve_mdns(ip: str) -> str:
    for cmd in (
        ['avahi-resolve-address', '-a', ip],
        ['avahi-resolve', '-a', ip],
    ):
        try:
            out = subprocess.check_output(
                cmd, stderr=subprocess.DEVNULL, timeout=4, text=True,
            ).strip()
            # "192.168.0.215\tGalaxy-A36-5G.local"
            parts = out.split()
            if len(parts) >= 2:
                cleaned = _clean_hostname(parts[-1])
                if cleaned:
                    return cleaned
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            continue
    return ''


def _resolve_netbios(ip: str) -> str:
    try:
        out = subprocess.check_output(
            ['nmblookup', '-A', ip],
            stderr=subprocess.DEVNULL,
            timeout=4,
            text=True,
        )
        for line in out.splitlines():
            line = line.strip()
            if '<00>' in line and 'GROUP' not in line.upper():
                # "GALAXY-A36-5G  <00>  UNIQUE"
                name = line.split()[0]
                cleaned = _clean_hostname(name)
                if cleaned:
                    return cleaned
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return ''


def resolve_hostname(ip: str, gateway: str | None = None) -> tuple[str, str]:
    """
    Try multiple resolution methods. Returns (hostname, source).
    source is one of: ptr_system, ptr_router, mdns, netbios, or ''.
    """
    if not ip or ip.startswith('127.'):
        return '', ''

    gateway = gateway or get_gateway_ip()

    for source, fn, args in (
        ('ptr_system', _resolve_ptr_socket, (ip,)),
        ('ptr_router', _resolve_ptr_dns, (ip, gateway)),
        ('mdns', _resolve_mdns, (ip,)),
        ('netbios', _resolve_netbios, (ip,)),
    ):
        try:
            name = fn(*args)
            if name:
                logger.debug('Resolved %s -> %s via %s', ip, name, source)
                return name, source
        except Exception as exc:
            logger.debug('Hostname resolve %s via %s failed: %s', ip, source, exc)

    return '', ''


def enrich_host_info(info: dict, gateway: str | None = None) -> dict:
    """Fill missing hostname on a scan host dict."""
    if info.get('hostname'):
        return info
    name, source = resolve_hostname(info.get('ip', ''), gateway=gateway)
    if name:
        info = {**info, 'hostname': name, 'hostname_source': source}
    return info
