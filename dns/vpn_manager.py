"""
Utility to manage Wireguard VPN interfaces and peers using subprocess and wg command.
"""
import subprocess
import os
import logging
from django.conf import settings

logger = logging.getLogger('dns')

WG_CONF_DIR = '/etc/wireguard'


def gen_keypair():
    """Generate a private and public key pair using 'wg genkey'."""
    priv = subprocess.check_output(['wg', 'genkey']).decode().strip()
    pub = subprocess.check_output(['wg', 'pubkey'], input=priv.encode()).decode().strip()
    return priv, pub


def generate_config(server, peers):
    """Generate the full wg0.conf content."""
    lines = [
        "[Interface]",
        f"PrivateKey = {server.private_key}",
        f"Address = {server.address}",
        f"ListenPort = {server.listen_port}",
        "PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE",
        "PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE",
        ""
    ]
    for p in peers:
        if not p.enabled:
            continue
        lines.extend([
            "[Peer]",
            f"PublicKey = {p.public_key}",
            f"AllowedIPs = {p.allowed_ips}",
            ""
        ])
    return "\n".join(lines)


def sync_config(interface_name='wg0'):
    """
    Sync memory state to /etc/wireguard/interface_name.conf and reload.
    Requires sudo access to 'wg' and 'wg-quick'.
    """
    from dns.models import VPNServer, VPNPeer
    server = VPNServer.objects.filter(name=interface_name).first()
    if not server or not server.enabled:
        return False, "Server not found or disabled"

    peers = VPNPeer.objects.filter(enabled=True)
    config_content = generate_config(server, peers)

    # Note: We use a temporary file then move it to avoid partial writes
    tmp_path = f"/tmp/{interface_name}.conf"
    with open(tmp_path, 'w') as f:
        f.write(config_content)

    try:
        # Move to /etc/wireguard (requires sudo)
        subprocess.run(['sudo', 'mv', tmp_path, f"{WG_CONF_DIR}/{interface_name}.conf"], check=True)
        subprocess.run(['sudo', 'chmod', '600', f"{WG_CONF_DIR}/{interface_name}.conf"], check=True)

        # Apply using wg syncconf (faster than restart)
        # If interface is down, start it
        res = subprocess.run(['sudo', 'wg', 'show', interface_name], capture_output=True)
        if res.returncode != 0:
            subprocess.run(['sudo', 'wg-quick', 'up', interface_name], check=True)
        else:
            subprocess.run(['sudo', 'wg', 'syncconf', interface_name, f"{WG_CONF_DIR}/{interface_name}.conf"], check=True)

        return True, "Success"
    except subprocess.CalledProcessError as e:
        logger.error(f"VPN sync failed: {e}")
        return False, str(e)


def get_status(interface_name='wg0'):
    """Get active handshake info from 'wg show interface dump'."""
    try:
        res = subprocess.run(
            ['sudo', '-n', 'wg', 'show', interface_name, 'dump'], 
            capture_output=True, text=True, timeout=2
        )
        if res.returncode != 0:
            return {}
        
        lines = res.stdout.strip().split('\n')
        if len(lines) < 2:
            return {}
        
        handshakes = {}
        # Skip the first line (interface info)
        for line in lines[1:]:
            parts = line.split('\t')
            if len(parts) >= 5:
                # pubkey, presharedkey, endpoint, allowed-ips, latest-handshake, ...
                pubkey = parts[0]
                handshake_ts = int(parts[4])
                handshakes[pubkey] = handshake_ts
        return handshakes
    except Exception:
        return {}


def generate_peer_config(server, peer):
    """Generate the .conf content for a client to import."""
    # We assume 'eth0' is the main WAN interface, but use the server's public IP
    # In a real setup, we'd need the external IP/Domain
    from dns.models import SystemSetting
    ext_host = SystemSetting.objects.filter(key='vpn_external_host').first()
    host = ext_host.value if ext_host else "dns-shield.local"

    lines = [
        "[Interface]",
        f"PrivateKey = {peer.private_key}",
        f"Address = {peer.allowed_ips}",
        "DNS = 10.0.0.1", # Use VPN server as DNS
        "",
        "[Peer]",
        f"PublicKey = {server.public_key}",
        f"Endpoint = {host}:{server.listen_port}",
        "AllowedIPs = 0.0.0.0/0", # Full tunnel
        "PersistentKeepalive = 25"
    ]
    return "\n".join(lines)
