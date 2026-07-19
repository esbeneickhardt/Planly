# 10 - Gantt / Progress View

← [Back to index](README.md)

Navigate to `/gantt` in Alpha Project. Requires tasks with deadlines to be meaningful.

---

## Prerequisites

Before testing Gantt, create in Alpha Project:
- [ ] At least 3 tasks with deadlines spread across the next 3 months
- [ ] At least 1 task that is overdue (deadline in the past, status not `done`)
- [ ] At least 1 dependency between two tasks

---

## Gantt chart display

> Code: [frontend/src/pages/GanttPage.tsx](../../frontend/src/pages/GanttPage.tsx) (bar rendering, health-colour logic, hover popover) · [frontend/src/hooks/useGanttData.ts](../../frontend/src/hooks/useGanttData.ts) (maps milestone data to bar positions)

- [ ] Gantt page loads without error
- [ ] Tasks with deadlines appear as horizontal bars on the timeline
- [ ] Bar color reflects health:
  - Green = on track (deadline ≥ 7 days out, not done)
  - Amber = approaching (deadline 1-7 days out)
  - Red = overdue or deadline passed
  - Grey/Blue = completed
- [ ] Hover over a bar → popover shows task name, deadline, status, assignee
- [ ] Overdue milestones shown in red
- [ ] "Milestones X/Y" completion counter shown (and NOT shown on other views)

---

## Timeline navigation

> Code: [frontend/src/hooks/useGanttDragZoom.ts](../../frontend/src/hooks/useGanttDragZoom.ts) (pan and zoom interaction handlers)

- [ ] Timeline spans a reasonable range (past month to future months)
- [ ] Horizontal scroll works (timeline can be scrolled left/right)
- [ ] Zoom in/out (if available) works
- [ ] Today marker is visible on the timeline

---

## Sprint lanes

> Code: [frontend/src/pages/GanttPage.tsx](../../frontend/src/pages/GanttPage.tsx) (sprint lane grouping) · [frontend/src/hooks/useSprints.ts](../../frontend/src/hooks/useSprints.ts)

- [ ] Sprint lanes visible if sprints are configured
- [ ] Tasks assigned to a sprint appear in that sprint's lane
- [ ] Unassigned tasks appear in a separate lane

---

## Dependencies on Gantt

> Code: [frontend/src/pages/GanttPage.tsx](../../frontend/src/pages/GanttPage.tsx) (renders dependency arrows between bars) · [backend/src/routes/tasks/dependencies.ts](../../backend/src/routes/tasks/dependencies.ts) (data source via task `dependsOn`)

- [ ] Dependency arrows between tasks shown on the Gantt timeline
- [ ] Arrow points from prerequisite to dependent task
- [ ] Arrow redraws if task deadline changes

---

## Mobile view (`GanttMobileList`)

> Code: [frontend/src/components/gantt/GanttMobileList.tsx](../../frontend/src/components/gantt/GanttMobileList.tsx) (plain list with name, deadline, status, health colour shown instead of timeline at narrow widths)

At 375px width:
- [ ] Mobile list view shown instead of the timeline chart
- [ ] Tasks listed with name, deadline, status, health colour
- [ ] Tapping a task opens task detail panel

---

## Analytics

> Code: [backend/src/routes/analytics.ts](../../backend/src/routes/analytics.ts) (task completion over time, workload per member) · [frontend/src/pages/AnalyticsPage.tsx](../../frontend/src/pages/AnalyticsPage.tsx) (summary cards, bar chart with period toggle, top contributors, event log)

- [ ] Analytics page loads without error
- [ ] Summary cards: active tasks, completed tasks, total tasks, average cycle time
- [ ] Bar chart with period toggle 7d / 30d / 90d works
- [ ] Hover bar → tooltip with count
- [ ] Top contributors list with username and proportional bars
- [ ] Event log with real usernames; "Load more" works
- [ ] Switching to Beta Project reloads all data for that product
- [ ] Charlie cannot navigate to Alpha Project analytics page (blocked or redirected)

---

## Bug log

| # | Description | Steps to reproduce | Severity |
|---|---|---|---|
| | | | |
