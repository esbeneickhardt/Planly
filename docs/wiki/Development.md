# Development

## Contents

- [Local Setup (without Docker)](#local-setup-without-docker)
- [Architecture Overview](#architecture-overview)
- [Migrations](#migrations)
- [Adding a New Route](#adding-a-new-route)
- [Adding a New Frontend Page](#adding-a-new-frontend-page)
- [Real-time Events](#real-time-events)
- [TypeScript](#typescript)
- [Importing from Trello](#importing-from-trello)
- [Contributing](#contributing)

---

## Local Setup (without Docker)

For fast iteration during development you can run the backend and frontend outside of Docker.

### Prerequisites

- Node.js 22+
- PostgreSQL 16 (local or via Docker)
- `pnpm`, `npm`, or `yarn`

### Start PostgreSQL in Docker (easiest)

```bash
docker run -d \
  --name planly-postgres \
  -e POSTGRES_USER=planly \
  -e POSTGRES_PASSWORD=dev \
  -e POSTGRES_DB=planly \
  -p 5432:5432 \
  postgres:16-alpine
```

### Backend

```bash
cd backend

# Install dependencies
npm install

# Create a .env in the backend directory (or set env vars inline)
cat > .env <<EOF
DATABASE_URL=postgresql://planly:dev@localhost:5432/planly
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
FRONTEND_ORIGIN=http://localhost:5173
COOKIE_SECURE=false
EOF

# Apply database migrations and generate the Prisma client
npx prisma migrate dev

# Start the dev server (hot-reload via tsx watch)
npm run dev
# Backend listens on http://localhost:3000
```

### Frontend

```bash
cd frontend

npm install
npm run dev
# Frontend dev server listens on http://localhost:5173
# API requests to /api/* are proxied to localhost:3000
```

### Running tests

**`npm test`** (`cd backend && npm test`) always runs `run-tests.sh`, which requires Docker and a running Postgres - there is no database-free path. The script builds a test image from the Alpine `builder` stage of `backend/Dockerfile` (the Prisma engine binary targets Alpine/musl, so tests must run in that container, not on the host), creates a `planly_test` database on the `db` service if it doesn't already exist, applies migrations, and then runs the full `vitest run` suite inside the container:

```bash
cd backend && npm test
# equivalent to: sh ../run-tests.sh
```

This requires the `db` service from `docker compose` to already be up (`docker compose up -d db` is enough - the backend/frontend containers don't need to be running) and a `DB_PASSWORD` set in `.env`, since `run-tests.sh` reads it to build the test connection string.

There's no separate "unit-only" script or config - `vitest.config.ts` has a single `include: ['src/**/*.test.ts']` pattern covering the whole suite, with no DB-free subset carved out, so `npm test` is the only documented way to run the backend tests.

**E2E tests** (Playwright against the full Docker stack):
```bash
docker compose up -d      # stack must be running
./run-e2e.sh              # creates a temporary admin, runs the suite, cleans up
```

**Manual testing** - for flows that can't be automated (drag-and-drop, real-time, TOTP with a real device):

- Smoke test (~30 min) - golden path with two browser windows
- Integrations test (~15 min) - PATs, App Registrations, Webhooks, GitHub, iCal, TOTP via `curl`

---

## Architecture Overview

```
planly/
├── backend/                  Fastify 5 API server
│   ├── prisma/
│   │   └── schema.prisma     Database schema
│   ├── src/
│   │   ├── config/           Environment variable validation and typed config
│   │   ├── db/               Prisma client singleton
│   │   ├── docs/             OpenAPI spec generation
│   │   ├── middleware/        Auth (requireAuth, requireAdmin) and CSRF hook
│   │   ├── realtime/         WebSocket room manager and ticket store
│   │   ├── routes/           One file per feature area
│   │   ├── schemas/          Zod validation schemas shared across routes
│   │   ├── utils/            Shared utilities (crypto, email, audit, webhooks, …)
│   │   └── index.ts          App bootstrap, plugin registration, startup tasks
│   └── tsconfig.json
│
├── frontend/                 React 18 + Vite + TailwindCSS SPA
│   ├── public/               Static assets (backgrounds, icons)
│   └── src/
│       ├── api/              Typed fetch wrapper and all API call functions
│       ├── components/       Reusable UI components
│       ├── hooks/            Custom React hooks (useAuth, useTasks, useWebSocket, …)
│       ├── pages/            One component per route
│       ├── types/            TypeScript interfaces shared across the frontend
│       └── utils/            Frontend helpers
│
├── docs/wiki/                This documentation
├── docker-compose.yml        Development stack
├── docker-compose.prod.yml   Production stack (Traefik + TLS + backup)
├── .env.example              Environment variable template
└── LICENSE
```

### Request lifecycle

1. Browser → Nginx → Fastify
2. `onRequest` hook: assign/sanitize `X-Request-Id`, reject malformed `Content-Type`
3. `preHandler` hook: CSRF check, IP restriction check
4. Route `preHandler`: `requireAuth` or `requireAdmin` (JWT/PAT validation + email verification)
5. Route handler: Zod validation → business logic → Prisma queries → response
6. `onSend` hook: attach `X-Request-Id` and CSP headers to response

### Database schema conventions

- UUIDs for all primary keys (Prisma `@default(uuid())`)
- `createdAt DateTime @default(now())` on every model
- `updatedAt DateTime @updatedAt` where relevant
- Soft deletes use `deletedAt DateTime?` (filtered out in queries with `where: { deletedAt: null }`)
- Encrypted string fields store `ivHex:authTagHex:ciphertextHex`

---

## Migrations

Planly uses Prisma Migrate. Migration files live in `prisma/migrations/` and must be committed alongside schema changes.

```bash
cd backend

# Create a new migration after editing schema.prisma (dev only - applies immediately)
npx prisma migrate dev --name add-my-feature

# Apply pending migrations without creating new ones (what the backend runs on startup)
npx prisma migrate deploy

# Regenerate the Prisma client after schema changes (needed locally; CI/Docker do this automatically)
npx prisma generate

# Open Prisma Studio (GUI database browser)
npx prisma studio
```

> **Never use `prisma db push` on a real database.** It can silently drop columns to match the schema. `db push` is only appropriate for throwaway test databases where data loss is acceptable.

---

## Adding a New Route

1. Create `backend/src/routes/my-feature.ts`:

```typescript
/**
 * My feature routes - brief description of what this covers.
 */
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../db/client';
import { requireAuth } from '../middleware/auth';
import { validate } from '../utils/validate';

const createSchema = z.object({
  name: z.string().min(1).max(200),
});

export async function myFeatureRoutes(app: FastifyInstance) {
  app.get('/api/my-feature', { preHandler: requireAuth }, async (req, reply) => {
    const rows = await prisma.myModel.findMany({ where: { userId: req.user.userId } });
    reply.send(rows);
  });

  app.post('/api/my-feature', { preHandler: requireAuth }, async (req, reply) => {
    const body = validate(createSchema, req.body, reply);
    if (!body) return;
    const row = await prisma.myModel.create({ data: { ...body, userId: req.user.userId } });
    reply.status(201).send(row);
  });
}
```

2. Import and register in `backend/src/index.ts`:

```typescript
import { myFeatureRoutes } from './routes/my-feature';
// ...
await app.register(myFeatureRoutes);
```

3. Add the Prisma model to `prisma/schema.prisma` and run `npx prisma migrate dev`.

---

## Adding a New Frontend Page

1. Create `frontend/src/pages/MyPage.tsx`
2. Add a route in `frontend/src/App.tsx` (or wherever the router is configured)
3. Add API calls to the relevant file under `frontend/src/api/domains/` (or create a new one) using the typed `request<T>()`/`json()` helpers from `frontend/src/api/httpClient.ts`

---

## Real-time Events

The WebSocket manager (`backend/src/realtime/manager.ts`) broadcasts events to all connected clients in a product room.

To broadcast from a route:

```typescript
import { broadcastToProduct } from '../realtime/manager';

// After creating/updating a task:
broadcastToProduct(productId, {
  event: 'task:created',
  data: { task },
});
```

The frontend subscribes in `useWebSocket` and dispatches events to React state.

---

## TypeScript

Both backend and frontend are fully typed. Run type checking:

```bash
# Backend
cd backend && npx tsc --noEmit

# Frontend
cd frontend && npx tsc --noEmit
```

The CI should never merge code that doesn't pass both checks.

---

## Importing from Trello

`scripts/import-trello.py` migrates a Trello board export into a new Planly project:

```bash
python3 scripts/import-trello.py <trello-export.json>
```

It reads a Trello board's JSON export (in Trello: **Menu → Print, export, and share → Export as JSON**), creates a new Planly project named after the board, turns each open Trello list into a milestone task, and imports each open card as a task linked to its list's milestone as a prerequisite - card descriptions carry over as task descriptions, and checklist items become subtasks. It talks to your instance over the normal REST API, authenticating with a [Personal Access Token](Access-Tokens.md); set `PLANLY_URL` and `PLANLY_TOKEN` as environment variables, or enter them interactively when prompted.

---

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the current status of external contributions and how to report bugs or request features.

If you're forking the repository for your own use under the [Business Source License 1.1](../../LICENSE), run the TypeScript checks before building on the codebase:

```bash
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```
