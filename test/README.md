# Testing

Planly uses a two-tier testing strategy: automated tests cover everything that can be scripted; a short manual smoke test covers what they can't.

---

## 1. Automated tests

Run these first. They cover auth, RBAC, admin, tasks, sprints, columns, API tokens, TOTP, uploads, search, rate limiting, and IP restrictions.

### Backend integration tests (vitest)

```bash
cd backend
npm test
```

Requires a running PostgreSQL. The test suite creates and tears down its own data — it does not touch the dev database. Set `TEST_DATABASE_URL` if you use a separate test DB:

```bash
TEST_DATABASE_URL=postgres://planly:dev@localhost:5432/planly_test npm test
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
