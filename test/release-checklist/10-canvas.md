# 11 - Canvas View

← [Back to index](README.md)

Navigate to `/canvas` in Alpha Project.

---

## Canvas nodes

> Code: [frontend/src/components/canvas/CanvasView.tsx](../../frontend/src/components/canvas/CanvasView.tsx) (React Flow canvas: renders nodes from task list) · [frontend/src/components/canvas/nodes/TaskNode.tsx](../../frontend/src/components/canvas/nodes/TaskNode.tsx) (node content: name, status badge, owner avatar, deadline, milestone indicator)

- [ ] Canvas page loads without error
- [ ] Existing tasks appear as nodes at their saved canvas positions
- [ ] Tasks without a canvas position are placed in a default location (e.g. grid auto-layout)
- [ ] Task node shows: name, status badge, owner avatar (if assigned), deadline (if set)
- [ ] Milestone badge shown on tasks with a deadline
- [ ] Clicking a node opens the task detail panel

---

## Node creation

> Code: [frontend/src/components/canvas/CanvasView.tsx](../../frontend/src/components/canvas/CanvasView.tsx) (double-click handler creates task, saves position) · [backend/src/routes/tasks/crud.ts](../../backend/src/routes/tasks/crud.ts) (POST + PATCH position)

- [ ] Double-click on blank canvas area → creates a new task node
- [ ] New task modal appears (name required)
- [ ] After creating, node appears at the double-clicked location
- [ ] Node position saved (`canvasX`, `canvasY` on the task)

---

## Node movement

> Code: [frontend/src/components/canvas/CanvasView.tsx](../../frontend/src/components/canvas/CanvasView.tsx) (drag-end handler calls `PATCH /tasks/:id/position`) · [backend/src/routes/tasks/crud.ts](../../backend/src/routes/tasks/crud.ts) (position endpoint)

- [ ] Drag a node to a new position → position saved on mouse-up
- [ ] After reload, node is at the same position
- [ ] Moving multiple nodes works independently

---

## Dependency arrows (connections)

> Code: [backend/src/routes/connections.ts](../../backend/src/routes/connections.ts) (create/delete/list connections; cycle detection rejects reverse edges) · [frontend/src/components/canvas/CanvasView.tsx](../../frontend/src/components/canvas/CanvasView.tsx) (draw handle → drag to target → POST connection)

- [ ] Draw dependency arrow from node A to node B by dragging from A's connection handle to B
- [ ] Arrow appears on canvas after save
- [ ] Arrow persists after reload
- [ ] Cycle detection: draw B → A when A → B exists → rejected with error
- [ ] Multi-hop cycle A → B → C → A → rejected
- [ ] Delete arrow → connection removed from canvas
- [ ] Connections reflected in task `dependsOn`/`requiredBy` fields

---

## Canvas snapshots

> Code: [backend/src/routes/canvas-snapshots.ts](../../backend/src/routes/canvas-snapshots.ts) (save named layout, list, delete) · [frontend/src/hooks/useCanvasSnapshots.ts](../../frontend/src/hooks/useCanvasSnapshots.ts) (fetch/restore logic)

- [ ] Save current layout as named snapshot
- [ ] Snapshots listed in UI dropdown or list
- [ ] Restore snapshot → canvas positions and viewport restored
- [ ] Delete snapshot → removed from list
- [ ] Multiple snapshots can coexist
- [ ] Snapshot includes node positions and viewport (zoom, pan)

---

## Legend modal

> Code: [frontend/src/components/canvas/LegendModal.tsx](../../frontend/src/components/canvas/LegendModal.tsx) · [frontend/src/hooks/useColorLegend.ts](../../frontend/src/hooks/useColorLegend.ts) · [backend/src/routes/color-legend.ts](../../backend/src/routes/color-legend.ts)

- [ ] Open Legend modal (button on canvas toolbar)
- [ ] Shows colour legend for the product (from `colorLegend` route)
- [ ] Closing modal returns to canvas

---

## Color legend

> Code: [backend/src/routes/color-legend.ts](../../backend/src/routes/color-legend.ts) (`GET/PUT`) · [frontend/src/pages/settings/SettingsColors.tsx](../../frontend/src/pages/settings/SettingsColors.tsx) (editor UI)

- [ ] Default legend loads
- [ ] Updating legend → changes reflected in Legend modal
- [ ] Colour dots on Kanban cards match the legend

---

## Canvas performance

- [ ] 50+ nodes on canvas: no noticeable lag when panning or zooming
- [ ] 20+ connections: arrows render without severe performance degradation

---

## Mobile (canvas disabled)

- [ ] At 375px width, canvas view shows a placeholder or is not accessible
- [ ] No JavaScript errors in mobile mode for canvas route

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
