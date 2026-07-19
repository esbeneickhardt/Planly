# Testing

Planly uses a two-tier testing strategy: automated tests cover everything that can be scripted; a short manual smoke test covers what they can't.

---

## 1. Automated tests

Run these first. They cover auth, RBAC, admin, tasks, sprints, columns, API tokens, TOTP, uploads, search, rate limiting, and IP restrictions.

### Backend integration tests (vitest)

Run inside Docker (required — the Prisma engine binary targets Alpine Linux):

```bash
docker run --rm \
  --network planly_default \
  -e TEST_DATABASE_URL="postgresql://planly:planly_dev@db:5432/planly_test" \
  -e DATABASE_URL="postgresql://planly:planly_dev@db:5432/planly_test" \
  -v "$(pwd)/backend/src:/app/src:ro" \
  -v "$(pwd)/backend/vitest.config.ts:/app/vitest.config.ts:ro" \
  -v "$(pwd)/backend/tsconfig.json:/app/tsconfig.json:ro" \
  planly-backend-test \
  sh -c "cd /app && npx vitest run --reporter=verbose"
```

The `planly-backend-test` image is the builder stage of the backend Dockerfile (includes dev dependencies and the musl Prisma binary). Build it once:

```bash
docker build -f backend/Dockerfile --target builder -t planly-backend-test backend/
```

The test suite creates and tears down its own data — it does not touch the dev database. The `planly_test` database must exist:

```bash
docker compose exec db createdb -U planly planly_test
docker compose exec backend sh -c "DATABASE_URL=postgresql://planly:planly_dev@db:5432/planly_test npx prisma db push --skip-generate"
```

### E2E browser tests (Playwright)

```bash
cd e2e
npx playwright test
```

Requires the full Docker stack to be running (`docker compose up -d`). Set `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` to a working admin account.

---

## 2. Manual tests (before production release)

Run after automated tests pass. Together they take ~45 minutes.

| File | What it covers | Time |
|---|---|---|
| [SMOKE.md](SMOKE.md) | Golden path with two browser windows — real-time, drag-and-drop, permissions, markdown | ~30 min |
| [INTEGRATIONS.md](INTEGRATIONS.md) | PATs, App Registrations, Webhooks end-to-end with curl and webhook.site | ~15 min |

---

## Gaps in automated coverage

These areas have no integration tests yet and rely on the manual smoke test:

- Announcements (CRUD, markdown, comments, pin restriction)
- Team chat / messages
- Webhooks (delivery, retries, signature)
- Team invites (open link, email invite, accept flow)
- Access requests
- Real-time updates (two-client WebSocket behavior)
