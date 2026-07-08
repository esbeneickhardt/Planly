# 08 — Kanban Board

← [Back to index](README.md)

Navigate to `/kanban` in Alpha Project as Admin, then repeat key checks as Alice (member).

---

## Columns (`/api/products/:productId/columns`)

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

- [ ] Default columns exist (Backlog, To Do, In Progress, Done — or similar)
- [ ] Create column "In Review" → appears on board as rightmost column
- [ ] Rename column → name updates on board header
- [ ] Drag column to reorder → order persists after reload
- [ ] API reorder → order persists after reload
- [ ] Delete column → tasks in that column move to the first column (not lost)
- [ ] Cannot delete the last remaining column → clear error
- [ ] Empty column name → 400
- [ ] Non-member cannot create/rename/delete columns → 403

### Per-column sort

- [ ] Click sort icon (⇅) on a column header → cycles through sort modes
- [ ] "Deadline" sort: tasks with deadline nearest-first, no-deadline last
- [ ] "Alphabetical" sort works
- [ ] "Custom" sort restores drag order
- [ ] Reset to custom sort after non-custom sort

---

## Drag and drop

- [ ] Drag task card from one column to another → status updates immediately
- [ ] Dragged task position persists after reload
- [ ] Drag task within same column to reorder → order persists
- [ ] Real-time: drag task → second browser window updates without reload
- [ ] Dragging a task to the same position does not trigger unnecessary saves

---

## Filters

- [ ] **Mine toggle**: click "Mine" → only tasks owned by current user shown; task count updates
- [ ] **Owner filter**: click owner avatar → filter by that owner; multi-select works
- [ ] **Colour filter**: click colour dot → filter by that colour
- [ ] **Sprint filter**: select sprint → only sprint tasks shown; "No sprint" option hides sprinted tasks
- [ ] **Reset all filters**: click ↺ → all filters cleared; full board visible
- [ ] Filters persist after navigating away and back (check localStorage or URL params)
- [ ] Active filter count shown somewhere on toolbar

---

## Compact view (table)

- [ ] Click "☰ Compact" toggle → board switches to table view
- [ ] All tasks shown in table with columns: name, status, owner, deadline, colour
- [ ] Click table column header → sort by that column
- [ ] Status dropdown per row → change status → status updates (also reflected in board view)
- [ ] Click task row → task detail panel opens
- [ ] "▦ Board" toggle → returns to board view
- [ ] View preference persists across page reload

---

## Backgrounds (desktop only)

- [ ] Background picker button visible at ≥ 1024px width
- [ ] Select a background → board background changes
- [ ] Background preference persists across reload
- [ ] Background picker hidden on mobile (< 768px viewport)

---

## New task creation from board

- [ ] Click + button at top of a column → inline task creation or modal
- [ ] Type task name → press Enter or click "Add" → task appears at top of column
- [ ] Created task has correct status matching the column it was created in
- [ ] Cancel/Escape → no task created

---

## Sprint filter on board

- [ ] Select "Sprint 1" in sprint filter → only Sprint 1 tasks shown
- [ ] Select "No sprint" → tasks not in any sprint shown
- [ ] Select "All" → all tasks shown
- [ ] Sprint filter works in combination with other filters

---

## Real-time updates

Open the same board in two browser windows (or two users):

- [ ] Alice creates a task → appears in Admin's board without reload
- [ ] Admin drags a task → Alice sees the new position without reload
- [ ] Admin renames a column → Alice sees the new name without reload
- [ ] Admin deletes a task → it disappears from Alice's board
- [ ] WebSocket disconnection reconnects automatically

---

## Mobile responsiveness

Resize browser to 375px width:

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
