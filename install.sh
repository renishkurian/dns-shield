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
    python3.11 python3.11-venv python3-pip \
    redis-server nginx supervisor \
    nodejs npm \
    unbound netfilter-persistent iptables-persistent \
    curl git

# Enable Redis
systemctl enable --now redis-server

# ─── Application user & directory ────────────────────────────────────────────
echo "[2/8] Setting up application directory..."
if [ ! -d "$APP_DIR" ]; then
    cp -r "$(pwd)" "$APP_DIR"
fi
chown -R www-data:www-data "$APP_DIR"
mkdir -p "$APP_DIR/logs" "$APP_DIR/staticfiles" "$APP_DIR/media"

# ─── Python virtualenv ────────────────────────────────────────────────────────
echo "[3/8] Creating Python virtualenv..."
python3.11 -m venv "$VENV"
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

# ─── Sudoers ──────────────────────────────────────────────────────────────────
echo "[6/8] Configuring sudoers..."
cp "$APP_DIR/sudoers.d/dns-shield" /etc/sudoers.d/dns-shield
chmod 440 /etc/sudoers.d/dns-shield

# ─── Supervisor ───────────────────────────────────────────────────────────────
echo "[7/8] Configuring supervisor..."
cat > /etc/supervisor/conf.d/dns-shield.conf << 'EOF'
[program:dns-shield-web]
command=/opt/dns-shield/venv/bin/daphne -b 0.0.0.0 -p 8000 config.asgi:application
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
    listen 80 default_server;
    server_name _;

    # Static files served directly
    location /static/ {
        alias /opt/dns-shield/staticfiles/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /media/ {
        alias /opt/dns-shield/media/;
    }

    # Everything else proxied to Daphne (Django + WebSocket)
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
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
echo "  Access:  http://$IP"
echo "  Login:   admin / changeme123"
echo ""
echo "  ⚠  IMPORTANT: Change the admin password immediately!"
echo ""
echo "  Next steps:"
echo "    1. Configure Unbound on port 5335"
echo "    2. Point your router's DNS to $IP"
echo "    3. Run 'Update Gravity' from the Adlists page"
echo ""
