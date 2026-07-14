# Contributing to Planly

## Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local type-checking and testing without Docker)
- A PostgreSQL 16 instance (or use the one in Docker Compose)

## Running locally

```bash
# Start the full stack (db + backend + frontend)
docker compose up --build

# Backend is available at http://localhost:3000
# Frontend dev server proxies /api to the backend at http://localhost:5173
```

For backend-only development:

```bash
cd backend
cp ../.env.example .env          # fill in DATABASE_URL etc.
npm install
npx prisma db push               # apply schema to your local DB
npm run dev                      # starts Fastify with ts-node
```

For frontend-only development:

```bash
cd frontend
npm install
npm run dev                      # starts Vite dev server on :5173
```

## Environment variables

Copy `.env.example` to `.env` at the repo root. Required variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing session JWTs (min 32 chars) |
| `APP_URL` | Public URL of the app (e.g. `http://localhost:5173`) |

SMTP, OIDC SSO, and other integrations are optional - the app runs without them.

## Running tests

```bash
# Backend integration tests (require a running PostgreSQL)
cd backend
TEST_DATABASE_URL=postgres://... npm test

# Frontend unit tests (jsdom, no DB)
cd frontend
npm test
```

## Code conventions

- **Backend validation**: All route handlers use the shared `validate(schema, req.body, reply)` utility from `src/utils/validate.ts`. Never use inline `.safeParse()`.
- **Logging**: Use `req.log.info/warn/error` (Pino, structured) in route handlers. `console.log` is reserved for startup messages in `index.ts`.
- **Frontend styling**: Use Tailwind classes. For theme-aware colors, prefer the design-token classes (`text-token`, `bg-surface`, `border-border`, `text-accent`) over inline `style={{ color: 'var(--text)' }}`.
- **TypeScript**: Both packages run in strict mode. No `as any` or `@ts-ignore` in production code.

## Adding a new backend route

1. Create `backend/src/routes/<feature>.ts` and export `async function <feature>Routes(app: FastifyInstance)`.
2. Register it in `backend/src/index.ts` with `app.register(<feature>Routes)`.
3. Register it in `backend/src/__tests__/helpers/app.ts` so integration tests can exercise it.
4. Add a smoke test file at `backend/src/__tests__/integration/<feature>.test.ts`.

## Deploying

```bash
# Rebuild a single service with no cache and recreate the container
docker compose build --no-cache backend
docker compose up -d --force-recreate backend
```

**Never use `docker restart`** - it does not apply a new image.

See [DECISIONS.md](DECISIONS.md) for the architectural reasoning behind key design choices.
