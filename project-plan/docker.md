# Docker & Deployment

← [Back to README](README.md)

---

## Deployment Model

One Docker Compose stack per company. Each company gets:
- Their own frontend container (nginx serving the React build)
- Their own backend container (Fastify API)
- Their own PostgreSQL container with a named volume

This means complete data isolation between companies, trivial per-company backup, and no multi-tenant complexity in the application code. A single PostgreSQL instance can comfortably serve a company of 50,000 people — the limiting factor is the hardware it runs on, not the schema.

---

## docker-compose.yml

```yaml
services:
  frontend:
    build: ./frontend
    restart: unless-stopped
    ports:
      - "${FRONTEND_PORT:-3000}:80"
    depends_on:
      - backend

  backend:
    build: ./backend
    restart: unless-stopped
    ports:
      - "${BACKEND_PORT:-3001}:3001"
    environment:
      DATABASE_URL: postgres://${DB_USER}:${DB_PASSWORD}@db:5432/${DB_NAME}
      JWT_SECRET: ${JWT_SECRET}
      NODE_ENV: production
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d ${DB_NAME}"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

---

## .env (per company)

Each company's stack has its own `.env` file in its directory:

```env
DB_NAME=acme_pm
DB_USER=acme
DB_PASSWORD=change_me_before_deploy
JWT_SECRET=change_me_long_random_string
FRONTEND_PORT=3000
BACKEND_PORT=3001
```

Keep `.env` out of version control (`.gitignore` it). Provide a `.env.example` with placeholder values.

---

## Directory Layout (per company)

```
/opt/pm/acme/
├── docker-compose.yml   # symlink or copy of the standard compose file
├── .env                 # company-specific secrets
└── backups/             # optional: pg_dump output
```

For multiple companies on the same host, use different `FRONTEND_PORT` and `BACKEND_PORT` values per company, and put a reverse proxy (nginx or Caddy) in front to route by subdomain:

```
acme.yourpm.internal      → localhost:3000
globocorp.yourpm.internal → localhost:3100
```

---

## Dockerfiles

### frontend/Dockerfile

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

### frontend/nginx.conf

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback — all routes serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API calls to backend
    location /api/ {
        proxy_pass http://backend:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

This nginx config means the frontend and backend are served from the same origin, avoiding CORS complexity entirely.

### backend/Dockerfile

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY prisma ./prisma
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
```

The `CMD` runs database migrations before starting the server on every container start. `prisma migrate deploy` is idempotent — it only applies pending migrations.

---

## Common Operations

### Start

```bash
docker compose up -d
```

### Stop

```bash
docker compose down
```

### Upgrade (pull new version)

```bash
git pull
docker compose build
docker compose up -d
```

Database migrations run automatically on startup. No manual migration step needed.

### Backup database

```bash
docker compose exec db pg_dump -U $DB_USER $DB_NAME > backups/$(date +%Y%m%d_%H%M%S).sql
```

### Restore database

```bash
docker compose exec -T db psql -U $DB_USER $DB_NAME < backups/20250101_120000.sql
```

### View logs

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

---

## Scaling Considerations

For a single company the single-host compose stack is sufficient for a very long time. When horizontal scaling becomes necessary:

- Move PostgreSQL to a managed service (e.g. self-hosted Patroni cluster, or RDS if cloud is acceptable)
- Run multiple backend replicas behind a load balancer
- The frontend is stateless and trivially scalable

This is a future concern — do not optimise for it prematurely.

See [Tech Stack](tech-stack.md) for application architecture details and [Build Phases](build-phases.md) for implementation order.
