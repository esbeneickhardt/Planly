# 07 - Task Management

← [Back to index](README.md)

All tests use **Alpha Project** (see [01-setup.md](01-setup.md)). `PRODUCT_ID` = the ID of Alpha Project.

---

## Task CRUD

### Create

> Code: [backend/src/routes/tasks/crud.ts](../../backend/src/routes/tasks/crud.ts) (POST handler - validates name, sets `kanbanOrder`, `createdBy`) · [frontend/src/components/kanban/KanbanColumn.tsx](../../frontend/src/components/kanban/KanbanColumn.tsx) (inline task creation from board)

```bash
curl -s -b cookies.txt -X POST $BASE/api/products/$PRODUCT_ID/tasks \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"My API task","status":"backlog","description":"A test task"}' | jq .
```

- [ ] Create task via `+` button on Kanban → appears on board
- [ ] Empty name → validation error shown

### Read

> Code: [backend/src/routes/tasks/crud.ts](../../backend/src/routes/tasks/crud.ts) (list includes `subtasks`, `dependsOn`, `requiredBy`) · [backend/src/db/selects.ts](../../backend/src/db/selects.ts) (task select shape)

```bash
# List all tasks
curl -s -b cookies.txt $BASE/api/products/$PRODUCT_ID/tasks | jq '.[].name'

# Get single task
curl -s -b cookies.txt $BASE/api/products/$PRODUCT_ID/tasks/<task-id> | jq .
```

- [ ] Charlie (non-member) cannot open the project board

### Update

> Code: [backend/src/routes/tasks/crud.ts](../../backend/src/routes/tasks/crud.ts) (PATCH handler) · [frontend/src/components/common/TaskDetailPanel.tsx](../../frontend/src/components/common/TaskDetailPanel.tsx) (autosave on field change)

```bash
curl -s -b cookies.txt -X PATCH $BASE/api/products/$PRODUCT_ID/tasks/<task-id> \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"Updated name","status":"in_progress","ownerId":"<alice-id>","deadline":"2027-06-01","color":"#ff0000"}' | jq .
```

- [ ] Change name → updates everywhere (kanban card, detail panel, backlog)
- [ ] Change status → card moves to correct column on Kanban
- [ ] Assign owner (Alice) → card shows avatar; real-time update in Alice's window
- [ ] Set deadline → shows on card; overdue styling if past
- [ ] Set colour → card border/background changes
- [ ] Clear deadline → deadline removed from card

### Delete

> Code: [backend/src/routes/tasks/crud.ts](../../backend/src/routes/tasks/crud.ts) (DELETE - cascades to subtasks, removes from sprint)

```bash
curl -s -b cookies.txt -X DELETE $BASE/api/products/$PRODUCT_ID/tasks/<task-id> \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Delete via detail panel → task disappears from board; panel closes
- [ ] Deleting a parent task also removes its subtasks (no orphans visible)

---

## Task status values

> Code: [backend/prisma/schema.prisma](../../backend/prisma/schema.prisma) (TaskStatus enum) · [frontend/src/components/kanban/KanbanBoard.tsx](../../frontend/src/components/kanban/KanbanBoard.tsx) (column-to-status mapping)

Test that each valid status can be set and is reflected in UI:

- [ ] Each status (backlog / todo / in_progress / done / blocked) appears in the correct Kanban column with correct styling

---

## Task position (`PATCH /tasks/:id/position`)

> Code: [backend/src/routes/tasks/crud.ts](../../backend/src/routes/tasks/crud.ts) (`/position` endpoint - saves `canvasX`/`canvasY`) · [frontend/src/components/canvas/CanvasView.tsx](../../frontend/src/components/canvas/CanvasView.tsx) (calls on drag-end)

```bash
# Move task to canvas position
curl -s -b cookies.txt -X PATCH $BASE/api/products/$PRODUCT_ID/tasks/<task-id>/position \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"canvasX":100,"canvasY":200}' | jq .
```

- [ ] Canvas positions persist after page reload (covered in [10-canvas.md](10-canvas.md))

---

## Task reorder (`PATCH /tasks/reorder`)

> Code: [backend/src/routes/tasks/crud.ts](../../backend/src/routes/tasks/crud.ts) (`/reorder` endpoint - bulk-updates `kanbanOrder`) · [frontend/src/components/kanban/KanbanBoard.tsx](../../frontend/src/components/kanban/KanbanBoard.tsx) (drag-and-drop handler)

- [ ] Drag task within a Kanban column → `kanbanOrder` updated
- [ ] Order persists after page reload
- [ ] Reorder is real-time (second browser sees the new order)

---

## Subtasks (`/tasks/:taskId/subtasks`)

> Code: [backend/src/routes/tasks/subtasks.ts](../../backend/src/routes/tasks/subtasks.ts) (add, update name/order/completed, delete) · [frontend/src/components/common/TaskDetailPanel.tsx](../../frontend/src/components/common/TaskDetailPanel.tsx) (subtask section) · [frontend/src/components/kanban/KanbanCard.tsx](../../frontend/src/components/kanban/KanbanCard.tsx) (progress fraction display)

```bash
# Add subtask
curl -s -b cookies.txt -X POST "$BASE/api/products/$PRODUCT_ID/tasks/<task-id>/subtasks" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"Do the thing","order":0}' | jq .

# Update subtask (check it off)
curl -s -b cookies.txt -X PATCH "$BASE/api/products/$PRODUCT_ID/tasks/<task-id>/subtasks/<subtask-id>" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"completed":true}' | jq .

# Delete subtask
curl -s -b cookies.txt -X DELETE "$BASE/api/products/$PRODUCT_ID/tasks/<task-id>/subtasks/<subtask-id>" \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Add subtask via detail panel → appears in subtask list
- [ ] Check subtask → progress fraction updates on Kanban card (e.g. "2/3")
- [ ] Uncheck, rename, reorder, delete subtasks all work
- [ ] Empty subtask name → validation error

---

## Dependencies (`/tasks/:taskId/dependencies`)

> Code: [backend/src/routes/tasks/dependencies.ts](../../backend/src/routes/tasks/dependencies.ts) (add prerequisite with cycle detection, remove) · [frontend/src/components/common/TaskDetailPanel.tsx](../../frontend/src/components/common/TaskDetailPanel.tsx) (dependency section) · [frontend/src/components/canvas/CanvasView.tsx](../../frontend/src/components/canvas/CanvasView.tsx) (arrows)

```bash
# Add dependency: task B depends on task A (A must finish before B starts)
curl -s -b cookies.txt -X POST "$BASE/api/products/$PRODUCT_ID/tasks/<task-b-id>/dependencies" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"prerequisiteId":"<task-a-id>"}' | jq .

# Remove dependency
curl -s -b cookies.txt -X DELETE "$BASE/api/products/$PRODUCT_ID/tasks/<task-b-id>/dependencies/<task-a-id>" \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Add dependency A → B → shown as arrow in Canvas and on Gantt
- [ ] Creating a cycle (B → A when A → B exists) → rejected with clear error
- [ ] Remove dependency → arrow disappears

---

## Task detail panel (UI)

> Code: [frontend/src/components/common/TaskDetailPanel.tsx](../../frontend/src/components/common/TaskDetailPanel.tsx) · [frontend/src/components/common/MarkdownEditor.tsx](../../frontend/src/components/common/MarkdownEditor.tsx) (description field)

Open a task card on the Kanban board:

- [ ] Panel slides in from right
- [ ] Task name editable inline → autosaves
- [ ] Status dropdown changes column in real time
- [ ] Owner picker shows team members; selecting one assigns the task
- [ ] Reviewer picker works (separate from owner)
- [ ] Deadline date picker sets/clears deadline
- [ ] Colour picker sets task colour
- [ ] Description field (markdown) → preview toggle works
- [ ] Markdown headings, bold, lists, code blocks render correctly
- [ ] Subtask section: add, check, reorder, delete
- [ ] Dependency section: add and remove dependencies
- [ ] Unsaved change → close panel → "Unsaved changes" prompt
- [ ] Discard → changes lost; Save → changes persisted
- [ ] "Delete task" button → confirm dialog → task deleted; panel closes

---

## Task comments / messages

> Code: [backend/src/routes/messages.ts](../../backend/src/routes/messages.ts) (`?taskId=` filter separates task threads from product chat)

Tasks share the `/api/products/:id/messages` endpoint (with `taskId` filter). See [12-messaging.md](12-messaging.md) for full message tests.

- [ ] Task detail panel has a comment thread
- [ ] Messages posted in task thread do NOT appear in the main product chat

---

## Activity log (`GET /api/products/:productId/activity`)

> Code: [backend/src/routes/activity.ts](../../backend/src/routes/activity.ts)

```bash
curl -s -b cookies.txt "$BASE/api/products/$PRODUCT_ID/activity?limit=10" | jq .
```

- [ ] Activity log shows recent task actions with actor names

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
