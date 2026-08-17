#!/bin/sh
# Run Playwright E2E tests inside Docker.
#
# Self-contained: creates a temporary admin user before the suite runs and
# deletes it afterwards. No manual credential setup needed.
#
# Optional env vars:
#   E2E_BASE_URL - override the app URL (default: http://frontend via planly_default network)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE="planly-e2e"

# Unique credentials for this run - readable only for the duration of the script
SUFFIX=$(date +%s)
ADMIN_EMAIL="e2e_admin_${SUFFIX}@planly.test"
ADMIN_USER="e2eadmin${SUFFIX}"
ADMIN_PASS="E2eAdm1n!${SUFFIX}"

echo ">>> Creating temporary E2E admin: $ADMIN_EMAIL"

# Run a tiny Node script inside the already-running backend container.
# bcryptjs and @prisma/client are production deps so they are always present.
RESULT=$(docker compose -f "$SCRIPT_DIR/docker-compose.yml" exec -T backend node -e "
  const bcrypt = require('bcryptjs');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  bcrypt.hash('${ADMIN_PASS}', 10)
    .then(hash => prisma.user.create({
      data: {
        email: '${ADMIN_EMAIL}',
        username: '${ADMIN_USER}',
        passwordHash: hash,
        isAdmin: true,
        emailVerified: true,
      }
    }))
    .then(() => prisma.\$disconnect())
    .then(() => { console.log('ok'); process.exit(0); })
    .catch(e => { console.error(e.message); process.exit(1); });
" 2>&1)

if ! echo "$RESULT" | grep -q "^ok"; then
  echo "ERROR: Could not create E2E admin user:"
  echo "$RESULT"
  exit 1
fi

echo ">>> E2E admin ready."

# Ensure allowProjectCreation is ON so regular test users can create projects.
# The server config may have been left as false by a prior test run or admin action.
docker compose -f "$SCRIPT_DIR/docker-compose.yml" exec -T backend node -e "
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  prisma.serverConfig.upsert({
    where: { id: 'main' },
    update: { allowProjectCreation: true },
    create: { id: 'main', allowProjectCreation: true },
  })
    .then(() => prisma.\$disconnect())
    .then(() => process.exit(0))
    .catch(e => { console.error(e.message); process.exit(1); });
" > /dev/null 2>&1
echo ">>> allowProjectCreation set to true."

# Build the Playwright image if it does not exist yet
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo ">>> Building $IMAGE ..."
  docker build -f "$SCRIPT_DIR/e2e/Dockerfile" -t "$IMAGE" "$SCRIPT_DIR/e2e/"
fi

# Run the test suite; capture the exit code so we can always clean up.
# --network host: the container shares the host network so the browser hits
# http://localhost (= the running nginx), and the Origin header matches
# FRONTEND_ORIGIN=http://localhost, satisfying the backend CSRF check.
set +e
docker run --rm \
  --network host \
  -e E2E_ADMIN_EMAIL="$ADMIN_EMAIL" \
  -e E2E_ADMIN_PASSWORD="$ADMIN_PASS" \
  -v "$SCRIPT_DIR/e2e/specs:/e2e/specs:ro" \
  -v "$SCRIPT_DIR/e2e/fixtures:/e2e/fixtures:ro" \
  -v "$SCRIPT_DIR/e2e/playwright.config.ts:/e2e/playwright.config.ts:ro" \
  -v "$SCRIPT_DIR/e2e/test-results:/e2e/test-results" \
  -v "$SCRIPT_DIR/e2e/playwright-report:/e2e/playwright-report" \
  "$IMAGE" \
  sh -c "cd /e2e && npx playwright test --reporter=list"
TEST_EXIT=$?
set -e

# Always clean up the temporary admin, even if tests failed
echo ">>> Removing temporary E2E admin."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" exec -T backend node -e "
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  prisma.user.delete({ where: { email: '${ADMIN_EMAIL}' } })
    .then(() => prisma.\$disconnect())
    .then(() => process.exit(0))
    .catch(() => process.exit(0));
" > /dev/null 2>&1 || true

echo ">>> Done."
exit $TEST_EXIT
