#!/bin/sh
# Run backend integration tests inside Docker.
# The Prisma engine binary targets Alpine (musl), so tests must run in the Alpine container.
#
# Creates planly_test database (if missing) and applies migrations before running.
#
# Usage: ./run-tests.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE="planly-backend-test"
NETWORK="planly_default"

# Read DB_PASSWORD from .env so the URL stays in sync with the running stack
DB_PASSWORD=$(grep '^DB_PASSWORD=' "$SCRIPT_DIR/.env" 2>/dev/null | cut -d= -f2-)
if [ -z "$DB_PASSWORD" ]; then
  echo "ERROR: DB_PASSWORD not found in .env"
  exit 1
fi

TEST_DB_URL="postgresql://planly:${DB_PASSWORD}@db:5432/planly_test"

# Build test image if it doesn't exist (builder stage has dev deps + Alpine Prisma binary)
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Building $IMAGE ..."
  docker build -f "$SCRIPT_DIR/backend/Dockerfile" --target builder -t "$IMAGE" "$SCRIPT_DIR/backend/"
fi

# Create planly_test database if it doesn't already exist
echo ">>> Ensuring planly_test database exists..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" exec -T db \
  psql -U planly -c "SELECT 1 FROM pg_database WHERE datname = 'planly_test'" \
  | grep -q "1 row" || \
  docker compose -f "$SCRIPT_DIR/docker-compose.yml" exec -T db \
  psql -U planly -c "CREATE DATABASE planly_test"

# Apply schema migrations then run the full test suite
docker run --rm \
  --network "$NETWORK" \
  -e TEST_DATABASE_URL="$TEST_DB_URL" \
  -e DATABASE_URL="$TEST_DB_URL" \
  -v "$SCRIPT_DIR/backend/src:/app/src:ro" \
  -v "$SCRIPT_DIR/backend/prisma:/app/prisma:ro" \
  -v "$SCRIPT_DIR/backend/vitest.config.ts:/app/vitest.config.ts:ro" \
  -v "$SCRIPT_DIR/backend/tsconfig.json:/app/tsconfig.json:ro" \
  "$IMAGE" \
  sh -c "cd /app && npx prisma migrate deploy && npx vitest run --reporter=verbose"
