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
- [ ] Create task via API → returns 201 with full task object
- [ ] Empty name → 400 validation error
- [ ] Very long name (500+ chars) → rejected or truncated gracefully
- [ ] Task gets a unique `id` (UUID)
- [ ] `kanbanOrder` defaults sensibly (not null)
- [ ] `createdBy` is set to the creating user's ID

### Read

> Code: [backend/src/routes/tasks/crud.ts](../../backend/src/routes/tasks/crud.ts) (list includes `subtasks`, `dependsOn`, `requiredBy`) · [backend/src/db/selects.ts](../../backend/src/db/selects.ts) (task select shape)

```bash
# List all tasks
curl -s -b cookies.txt $BASE/api/products/$PRODUCT_ID/tasks | jq '.[].name'

# Get single task
curl -s -b cookies.txt $BASE/api/products/$PRODUCT_ID/tasks/<task-id> | jq .
```

- [ ] `GET /tasks` returns all tasks in the product (with subtasks, dependsOn, requiredBy)
- [ ] `GET /tasks/:id` returns a single task with full detail
- [ ] Non-member (Charlie) cannot GET tasks → 403
- [ ] Unauthenticated → 401

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
- [ ] Clear deadline (`"deadline": null`) → deadline removed
- [ ] Non-member cannot PATCH a task → 403

### Delete

> Code: [backend/src/routes/tasks/crud.ts](../../backend/src/routes/tasks/crud.ts) (DELETE - cascades to subtasks, removes from sprint)

```bash
curl -s -b cookies.txt -X DELETE $BASE/api/products/$PRODUCT_ID/tasks/<task-id> \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Delete via detail panel → task disappears from board; panel closes
- [ ] Delete via API → returns 200; task no longer in list
- [ ] Deleting a task deletes its subtasks (confirm not orphaned in DB)
- [ ] Deleting a task removes it from its sprint
- [ ] Non-member cannot DELETE → 403

---

## Task status values

> Code: [backend/prisma/schema.prisma](../../backend/prisma/schema.prisma) (TaskStatus enum) · [frontend/src/components/kanban/KanbanBoard.tsx](../../frontend/src/components/kanban/KanbanBoard.tsx) (column-to-status mapping)

Test that each valid status can be set and is reflected in UI:

- [ ] `backlog` - shown in Backlog view and Kanban backlog column
- [ ] `todo` - shown in Kanban
- [ ] `in_progress` - shown in Kanban
- [ ] `done` - shown in Kanban; card may have completed styling
- [ ] `blocked` - shown in Kanban; may have warning styling
- [ ] Invalid status value → 400 validation error

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

- [ ] Canvas position persists after page reload
- [ ] Multiple tasks can be moved independently

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
- [ ] Check subtask → `completed: true`; progress fraction updates on Kanban card
- [ ] Uncheck subtask → `completed: false`
- [ ] Rename subtask → name updates
- [ ] Reorder subtasks → order persists
- [ ] Delete subtask → removed from list
- [ ] Empty subtask name → validation error
- [ ] Progress counter on Kanban card: "2/3" when 2 of 3 subtasks complete

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

- [ ] Add dependency A → B: B's `dependsOn` includes A's ID
- [ ] Add dependency B → A (creates cycle): rejected with 409 or clear cycle error
- [ ] Multi-hop cycle A → B → C → A: rejected
- [ ] Dependencies visible in Canvas view as arrows
- [ ] Dependencies visible in Gantt view
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

Tasks share the `/api/products/:id/messages` endpoint (with `taskId` filter). See [13-messaging.md](13-messaging.md) for full message tests.

- [ ] Task detail panel has a comment thread
- [ ] Messages posted in task thread do NOT appear in the main product chat

---

## Activity log (`GET /api/products/:productId/activity`)

> Code: [backend/src/routes/activity.ts](../../backend/src/routes/activity.ts)

```bash
curl -s -b cookies.txt "$BASE/api/products/$PRODUCT_ID/activity?limit=10" | jq .
```

- [ ] Activity entries appear after task create, update, delete
- [ ] Entries show actor username and action
- [ ] Pagination works

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
