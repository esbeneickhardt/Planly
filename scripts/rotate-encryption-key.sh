#!/usr/bin/env bash
# Automates ENCRYPTION_KEY rotation:
#   1. Generate a new key
#   2. Re-encrypt all DB secrets (SMTP passwords, webhook secrets, TOTP secrets)
#   3. Update ENCRYPTION_KEY in .env
#   4. Restart the backend
#
# Run from the repo root: bash scripts/rotate-encryption-key.sh
# Requires: docker compose stack running, .env in the current directory

set -euo pipefail

ENV_FILE=".env"
TS_SCRIPT="scripts/rotate-encryption-key.ts"

# ── Preflight ────────────────────────────────────────────────────────────────

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Run this from the repo root." >&2
  exit 1
fi

if [ ! -f "$TS_SCRIPT" ]; then
  echo "ERROR: $TS_SCRIPT not found." >&2
  exit 1
fi

# Read current values from .env (handles quoted and unquoted values)
OLD_KEY=$(grep -E '^ENCRYPTION_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'" | xargs)
DB_PASS=$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'" | xargs)

if [ -z "$OLD_KEY" ]; then
  echo "ERROR: ENCRYPTION_KEY not found in $ENV_FILE." >&2
  exit 1
fi
if [ -z "$DB_PASS" ]; then
  echo "ERROR: DB_PASSWORD not found in $ENV_FILE." >&2
  exit 1
fi

# Detect running backend container
CONTAINER=$(docker compose ps -q backend 2>/dev/null | head -1)
if [ -z "$CONTAINER" ]; then
  echo "ERROR: Backend container is not running. Start the stack first." >&2
  exit 1
fi
CONTAINER_NAME=$(docker inspect --format '{{.Name}}' "$CONTAINER" | sed 's|^/||')

# ── Generate new key ─────────────────────────────────────────────────────────

NEW_KEY=$(openssl rand -hex 32)
echo ""
echo "Old key: $OLD_KEY"
echo "New key: $NEW_KEY"
echo ""
echo "Rotating encryption key..."

# ── Re-encrypt DB secrets ────────────────────────────────────────────────────

docker cp "$TS_SCRIPT" "$CONTAINER_NAME:/app/rotate-key.ts"

if ! docker compose exec \
  -e OLD_ENCRYPTION_KEY="$OLD_KEY" \
  -e NEW_ENCRYPTION_KEY="$NEW_KEY" \
  -e DATABASE_URL="postgresql://planly:${DB_PASS}@db:5432/planly" \
  backend \
  sh -c "cd /app && npx tsx rotate-key.ts"; then
  echo ""
  echo "ERROR: Rotation script failed. .env has NOT been changed. No restart performed." >&2
  exit 1
fi

# ── Update .env ──────────────────────────────────────────────────────────────

sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$NEW_KEY|" "$ENV_FILE"
echo ""
echo "Updated ENCRYPTION_KEY in $ENV_FILE."

# ── Restart backend ───────────────────────────────────────────────────────────

echo "Restarting backend..."
docker compose up -d --force-recreate --no-deps backend

# ── Health check ─────────────────────────────────────────────────────────────

echo "Waiting for backend to be ready..."
for i in $(seq 1 15); do
  if curl -sf http://localhost/api/health > /dev/null 2>&1; then
    echo "Backend is healthy."
    echo ""
    echo "Rotation complete. Verify SMTP still works: Admin → Email → Send test email."
    exit 0
  fi
  sleep 2
done

echo "WARNING: Backend did not become healthy within 30s. Check logs:" >&2
echo "  docker compose logs --tail=50 backend" >&2
exit 1
