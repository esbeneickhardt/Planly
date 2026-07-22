# Deployment Guide

## Single-server (default)

```bash
cp .env.example .env
# Fill in DB_PASSWORD, JWT_SECRET, ENCRYPTION_KEY, ADMIN_EMAIL
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
```

> **Note:** Always use `build --no-cache` + `up --force-recreate` when deploying updated images.
> `docker restart` does **not** pick up a newly built image.

---

## Multi-replica (horizontal scaling)

Multiple backend replicas require a shared Redis instance for WebSocket pub/sub.
Without it, a user connected to replica A cannot receive real-time events from replica B.

### Prerequisites

- A load balancer that supports sticky sessions **or** that passes all WebSocket connections
  from one browser to the same replica (e.g. Nginx `ip_hash`, Traefik `sticky`).
- Redis 7+ (included in `docker-compose.prod.yml`).

### Steps

1. Ensure `REDIS_URL=redis://redis:6379` (or your external Redis URL) is set in `.env`.
2. Start the stack — Redis starts automatically via `docker-compose.prod.yml`.
3. Scale the backend service:

   ```bash
   docker compose -f docker-compose.prod.yml up -d --scale backend=3 --no-recreate
   ```

4. Verify replicas are running:

   ```bash
   docker compose -f docker-compose.prod.yml ps backend
   ```

### Nginx upstream config (example)

```nginx
upstream planly_backend {
    ip_hash;  # sticky sessions — same client always hits same replica
    server planly-backend-1:3000;
    server planly-backend-2:3000;
    server planly-backend-3:3000;
}
```

### Known limitations

- File uploads are stored in a Docker volume (`uploads_data`).
  All replicas must share the same volume. With Docker Swarm / Kubernetes,
  use a network-attached volume (NFS, S3 via AWS_S3_BUCKET, etc.).
- Session JWTs are signed with `JWT_SECRET` — ensure all replicas share the same secret.

---

## Monitoring

Prometheus scrapes `/api/metrics` on the backend every 15 seconds.

1. Set `METRICS_SECRET` in `.env` (generate with `openssl rand -hex 32`).
2. Edit `monitoring/prometheus.yml` and replace `REPLACE_WITH_METRICS_SECRET` with the same value.
3. Uncomment the `prometheus` service in `docker-compose.yml` (or `docker-compose.prod.yml`).
4. Start the stack — Prometheus is available at `http://localhost:9090` (localhost only).

Alert rules are in `monitoring/alerts.yml` and are loaded automatically by the `prometheus.yml` config.

### Key metrics

| Metric | What it measures |
|--------|-----------------|
| `http_requests_total` | Cumulative request count |
| `http_requests_by_status_total{status="5xx"}` | Error rate (use with `irate()`) |
| `ws_connections_active` | Live WebSocket connections |
| `process_uptime_seconds` | Backend uptime (resets on restart) |

---

## Backup

The `backup` service in `docker-compose.prod.yml` runs hourly and writes to `${BACKUP_DIR:-./backups}`.

### Restore

```bash
# Restore database
gunzip -c backups/planly/<TIMESTAMP>/db.sql.gz | docker exec -i planly-db-1 psql -U planly planly

# Restore uploads
tar -xzf backups/planly/<TIMESTAMP>/uploads.tar.gz -C ./data/uploads/
```

---

## TLS / HTTPS (Traefik + Let's Encrypt)

Set in `.env`:
```
DOMAIN=planly.yourdomain.com
ACME_EMAIL=admin@yourdomain.com
```

Traefik automatically obtains and renews certificates. The `cert-checker` service sends
a webhook alert if the certificate will expire in fewer than 14 days.

---

## Upgrading

```bash
git pull
docker compose -f docker-compose.prod.yml build --no-cache backend frontend
docker compose -f docker-compose.prod.yml up -d --force-recreate backend frontend
```

Database migrations run automatically on backend startup.
