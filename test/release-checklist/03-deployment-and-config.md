# 03 — Deployment & Configuration

← [Back to index](README.md)

---

## Fresh install flow

- [ ] `cp .env.example .env` and fill in three required secrets
- [ ] `docker compose up --build` completes without errors
- [ ] All three containers are running: `docker compose ps` shows `db`, `backend`, `frontend` all healthy
- [ ] `GET /api/health` returns `{ "ok": true }` within 30 seconds of start
- [ ] `GET /api/health/ready` returns 200 (database connected)
- [ ] `http://localhost` shows the login page
- [ ] Backend logs show startup message and no error stack traces

---

## ADMIN_EMAIL bootstrap

- [ ] Set `ADMIN_EMAIL=test@example.com` in `.env` before first start
- [ ] On first start, backend logs show `[admin] Created founding admin: test@example.com` (or similar)
- [ ] Register with that email → shield button 🛡 appears
- [ ] Register with a different email → no shield button
- [ ] Set `ADMIN_EMAIL` to an **already-registered** non-admin email, restart → that user gains admin
- [ ] After restart, removing `ADMIN_EMAIL` from `.env` does NOT revoke the admin flag

---

## Required environment variables

Test that missing each required variable causes a clear startup error:

- [ ] `DB_PASSWORD` missing → backend exits with clear error, not a cryptic DB connection crash
- [ ] `JWT_SECRET` missing → backend exits with clear error
- [ ] `ENCRYPTION_KEY` missing → backend exits with clear error
- [ ] `JWT_SECRET` shorter than 32 chars → backend rejects it at startup
- [ ] `ENCRYPTION_KEY` wrong length (not 64 hex chars) → backend rejects it

---

## COOKIE_SECURE behaviour

- [ ] With `COOKIE_SECURE=false` in `.env`: login works over HTTP, cookies are set without `Secure` flag
- [ ] Without `COOKIE_SECURE` (defaults to `true`): on HTTP login works but cookies have `Secure` flag (browser may block on HTTP — confirm behaviour is documented)

---

## TRUSTED_PROXY_DEPTH

- [ ] Default (`1`) — real IP is read from `X-Forwarded-For` (first hop)
- [ ] Confirm IP restriction features use the correct real IP (see [23-security.md](23-security.md))

---

## Health endpoints

```bash
# Basic health
curl -s $BASE/api/health | jq .
# Expected: { "ok": true }

# Readiness (checks DB)
curl -s $BASE/api/health/ready | jq .
# Expected: 200 with DB status
```

- [ ] `GET /api/health` returns 200 with `{ "ok": true }`
- [ ] `GET /api/health/ready` returns 200 when DB is connected
- [ ] Stop the DB container: `GET /api/health/ready` returns non-200

---

## Metrics endpoint

```bash
# Without METRICS_SECRET set — should be open
curl -s $BASE/api/metrics

# With METRICS_SECRET=secret123 set
curl -s -H "X-Metrics-Secret: secret123" $BASE/api/metrics
curl -s $BASE/api/metrics   # should return 401 or 403
```

- [ ] Without `METRICS_SECRET`: metrics are returned publicly — **confirm this is acceptable or add note to docs**
- [ ] With `METRICS_SECRET` set: requests without the header are rejected
- [ ] With `METRICS_SECRET` set: requests with correct header return Prometheus-format text
- [ ] Metrics include `http_requests_total` and per-status counters

---

## Seed data endpoint

```bash
curl -s -X POST $BASE/api/seed-examples
```

- [ ] `POST /api/seed-examples` — confirm what this does and whether it should be disabled in production
- [ ] If it should be disabled: add env guard or remove the route in production builds

---

## Docker build

- [ ] `docker compose build --no-cache` completes without error
- [ ] Image size is reasonable (document expected size)
- [ ] `docker compose up -d --force-recreate` picks up the new image (not the old one)
- [ ] `docker restart backend` does NOT pick up a new image (confirm `--force-recreate` is required, as documented)

---

## Logging

- [ ] Backend logs are JSON format by default (Pino)
- [ ] Setting `LOG_FORMAT=pretty` produces human-readable colourised output
- [ ] Log rotation limits are applied (check `docker compose logs --tail=100 backend`)
- [ ] No secrets appear in logs (passwords, tokens, encryption keys)

---

## Data persistence

- [ ] Restart the stack: `docker compose restart`; log in — all data preserved
- [ ] Stop and start (not restart): `docker compose down && docker compose up -d` — all data preserved
- [ ] `docker compose down -v` destroys the **database** (`db_data` named volume) — **confirm this is documented as destructive**
- [ ] Uploaded files survive `docker compose down -v` because they live in `./data/uploads/` on the host (bind mount, not a named volume)
- [ ] `./data/uploads/` directory exists on the host before first start (created by `mkdir -p data/uploads` or automatically by Docker when bind-mounted)
- [ ] S3 mode: set `AWS_S3_BUCKET` in `.env` → restart → upload a file → confirm it appears in the S3/Scaleway bucket, not in `./data/uploads/`

---

## Upgrades

- [ ] `git pull` + `build --no-cache` + `up --force-recreate` produces a working updated app
- [ ] After upgrade, existing sessions still work (no forced re-login)
- [ ] After upgrade, existing data (tasks, projects) is intact

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
