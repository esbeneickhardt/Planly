#!/usr/bin/env bash
# init-migrations.sh — one-time migration baseline for existing Planly installations.
#
# Run this ONCE on any installation that was previously set up with "prisma db push"
# before switching to the tracked migration workflow.
#
# What it does:
#   1. Creates prisma/migrations/0_baseline/ and generates the full SQL for the
#      current schema by comparing against the live database.
#   2. Records that migration as already applied so future "prisma migrate deploy"
#      runs start from a clean baseline.
#
# Prerequisites:
#   - Node ≥ 18 installed locally (or run inside the backend container)
#   - DATABASE_URL pointing at your live database
#   - Run from the backend/ directory (where prisma/schema.prisma lives)
#
# Usage:
#   cd backend
#   DATABASE_URL=postgresql://planly:<password>@<host>:5432/planly \
#     bash ../scripts/init-migrations.sh
#
# After this script completes:
#   - Commit the generated prisma/migrations/ directory to version control.
#   - From then on, all schema changes must go through:
#       npx prisma migrate dev --name <description>     # during development
#       npx prisma migrate deploy                       # in production (Dockerfile does this automatically)
#   - NEVER run "prisma db push" on a production database again.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")/backend"

if [ ! -f "$BACKEND_DIR/prisma/schema.prisma" ]; then
  echo "ERROR: prisma/schema.prisma not found. Run this script from the repo root or backend/ directory."
  exit 1
fi

cd "$BACKEND_DIR"

if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "prisma/migrations/ already exists and is non-empty. Nothing to do."
  echo "If you intended to regenerate the baseline, delete prisma/migrations/ first."
  exit 0
fi

echo "==> Generating initial migration SQL from current schema..."
# --create-only writes the SQL without applying it, which is what we want for
# baselining — the schema is already in the DB, so we mark it applied below.
npx prisma migrate dev --name baseline --create-only

MIGRATION_DIR=$(ls -d prisma/migrations/*_baseline 2>/dev/null | head -1)

if [ -z "$MIGRATION_DIR" ]; then
  echo "ERROR: Migration directory not found after prisma migrate dev --create-only."
  exit 1
fi

echo "==> Marking migration as already applied (schema already in DB)..."
# This writes a row into the _prisma_migrations table so Prisma knows the
# current schema is the baseline — it will NOT try to re-run the SQL.
npx prisma migrate resolve --applied "$(basename "$MIGRATION_DIR")"

echo ""
echo "✓ Done. Migration baseline created at: $MIGRATION_DIR"
echo ""
echo "Next steps:"
echo "  1. Review the generated SQL in $MIGRATION_DIR/migration.sql"
echo "  2. git add prisma/migrations/ && git commit -m 'chore: initialise prisma migrations baseline'"
echo "  3. Going forward, use 'npx prisma migrate dev --name <description>' for schema changes."
echo "     The Dockerfile will automatically run 'npx prisma migrate deploy' on container start."
