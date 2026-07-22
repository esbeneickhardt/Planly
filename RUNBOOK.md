# Planly Operations Runbook

Quick reference for on-call responders. For architecture details see the README.

---

## First steps for any incident

```bash
# Is everything running?
docker compose ps

# Recent logs (replace "backend" with "db" or "frontend" as needed)
docker compose logs backend --since 30m

# Health endpoint
curl -sf http://localhost/api/health/ready && echo OK || echo UNHEALTHY
```

---

## Alert: PlanlyDown — backend not responding

**Symptoms:** `/api/health/ready` returns nothing or a connection error.

**Steps:**
1. `docker compose ps` — is the `backend` container running?
2. If not running: `docker compose logs backend --tail 100` — look for the exit reason (OOM, fatal error, env validation failure).
3. If OOM-killed (`exit code 137`): the container exceeded its memory limit. Check `docker stats`; increase memory or reduce concurrent connections.
4. If env validation error: check that `.env` has all required variables (`JWT_SECRET`, `ENCRYPTION_KEY`, `DB_PASSWORD`).
5. Restart: `docker compose up -d --force-recreate backend` (not `docker restart` — that does not apply image changes).

---

## Alert: PlanlyUnexpectedRestart — process uptime under 2 minutes

**Symptoms:** Backend keeps restarting in a loop.

**Steps:**
1. `docker compose logs backend --since 10m` — look for "FATAL" lines from env validation or DB connection errors.
2. `docker compose logs db` — is PostgreSQL healthy? Look for out-of-disk or auth failures.
3. If the DB is unreachable: `docker compose restart db` then give it 30 seconds before the backend reconnects.
4. If the error repeats after a recent deploy: roll back the image (`git revert` + rebuild with `docker compose build --no-cache backend && docker compose up -d --force-recreate backend`).

---

## Alert: HighServerErrorRate — 5xx rate above 5%

**Steps:**
1. Check logs for the specific error: `docker compose logs backend --since 30m | grep '"level":"error"'`.
2. If errors mention the database: check `docker compose logs db` for replication lag, out-of-disk, or connection refusals.
3. If errors mention encryption (`decryptValue failed`): the `ENCRYPTION_KEY` env var may have changed. Never change this after first deploy — it will make existing encrypted rows unreadable.
4. If errors are 502s from the frontend: Nginx is up but backend is down — see PlanlyDown.

---

## Alert: HighWebSocketConnections / WebSocketConnectionsNearLimit

WebSocket rooms are held in memory per backend process. A single process comfortably handles ~3,000 concurrent connections; above that, latency climbs.

**Short-term:** Restart the backend to clear stale connections (real clients reconnect automatically).

**Medium-term (if the load is sustained):**
1. Enable Redis in `.env`: add `REDIS_URL=redis://redis:6379`.
2. Uncomment the `redis` service in `docker-compose.yml`.
3. Scale the backend: `docker compose up -d --scale backend=3` (requires a load balancer in front).

---

## Deploying an update

```bash
# Always build fresh and recreate — docker restart does NOT apply image changes
docker compose build --no-cache backend
docker compose up -d --force-recreate backend
```

Prisma migrations run automatically at container startup (`prisma migrate deploy`). The container exits with a non-zero code if migrations fail — check logs before declaring the deploy healthy.

**To add a new schema change during development:**
```bash
# Edit prisma/schema.prisma, then:
cd backend
npm run db:migrate:dev -- --name describe_your_change
# This creates a new file under prisma/migrations/ — commit it with your PR.
```

**Never use `prisma db push` on a production database.** It can drop columns to match the schema.

---

## Rolling back a migration

Prisma does not support automatic down-migrations. To roll back:

1. Restore from the last backup (see § Backup and restore).
2. Deploy the previous image tag.

This is why the backup-restore workflow runs weekly — each backup is a clean recovery point.

---

## Backup and restore

**Where backups come from:** The `backup` service in `docker-compose.yml` (commented out by default) runs `pg_dump` hourly and keeps 30 days of history in `BACKUP_DIR` (default `./backups`).

**Manual backup:**
```bash
docker compose exec db pg_dump -U planly planly | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

**Restore:**
```bash
# 1. Stop the backend (DB must be accessible but app should not write during restore)
docker compose stop backend

# 2. Drop and recreate the database
docker compose exec db psql -U planly postgres \
  -c "DROP DATABASE planly;" \
  -c "CREATE DATABASE planly OWNER planly;"

# 3. Restore
gunzip -c backup_TIMESTAMP.sql.gz | docker compose exec -T db psql -U planly planly

# 4. Apply any migrations that postdate the backup
docker compose exec backend npx prisma migrate deploy

# 5. Restart
docker compose up -d --force-recreate backend
```

---

## Scaling beyond a single instance

For deployments exceeding ~3,000 concurrent active users:

1. Enable Redis (see `docker-compose.yml` comments — add `REDIS_URL` and uncomment the `redis` service). This makes WebSocket rooms work across multiple backend replicas.
2. Scale the backend: use a load balancer (Traefik, Nginx upstream, or a cloud LB) in front of multiple backend containers.
3. If DB connections become a bottleneck (check `SELECT count(*) FROM pg_stat_activity` on the DB): enable PgBouncer (see `docker-compose.yml` comments).

---

## Checking audit logs

Audit logs are available via the admin panel (Admin → Logs) or via the API:

```bash
# Requires an admin session cookie or Bearer token
curl -H "Authorization: Bearer <PAT>" https://yourdomain.com/api/admin/logs
```

Default retention is 90 days (configurable via `ADMIN_LOG_RETENTION_DAYS` in `.env`).

---

## Emergency admin password reset

If the admin account is locked out or the password is unknown:

1. Set `RECROWN_EMAIL=<existing-user-email>` in `.env`.
2. `docker compose up -d --force-recreate backend` — on startup the backend transfers crown privileges to that user.
3. Remove `RECROWN_EMAIL` from `.env` and recreate again.
