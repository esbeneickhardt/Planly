# Build Phases

← [Back to README](README.md)

Four phases, each delivering a usable product increment. Each phase has a clear validation goal — the thing you test before moving to the next phase.

---

## Phase 1 — Foundation: Users, Tasks, Kanban, Backlog

**Goal:** A working project management tool without the DAG. Useful on its own — validates the data model and core UX before any graph complexity.

### Backend
- [ ] Prisma schema for `User`, `Team`, `Product`, `Task`, `Subtask`, `TaskDependency` (table only, no logic yet)
- [ ] Migrations and Prisma client setup
- [ ] Auth routes: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- [ ] User CRUD: `GET/POST /api/users`, `GET/PATCH/DELETE /api/users/:id`
- [ ] Team CRUD: `GET/POST /api/teams`, `GET/PATCH/DELETE /api/teams/:id`
- [ ] Product CRUD: `GET/POST /api/products`, `GET/PATCH/DELETE /api/products/:id`
- [ ] Task CRUD within product: `GET/POST /api/products/:id/tasks`, `GET/PATCH/DELETE /api/products/:id/tasks/:tid`
- [ ] Subtask CRUD nested under task
- [ ] Status transition validation (owner required for `backlog → todo`)

### Frontend
- [ ] Vite + React + TypeScript + Tailwind scaffolding
- [ ] Auth: login page, session persistence, protected routes
- [ ] Navigation: sidebar with product switcher, links to views
- [ ] Typed API client wrapping all backend routes
- [ ] **Kanban view** — four columns, drag-drop with `@dnd-kit`, blocked badge — see [View: Kanban](view-kanban.md)
  - [ ] Card component (name, owner, color strip, milestone badge, subtask chip)
  - [ ] Subtask fold-out with inline checkbox and add-subtask input
  - [ ] Owner assignment gate on drag to To Do
- [ ] **Backlog view** — sortable list, unassigned warning banner, bulk assign — see [View: Backlog](view-backlog.md)
- [ ] Task detail panel (slide-in from right): all fields editable, owner picker, deadline picker

### Docker
- [ ] `docker-compose.yml` with frontend, backend, db services
- [ ] `frontend/Dockerfile` with nginx + SPA fallback + API proxy
- [ ] `backend/Dockerfile` with `prisma migrate deploy` on startup
- [ ] `.env.example`

### Validation
Conduct a real planning session: create a product, add team members, create 20+ tasks, assign owners, move tasks across the Kanban. The Backlog warning banner should surface unassigned tasks clearly. The subtask fold-out should feel snappy.

---

## Phase 2 — DAG Canvas

**Goal:** The core differentiator. Tasks become nodes on a canvas. Dependencies are drawn by hand. The product vision is always visible as the terminal node.

### Backend
- [ ] `POST /api/products/:id/tasks/:tid/dependencies` — add a `dependsOn` edge (with cycle check)
- [ ] `DELETE /api/products/:id/tasks/:tid/dependencies/:did` — remove an edge
- [ ] `GET /api/products/:id/graph` — return all tasks and edges for the product in one call (for canvas initialisation)
- [ ] Store `canvasX`, `canvasY` per task; `PATCH /api/products/:id/tasks/:tid/position` for position saves

### Frontend
- [ ] React Flow canvas setup — see [View: Canvas / DAG](view-canvas-dag.md)
  - [ ] `TaskNode` component (name, owner avatar, status ring, color accent, connection handles)
  - [ ] `MilestoneNode` component (deadline badge, progress fraction)
  - [ ] `ProductNode` component (terminal, non-deletable, no outgoing handles)
  - [ ] Edge drawing: right handle → left handle, rejected if cycle detected (snap-back + toast)
  - [ ] Edge deletion: click edge, press Delete
  - [ ] Double-click canvas → inline task name input → creates node + API call
  - [ ] Click node → opens task detail panel (reuse from Phase 1)
  - [ ] Drag node → saves position via debounced API call
- [ ] Auto-layout button using `dagre` — see [Tech Stack — dagre](tech-stack.md#dagre-auto-layout)
- [ ] Canvas toolbar: Auto-Layout, Filters (dropdown), Zoom display, Fit to screen, + New Task
- [ ] Filters: hide done, owner filter, path-to-milestone highlight

### Validation
Run a planning session using only the canvas: start with the product node, add milestone tasks, add leaf tasks, draw edges until every task is on a visible path to the product. Run auto-layout. Confirm the left-to-right reading direction feels natural.

---

## Phase 3 — Gantt

**Goal:** Automatic project timeline with honest progress bars. No data entry — everything derived from the DAG.

### Backend
- [ ] `GET /api/products/:id/milestones` — returns each milestone task with:
  - `totalDependencies`: count of transitive prerequisite tasks
  - `doneDependencies`: count of those with status `done`
  - `dependencyList`: array of task summaries (name, status, owner) for popover

The transitive dependency count uses a recursive CTE query. Computed on read, not cached — acceptable for v1 given typical graph sizes.

### Frontend
- [ ] **Gantt view** — see [View: Gantt](view-gantt.md)
  - [ ] Timeline axis (X) spanning earliest task `createdAt` to product `deadline`
  - [ ] "Today" vertical line
  - [ ] One row per milestone task + one final row for the product
  - [ ] Progress bar per row (green/amber/red based on deadline proximity)
  - [ ] `X / Y tasks done` label per row
  - [ ] Hover popover showing dependency task list with statuses
  - [ ] Overdue indicator (`⚠`) for passed deadlines with incomplete tasks
  - [ ] Filters: hide completed milestones, filter by owner, zoom timeline

### Validation
Add deadlines to several tasks in an existing product. Confirm the Gantt populates automatically. Complete some dependency tasks and confirm progress bars update. Deliberately push a milestone past its deadline and confirm the red/overdue state appears.

---

## Phase 4 — Polish & Resilience

**Goal:** The product is ready for daily use by a real team. Rough edges smoothed, edge cases handled, experience feels complete.

### UX Polish
- [ ] **Blocked task detection** — automatically surface tasks as `blocked` when a prerequisite has had no status change for N days (configurable per product); show in Kanban and Canvas
- [ ] **Path highlighting** — in Canvas, clicking a milestone node highlights (brightens) all nodes on its transitive dependency path; non-path nodes dim
- [ ] **Unassigned prerequisite warnings** — in Gantt popover and Canvas milestone node, flag unassigned tasks that are blocking a milestone
- [ ] **Keyboard shortcuts** — `N` new task on canvas, `L` auto-layout, `F` fit to screen, `Escape` deselect / close panel
- [ ] **Empty states** — helpful prompts when a product has no tasks, or the backlog is clear
- [ ] **Responsive layout** — Kanban and Backlog usable on tablet; Canvas is desktop-only (acknowledged limitation)

### Data
- [ ] Soft delete for tasks (archive rather than destroy, recoverable)
- [ ] Activity log per task (status changes, owner changes, edge additions) — shown in task detail panel timeline
- [ ] `completedBy` / `completedAt` displayed in task detail panel and Kanban card tooltip

### Ops
- [ ] Database backup script + cron example in documentation
- [ ] Health check endpoint `GET /api/health` returning DB connectivity status
- [ ] Structured JSON logging in backend (for log aggregation)
- [ ] Rate limiting on auth endpoints

### Validation
Onboard a real team onto a real project for two weeks. Measure: does the backlog stay clean (owners assigned)? Does the canvas accurately represent the plan? Does the Gantt surface risk before deadlines are missed?

---

## What Is Deliberately Out of Scope (v1)

- Email notifications (add in v2 if the team wants them)
- Time tracking or effort estimates — see [README — Core Principles](README.md#core-principles)
- Recurring tasks
- Comments / threaded discussions on tasks (use your existing chat tool)
- Mobile app
- SSO / OAuth (add when a company needs it)
- Multi-product dependency edges (tasks in different products cannot depend on each other — keep it clean)
