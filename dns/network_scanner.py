"""
Utility to scan the local network for devices using nmap.
Populates the Client model with hostnames, MACs, vendors, OS hints, and open ports.
"""
import logging
import re
import socket
import subprocess
import time
import xml.etree.ElementTree as ET
from django.utils import timezone
from dns.models import Client
from dns.hostname_resolver import enrich_host_info, get_gateway_ip, resolve_hostname

logger = logging.getLogger('dns')

# Shared progress for the UI to poll while a background scan runs.
_scan_state = {
    'running': False,
    'phase': '',
    'found': 0,
    'enriched': 0,
    'error': None,
    'started_at': None,
    'finished_at': None,
}


def get_scan_status():
    return dict(_scan_state)


def get_local_ip():
    """Get the primary local IP of the machine."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP


def get_subnet(ip):
    """Simple assumption for /24 subnet."""
    parts = ip.split('.')
    if len(parts) == 4:
        return f"{parts[0]}.{parts[1]}.{parts[2]}.0/24"
    return "192.168.1.0/24"


def _run_nmap(args, timeout=300):
    cmd = ['sudo', 'nmap', *args]
    logger.info('Running: %s', ' '.join(cmd))
    return subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=timeout).decode('utf-8', errors='replace')


def _parse_nmap_xml(xml_text):
    """Parse nmap -oX output into a list of host dicts."""
    hosts = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        logger.error('Failed to parse nmap XML: %s', exc)
        return hosts

    for host in root.findall('host'):
        status = host.find('status')
        if status is not None and status.get('state') not in (None, 'up'):
            continue

        ip = ''
        mac = ''
        vendor = ''
        for addr in host.findall('address'):
            addrtype = addr.get('addrtype')
            if addrtype in ('ipv4', 'ipv6') and not ip:
                ip = addr.get('addr', '')
            elif addrtype == 'mac':
                mac = addr.get('addr', '')
                vendor = addr.get('vendor', '') or ''

        if not ip:
            continue

        hostname = ''
        hostnames = host.find('hostnames')
        if hostnames is not None:
            # Prefer user/PTR hostname
            for hn in hostnames.findall('hostname'):
                name = hn.get('name') or ''
                if name and (hn.get('type') in ('user', 'PTR', None) or not hostname):
                    hostname = name.split('.')[0] if hn.get('type') == 'PTR' else name
                    if hn.get('type') in ('user', 'PTR'):
                        break

        os_hint = ''
        os_node = host.find('os')
        if os_node is not None:
            matches = []
            for osm in os_node.findall('osmatch'):
                name = osm.get('name') or ''
                acc = osm.get('accuracy') or '0'
                if name:
                    matches.append((int(acc), name))
            if matches:
                matches.sort(reverse=True)
                os_hint = matches[0][1]

        ports = []
        ports_node = host.find('ports')
        if ports_node is not None:
            for port in ports_node.findall('port'):
                state = port.find('state')
                if state is not None and state.get('state') == 'open':
                    portid = port.get('portid')
                    proto = port.get('protocol', 'tcp')
                    service = port.find('service')
                    svc = service.get('name') if service is not None else ''
                    if portid:
                        label = f"{portid}/{proto}"
                        if svc:
                            label = f"{label} ({svc})"
                        ports.append(label)

        hosts.append({
            'ip': ip,
            'mac': mac.upper() if mac else '',
            'vendor': vendor,
            'hostname': hostname,
            'os_hint': os_hint,
            'open_ports': ', '.join(ports[:12]),
            'device_type': _guess_device_type(os_hint, vendor, hostname, ports),
        })
    return hosts


def _guess_device_type(os_hint='', vendor='', hostname='', ports=None):
    text = f"{os_hint} {vendor} {hostname}".lower()
    port_nums = set()
    for p in ports or []:
        m = re.match(r'(\d+)', str(p))
        if m:
            port_nums.add(int(m.group(1)))

    if any(x in text for x in ('iphone', 'android', 'pixel', 'galaxy')):
        return 'phone'
    if any(x in text for x in ('ipad', 'tablet')):
        return 'phone'
    if any(x in text for x in ('apple tv', 'smart tv', 'roku', 'fire tv', 'chromecast', 'bravia')):
        return 'tv'
    if any(x in text for x in (
        'router', 'gateway', 'tp-link', 'tplink', 'asus', 'netgear', 'mikrotik',
        'ubiquiti', 'unifi', 'openwrt', 'dd-wrt',
    )) or (53 in port_nums and 80 in port_nums):
        return 'router'
    if any(x in text for x in ('raspberry', 'raspi', 'esp32', 'esp8266', 'arduino', 'iot', 'printer')):
        return 'iot'
    if any(x in text for x in ('macbook', 'mac os', 'macos', 'windows', 'ubuntu', 'linux', 'laptop')):
        return 'laptop'
    if 3389 in port_nums or 5900 in port_nums:
        return 'laptop'
    return 'other'


def _upsert_host(info):
    """Create/update a Client from scan data without wiping user-set fields."""
    defaults = {'last_seen': timezone.now()}
    if info.get('mac'):
        defaults['mac'] = info['mac']
    if info.get('vendor'):
        defaults['vendor'] = info['vendor']
    if info.get('os_hint'):
        defaults['os_hint'] = info['os_hint'][:100]
    if info.get('open_ports') is not None:
        defaults['open_ports'] = info.get('open_ports', '')[:255]
    if info.get('device_type') and info['device_type'] != 'other':
        defaults['device_type'] = info['device_type']

    client, created = Client.objects.update_or_create(ip=info['ip'], defaults=defaults)

    # Fill hostname/name without overwriting user nicknames or existing names
    updates = {}
    if info.get('hostname'):
        if not client.hostname:
            updates['hostname'] = info['hostname'][:255]
        if not client.name:
            updates['name'] = info['hostname'][:100]
    if not client.device_type or client.device_type == 'other':
        guessed = info.get('device_type') or 'other'
        if guessed != 'other':
            updates['device_type'] = guessed
    if updates:
        for k, v in updates.items():
            setattr(client, k, v)
        client.save(update_fields=list(updates.keys()))

    if created:
        _notify_new_device(client)
    return client, created


def _notify_new_device(client):
    from dns.alerts import notify_event
    import asyncio
    msg = f"New device detected: {client.name or client.hostname or client.ip}"
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(notify_event('new_device', msg, {'client_id': client.id, 'ip': client.ip}))
        else:
            asyncio.run(notify_event('new_device', msg, {'client_id': client.id, 'ip': client.ip}))
    except Exception:
        pass


def run_network_scan(subnet=None, deep=True):
    """
    Discover LAN hosts with nmap, then optionally fingerprint OS/open ports.

    Phase 1: sudo nmap -sn -PR -R  (ARP ping + reverse DNS)
    Phase 2: sudo nmap -Pn -F -O --osscan-guess  (fast ports + OS guess)
    """
    if _scan_state['running']:
        logger.warning('Scan already running; skipping duplicate start')
        return _scan_state.get('found', 0)

    if not subnet:
        ip = get_local_ip()
        subnet = get_subnet(ip)

    _scan_state.update({
        'running': True,
        'phase': 'discovery',
        'found': 0,
        'enriched': 0,
        'error': None,
        'started_at': time.time(),
        'finished_at': None,
    })

    logger.info('Starting network scan on %s (deep=%s)...', subnet, deep)
    try:
        # Phase 1 — who is up?
        discovery_xml = _run_nmap(
            ['-sn', '-PR', '-R', '-T4', '-oX', '-', subnet],
            timeout=180,
        )
        hosts = _parse_nmap_xml(discovery_xml)
        _scan_state['found'] = len(hosts)

        gateway = get_gateway_ip()
        _scan_state['phase'] = 'hostnames'
        for i, info in enumerate(hosts):
            if not info.get('hostname'):
                hosts[i] = enrich_host_info(info, gateway=gateway)
            _upsert_host(hosts[i])
            _scan_state['enriched'] = i + 1

        # Also try to name known clients still missing hostnames (offline devices)
        for client in Client.objects.filter(hostname='').exclude(ip=''):
            name, _ = resolve_hostname(client.ip, gateway=gateway)
            if name:
                updates = {}
                if not client.hostname:
                    updates['hostname'] = name[:255]
                if not client.name:
                    updates['name'] = name[:100]
                if updates:
                    for k, v in updates.items():
                        setattr(client, k, v)
                    client.save(update_fields=list(updates.keys()))

        # Phase 2 — OS + open ports for live hosts
        if deep and hosts:
            _scan_state['phase'] = 'fingerprint'
            _scan_state['enriched'] = 0
            ips = [h['ip'] for h in hosts]
            try:
                # Batch fingerprint; host-timeout keeps slow boxes from stalling forever
                enrich_xml = _run_nmap(
                    [
                        '-Pn', '-T4', '-F', '-O', '--osscan-guess',
                        '--max-os-tries', '1', '--host-timeout', '20s',
                        '-oX', '-', *ips,
                    ],
                    timeout=900,
                )
                enriched = _parse_nmap_xml(enrich_xml)
                by_ip = {h['ip']: h for h in enriched}
                count = 0
                for info in hosts:
                    extra = by_ip.get(info['ip'])
                    if not extra:
                        continue
                    merged = {**info}
                    for key in ('os_hint', 'open_ports', 'device_type', 'mac', 'vendor', 'hostname'):
                        if extra.get(key):
                            merged[key] = extra[key]
                    if not merged.get('hostname'):
                        merged = enrich_host_info(merged, gateway=gateway)
                    # Re-guess type with richer data
                    merged['device_type'] = _guess_device_type(
                        merged.get('os_hint', ''),
                        merged.get('vendor', ''),
                        merged.get('hostname', ''),
                        (merged.get('open_ports') or '').split(', '),
                    )
                    _upsert_host(merged)
                    count += 1
                    _scan_state['enriched'] = count
            except Exception as exc:
                logger.warning('Fingerprint phase failed (discovery data kept): %s', exc)
                _scan_state['error'] = f'Fingerprint incomplete: {exc}'

        _scan_state['phase'] = 'done'
        logger.info('Scan complete. Found %s devices.', len(hosts))
        return len(hosts)
    except Exception as e:
        logger.error('Network scan failed: %s', e)
        _scan_state['error'] = str(e)
        _scan_state['phase'] = 'error'
        return 0
    finally:
        _scan_state['running'] = False
        _scan_state['finished_at'] = time.time()
