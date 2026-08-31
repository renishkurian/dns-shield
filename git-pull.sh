#!/usr/bin/env bash
set -e

# Change to project root directory
cd "$(dirname "$0")"

echo "=== Pulling latest changes from origin/main ==="
git pull origin main

echo "=== Running database migrations ==="
./venv/bin/python manage.py migrate

echo "=== Building frontend assets ==="
if [ -d "frontend" ]; then
  cd frontend
  npm run build
  cd ..
fi

echo "=== Collecting static files ==="
./venv/bin/python manage.py collectstatic --noinput

echo "=== Restarting DNS Shield services ==="
sudo supervisorctl restart dns-shield-proxy dns-shield-web

echo "=== Deployment successful! ==="
