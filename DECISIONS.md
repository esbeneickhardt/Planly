# Architectural Decision Records

Key decisions made during the design and evolution of Planly. Each entry covers what was chosen, why, and what the trade-offs are.

---

## 1. Fastify over Express

**Decision**: Use Fastify 5 as the HTTP framework.

**Why**: Fastify is 2–3× faster than Express on the same hardware due to its schema-based serialization, and its TypeScript support is first-class (all routes are fully typed via generics). The plugin system and built-in lifecycle hooks (`preHandler`, `onSend`) map cleanly to the auth + CSRF middleware we need.

**Trade-off**: Smaller ecosystem than Express; fewer third-party middleware plugins. In practice this was never a constraint - every piece we needed (`@fastify/cookie`, `@fastify/cors`, `@fastify/rate-limit`) existed and was well-maintained.

---

## 2. Prisma over raw SQL / Drizzle / Sequelize

**Decision**: Use Prisma 5 as the ORM, with `prisma db push` (not migrations) for schema management.

**Why**: Prisma's generated client gives end-to-end type safety between the schema and the route handlers. `prisma db push` is used over `prisma migrate` because Planly is currently a single-team deployment where schema drift across environments is not a concern. Push is instant and requires no migration history to maintain.

**Trade-off**: `db push` is destructive on incompatible changes (it drops columns without a migration trail). If Planly ever serves multiple independent customer databases, switching to `prisma migrate dev` will be necessary.

---

## 3. httpOnly JWT cookies over Authorization headers

**Decision**: Auth tokens are stored in httpOnly, Secure, SameSite=Strict cookies - not in localStorage or as Bearer tokens.

**Why**: httpOnly cookies are inaccessible to JavaScript, eliminating XSS-based token theft. SameSite=Strict blocks CSRF cross-site submission. The trade-off is that API clients (mobile apps, CLI tools) can't use cookie auth; they use `X-API-Token` bearer tokens minted via the `/api/auth/tokens` endpoint instead.

**Related**: Every JWT carries a `tokenVersion` claim that must match the value stored in the database. When a user changes their password, resets it, or an admin revokes access, `tokenVersion` is incremented on the server and all existing tokens become invalid immediately - without needing a token blocklist.

---

## 4. tokenVersion invalidation (no blocklist)

**Decision**: Use a per-user `tokenVersion` integer column to invalidate sessions rather than maintaining a JWT blocklist.

**Why**: A blocklist requires a persistent store lookup on every request and grows unboundedly. `tokenVersion` only adds a single indexed integer column to the users table and the auth middleware already queries the user row for the `isAdmin` and `emailVerified` flags - the `tokenVersion` check is zero extra latency.

**How it works**: The JWT payload includes `{ userId, username, tokenVersion }`. On every authenticated request, the middleware reads `tokenVersion` from the DB and rejects the token if it doesn't match. `tokenVersion` is incremented on password change, password reset, and admin-forced logout.

---

## 5. dagre for canvas auto-layout

**Decision**: Use `@dagrejs/dagre` for automatic graph layout on the canvas board.

**Why**: dagre implements the Sugiyama layered layout algorithm, which produces readable left-to-right or top-to-bottom directed graphs - exactly what a task dependency canvas needs. It's pure JS (no native deps), runs in the browser, and is fast enough for graphs up to ~200 nodes.

**How it works** (`CanvasView.tsx:133`): 
1. A `dagre.graphlib.Graph` is built from the task list and their `parentId` relationships.
2. Node dimensions are estimated (card width/height) and fed to dagre.
3. `dagre.layout(g)` assigns `(x, y)` to each node.
4. Positions are persisted per-user in localStorage so the layout only runs once per fresh board.

**Trade-off**: dagre doesn't handle cycles (circular dependencies). The UI prevents cycles at creation time but doesn't validate existing data - a data import with cycles would produce a degenerate layout.

---

## 6. Sprint aura rendering on the Gantt timeline

**Decision**: Sprint time ranges are rendered as translucent background bands ("auras") behind the milestone bars on the Gantt chart rather than as explicit row entries.

**Why**: Putting sprints on their own row would double the vertical space and make the timeline harder to read. Overlaying them as background auras lets the user see which sprint each milestone falls into without losing the milestone-centric view.

**Implementation**: Each sprint aura is a `div` with `position: absolute`, `left`/`width` computed as a percentage of the visible time window (`vs`/`ve`), and a semi-transparent background. The sprint label is placed at the top of its aura with `overflow: hidden` so it clips gracefully.

---

## 7. Real-time via SSE, not WebSockets

**Decision**: Push updates to connected clients via Server-Sent Events (SSE) rather than WebSockets.

**Why**: SSE is unidirectional (server → client), works over HTTP/1.1 without an upgrade handshake, and requires no special infrastructure (load balancers, proxies, nginx config for WebSocket pass-through). Since Planly only needs the server to push updates (task changes, new messages) and clients write via normal REST calls, SSE is sufficient.

**Trade-off**: SSE connections are per-tab and can't be multiplexed. A user with 5 tabs open holds 5 SSE connections. This is acceptable at current scale; if connection counts become a concern, switching to a shared WebSocket or a polling fallback is straightforward.

---

## 8. Vite over Create React App / Webpack

**Decision**: Use Vite as the frontend bundler.

**Why**: Vite's dev server uses native ES modules (no bundling in dev mode), making hot-module replacement nearly instant even as the codebase grows. Build times are 5–10× faster than CRA/Webpack. Vitest is Vite-native, eliminating the need for a separate Jest config and transform pipeline.

---

## 9. Docker Compose for the full stack

**Decision**: The entire stack (PostgreSQL, backend, frontend/nginx) is orchestrated with Docker Compose.

**Why**: A single `docker compose up` gives every developer an identical environment. The production compose file (`docker-compose.prod.yml`) extends the dev file, so the two stay in sync. The backend and frontend run in separate containers with nginx acting as the reverse proxy, which mirrors the production network topology exactly.

**Deploy procedure**: Always `docker compose build --no-cache <service> && docker compose up -d --force-recreate <service>`. `docker restart` does NOT pull a new image and must not be used for deployments.
