# 12 — Sprints

← [Back to index](README.md)

---

## Sprint CRUD (`/api/products/:productId/sprints`)

> Code: [backend/src/routes/sprints.ts](../../backend/src/routes/sprints.ts) (CRUD + add/remove task from sprint; removing sprint leaves tasks intact but unassigned) · [frontend/src/hooks/useSprints.ts](../../frontend/src/hooks/useSprints.ts) (sprint list, active-sprint detection)

```bash
# Create sprint
curl -s -b cookies.txt -X POST $BASE/api/products/$PRODUCT_ID/sprints \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"Sprint 1","startDate":"2026-07-01","endDate":"2026-07-14","color":"#6366f1"}' | jq .

# List sprints
curl -s -b cookies.txt $BASE/api/products/$PRODUCT_ID/sprints | jq '.[].name'

# Update sprint
curl -s -b cookies.txt -X PATCH $BASE/api/products/$PRODUCT_ID/sprints/<sprint-id> \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"name":"Sprint 1 — renamed","endDate":"2026-07-21"}' | jq .

# Delete sprint
curl -s -b cookies.txt -X DELETE $BASE/api/products/$PRODUCT_ID/sprints/<sprint-id> \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Create sprint with name, start date, end date, colour → appears in sprint filter
- [ ] Rename sprint → updates in all sprint pickers
- [ ] Edit dates → updated
- [ ] Delete sprint → sprint removed; tasks remain but are unassigned from sprint

---

## Adding tasks to a sprint (`/sprints/:sprintId/tasks`)

> Code: [backend/src/routes/sprints.ts](../../backend/src/routes/sprints.ts) (`/tasks` sub-route — enforces one sprint per task: adding to a new sprint removes from the old one)

```bash
# Add task to sprint
curl -s -b cookies.txt -X POST $BASE/api/products/$PRODUCT_ID/sprints/<sprint-id>/tasks \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"taskId":"<task-id>"}' | jq .

# Remove task from sprint
curl -s -b cookies.txt -X DELETE "$BASE/api/products/$PRODUCT_ID/sprints/<sprint-id>/tasks/<task-id>" \
  -H "X-CSRF-Token: $CSRF" | jq .
```

- [ ] Add task to Sprint 1 → task disappears from "No sprint" filter; appears in Sprint 1 filter on Kanban
- [ ] Remove task from sprint → task returns to "No sprint"
- [ ] A task can only be in one sprint at a time (adding to Sprint 2 removes from Sprint 1)
- [ ] Backlog panel shows tasks not in any sprint
- [ ] Sprint backlog panel shows tasks in the current sprint

---

## Sprint board UI

> Code: [frontend/src/components/kanban/SprintBacklogPanel.tsx](../../frontend/src/components/kanban/SprintBacklogPanel.tsx) (sprint backlog sidebar — drag to assign tasks to sprints) · [frontend/src/pages/KanbanPage.tsx](../../frontend/src/pages/KanbanPage.tsx) (sprint filter dropdown)

- [ ] Sprint filter on Kanban: select Sprint 1 → only Sprint 1 tasks shown across all columns
- [ ] Sprint filter "No sprint" → tasks not in any sprint
- [ ] Sprint filter "All" → all tasks
- [ ] Current sprint auto-selected on load (if there is an active sprint)
- [ ] Sprint panel (sidebar or bottom) shows Sprint 1 tasks with drag-to-assign capability

---

## Sprint stats / velocity

> Code: [backend/src/routes/analytics.ts](../../backend/src/routes/analytics.ts) (completed-per-sprint breakdown in analytics response) · [frontend/src/pages/AnalyticsPage.tsx](../../frontend/src/pages/AnalyticsPage.tsx)

- [ ] Analytics view shows completed-per-sprint data (if sprint has completed tasks)
- [ ] Sprint start/end dates affect which sprint is "current" in auto-select

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
