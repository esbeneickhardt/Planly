# Operations

Day-to-day ops reference for running a Planly instance in production. Covers incident response, deploying updates, scaling, and emergency procedures.

---

## Contents

- [First steps for any incident](#first-steps-for-any-incident)
- [Alert playbooks](#alert-playbooks)
- [Deploying an update](#deploying-an-update)
- [Horizontal scaling](#horizontal-scaling)
- [Backup and restore](#backup-and-restore)
- [Rolling back a migration](#rolling-back-a-migration)
- [Checking audit logs](#checking-audit-logs)
- [Monitoring (Prometheus)](#monitoring-prometheus)
- [Emergency admin password reset](#emergency-admin-password-reset)
- [Data persistence](#data-persistence)
- [Key rotation](#key-rotation)

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

## Alert playbooks

### PlanlyDown - backend not responding

**Symptom:** `/api/health/ready` returns nothing or a connection error.

1. `docker compose ps` - is the `backend` container running?
2. If not: `docker compose logs backend --tail 100` - look for the exit reason (OOM, fatal error, env validation failure).
3. If OOM-killed (exit code 137): the container exceeded its memory limit. Check `docker stats`; increase memory or reduce concurrent connections.
4. If env validation error: check that `.env` has all required variables (`JWT_SECRET`, `ENCRYPTION_KEY`, `DB_PASSWORD`).
5. Restart: `docker compose build --no-cache backend && docker compose up -d --force-recreate backend`.

### PlanlyUnexpectedRestart - uptime under 2 minutes

**Symptom:** Backend keeps restarting in a loop.

1. `docker compose logs backend --since 10m` - look for "FATAL" lines.
2. `docker compose logs db` - is PostgreSQL healthy? Check for out-of-disk or auth failures.
3. If the DB is unreachable: `docker compose restart db`, wait 30 seconds.
4. If the error repeats after a recent deploy: roll back the image (`git revert` + rebuild).

### HighServerErrorRate - 5xx rate above 5%

1. `docker compose logs backend --since 30m | grep '"level":"error"'`
2. Errors mentioning the database: check `docker compose logs db` for replication lag or connection refusals.
3. Errors mentioning encryption: the `ENCRYPTION_KEY` may have changed. **Never change `ENCRYPTION_KEY` after first deploy** - it makes all encrypted rows unreadable.
4. 502s from the frontend: Nginx is up but backend is down - see PlanlyDown above.

### HighWebSocketConnections / WebSocketConnectionsNearLimit

WebSocket rooms are held in memory per backend process. A single process handles ~3,000 concurrent connections comfortably.

**Short-term:** Restart the backend to clear stale connections (real clients reconnect automatically).

**Sustained load:** Enable Redis and scale horizontally - see [Horizontal scaling](#horizontal-scaling) below.

---

## Deploying an update

```bash
# Always build fresh and recreate - docker restart does NOT apply image changes
docker compose build --no-cache backend
docker compose up -d --force-recreate backend
```

`prisma migrate deploy` runs automatically at container startup. If migrations fail the container exits with a non-zero code - check logs before declaring the deploy healthy.

**To add a new schema change during development:**
```bash
cd backend
npx prisma migrate dev --name describe_your_change
# Commits the new file under prisma/migrations/ - include it in the PR
```

---

## Horizontal scaling

For deployments exceeding ~3,000 concurrent active users:

### Prerequisites

- A load balancer that supports sticky sessions (Nginx `ip_hash`, Traefik `sticky`) - WebSocket connections from one browser must always reach the same replica.
- Redis 7+ for WebSocket pub/sub across replicas.

### Steps

1. Add `REDIS_URL=redis://redis:6379` to `.env` and uncomment the `redis` service in `docker-compose.yml`.
2. Scale the backend:
   ```bash
   docker compose up -d --scale backend=3 --no-recreate
   ```
3. Verify replicas:
   ```bash
   docker compose ps backend
   ```

**Nginx upstream example:**
```nginx
upstream planly_backend {
    ip_hash;
    server planly-backend-1:3000;
    server planly-backend-2:3000;
    server planly-backend-3:3000;
}
```

**Known limitation:** File uploads are stored in the `uploads_data` Docker volume. All replicas must share the same volume. With Swarm or Kubernetes, use a network-attached volume or set `S3_BUCKET` for S3-compatible storage.

### Connection pooling (PgBouncer)

PgBouncer is only needed when multiple backend replicas would push the total DB connection count above PostgreSQL's `max_connections` (default: 100). For a single instance or two-to-three replicas this is not needed.

To enable PgBouncer: uncomment the `pgbouncer` service in `docker-compose.yml` and follow the instructions in the comments (two connection strings are required - `DATABASE_URL` for the app and `DATABASE_DIRECT_URL` for migrations).

---

## Backup and restore

### Project data export (lightweight alternative)

For a single project rather than the whole database, an owner or co-owner can download a self-contained JSON snapshot from **Settings → Project → Export project data**, or directly via:

```
GET /api/products/:productId/export
```

The file includes the project's tasks (with subtasks and dependencies), columns, sprints, color legend, canvas snapshots, and chat messages. It's useful for point-in-time archives, migrating a single project between instances, or handing data to a project owner who doesn't have server/database access - it is not a substitute for the full database backups below, which are what you restore from in an actual incident.

### Automated backups

The `backup` service in `docker-compose.yml` (uncomment to enable) runs `pg_dump` hourly and retains 30 days of history in `BACKUP_DIR` (default: `./backups`).

### Manual backup

```bash
docker compose exec db pg_dump -U planly planly | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Restore

```bash
# 1. Stop the backend
docker compose stop backend

# 2. Drop and recreate the database
docker compose exec db psql -U planly postgres \
  -c "DROP DATABASE planly;" \
  -c "CREATE DATABASE planly OWNER planly;"

# 3. Restore from backup
gunzip -c backup_TIMESTAMP.sql.gz | docker compose exec -T db psql -U planly planly

# 4. Re-apply any migrations that postdate the backup
docker compose exec backend npx prisma migrate deploy

# 5. Start the backend
docker compose up -d --force-recreate backend
```

---

## Rolling back a migration

The safest path is always **restore from backup** (see above), then re-deploy the previous image tag.

If a point-in-time backup isn't available, a manual rollback is possible but requires coordination between code and schema:

1. Reverse the schema change with SQL:
   ```sql
   -- Example: undo an ADD COLUMN
   ALTER TABLE "Task" DROP COLUMN IF EXISTS "my_new_column";
   ```
2. Mark it rolled back in Prisma's history:
   ```bash
   npx prisma migrate resolve --rolled-back 20260722000000_my_migration
   ```
3. Remove the migration file from `prisma/migrations/` so it doesn't re-apply on next startup.
4. Deploy the previous image tag.

---

## Checking audit logs

Via the admin panel: Admin panel → **Audit Logs** tab.

Via the API (requires admin session or admin-scoped PAT):
```bash
curl -H "Authorization: Bearer <PAT>" https://yourdomain.com/api/admin/logs
```

Default retention is 90 days, configurable via `ADMIN_LOG_RETENTION_DAYS` in `.env`.

---

## Monitoring (Prometheus)

1. Set `METRICS_SECRET` in `.env` (`openssl rand -hex 32`).
2. Edit `monitoring/prometheus.yml` and replace `REPLACE_WITH_METRICS_SECRET` with that value.
3. Uncomment the `prometheus` service in `docker-compose.yml`.

Alert rules are in `monitoring/alerts.yml` and loaded automatically. Prometheus UI is available at `http://localhost:9090` (internal only).

**Metrics exported:**

| Metric | Description |
|---|---|
| `http_requests_total` | Cumulative request count |
| `http_requests_by_status_total{status="5xx"}` | Error rate (use with `irate()`) |
| `ws_connections_active` | Live WebSocket connections |
| `process_uptime_seconds` | Uptime since last restart |

---

## Emergency admin password reset

If the founding admin account is locked out and cannot log in:

1. Set `RECROWN_EMAIL=existing-user@example.com` in `.env`.
2. `docker compose up -d --force-recreate backend` - the backend transfers crown privileges to that user on startup.
3. Remove `RECROWN_EMAIL` from `.env` and recreate again to clear the log warning.

This is recorded in the audit log as `CROWN_TRANSFERRED` with actor `SYSTEM (RECROWN_EMAIL)`.

---

## Data persistence

| Data | Storage location | Docker volume |
|---|---|---|
| Database | PostgreSQL container | `db_data` |
| File attachments | Backend container | `uploads_data` |
| TLS certificates | Traefik container | `letsencrypt_data` |

These volumes persist across `up`/`down` cycles. To **fully reset** (destroys all data):

```bash
docker compose down -v   # WARNING: deletes all volumes
```

---

## Key rotation

Rotate `ENCRYPTION_KEY` annually or when a key-holder leaves. Run the rotation script from the repo root - it generates a new key, re-encrypts all DB secrets, updates `.env`, and restarts the backend automatically:

```bash
bash scripts/rotate-encryption-key.sh
```

The script aborts without touching `.env` if re-encryption fails, so there is no window where DB values and the active key are out of sync.

After it completes, verify SMTP still works (Admin panel → Email Settings → Send test) to confirm the re-encrypted password decrypts correctly.
