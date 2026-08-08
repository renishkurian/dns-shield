#!/bin/bash
# DNS Shield Install Script
# Run as root on Debian Bookworm (Raspberry Pi 4/5)
set -euo pipefail

APP_DIR="/opt/dns-shield"
VENV="$APP_DIR/venv"
PYTHON="$VENV/bin/python"
PIP="$VENV/bin/pip"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  DNS Shield Installer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─── System dependencies ──────────────────────────────────────────────────────
echo "[1/8] Installing system packages..."
apt-get update -qq
apt-get install -y -qq \
    python3 python3-venv python3-pip \
    redis-server nginx supervisor \
    nodejs npm \
    unbound netfilter-persistent iptables-persistent \
    tor \
    curl git

# Enable Redis
systemctl enable --now redis-server

# Tor is optional at runtime — leave stopped until enabled from Settings → Network
systemctl disable --now tor 2>/dev/null || true

# ─── Application user & directory ────────────────────────────────────────────
echo "[2/8] Setting up application directory..."
if [ ! -d "$APP_DIR" ]; then
    cp -r "$(pwd)" "$APP_DIR"
fi
mkdir -p "$APP_DIR/logs" "$APP_DIR/staticfiles" "$APP_DIR/media"
# Ensure www-data can write logs/DB (web runs as www-data; mkdir as root would otherwise break Daphne)
touch "$APP_DIR/logs/dns_shield.log"
chown -R www-data:www-data "$APP_DIR"

# ─── Python virtualenv ────────────────────────────────────────────────────────
echo "[3/8] Creating Python virtualenv..."
python3 -m venv "$VENV"
$PIP install --upgrade pip -q
$PIP install -r "$APP_DIR/requirements.txt" -q

# ─── Frontend ─────────────────────────────────────────────────────────────────
echo "[4/8] Building frontend..."
cd "$APP_DIR/frontend"
npm ci --silent
npm run build

# ─── Django setup ─────────────────────────────────────────────────────────────
echo "[5/8] Running Django setup..."
cd "$APP_DIR"
$PYTHON manage.py migrate --noinput
$PYTHON manage.py collectstatic --noinput
$PYTHON manage.py create_default_settings

# Create default admin
DJANGO_SUPERUSER_PASSWORD="changeme123" \
$PYTHON manage.py createsuperuser \
    --no-input \
    --username admin \
    --email admin@localhost 2>/dev/null || echo "  Admin user already exists"

# Re-apply ownership after root-run migrate/collectstatic/npm create root-owned files
chown -R www-data:www-data "$APP_DIR"
# Proxy runs as root and must still append to proxy.log
chmod 775 "$APP_DIR/logs"
chmod 664 "$APP_DIR/logs"/*.log 2>/dev/null || true

# ─── Sudoers (iptables, unbound, wireguard, Tor enable/disable/torrc, etc.) ───
echo "[6/8] Configuring sudoers..."
cp "$APP_DIR/sudoers.d/dns-shield" /etc/sudoers.d/dns-shield
chmod 440 /etc/sudoers.d/dns-shield
visudo -cf /etc/sudoers.d/dns-shield

# ─── Supervisor ───────────────────────────────────────────────────────────────
echo "[7/8] Configuring supervisor..."
cat > /etc/supervisor/conf.d/dns-shield.conf << 'EOF'
[program:dns-shield-web]
command=/opt/dns-shield/venv/bin/daphne -b 0.0.0.0 -p 8889 config.asgi:application
directory=/opt/dns-shield
user=www-data
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/opt/dns-shield/logs/web.log
stdout_logfile_maxbytes=10MB
stdout_logfile_backups=3
environment=DJANGO_SETTINGS_MODULE="config.settings"

[program:dns-shield-proxy]
command=/opt/dns-shield/venv/bin/python manage.py run_proxy
directory=/opt/dns-shield
user=root
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/opt/dns-shield/logs/proxy.log
stdout_logfile_maxbytes=10MB
stdout_logfile_backups=3
environment=DJANGO_SETTINGS_MODULE="config.settings"
EOF

supervisorctl reread
supervisorctl update

# ─── Nginx ────────────────────────────────────────────────────────────────────
echo "[8/8] Configuring Nginx..."
cat > /etc/nginx/sites-available/dns-shield << 'EOF'
server {
    listen 8888 default_server;
    server_name _;

    # Static files served directly
    location /static/ {
        alias /opt/dns-shield/staticfiles/;
        # Hashed Vite assets can be cached long; avoid immutable on unhashed fallbacks
        expires 7d;
        add_header Cache-Control "public";
    }

    location /media/ {
        alias /opt/dns-shield/media/;
    }

    # Everything else proxied to Daphne (Django + WebSocket)
    location / {
        proxy_pass http://127.0.0.1:8889;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/dns-shield /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# ─── Summary ──────────────────────────────────────────────────────────────────
IP=$(hostname -I | awk '{print $1}')
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  DNS Shield installed successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Access:  http://$IP:8888"
echo "  Login:   admin / changeme123"
echo ""
echo "  ⚠  IMPORTANT: Change the admin password immediately!"
echo ""
echo "  Next steps:"
echo "    1. Configure Unbound on port 5335"
echo "    2. Point your router's DNS to $IP"
echo "    3. Run 'Update Gravity' from the Adlists page"
echo "    4. (Optional) Enable Tor DNS under Settings → Network"
echo ""
