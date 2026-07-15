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

The backend auto-applies schema changes on startup via `prisma db push` - no manual steps needed.

---

## Production

Use `docker-compose.prod.yml`. This adds:

- **Traefik** as a reverse proxy, automatically obtaining and renewing TLS certificates from Let's Encrypt
- **No exposed backend port** - the backend is reachable only via the Docker internal network
- **Automated hourly backups** - PostgreSQL dump + uploads archive written to `./backups` (or `BACKUP_DIR`)

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

## Secrets Management in Production

The `.env` file is a local development convenience. In production there are better approaches depending on your setup.

### Option 1 - .env file on the server (simplest)

Keep a `.env` at `/srv/planly/.env` on the server - never in the repository, never in backups alongside the database. Docker Compose picks it up automatically when you run from the same directory.

```bash
# Restrict permissions so only root can read it
chmod 600 /srv/planly/.env
```

This is the right choice for a single server with a single operator.

### Option 2 - Shell environment / CI/CD injection

Docker Compose reads `${VAR}` from the shell environment as well as from `.env`. Your CI/CD pipeline (GitHub Actions, GitLab CI, etc.) can inject secrets at deploy time without any file on disk:

```bash
# GitHub Actions example (secrets set in repo settings)
DB_PASSWORD=${{ secrets.DB_PASSWORD }} \
JWT_SECRET=${{ secrets.JWT_SECRET }} \
ENCRYPTION_KEY=${{ secrets.ENCRYPTION_KEY }} \
ADMIN_EMAIL=${{ secrets.ADMIN_EMAIL }} \
docker compose -f docker-compose.prod.yml up --build --force-recreate -d
```

### Option 3 - Secrets manager injection (recommended for teams)

Tools like [Doppler](https://doppler.com), HashiCorp Vault, AWS Secrets Manager, or 1Password Secrets Automation inject secrets as environment variables at runtime - nothing is stored on disk. Docker Compose receives them transparently:

**Doppler:**
```bash
# Install Doppler CLI, authenticate, link to your project
doppler run -- docker compose -f docker-compose.prod.yml up --build --force-recreate -d
```

**HashiCorp Vault (via envconsul):**
```bash
envconsul -config=vault.hcl docker compose -f docker-compose.prod.yml up -d
```

**AWS Secrets Manager (via aws-secrets-manager-env):**
```bash
aws-env --secret planly/prod -- docker compose -f docker-compose.prod.yml up -d
```

This approach means secrets are never on disk, are audited centrally, and can be rotated without touching the server.

### What to never do

- Never commit `.env` to the repository (it is gitignored by default)
- Never put plaintext secrets in `docker-compose.yml` or `docker-compose.prod.yml`
- Never store `ENCRYPTION_KEY` in the same place as the database backup - if both are compromised together, encrypted fields are exposed

---

## Upgrading

Planly uses a rolling upgrade pattern - pull new images and recreate. Always rebuild from scratch to avoid stale layer caches.

```bash
git pull

# Development
docker compose build --no-cache && docker compose up --force-recreate -d

# Production
docker compose -f docker-compose.prod.yml build --no-cache && docker compose -f docker-compose.prod.yml up --force-recreate -d
```

> **Important:** `docker compose restart` only restarts existing containers - it does **not** apply updated images. Always use `--force-recreate` when deploying new code.

Schema changes are applied automatically on backend startup via `prisma db push`.

### Rolling back a migration

Prisma does not support automatic rollbacks. The safest recovery path is **always a forward migration** (write a new migration that undoes the change). If you must roll back manually:

1. **Reverse the schema change with SQL** - connect to Postgres and undo the DDL:
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

- **PostgreSQL dump** - full `pg_dump` compressed with gzip
- **Uploads** - `/data/uploads` tarball (file attachments)

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
5. If the proxy terminates TLS (HTTPS) and forwards plain HTTP to the backend, set `COOKIE_SECURE=false` — the backend only sees HTTP so the `Secure` cookie flag would cause instant logouts. If the backend itself serves HTTPS, keep the default `COOKIE_SECURE=true`.
