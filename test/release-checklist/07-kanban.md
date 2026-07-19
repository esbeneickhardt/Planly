# 08 - Kanban Board

← [Back to index](README.md)

Navigate to `/kanban` in Alpha Project as Admin, then repeat key checks as Alice (member).

---

## Columns (`/api/products/:productId/columns`)

> Code: [backend/src/routes/columns.ts](../../backend/src/routes/columns.ts) (CRUD + reorder; prevents deleting last column; moves tasks to first column on delete) · [frontend/src/components/kanban/KanbanColumn.tsx](../../frontend/src/components/kanban/KanbanColumn.tsx) (column header: name, sort toggle, add-task button)

```bash
# Create column
curl -s -b cookies.txt -X POST $BASE/api/products/$PRODUCT_ID/columns \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"In Review","order":3}' | jq .

# List columns
curl -s -b cookies.txt $BASE/api/products/$PRODUCT_ID/columns | jq '.[].name'

# Rename column
curl -s -b cookies.txt -X PATCH $BASE/api/products/$PRODUCT_ID/columns/<col-id> \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"Done ✅"}' | jq .

# Reorder columns
curl -s -b cookies.txt -X PATCH $BASE/api/products/$PRODUCT_ID/columns/reorder \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"columnIds":["<id1>","<id2>","<id3>"]}' | jq .

# Delete column
curl -s -b cookies.txt -X DELETE $BASE/api/products/$PRODUCT_ID/columns/<col-id> \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Default columns exist on the board
- [ ] Create column "In Review" → appears on board as rightmost column
- [ ] Rename column → name updates on board header
- [ ] Drag column to reorder → order persists after reload
- [ ] Delete column → tasks in that column move to the first column (not lost)
- [ ] Cannot delete the last remaining column → clear error

### Per-column sort

> Code: [frontend/src/components/kanban/KanbanColumn.tsx](../../frontend/src/components/kanban/KanbanColumn.tsx) (sort-mode toggle cycling through custom / deadline / alphabetical)

- [ ] Click sort icon (⇅) on a column header → cycles through sort modes
- [ ] "Deadline" sort: tasks with deadline nearest-first, no-deadline last
- [ ] "Alphabetical" sort works
- [ ] "Custom" sort restores drag order
- [ ] Reset to custom sort after non-custom sort

---

## Drag and drop

> Code: [frontend/src/components/kanban/KanbanBoard.tsx](../../frontend/src/components/kanban/KanbanBoard.tsx) (drag-end handler: PATCH task status + PATCH tasks/reorder) · [backend/src/routes/tasks/crud.ts](../../backend/src/routes/tasks/crud.ts) (reorder endpoint) · [backend/src/realtime/manager.ts](../../backend/src/realtime/manager.ts) (broadcasts position change to other clients)

- [ ] Drag task card from one column to another → status updates immediately
- [ ] Dragged task position persists after reload
- [ ] Drag task within same column to reorder → order persists
- [ ] Real-time: drag task → second browser window updates without reload

---

## Filters

> Code: [frontend/src/pages/KanbanPage.tsx](../../frontend/src/pages/KanbanPage.tsx) (filter state, active-filter count) · [frontend/src/components/kanban/KanbanBoard.tsx](../../frontend/src/components/kanban/KanbanBoard.tsx) (applies filters to task list)

- [ ] **Mine toggle**: click "Mine" → only tasks owned by current user shown; task count updates
- [ ] **Owner filter**: click owner avatar → filter by that owner; multi-select works
- [ ] **Colour filter**: click colour dot → filter by that colour
- [ ] **Sprint filter**: select sprint → only sprint tasks shown; "No sprint" option hides sprinted tasks
- [ ] **Reset all filters**: click ↺ → all filters cleared; full board visible
- [ ] Filters persist after navigating away and back (check localStorage or URL params)
- [ ] Active filter count shown somewhere on toolbar

---

## Compact view (table)

> Code: [frontend/src/pages/KanbanPage.tsx](../../frontend/src/pages/KanbanPage.tsx) (board/compact toggle, view-mode persisted to localStorage)

- [ ] Click "☰ Compact" toggle → board switches to table view
- [ ] All tasks shown in table with columns: name, status, owner, deadline, colour
- [ ] Click table column header → sort by that column
- [ ] Status dropdown per row → change status → status updates (also reflected in board view)
- [ ] Click task row → task detail panel opens
- [ ] "▦ Board" toggle → returns to board view
- [ ] View preference persists across page reload

---

## Backgrounds (desktop only)

> Code: [frontend/src/constants/kanbanBackgrounds.ts](../../frontend/src/constants/kanbanBackgrounds.ts) (background options) · [frontend/src/pages/KanbanPage.tsx](../../frontend/src/pages/KanbanPage.tsx) (background picker, saved to localStorage)

- [ ] Background picker button visible at ≥ 1024px width
- [ ] Select a background → board background changes
- [ ] Background preference persists across reload
- [ ] Background picker hidden on mobile (< 768px viewport)

---

## New task creation from board

> Code: [frontend/src/components/kanban/KanbanColumn.tsx](../../frontend/src/components/kanban/KanbanColumn.tsx) (inline task input, Enter to submit) · [backend/src/routes/tasks/crud.ts](../../backend/src/routes/tasks/crud.ts) (POST handler)

- [ ] Click + button at top of a column → inline task creation or modal
- [ ] Type task name → press Enter or click "Add" → task appears at top of column
- [ ] Created task has correct status matching the column it was created in
- [ ] Cancel/Escape → no task created

---

## Sprint filter on board

> Code: [frontend/src/pages/KanbanPage.tsx](../../frontend/src/pages/KanbanPage.tsx) (sprint filter dropdown) · [frontend/src/hooks/useSprints.ts](../../frontend/src/hooks/useSprints.ts) (sprint list fetch)

- [ ] Select "Sprint 1" in sprint filter → only Sprint 1 tasks shown
- [ ] Select "No sprint" → tasks not in any sprint shown
- [ ] Select "All" → all tasks shown
- [ ] Sprint filter works in combination with other filters

---

## Real-time updates

> Code: [backend/src/realtime/manager.ts](../../backend/src/realtime/manager.ts) (broadcasts to product room) · [frontend/src/hooks/useRealtimeUpdates.ts](../../frontend/src/hooks/useRealtimeUpdates.ts) (handles incoming events, updates React state)

Open the same board in two browser windows (or two users):

- [ ] Alice creates a task → appears in Admin's board without reload
- [ ] Admin drags a task → Alice sees the new position without reload
- [ ] Admin renames a column → Alice sees the new name without reload
- [ ] Admin deletes a task → it disappears from Alice's board
- [ ] WebSocket disconnection reconnects automatically

---

## Mobile responsiveness

- [ ] Board renders without horizontal scroll at page level
- [ ] Secondary filters (owner, colour, sprint) are hidden
- [ ] "Mine" toggle visible on mobile
- [ ] Board/Compact toggle visible on mobile
- [ ] Background picker hidden on mobile
- [ ] Task cards readable at small viewport
- [ ] Detail panel slides in correctly on mobile

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
