# Tech Stack

← [Back to README](README.md)

---

## Overview

| Layer | Choice | Reason |
|-------|--------|--------|
| Frontend framework | React + TypeScript | Ecosystem, React Flow dependency |
| Canvas library | React Flow | Purpose-built for node-edge graphs |
| Graph layout | dagre | Standard left-to-right DAG layout, React Flow integration |
| UI / styling | Tailwind CSS | Minimal, no component library overhead |
| Kanban drag-drop | `@dnd-kit/core` | Accessible, works alongside React Flow without conflicts |
| Backend framework | Fastify + TypeScript | Lightweight, fast, excellent TypeScript support |
| ORM | Prisma | Clean schema definition, type-safe queries, migration tooling |
| Database | PostgreSQL 16 | Handles recursive graph queries, robust, well-understood |
| Auth | JWT (custom, httpOnly cookies) | No external provider dependency, self-hosted friendly |
| Containerisation | Docker + Docker Compose | See [Docker & Deployment](docker.md) |

---

## Frontend

### React + TypeScript
Standard Vite-based React app. TypeScript throughout — no `any`.

### React Flow

The canvas view is built entirely on [React Flow](https://reactflow.dev). It provides:
- Zoomable, pannable canvas
- Custom node and edge components
- Connection handles (drag-to-connect)
- Selection, multi-select
- Built-in minimap and controls

Custom node components:
- `TaskNode` — regular task
- `MilestoneNode` — task with deadline, shows progress fraction
- `ProductNode` — terminal node, always rightmost, non-deletable

React Flow config:
```ts
<ReactFlow
  connectionMode="strict"
  defaultEdgeOptions={{ type: 'smoothstep', animated: false }}
  nodeTypes={{ task: TaskNode, milestone: MilestoneNode, product: ProductNode }}
/>
```

### dagre (Auto-Layout)

`dagre` computes a left-to-right hierarchical layout from the graph structure. Called when the user clicks "Auto-Layout":

```ts
import dagre from '@dagrejs/dagre';

const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 40 });
nodes.forEach(n => g.setNode(n.id, { width: 180, height: 60 }));
edges.forEach(e => g.setEdge(e.source, e.target));
dagre.layout(g);
// map back to React Flow node positions
```

### @dnd-kit/core (Kanban Drag-Drop)

Used only in the Kanban view for column-to-column card dragging. Chosen over `react-beautiful-dnd` (unmaintained) and React Flow's built-in drag (scoped to the canvas). `@dnd-kit` is accessible, pointer/touch capable, and does not conflict with React Flow's event handling.

### Tailwind CSS

No component library (no MUI, no shadcn). Components are hand-built with Tailwind utility classes. This keeps the UI minimal and avoids fighting a design system that was built for different use cases.

---

## Backend

### Fastify + TypeScript

REST API. Route structure:

```
/api/auth          — login, logout, me
/api/users         — CRUD
/api/teams         — CRUD
/api/products      — CRUD
/api/products/:id/tasks       — CRUD for tasks within a product
/api/products/:id/tasks/:tid/dependencies  — add/remove DAG edges
/api/products/:id/milestones  — read-only: milestone progress computations
```

### Prisma + PostgreSQL

Schema mirrors the [Data Model](data-model.md) closely. DAG edges stored as a join table:

```prisma
model Task {
  id          String   @id @default(uuid())
  productId   String
  name        String
  status      Status   @default(BACKLOG)
  ownerId     String?
  deadline    DateTime?
  color       String?
  description String?
  canvasX     Float?
  canvasY     Float?
  createdAt   DateTime @default(now())
  completedAt DateTime?
  completedBy String?

  product      Product  @relation(fields: [productId], references: [id])
  owner        User?    @relation(fields: [ownerId], references: [id])
  subtasks     Subtask[]
  dependsOn    TaskDependency[] @relation("dependent")
  requiredBy   TaskDependency[] @relation("prerequisite")
}

model TaskDependency {
  dependentId    String
  prerequisiteId String
  dependent      Task @relation("dependent",    fields: [dependentId],    references: [id])
  prerequisite   Task @relation("prerequisite", fields: [prerequisiteId], references: [id])
  @@id([dependentId, prerequisiteId])
}
```

### Cycle Prevention

Before inserting a new `TaskDependency`, the backend runs a recursive CTE to check if the proposed edge creates a cycle:

```sql
WITH RECURSIVE reachable AS (
  SELECT prerequisite_id AS id FROM task_dependencies WHERE dependent_id = $newPrerequisiteId
  UNION
  SELECT td.prerequisite_id FROM task_dependencies td JOIN reachable r ON td.dependent_id = r.id
)
SELECT 1 FROM reachable WHERE id = $newDependentId;
```

If this returns a row, the edge would create a cycle and is rejected.

### Auth

Sessions via JWT stored in httpOnly cookies. Simple username + password login. No OAuth initially — can be added later. Passwords hashed with `bcrypt` (12 rounds).

---

## Project Structure

```
/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── canvas/         # React Flow nodes, edges, canvas view
│   │   │   ├── kanban/         # Board, column, card, subtask components
│   │   │   ├── gantt/          # Gantt rows and timeline
│   │   │   └── common/         # Shared UI components
│   │   ├── pages/              # Route-level components
│   │   ├── api/                # Typed fetch wrappers for backend routes
│   │   └── types/              # Shared TypeScript types
│   ├── Dockerfile
│   └── vite.config.ts
│
├── backend/
│   ├── src/
│   │   ├── routes/             # Fastify route handlers
│   │   ├── services/           # Business logic (DAG ops, milestone calc)
│   │   ├── db/                 # Prisma client, migrations
│   │   └── middleware/         # Auth, validation
│   ├── prisma/
│   │   └── schema.prisma
│   └── Dockerfile
│
└── docker-compose.yml
```

---

## Real-Time Updates

Initially, updates across views (e.g. completing a task in Kanban → Gantt progress updates) are achieved by client-side polling every 10–15 seconds or on page focus. This is sufficient for v1.

When needed, WebSocket support can be added to Fastify (`@fastify/websocket`) to push task status changes to all connected clients of the same product — a straightforward upgrade given the existing architecture.
