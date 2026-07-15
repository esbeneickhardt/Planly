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

- [X] `GET /api/health` returns 200 with `{ "ok": true }`
- [X] `GET /api/health/ready` returns 200 when DB is connected
- [X] Stop the DB container: `GET /api/health/ready` returns non-200

---

## ADMIN_EMAIL bootstrap — edge cases

> Code: [backend/src/index.ts](../../backend/src/index.ts) (search for `ADMIN_EMAIL` - promotes/creates the founding admin on startup)
>
> Basic bootstrap (set `ADMIN_EMAIL`, backend log confirms creation, shield button visible) was verified in [01-setup.md](01-setup.md). Test the edge cases here:

- [X] Set `ADMIN_EMAIL` to an **already-registered** non-admin email, restart → that user gains admin
- [X] After restart, removing `ADMIN_EMAIL` from `.env` does NOT revoke the admin flag

---

## RECROWN_EMAIL — emergency crown transfer

> Code: [backend/src/index.ts](../../backend/src/index.ts) (`emergencyRecrown` - runs before `ensureAdminAccount` on every startup)
>
> Use this when the founding admin has left and will not cooperate. `ADMIN_EMAIL` on an existing user only grants `isAdmin`; it never touches `isFoundingAdmin`. `RECROWN_EMAIL` forcibly transfers the crown and writes an audit log entry.

```bash
# Add to .env — remove immediately after verifying
RECROWN_EMAIL=bob@test.local
```

- [X] Set `RECROWN_EMAIL=bob@test.local`, restart backend with `--force-recreate`
- [X] Backend logs show `EMERGENCY CROWN TRANSFER COMPLETE` banner naming Bob
- [X] Audit log (`GET /api/admin/logs`) contains a `CROWN_TRANSFERRED` entry with actor `SYSTEM (RECROWN_EMAIL)`
- [X] Log in as Bob → shield button 🛡 visible and "Transfer Ownership" option available in the admin panel
- [X] Log in as the previous founding admin → shield still visible (retains `isAdmin`) but "Transfer Ownership" is gone
- [X] Remove `RECROWN_EMAIL` from `.env`, restart → no banner, no side effects

---

## Required environment variables

> Code: [backend/src/config/env.ts](../../backend/src/config/env.ts) - throws on startup if any required var is missing or fails the length check

Test that missing each required variable causes a clear startup error:

- [X] `DB_PASSWORD` missing → backend exits with clear error, not a cryptic DB connection crash
- [X] `JWT_SECRET` missing → backend exits with clear error
- [X] `ENCRYPTION_KEY` missing → backend exits with clear error
- [X] `JWT_SECRET` shorter than 32 chars → backend rejects it at startup
- [X] `ENCRYPTION_KEY` wrong length (not 64 hex chars) → backend rejects it

---## TRUSTED_PROXY_DEPTH

> Code: [backend/src/config/env.ts](../../backend/src/config/env.ts) · [backend/src/routes/ip-restrictions.ts](../../backend/src/routes/ip-restrictions.ts) (reads real IP from X-Forwarded-For using the configured depth)

The setup is: **Browser → Nginx → Backend**. Nginx appends the real client IP to the `X-Forwarded-For` header so the backend knows who is actually connecting. `TRUSTED_PROXY_DEPTH=1` tells the backend to trust exactly one hop — reading the IP Nginx added, and ignoring anything the client themselves put in that header (which would otherwise allow anyone to spoof their IP and bypass blocklists).

**Set up shell variables first** (needed for all curl tests in this file):
1. Log in as Admin in the browser
2. Open DevTools → Application tab → Cookies → `http://localhost`
3. Set in your terminal:
```bash
TOKEN=<token cookie value>
CSRF=<csrf cookie value>
```

**Test 1 — real IP is read, not Nginx's internal Docker IP**

```bash
curl -s http://localhost/api/admin/ip-restrictions \
  -H "Cookie: token=$TOKEN" | jq .yourIp
```

Pass: returns `172.18.0.1` (the Docker bridge gateway — your host machine as seen through Docker). It must NOT be a container-internal address like `172.18.0.2` or `172.18.0.3`, which would mean Nginx's own IP is leaking. In production with real internet traffic this would be the user's actual public IP.

You can also just open **Admin → IP Rules** in the browser — the "Your current IP" chip shows the same value without needing curl.

**Test 2 — spoofing attempt via a fake header is ignored**

```bash
curl -s http://localhost/api/admin/ip-restrictions \
  -H "X-Forwarded-For: 1.2.3.4" \
  -H "Cookie: token=$TOKEN" | jq .yourIp
```

Pass: still returns your real IP, **not** `1.2.3.4`. If it returned `1.2.3.4`, the depth would be misconfigured and anyone could bypass IP blocklists by faking the header.

- [X] Test 1 passes — `yourIp` is `172.18.0.1` (the Docker bridge gateway, i.e. your host machine as seen through Docker). In production this would be the user's real public IP. It must NOT be a container-internal address like `172.18.0.2`/`.3` (which would mean Nginx's own IP is leaking through)
- [X] Test 2 passes — `yourIp` is unchanged even with a fake `X-Forwarded-For: 1.2.3.4` header (spoofing attempt correctly ignored)


## COOKIE_SECURE behaviour

> Code: [backend/src/config/env.ts](../../backend/src/config/env.ts) (`COOKIE_SECURE`) · [backend/src/routes/auth.ts](../../backend/src/routes/auth.ts) (cookie options passed to `reply.setCookie`)

- [X] With `COOKIE_SECURE=false` in `.env`: login works over HTTP, cookies are set without `Secure` flag
- [X] Without `COOKIE_SECURE` (defaults to `true`): on HTTP login works but cookies have `Secure` flag (browser may block on HTTP - confirm behaviour is documented)

---


---

## Metrics endpoint

> Code: [backend/src/index.ts](../../backend/src/index.ts) (`/api/metrics` route, `METRICS_SECRET` check)

```bash
# Add to .env
METRICS_SECRET=secret123
```

```bash
# With METRICS_SECRET set: correct header returns metrics
curl -s -H "X-Metrics-Secret: secret123" $BASE/api/metrics

# Missing or wrong secret → 401
curl -s $BASE/api/metrics
curl -s -H "X-Metrics-Secret: wrongvalue" $BASE/api/metrics

# With METRICS_SECRET unset: endpoint is still closed (401 for everyone)
curl -s $BASE/api/metrics   # 401
```

- [X] With `METRICS_SECRET` set and correct header: Prometheus-format text returned
- [X] With `METRICS_SECRET` set and missing/wrong header: 401 Unauthorized
- [X] With `METRICS_SECRET` unset in `.env`: endpoint returns 401 (closed by default)
- [X] Metrics include `http_requests_total` and per-status counters

---

## Seed data endpoint

> Code: [backend/src/routes/seed.ts](../../backend/src/routes/seed.ts) - admin-only endpoint that populates a fresh instance with three demo projects (Podcast Launch, IRB PD Model, Build a Rocket) including tasks, subtasks, dependencies, and milestones. Useful for demoing the app to new users.

```bash
# Mutating requests (POST/PUT/DELETE) require both cookies + the CSRF header — see setup above.
curl -s -X POST $BASE/api/seed-examples \
  -H "Cookie: token=$TOKEN; csrf=$CSRF" \
  -H "X-CSRF-Token: $CSRF"
# Expected: { "ok": true, "products": ["<id>", "<id>", "<id>"] }
```

- [X] Calling without auth returns 401 (route is protected by `requireAdmin`)
- [X] Calling as admin creates the three demo projects and they appear in the UI

---

## Data persistence

> Code: [docker-compose.yml](../../docker-compose.yml) - `db_data` named volume for Postgres; `uploads_data` named volume for files

- [X] Upload a file, restart the stack (`docker compose down && docker compose up -d`) — file still accessible
- [X] `docker compose down -v` destroys **both** database and uploaded files (`-v` wipes all named volumes) — accepted; this is standard Docker named-volume behaviour, not Planly-specific logic. Documented in [docs/wiki/Deployment.md](../../docs/wiki/Deployment.md)

---

## ADMIN_PASSWORD

> Code: [backend/src/index.ts](../../backend/src/index.ts) (`ensureAdminAccount` - skips random password when `ADMIN_PASSWORD` is set)

Without `ADMIN_PASSWORD` the server generates a random password and prints it to the log. With it, you set the initial password yourself.

```bash
# Add to .env before first start (fresh DB only)
ADMIN_PASSWORD=MyChosenPassword123!
```

- [X] Set `ADMIN_PASSWORD` in `.env`, wipe DB (`docker compose down -v`), restart
- [X] Backend log does NOT print the password banner (no auto-generated password shown)
- [X] Log in with the email from `ADMIN_EMAIL` and the password from `ADMIN_PASSWORD` - works
- [X] `mustChangePassword` is NOT set (no forced password-change prompt on login)
- [X] Remove `ADMIN_PASSWORD` from `.env` after verifying (it has no effect once the account exists)

---

## FRONTEND_PORT

> Code: [docker-compose.yml](../../docker-compose.yml) (`${FRONTEND_PORT:-80}:80`)

```bash
# Add to .env
FRONTEND_PORT=8080
```

- [X] Set `FRONTEND_PORT=8080`, restart with `--force-recreate`
- [X] App is reachable at `http://localhost:8080` (not port 80)
- [X] Reset to `FRONTEND_PORT=80` (or remove it) when done

---

## SECURITY_ALERT_WEBHOOK_URL

> Code: [backend/src/routes/auth.ts](../../backend/src/routes/auth.ts) (fires on account lockout) · [03-auth.md](03-auth.md) (lockout test)

Use a free request inspector like [webhook.site](https://webhook.site) to capture the payload without needing a real Slack setup.

```bash
# Add to .env
SECURITY_ALERT_WEBHOOK_URL=https://webhook.site/your-unique-id
```

- [X] Set `SECURITY_ALERT_WEBHOOK_URL`, restart
- [X] Trigger an account lockout (5+ failed logins on Bob's account)
- [X] Webhook.site receives a POST with a JSON payload
- [X] Payload contains the locked account username, lockout duration, and timestamp
- [X] Normal login activity does NOT trigger the webhook

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
- [ ] `docker restart backend` does NOT apply a new image — `--force-recreate` is always required (see [Deployment wiki](../../docs/wiki/Deployment.md))

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
