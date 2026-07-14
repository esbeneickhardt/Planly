# Deployment Guide

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- A domain with TLS configured (Let's Encrypt recommended)
- PostgreSQL 16 (managed by Docker Compose)

---

## Production vs Development

**Always use `docker-compose.prod.yml` in production.**

`docker-compose.yml` is for local development only. It exposes the backend port directly to the host, does not enforce HSTS, and uses weaker defaults. Running it in production is a security risk.

```bash
# Production start
docker compose -f docker-compose.prod.yml up -d

# Development start (local only)
docker compose up -d
```

---

## Required Environment Variables

Copy `.env.example` to `.env` and populate every value before first launch.

| Variable | Description | How to generate |
|----------|-------------|-----------------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@db:5432/planly` |
| `JWT_SECRET` | Signs session cookies | `openssl rand -hex 64` |
| `ENCRYPTION_KEY` | AES-256-GCM key for PII at rest | `openssl rand -hex 32` |
| `DOMAIN` | Your public domain (no protocol) | e.g. `planly.example.com` |
| `FRONTEND_ORIGIN` | Full origin for CORS | e.g. `https://planly.example.com` |
| `APP_URL` | Full app URL | e.g. `https://planly.example.com` |
| `SMTP_*` | Email delivery credentials | From your SMTP provider |
| `FOUNDING_ADMIN_EMAIL` | Email for the bootstrap admin account | Your email address |
| `FOUNDING_ADMIN_PASSWORD` | Initial admin password (change immediately) | Strong random password |

Optional:
| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_LOG_RETENTION_DAYS` | `365` | How long to keep admin audit logs |
| `LOG_LEVEL` | `info` | Pino log level (`trace`/`debug`/`info`/`warn`/`error`) |
| `COOKIE_SECURE` | `true` | Set to `false` only for local HTTP testing |

---

## HSTS Warning

`docker-compose.prod.yml` sets `Strict-Transport-Security` with `preload` once TLS is active. **This is permanent for browsers that cache it.** Only point your `DOMAIN` at this server after TLS is confirmed working end-to-end. Misconfiguring HSTS on a domain without valid TLS will make the site inaccessible to returning visitors.

To verify TLS before enabling HSTS, comment out the HSTS header in `frontend/nginx.conf`, deploy, confirm HTTPS works, then uncomment and redeploy.

---

## First Deploy

```bash
# 1. Clone and configure
cp .env.example .env
# Edit .env with your values

# 2. Build images (always use --no-cache for a clean build)
docker compose -f docker-compose.prod.yml build --no-cache

# 3. Start services
docker compose -f docker-compose.prod.yml up -d

# 4. Run database migrations
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy

# 5. Verify the app is running
curl -s https://<DOMAIN>/api/health
```

## Updating

```bash
git pull
docker compose -f docker-compose.prod.yml build --no-cache backend frontend
docker compose -f docker-compose.prod.yml up -d --force-recreate backend frontend
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

> **Note:** `docker restart` does not pick up new images. Always use `build --no-cache` + `up --force-recreate`.

---

## PII Migration (first deploy only)

If upgrading from a version before PII encryption was introduced, run the one-off migration script to encrypt existing `realName` and `phone` values:

```bash
docker compose -f docker-compose.prod.yml exec backend \
  npx tsx scripts/encrypt-pii-fields.ts
```

The script is idempotent - safe to run multiple times.

---

## Backups

See `plan/backup-strategy.md` for the full backup and restore procedure.

Quick reference:
```bash
# Set these in your environment or cron entry
export BACKUP_DIR=/backups/planly
export DB_CONTAINER=planly-db-1
export RETENTION_DAYS=30

./scripts/backup.sh
```

Add to cron for automated hourly backups:
```cron
0 * * * * BACKUP_DIR=/backups/planly DB_CONTAINER=planly-db-1 /path/to/planly/scripts/backup.sh >> /var/log/planly-backup.log 2>&1
```

---

## Docker Image Signing

Docker image signing with cosign (Sigstore) is not currently enforced. The container registry is private and access is restricted to deploy keys. Images are scanned by Trivy in CI for HIGH/CRITICAL vulnerabilities before push. Revisit cosign when the registry becomes multi-tenant or public.

---

*Last updated: 2026-07-06*
