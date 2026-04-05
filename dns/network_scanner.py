"""
Utility to scan the local network for devices using nmap.
Populates the Client model with found hostnames, MACs, and vendors.
"""
import subprocess
import re
import socket
import logging
from django.utils import timezone
from dns.models import Client

logger = logging.getLogger('dns')


def get_local_ip():
    """Get the primary local IP of the machine."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Doesn't need to be reachable
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


def run_network_scan(subnet=None):
    """
    Run 'sudo nmap -sn subnet' and parse output.
    -sn: Ping scan, skip port scan.
    """
    if not subnet:
        ip = get_local_ip()
        subnet = get_subnet(ip)

    logger.info(f"Starting network scan on {subnet}...")
    try:
        # Use -oX for XML output is better, but plain text parsing is also doable
        # nmap -sn 192.168.1.0/24
        result = subprocess.check_output(['sudo', 'nmap', '-sn', subnet]).decode()
        
        # Parse logic
        # Nmap scan report for 192.168.1.1
        # Host is up (0.0010s latency).
        # MAC Address: AA:BB:CC:DD:EE:FF (Vendor Name)
        
        blocks = result.split('Nmap scan report for ')
        found_count = 0
        
        for block in blocks[1:]:
            lines = block.split('\n')
            header = lines[0].strip()
            
            # Header can be "hostname (ip)" or just "ip"
            match = re.search(r'\((.*?)\)', header)
            if match:
                ip = match.group(1)
                hostname = header.split(' (')[0]
            else:
                ip = header
                hostname = ""

            mac = ""
            vendor = ""
            for line in lines:
                if 'MAC Address:' in line:
                    mac_match = re.search(r'MAC Address: ([:0-9A-F]+)', line)
                    if mac_match:
                        mac = mac_match.group(1)
                    vendor_match = re.search(r'\((.*?)\)', line)
                    if vendor_match:
                        vendor = vendor_match.group(1)
            
            # Update Client
            client, created = Client.objects.update_or_create(
                ip=ip,
                defaults={
                    'mac': mac or None,
                    'hostname': hostname,
                    'vendor': vendor,
                    'last_seen': timezone.now()
                }
            )
            found_count += 1

        logger.info(f"Scan complete. Found {found_count} devices.")
        return found_count
    except Exception as e:
        logger.error(f"Network scan failed: {e}")
        return 0
