#!/bin/sh
# Run backend integration tests inside Docker.
# The Prisma engine binary targets Alpine (musl), so tests must run in the Alpine container.
#
# Usage: ./run-tests.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE="planly-backend-test"
NETWORK="planly_default"
TEST_DB_URL="postgresql://planly:planly_dev@db:5432/planly_test"

# Build test image if it doesn't exist (builder stage has dev deps + Alpine Prisma binary)
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Building $IMAGE ..."
  docker build -f "$SCRIPT_DIR/backend/Dockerfile" --target builder -t "$IMAGE" "$SCRIPT_DIR/backend/"
fi

docker run --rm \
  --network "$NETWORK" \
  -e TEST_DATABASE_URL="$TEST_DB_URL" \
  -e DATABASE_URL="$TEST_DB_URL" \
  -v "$SCRIPT_DIR/backend/src:/app/src:ro" \
  -v "$SCRIPT_DIR/backend/vitest.config.ts:/app/vitest.config.ts:ro" \
  -v "$SCRIPT_DIR/backend/tsconfig.json:/app/tsconfig.json:ro" \
  "$IMAGE" \
  sh -c "cd /app && npx vitest run --reporter=verbose"
