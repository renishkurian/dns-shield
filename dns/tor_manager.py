"""
Manage the system Tor service for DNS-over-Tor (DNSPort 9053).
"""
import logging
import os
import shutil
import subprocess

logger = logging.getLogger('dns')

TORRC_PATH = '/etc/tor/torrc'
TORRC_TMP = '/tmp/torrc'
MANAGED_BEGIN = '# BEGIN DNS-SHIELD TOR'
MANAGED_END = '# END DNS-SHIELD TOR'
MANAGED_BLOCK = (
    f"{MANAGED_BEGIN}\n"
    "DNSPort 127.0.0.1:9053\n"
    "SocksPort 9050\n"
    f"{MANAGED_END}"
)


def is_installed() -> bool:
    return shutil.which('tor') is not None


def get_install_command() -> str:
    return 'sudo apt-get install -y tor'


def _systemctl_state(action: str) -> bool:
    """Return True if systemctl is-active/is-enabled reports active/enabled."""
    try:
        res = subprocess.run(
            ['systemctl', action, 'tor'],
            capture_output=True, text=True, timeout=5,
        )
        return res.stdout.strip() in ('active', 'enabled')
    except Exception as exc:
        logger.error(f"systemctl {action} tor failed: {exc}")
        return False


def get_status() -> dict:
    installed = is_installed()
    return {
        'installed': installed,
        'running': _systemctl_state('is-active') if installed else False,
        'enabled': _systemctl_state('is-enabled') if installed else False,
    }


def _ensure_torrc() -> None:
    """Ensure torrc contains the DNS-SHIELD managed DNSPort/SocksPort block."""
    existing = ''
    if os.path.isfile(TORRC_PATH):
        try:
            with open(TORRC_PATH, 'r') as f:
                existing = f.read()
        except OSError as exc:
            logger.warning(f"Could not read {TORRC_PATH}: {exc}")

    if MANAGED_BEGIN in existing and MANAGED_END in existing:
        start = existing.index(MANAGED_BEGIN)
        end = existing.index(MANAGED_END) + len(MANAGED_END)
        content = existing[:start].rstrip() + '\n\n' + MANAGED_BLOCK + '\n' + existing[end:].lstrip('\n')
    else:
        content = (existing.rstrip() + '\n\n' + MANAGED_BLOCK + '\n') if existing.strip() else MANAGED_BLOCK + '\n'

    with open(TORRC_TMP, 'w') as f:
        f.write(content)

    subprocess.run(['sudo', 'mv', TORRC_TMP, TORRC_PATH], check=True)


def enable_tor() -> tuple[bool, str]:
    if not is_installed():
        return False, 'Tor is not installed.'
    try:
        _ensure_torrc()
        res = subprocess.run(
            ['sudo', 'systemctl', 'enable', '--now', 'tor'],
            capture_output=True, text=True, timeout=30,
        )
        output = (res.stdout or res.stderr or '').strip()
        if res.returncode != 0:
            return False, output or 'Failed to enable Tor.'
        return True, output or 'Tor enabled and started.'
    except subprocess.CalledProcessError as e:
        logger.error(f"Tor enable failed: {e}")
        return False, str(e)
    except Exception as e:
        logger.error(f"Tor enable failed: {e}")
        return False, str(e)


def disable_tor() -> tuple[bool, str]:
    try:
        res = subprocess.run(
            ['sudo', 'systemctl', 'disable', '--now', 'tor'],
            capture_output=True, text=True, timeout=30,
        )
        output = (res.stdout or res.stderr or '').strip()
        if res.returncode != 0:
            return False, output or 'Failed to disable Tor.'
        return True, output or 'Tor disabled and stopped.'
    except Exception as e:
        logger.error(f"Tor disable failed: {e}")
        return False, str(e)
