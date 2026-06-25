# Planly — Feature Implementation Plan

> **Status: All four features shipped.** ✅

Four features to implement in order. Each section covers DB changes, backend endpoints,
and frontend work. Features build on top of each other minimally — they are mostly
independent and can be shipped one at a time.

---

## Feature 1 — Kanban column task ordering

**Goal:** Tasks within a Kanban column can be manually reordered by drag-and-drop, and
the order persists across sessions and users.

### DB
- Add `kanbanOrder Int @default(0)` to `Task` model in `schema.prisma`.
- Generate and run migration.

### Backend
- Update `GET /api/products/:productId/tasks` to `orderBy: { kanbanOrder: 'asc' }`.
- Add `PATCH /api/products/:productId/tasks/reorder` body: `{ updates: { taskId, order }[] }`.
  Batch-updates `kanbanOrder` for each task in a Prisma transaction.

### Frontend
- `KanbanBoard.tsx`: currently tasks are grouped by status and rendered in array order.
  The @dnd-kit `DragEndEvent` already moves tasks between columns — extend it to also
  compute new `kanbanOrder` values within the target column and call the reorder endpoint.
- After a successful reorder, update local state optimistically so the UI doesn't flicker.
- `api/client.ts`: add `tasks.reorder(productId, updates)`.

### Files touched
- `backend/prisma/schema.prisma`
- `backend/src/routes/tasks.ts`
- `frontend/src/api/client.ts`
- `frontend/src/components/kanban/KanbanBoard.tsx`

---

## Feature 2 — Plan layout sharing (canvas snapshots)

**Goal:** Any team member can save their current canvas layout (node positions + viewport)
as a named snapshot. Other team members can browse snapshots and apply one to their own
local view.

### DB
- New model `CanvasSnapshot`:
  ```
  model CanvasSnapshot {
    id        String   @id @default(cuid())
    productId String
    userId    String
    name      String
    positions Json     // { taskId: { x, y } }
    viewport  Json     // { x, y, zoom }
    createdAt DateTime @default(now())
    product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
    user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  }
  ```
- Add `canvasSnapshots CanvasSnapshot[]` to `Product` and `User`.

### Backend
- New route file `backend/src/routes/canvas-snapshots.ts`.
  - `GET  /api/products/:productId/canvas-snapshots` — list all snapshots with author name/emoji.
  - `POST /api/products/:productId/canvas-snapshots` — save current layout (body: name, positions, viewport).
  - `DELETE /api/products/:productId/canvas-snapshots/:snapshotId` — delete own snapshot.
- Register in `index.ts`.

### Frontend
- `api/client.ts`: add `canvasSnapshots` namespace.
- `CanvasView.tsx`: add a "Share layout" button in the toolbar.
  - Opens a small modal: name field + Save button → calls POST endpoint.
- Add a "Load layout" button that opens a panel listing all snapshots (author, name, date).
  Clicking "Apply" calls `patchTaskPositions` with the snapshot positions and
  `setViewport` for the viewport, then saves to localStorage.

### Files touched
- `backend/prisma/schema.prisma`
- `backend/src/routes/canvas-snapshots.ts` (new)
- `backend/src/index.ts`
- `frontend/src/api/client.ts`
- `frontend/src/components/canvas/CanvasView.tsx`

---

## Feature 3 — Per-tab access control (Read / Write / None)

**Goal:** Product owners can configure which team members can access which tabs and
whether they have read-only or full write access.

### DB
- New model `TabPermission`:
  ```
  model TabPermission {
    id        String @id @default(cuid())
    productId String
    userId    String
    tab       String  // 'kanban' | 'backlog' | 'canvas' | 'gantt' | 'categories'
    level     String  // 'none' | 'read' | 'write'
    product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
    user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
    @@unique([productId, userId, tab])
  }
  ```
- Default when no row exists: full write for all team members.

### Backend
- New route file `backend/src/routes/permissions.ts`.
  - `GET  /api/products/:productId/permissions` — returns all TabPermission rows for the product.
  - `PUT  /api/products/:productId/permissions` — upsert body: `{ userId, tab, level }[]`.
- Add lightweight middleware helper `checkTabAccess(productId, userId, tab, required: 'read'|'write')`
  used by existing routes to gate write operations (e.g. task creation/update).
- Register in `index.ts`.

### Frontend
- New settings page `frontend/src/pages/SettingsPage.tsx`.
  - Route `/settings` added to `App.tsx`.
  - Shows a matrix: rows = team members, columns = tabs, cells = dropdown (None / Read / Write).
  - Calls PUT permissions endpoint on change.
- `Sidebar.tsx`: add Settings nav item (⚙) visible only to the product owner.
- `Sidebar.tsx`: hide tabs where the current user has level `none`; mark read-only tabs
  visually (lock icon) and disable mutation actions in those views.
- `api/client.ts`: add `permissions` namespace.

### Files touched
- `backend/prisma/schema.prisma`
- `backend/src/routes/permissions.ts` (new)
- `backend/src/index.ts`
- `frontend/src/api/client.ts`
- `frontend/src/pages/SettingsPage.tsx` (new)
- `frontend/src/App.tsx`
- `frontend/src/components/common/Sidebar.tsx`

---

## Feature 4 — Task/milestone chat with attachments and rich rendering

**Goal:** Each task (and optionally product-level) has a threaded chat. Messages support
plain text, markdown, code blocks with syntax highlighting, inline images, and URL link
previews. Images can be attached via file upload.

### DB
- New model `Message`:
  ```
  model Message {
    id          String    @id @default(cuid())
    productId   String
    taskId      String?   // null = product-level chat
    authorId    String
    content     String
    attachments Json      @default("[]")  // [{ url, name, type }]
    createdAt   DateTime  @default(now())
    editedAt    DateTime?
    product     Product   @relation(fields: [productId], references: [id], onDelete: Cascade)
    task        Task?     @relation(fields: [taskId], references: [id], onDelete: Cascade)
    author      User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  }
  ```

### Backend
- New route file `backend/src/routes/messages.ts`.
  - `GET  /api/products/:productId/messages?taskId=` — list messages (newest last, limit 100).
  - `POST /api/products/:productId/messages` — create message (body: content, taskId?, attachments?).
  - `PATCH /api/products/:productId/messages/:messageId` — edit own message.
  - `DELETE /api/products/:productId/messages/:messageId` — delete own message.
- New route `POST /api/upload` — accepts multipart file, saves to local `/uploads` volume
  (or an object store), returns `{ url }`. Use `@fastify/multipart`.
- Frontend polls `GET messages` every 5 s when the chat panel is open (no WebSocket needed
  for MVP).
- Register in `index.ts`.

### Frontend
- New component `frontend/src/components/common/ChatPanel.tsx`.
  - Slide-in panel (right side, below TaskDetailPanel z-index).
  - Message list rendered with `react-markdown` + `rehype-highlight` (code blocks) +
    `remark-gfm` (tables, strikethrough).
  - Image attachments shown inline (click to expand).
  - URLs auto-detected; simple link-preview card fetched client-side via `/api/link-preview`.
  - Compose area: textarea + paperclip button for file upload + send button.
  - Markdown preview toggle in compose area.
- `TaskDetailPanel.tsx`: add a "💬 Chat" button in the header that opens `ChatPanel`
  for the current task.
- `CanvasView.tsx`: product-level chat accessible from a toolbar button.
- `api/client.ts`: add `messages` and `upload` namespaces.
- Install frontend deps: `react-markdown`, `rehype-highlight`, `remark-gfm`, `highlight.js`.

### Files touched
- `backend/prisma/schema.prisma`
- `backend/src/routes/messages.ts` (new)
- `backend/src/index.ts`
- `frontend/src/api/client.ts`
- `frontend/src/components/common/ChatPanel.tsx` (new)
- `frontend/src/components/common/TaskDetailPanel.tsx`
- `frontend/src/components/canvas/CanvasView.tsx`

---

## Implementation order

| # | Feature                  | DB migration | New files | Effort  |
|---|--------------------------|-------------|-----------|---------|
| 1 | Kanban task ordering     | small        | 0         | Low     |
| 2 | Plan layout sharing      | medium       | 1 backend | Medium  |
| 3 | Tab access control       | medium       | 2         | High    |
| 4 | Chat + attachments       | medium       | 2         | Highest |
