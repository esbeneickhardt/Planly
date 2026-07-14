# 02 - Deployment & Configuration

← [Back to index](README.md)

> **Note:** Basic startup checks (containers up, app reachable at `http://localhost`, login page shown, backend logs clean, founding admin account created) were all verified in [01-setup.md](01-setup.md). This section covers deployment configuration, health endpoints, and env var behaviour only.

---

## Health endpoints

> Code: [backend/src/index.ts](../../backend/src/index.ts) (`/api/health` and `/api/health/ready` route handlers)

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

## ADMIN_EMAIL bootstrap — edge cases

> Code: [backend/src/index.ts](../../backend/src/index.ts) (search for `ADMIN_EMAIL` - promotes/creates the founding admin on startup)
>
> Basic bootstrap (set `ADMIN_EMAIL`, backend log confirms creation, shield button visible) was verified in [01-setup.md](01-setup.md). Test the edge cases here:

- [ ] Set `ADMIN_EMAIL` to an **already-registered** non-admin email, restart → that user gains admin
- [ ] After restart, removing `ADMIN_EMAIL` from `.env` does NOT revoke the admin flag

---

## Required environment variables

> Code: [backend/src/config/env.ts](../../backend/src/config/env.ts) - throws on startup if any required var is missing or fails the length check

Test that missing each required variable causes a clear startup error:

- [ ] `DB_PASSWORD` missing → backend exits with clear error, not a cryptic DB connection crash
- [ ] `JWT_SECRET` missing → backend exits with clear error
- [ ] `ENCRYPTION_KEY` missing → backend exits with clear error
- [ ] `JWT_SECRET` shorter than 32 chars → backend rejects it at startup
- [ ] `ENCRYPTION_KEY` wrong length (not 64 hex chars) → backend rejects it

---

## COOKIE_SECURE behaviour

> Code: [backend/src/config/env.ts](../../backend/src/config/env.ts) (`COOKIE_SECURE`) · [backend/src/routes/auth.ts](../../backend/src/routes/auth.ts) (cookie options passed to `reply.setCookie`)

- [ ] With `COOKIE_SECURE=false` in `.env`: login works over HTTP, cookies are set without `Secure` flag
- [ ] Without `COOKIE_SECURE` (defaults to `true`): on HTTP login works but cookies have `Secure` flag (browser may block on HTTP - confirm behaviour is documented)

---

## TRUSTED_PROXY_DEPTH

> Code: [backend/src/config/env.ts](../../backend/src/config/env.ts) · [backend/src/routes/ip-restrictions.ts](../../backend/src/routes/ip-restrictions.ts) (reads real IP from X-Forwarded-For using the configured depth)

- [ ] Default (`1`) - real IP is read from `X-Forwarded-For` (first hop)
- [ ] Confirm IP restriction features use the correct real IP (see [22-security.md](22-security.md))

---

## Metrics endpoint

> Code: [backend/src/index.ts](../../backend/src/index.ts) (`/api/metrics` route, `METRICS_SECRET` check)

```bash
# Without METRICS_SECRET set - should be open
curl -s $BASE/api/metrics

# With METRICS_SECRET=secret123 set
curl -s -H "X-Metrics-Secret: secret123" $BASE/api/metrics
curl -s $BASE/api/metrics   # should return 401 or 403
```

- [ ] Without `METRICS_SECRET`: metrics are returned publicly - **confirm this is acceptable or add note to docs**
- [ ] With `METRICS_SECRET` set: requests without the header are rejected
- [ ] With `METRICS_SECRET` set: requests with correct header return Prometheus-format text
- [ ] Metrics include `http_requests_total` and per-status counters

---

## Seed data endpoint

> Code: [backend/src/routes/seed.ts](../../backend/src/routes/seed.ts) - confirm whether it has an env guard or should be disabled in production

```bash
curl -s -X POST $BASE/api/seed-examples
```

- [ ] `POST /api/seed-examples` - confirm what this does and whether it should be disabled in production
- [ ] If it should be disabled: add env guard or remove the route in production builds

---

## Docker build

> Code: [docker-compose.yml](../../docker-compose.yml) · [docker-compose.prod.yml](../../docker-compose.prod.yml)

- [ ] `docker compose build --no-cache` completes without error
- [ ] Image size is reasonable (document expected size)
- [ ] `docker compose up -d --force-recreate` picks up the new image (not the old one)
- [ ] `docker restart backend` does NOT pick up a new image (confirm `--force-recreate` is required, as documented)

---

## Logging

> Code: [backend/src/index.ts](../../backend/src/index.ts) (Pino logger config, `LOG_FORMAT` env check)

- [ ] Backend logs are JSON format by default (Pino)
- [ ] Setting `LOG_FORMAT=pretty` produces human-readable colourised output
- [ ] Log rotation limits are applied (check `docker compose logs --tail=100 backend`)
- [ ] No secrets appear in logs (passwords, tokens, encryption keys)

---

## Data persistence

> Code: [docker-compose.yml](../../docker-compose.yml) - `db_data` named volume for Postgres; `./data/uploads:/data/uploads` bind-mount for files · [backend/src/config/env.ts](../../backend/src/config/env.ts) (`AWS_S3_BUCKET` switches storage backend)

- [ ] Restart the stack: `docker compose restart`; log in - all data preserved
- [ ] Stop and start (not restart): `docker compose down && docker compose up -d` - all data preserved
- [ ] `docker compose down -v` destroys the **database** (`db_data` named volume) - **confirm this is documented as destructive**
- [ ] Uploaded files survive `docker compose down -v` because they live in `./data/uploads/` on the host (bind mount, not a named volume)
- [ ] `./data/uploads/` directory exists on the host before first start (created by `mkdir -p data/uploads` or automatically by Docker when bind-mounted)
- [ ] S3 mode: set `AWS_S3_BUCKET` in `.env` → restart → upload a file → confirm it appears in the S3/Scaleway bucket, not in `./data/uploads/`

---

## ADMIN_PASSWORD

> Code: [backend/src/index.ts](../../backend/src/index.ts) (`ensureAdminAccount` - skips random password when `ADMIN_PASSWORD` is set)

Without `ADMIN_PASSWORD` the server generates a random password and prints it to the log. With it, you set the initial password yourself.

```bash
# Add to .env before first start (fresh DB only)
ADMIN_PASSWORD=MyChosenPassword123!
```

- [ ] Set `ADMIN_PASSWORD` in `.env`, wipe DB (`docker compose down -v`), restart
- [ ] Backend log does NOT print the password banner (no auto-generated password shown)
- [ ] Log in with the email from `ADMIN_EMAIL` and the password from `ADMIN_PASSWORD` - works
- [ ] `mustChangePassword` is NOT set (no forced password-change prompt on login)
- [ ] Remove `ADMIN_PASSWORD` from `.env` after verifying (it has no effect once the account exists)

---

## FRONTEND_PORT

> Code: [docker-compose.yml](../../docker-compose.yml) (`${FRONTEND_PORT:-80}:80`)

```bash
# Add to .env
FRONTEND_PORT=8080
```

- [ ] Set `FRONTEND_PORT=8080`, restart with `--force-recreate`
- [ ] App is reachable at `http://localhost:8080` (not port 80)
- [ ] Reset to `FRONTEND_PORT=80` (or remove it) when done

---

## SECURITY_ALERT_WEBHOOK_URL

> Code: [backend/src/routes/auth.ts](../../backend/src/routes/auth.ts) (fires on account lockout) · [03-auth.md](03-auth.md) (lockout test)

Use a free request inspector like [webhook.site](https://webhook.site) to capture the payload without needing a real Slack setup.

```bash
# Add to .env
SECURITY_ALERT_WEBHOOK_URL=https://webhook.site/your-unique-id
```

- [ ] Set `SECURITY_ALERT_WEBHOOK_URL`, restart
- [ ] Trigger an account lockout (5+ failed logins on Alice's account)
- [ ] Webhook.site (or your endpoint) receives a POST with a JSON payload
- [ ] Payload contains the locked account email and IP address
- [ ] Normal login activity does NOT trigger the webhook

---

## ADMIN_LOG_RETENTION_DAYS

> Code: [backend/src/index.ts](../../backend/src/index.ts) (retention cleanup job, defaults to 90 days)

```bash
# Add to .env to shorten retention for testing
ADMIN_LOG_RETENTION_DAYS=0
```

- [ ] Set `ADMIN_LOG_RETENTION_DAYS=0`, restart
- [ ] Trigger the cleanup by restarting (job runs on startup)
- [ ] Check `GET /api/admin/logs` - all existing audit log entries are gone (0-day retention deleted everything)
- [ ] Reset to `ADMIN_LOG_RETENTION_DAYS=90` (or remove the var) when done

---

## ENCRYPTION_KEY rotation

> Code: [scripts/rotate-encryption-key.ts](../../scripts/rotate-encryption-key.ts)

Rotation re-encrypts all secrets at rest (SMTP passwords, webhook secrets, TOTP secrets) from the old key to the new key. Run this outside of Docker against the live database.

```bash
# Generate a new key
NEW_KEY=$(openssl rand -hex 32)
echo "New key: $NEW_KEY"

# Run the rotation script (replace values)
OLD_ENCRYPTION_KEY=<current-key-from-env> \
NEW_ENCRYPTION_KEY=$NEW_KEY \
DATABASE_URL=postgresql://planly:<DB_PASSWORD>@localhost:5432/planly \
npx tsx scripts/rotate-encryption-key.ts
```

- [ ] Script completes without errors
- [ ] Update `ENCRYPTION_KEY` in `.env` to the new key
- [ ] Restart the backend - no errors on startup
- [ ] Verify SMTP still works (tests that the re-encrypted password decrypts correctly)
- [ ] Verify a webhook delivery still works (tests webhook secret re-encryption)

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
