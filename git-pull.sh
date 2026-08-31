#!/usr/bin/env bash
set -e

# Change to project root directory
cd "$(dirname "$0")"

# Record the current commit hash before pulling
PREV_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "")

echo "=== Pulling latest changes from origin/main ==="
git pull origin main

NEW_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "")

# 1. Update Python dependencies if requirements.txt changed or newly pulled
if [ "$PREV_COMMIT" != "$NEW_COMMIT" ] && git diff --name-only "$PREV_COMMIT" "$NEW_COMMIT" | grep -q "requirements.txt"; then
  echo "=== requirements.txt changed: Installing/updating Python dependencies ==="
  ./venv/bin/pip install -r requirements.txt
elif [ ! -f "venv/bin/pip" ]; then
  echo "=== Virtual environment missing pip: installing requirements.txt ==="
  pip install -r requirements.txt
fi

# 2. Update Node dependencies if package.json or lockfile changed
if [ "$PREV_COMMIT" != "$NEW_COMMIT" ] && git diff --name-only "$PREV_COMMIT" "$NEW_COMMIT" | grep -qE "frontend/package.*json"; then
  echo "=== Frontend package dependencies changed: Running npm install ==="
  if [ -d "frontend" ]; then
    (cd frontend && npm install)
  fi
fi

# 3. Apply database migrations
echo "=== Running database migrations ==="
./venv/bin/python manage.py migrate

# 4. Build frontend bundle if frontend files changed or dist is missing
if [ -d "frontend" ]; then
  if [ ! -d "static/dist" ] || [ "$PREV_COMMIT" != "$NEW_COMMIT" ] && git diff --name-only "$PREV_COMMIT" "$NEW_COMMIT" | grep -qE "^frontend/"; then
    echo "=== Building frontend assets ==="
    (cd frontend && npm run build)
  else
    echo "=== Frontend unchanged, skipping rebuild ==="
  fi
fi

# 5. Collect Django static files
echo "=== Collecting static files ==="
./venv/bin/python manage.py collectstatic --noinput

# 6. Restart supervisor services
echo "=== Restarting DNS Shield services ==="
sudo supervisorctl restart dns-shield-proxy dns-shield-web

echo "=== Deployment successful! ==="
