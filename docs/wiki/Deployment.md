# Deployment

---

## Development (local)

Use `docker-compose.yml`. This starts the stack on HTTP with all services on a single machine.

```bash
# First time
cp .env.example .env
# Edit .env: set DB_PASSWORD, JWT_SECRET, ENCRYPTION_KEY at minimum

docker compose up --build
# Open http://localhost
```

After the first build, omit `--build` for faster starts:

```bash
docker compose up
```

The backend auto-applies Prisma migrations on startup — no manual `migrate deploy` needed.

---

## Production

Use `docker-compose.prod.yml`. This adds:

- **Traefik** as a reverse proxy, automatically obtaining and renewing TLS certificates from Let's Encrypt
- **No exposed backend port** — the backend is reachable only via the Docker internal network
- **Automated hourly backups** — PostgreSQL dump + uploads archive written to `./backups` (or `BACKUP_DIR`)

### Requirements

- A server with Docker and Docker Compose v2
- A domain name with an A record pointing to the server's IP
- Ports **80** and **443** open and reachable from the internet (Traefik needs port 80 for the ACME HTTP challenge)

### Initial setup

```bash
# .env additions for production
DOMAIN=planly.yourdomain.com
ACME_EMAIL=you@yourdomain.com
ADMIN_EMAIL=you@yourdomain.com
```

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Check Traefik issued a certificate (may take 30–60 seconds on first start):
```bash
docker compose -f docker-compose.prod.yml logs traefik
```

---

## Upgrading

Planly uses a rolling upgrade pattern — pull new images and recreate. Always rebuild from scratch to avoid stale layer caches.

```bash
git pull

# Development
docker compose up --build --no-cache --force-recreate -d

# Production
docker compose -f docker-compose.prod.yml up --build --no-cache --force-recreate -d
```

> **Important:** `docker compose restart` only restarts existing containers — it does **not** apply updated images. Always use `--force-recreate` when deploying new code.

Database migrations run automatically on backend startup (`prisma migrate deploy`). Migrations are append-only — there is no built-in rollback command.

### Rolling back a migration

Prisma does not support automatic rollbacks. The safest recovery path is **always a forward migration** (write a new migration that undoes the change). If you must roll back manually:

1. **Reverse the schema change with SQL** — connect to Postgres and undo the DDL:
   ```sql
   -- Example: undo an ADD COLUMN
   ALTER TABLE "Task" DROP COLUMN IF EXISTS "githubUrl";
   ```

2. **Mark the migration as rolled back** so Prisma no longer considers it applied:
   ```sh
   npx prisma migrate resolve --rolled-back <migration_name>
   # e.g.: npx prisma migrate resolve --rolled-back 20260708120000_add_github_url
   ```

3. **Remove or revert the migration file** from `prisma/migrations/` to prevent it from being re-applied on the next startup.

> **Note:** The safest approach in production is always to write a new forward migration that reverses the unwanted change. Rollbacks require manual SQL and careful coordination with code deployments.

---

## Backups

The production compose file includes an automated backup service that runs every hour.

### What gets backed up

- **PostgreSQL dump** — full `pg_dump` compressed with gzip
- **Uploads** — `/data/uploads` tarball (file attachments)

### Where backups go

```
./backups/planly/<YYYYMMDD_HHMMSS>/db.sql.gz
./backups/planly/<YYYYMMDD_HHMMSS>/uploads.tar.gz
```

Backups older than 30 days are automatically pruned.

### Manual backup

```bash
# Database
docker exec <db-container-name> pg_dump -U planly planly | gzip > backup.sql.gz

# Uploads
docker cp <backend-container-name>:/data/uploads ./uploads-backup
```

### Restore

```bash
# Database
gunzip -c backup.sql.gz | docker exec -i <db-container-name> psql -U planly planly

# Uploads
docker cp ./uploads-backup <backend-container-name>:/data/uploads
```

---

## Monitoring

### Health check

```bash
curl https://planly.yourdomain.com/api/health
# { "ok": true, "db": "connected", "uptime": 12345 }
```

A `5xx` or `db: disconnected` response means the backend or database is down.

### Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Backend only
docker compose -f docker-compose.prod.yml logs -f backend

# Tail last 100 lines
docker compose -f docker-compose.prod.yml logs --tail=100 backend
```

Log rotation is configured in the compose files (50 MB / 5 files for the backend).

---

## Data Persistence

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

## Reverse Proxy Notes

If you run Planly behind your own reverse proxy (Nginx, Caddy, etc.) instead of Traefik:

1. Proxy all traffic to the frontend container on port 80.
2. Proxy `/api/*` and `/docs/*` to the backend on port 3000 (internal network only).
3. Pass `X-Forwarded-For` and `X-Forwarded-Proto` headers.
4. Set `TRUSTED_PROXY_DEPTH` in `.env` to match the number of proxy hops (default `1`).
5. Set `COOKIE_SECURE=true` (the default) if the proxy terminates TLS.
