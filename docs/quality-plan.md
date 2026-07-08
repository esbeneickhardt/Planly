# Quality Upgrade Plan

Target: Security → 10/10 · Code Quality → 10/10 · Production Readiness → 10/10 · Task Attachments

---

## Security

### CSP: remove `unsafe-inline` from `script-src` in error-page header
> **File:** `backend/src/index.ts` line 233  
> The Fastify `onSend` hook applies a CSP only to `text/html` responses (error pages). It currently has `script-src 'self' 'unsafe-inline'`. Vite-built error pages contain zero inline scripts, so `'unsafe-inline'` is unnecessary noise.  
> **Fix:** Change `script-src 'self' 'unsafe-inline'` → `script-src 'self'`.

- [ ] Remove `'unsafe-inline'` from `script-src` in `backend/src/index.ts:233`

---

### CSP: split `style-src` into elem + attr directives
> **Files:** `backend/src/index.ts` line 233 and `frontend/nginx.conf`  
> `style-src 'self' 'unsafe-inline'` permits both injected `<style>` tags (dangerous) and inline `style=""` attributes (required by React). Splitting them allows React's `style={}` props while blocking injected stylesheet elements.  
> **Fix (backend/src/index.ts error-page CSP):** Replace `style-src 'self' 'unsafe-inline'` with `style-src-elem 'self'; style-src-attr 'unsafe-inline'`.  
> **Fix (frontend/nginx.conf SPA CSP):** Same replacement — `style-src 'self' 'unsafe-inline'` → `style-src-elem 'self'; style-src-attr 'unsafe-inline'`.

- [ ] Split `style-src` in `backend/src/index.ts` CSP header
- [ ] Split `style-src` in `frontend/nginx.conf` CSP header

---

### Fix 14 explicit `any` annotations in `AnnouncementsPage.tsx`
> **File:** `frontend/src/pages/AnnouncementsPage.tsx` lines 16–31  
> The `react-markdown` `components` prop accepts per-element renderers. Each renderer is typed as `any` for its props. The package exports `Components` (a keyed type) and per-element types such as `ComponentPropsWithoutRef<'h1'>` from React. Replacing the `any` annotations removes the last explicit escape hatch from strict typing.  
> **Fix:** Import `ComponentPropsWithoutRef` from `'react'` and use it: `({ children }: ComponentPropsWithoutRef<'h1'>)`, etc. For the `code` renderer that also needs `className`, use `ComponentPropsWithoutRef<'code'>`.

- [ ] Replace all 14 `any` annotations in `AnnouncementsPage.tsx` with `ComponentPropsWithoutRef<'tag'>`

---

### WebSocket rate limiting per IP
> **File:** `backend/src/realtime/manager.ts` (WebSocket upgrade handler in `backend/src/routes/realtime.ts`)  
> There is a per-user cap of 10 concurrent WS connections but no per-IP rate limit on the upgrade handshake itself, leaving the WS endpoint open to connection-flood attempts from unauthenticated IPs.  
> **Fix:** In the `GET /api/realtime/ws` route, add a `config.rateLimit` of `{ max: 20, timeWindow: '1 minute' }` (same pattern as other rate-limited routes). The global `@fastify/rate-limit` `onRoute` hook already handles injection automatically when a `config.rateLimit` key is present.

- [ ] Add per-IP rate limit (20/min) to `GET /api/realtime/ws`

---

### Frontend security tests for user-controlled content rendering
> **File:** `frontend/src/__tests__/components/` (new test files)  
> No test currently verifies that user-supplied content (task names, descriptions, announcement body, chat messages) is rendered as text rather than HTML. Even with React's default escaping, a future refactor toward `dangerouslySetInnerHTML` or a new third-party renderer could introduce XSS silently.  
> **Fix:** Add `ChatMessage.test.tsx` and `AnnouncementBody.test.tsx` that render a payload of `<script>alert(1)</script>` and assert the element's `innerHTML` does not contain a `<script>` tag.

- [ ] Add `frontend/src/__tests__/components/ChatMessage.test.tsx` (XSS escape assertion)
- [ ] Add `frontend/src/__tests__/components/AnnouncementBody.test.tsx` (XSS escape assertion)

---

## Code Quality

### Fix remaining explicit `any` usages (see Security section above)
- [ ] (covered by the `AnnouncementsPage.tsx` item above)

---

### Expand frontend component tests
> **Existing setup:** `frontend/src/__tests__/` has `setup.ts`, 2 component tests, 2 hook tests; `vitest` + `@testing-library/react` is already wired in CI (`test.yml` job `frontend-tests`).  
> **Missing coverage:** Core pages and hooks that carry business logic have zero tests.

- [ ] Add `frontend/src/__tests__/hooks/useBacklogFilters.test.ts` — test filter/sort/search/tab-count logic against a mock task list
- [ ] Add `frontend/src/__tests__/components/BacklogPage.test.tsx` — render with mock tasks, assert tab counts and "Unassigned" badge appear correctly
- [ ] Add `frontend/src/__tests__/components/TaskDetailPanel.test.tsx` — render a task, assert name/status/deadline fields display; assert GitHub link renders only when `githubUrl` is set
- [ ] Add `frontend/src/__tests__/components/KanbanBoard.test.tsx` — render columns, assert tasks appear in correct column

---

### Add Playwright E2E tests for critical paths
> **Setup:** Install `@playwright/test` as a devDependency in a new top-level `e2e/` directory. Add a `playwright.config.ts` pointing at `http://localhost:5173` (Vite dev server). Add a `test:e2e` script to root `package.json`. Add a `e2e` job to `.github/workflows/test.yml` that starts the dev server and runs Playwright.  
> **Paths to cover:**

- [ ] Create `e2e/playwright.config.ts` and `e2e/` directory structure
- [ ] Add `e2e/auth.spec.ts` — register → login → logout flow
- [ ] Add `e2e/tasks.spec.ts` — create task → open detail panel → change status → verify in Backlog
- [ ] Add `e2e/kanban.spec.ts` — drag task between columns (or click status) → verify new column
- [ ] Add E2E job to `.github/workflows/test.yml`

---

### Decompose GanttPage into sub-components
> **File:** `frontend/src/pages/GanttPage.tsx` (~430 lines)  
> The Gantt header controls, the grid header row, individual task rows, and milestone rows are all inlined. Each is a self-contained visual unit with its own props.  
> **Fix:** Extract into `frontend/src/components/gantt/`:

- [ ] Extract `GanttControls` (header bar: date nav, hide-done toggle, zoom, add sprint/milestone buttons)
- [ ] Extract `GanttGridHeader` (the date column ruler)
- [ ] Extract `GanttTaskRow` (single task bar + resize handles)
- [ ] Extract `GanttMilestoneRow` (milestone diamond + resize handle)

---

## Production Readiness

### Grafana dashboard bundled in repo
> **Why:** The Prometheus metrics endpoint at `GET /api/metrics` is useless without a dashboard to visualise it. Operators have to build one from scratch today.  
> **Fix:** Add a `monitoring/` directory with a Grafana provisioning layout. Add Grafana + Prometheus services (commented-out, opt-in) to `docker-compose.prod.yml` with a bind-mount to `./monitoring/grafana/`.

- [ ] Create `monitoring/grafana/provisioning/datasources/prometheus.yaml`
- [ ] Create `monitoring/grafana/dashboards/planly.json` — panels: request rate, p95 latency, WS connections, active users, error rate
- [ ] Create `monitoring/prometheus.yml` — scrape config for `backend:3000/api/metrics`
- [ ] Add commented-out `prometheus` + `grafana` services to `docker-compose.prod.yml`

---

### Loki + Promtail log aggregation
> **Why:** Backend logs go to Docker's `json-file` driver. There is no way to query them without `docker logs` or manual file reads. On a multi-container deployment there is no unified log stream.  
> **Fix:** Add Loki + Promtail services (commented-out, opt-in) to `docker-compose.prod.yml`. Promtail reads from Docker's `json-file` log driver via `/var/lib/docker/containers` bind-mount and ships to Loki. Grafana (above) gets Loki as a second data source.

- [ ] Create `monitoring/promtail/config.yaml` — scrape Docker container logs, add `service` and `product` labels
- [ ] Create `monitoring/grafana/provisioning/datasources/loki.yaml`
- [ ] Add commented-out `loki` + `promtail` services to `docker-compose.prod.yml`

---

### SMTP startup warning
> **File:** `backend/src/index.ts` (startup section)  
> If `SMTP_HOST` / `SENDGRID_API_KEY` / `RESEND_API_KEY` are all unset, email verification and password reset silently fail. Operators have deployed without noticing until a real user reports they can't verify their email.  
> **Fix:** At startup, after env validation, check if any email provider is configured. If not, log a structured `logger.warn({ event: 'email_unconfigured' }, 'No email provider configured — email verification and password reset are disabled')`. This is visible in both dev and prod logs without being a hard error (some deployments intentionally disable email).

- [ ] Add SMTP/email-provider configuration check with `logger.warn` at startup in `backend/src/index.ts`

---

### Add `connect-src wss:` to backend error-page CSP
> **File:** `backend/src/index.ts` line 233  
> The backend error-page CSP has `connect-src` missing entirely (falls back to `default-src 'self'`). If an error page ever loads the SPA's WS reconnect logic, the WebSocket upgrade to `wss://` would be blocked by the CSP (since `'self'` in `connect-src` allows `https://` but not `wss://` in strict implementations).  
> **Fix:** Add `connect-src 'self' wss:` to the error-page CSP.

- [ ] Add `connect-src 'self' wss:` to the error-page CSP in `backend/src/index.ts`

---

## Task Attachments

### Prisma schema — `TaskAttachment` model
> Add a `TaskAttachment` model linked to `Task`. Reuses the same upload infrastructure that `ChatMessage` attachments already use (`POST /api/upload`, `GET /api/uploads/:filename`, `storage.ts`).

- [ ] Add `TaskAttachment` model to `backend/prisma/schema.prisma`:
  ```
  model TaskAttachment {
    id           String   @id @default(cuid())
    taskId       String
    task         Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
    filename     String
    originalName String
    mimeType     String
    size         Int
    uploadedById String
    uploadedBy   User     @relation("TaskAttachmentUploader", fields: [uploadedById], references: [id])
    createdAt    DateTime @default(now())
  }
  ```
- [ ] Add `attachments TaskAttachment[]` to the `Task` model relation
- [ ] Add migration file `backend/prisma/migrations/20260708000003_task_attachments/migration.sql`

---

### Backend route — `task-attachments.ts`
> **File:** `backend/src/routes/task-attachments.ts` (new)  
> Three endpoints, all scoped to `GET/POST/DELETE /api/products/:productId/tasks/:taskId/attachments`.

- [ ] `GET /api/products/:productId/tasks/:taskId/attachments` — list all attachments for the task (requires auth + product member)
- [ ] `POST /api/products/:productId/tasks/:taskId/attachments` — multipart upload; reuse `storage.ts` `storeFile`; create `TaskAttachment` record; rate-limit 20/min
- [ ] `DELETE /api/products/:productId/tasks/:taskId/attachments/:attachmentId` — delete record + call `deleteFile`; only uploader or product admin can delete
- [ ] Register `taskAttachmentRoutes` in `backend/src/index.ts`

---

### Frontend — types, API client, UI
> **Types file:** `frontend/src/types/index.ts` — add `TaskAttachment` interface and `attachments` field to `Task`.  
> **API client:** `frontend/src/api/client.ts` — add `api.tasks.attachments` namespace.  
> **UI:** `TaskDetailPanel.tsx` — add an "Attachments" section (file list with download links + delete button, upload dropzone/button).

- [ ] Add `TaskAttachment` interface to `frontend/src/types/index.ts`
- [ ] Add `attachments?: TaskAttachment[]` to the `Task` interface
- [ ] Add `api.tasks.attachments.list(productId, taskId)` to `frontend/src/api/client.ts`
- [ ] Add `api.tasks.attachments.upload(productId, taskId, file)` to `frontend/src/api/client.ts`
- [ ] Add `api.tasks.attachments.delete(productId, taskId, attachmentId)` to `frontend/src/api/client.ts`
- [ ] Add Attachments section to `frontend/src/components/common/TaskDetailPanel.tsx`
  - File list: filename, size, uploader, upload date, download link, delete button (own uploads only)
  - Upload button: opens file picker (respects `ALLOWED_MIME_TYPES` from storage.ts — 15 types)
  - Show upload progress spinner; refresh list on success
- [ ] Include `attachments` in the task serializer/include in relevant backend task queries (so `TaskDetailPanel` receives them without a separate fetch)
