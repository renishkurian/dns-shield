#!/bin/bash
# DNS Shield Uninstall Script
# Removes what install.sh installed. Does NOT purge shared packages
# (nginx, redis, supervisor, unbound, etc.) used by other apps.
# Run as root on the Raspberry Pi.
set -euo pipefail

APP_DIR="/opt/dns-shield"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  DNS Shield Uninstaller"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─── Stop services ─────────────────────────────────────────────────────────────
echo "[1/5] Stopping DNS Shield..."
supervisorctl stop dns-shield-proxy dns-shield-web 2>/dev/null || true

# ─── Supervisor ────────────────────────────────────────────────────────────────
echo "[2/5] Removing Supervisor config..."
rm -f /etc/supervisor/conf.d/dns-shield.conf
supervisorctl reread
supervisorctl update

# ─── Nginx ─────────────────────────────────────────────────────────────────────
echo "[3/5] Removing Nginx site..."
rm -f /etc/nginx/sites-enabled/dns-shield
rm -f /etc/nginx/sites-available/dns-shield
if nginx -t 2>/dev/null; then
    systemctl reload nginx
fi

# ─── Sudoers ───────────────────────────────────────────────────────────────────
echo "[4/5] Removing sudoers..."
rm -f /etc/sudoers.d/dns-shield

# ─── Application directory ─────────────────────────────────────────────────────
echo "[5/5] Removing $APP_DIR..."
rm -rf "$APP_DIR"

# ─── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  DNS Shield removed."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Left in place (shared with other apps):"
echo "    nginx, redis-server, supervisor, unbound, etc."
echo ""
if supervisorctl status 2>/dev/null | grep -q dns-shield; then
    echo "  ⚠  Warning: dns-shield entries still listed in supervisor:"
    supervisorctl status | grep dns-shield || true
else
    echo "  Supervisor: no dns-shield programs"
fi
echo ""
