# View: Backlog

← [Back to README](README.md)

The Backlog is the triage surface. It shows all tasks in the `backlog` status and enforces the rule that **every task must have an owner before it can enter active work**. This is the primary tool for preventing the rot that kills most project backlogs.

---

## Purpose

In most tools, the backlog becomes a graveyard — tasks accumulate, nobody owns them, nothing happens. This view is designed to prevent that by making ownerless tasks highly visible and blocking their progression.

---

## Layout

A flat, sortable list of tasks. Each row shows:

| Column | Notes |
|--------|-------|
| Task name | Clickable — opens task detail panel |
| Owner | Avatar + username if assigned. Red **"Unassigned"** badge if not. |
| Milestone | Which milestone (if any) this task is a prerequisite for |
| Created | When the task was created and by whom |
| Subtasks | `3 / 5` chip if task has subtasks |
| Actions | `Assign Owner`, `Move to To Do`, `Delete` |

---

## Owner Assignment Gate

A task **cannot** be moved from Backlog to To Do unless it has an owner. This is enforced at:
- The UI level (drag-to-column in Kanban is blocked, "Move to To Do" button is disabled)
- The API level (status transition from `backlog` to `todo` without `ownerId` returns a 400 error)

When clicking "Move to To Do" on an unassigned task, the UI immediately opens an owner picker inline rather than showing an error. The task moves as soon as an owner is selected.

---

## Sorting

Default sort: **oldest first** (creation date ascending) — forces confrontation with tasks that have been sitting longest.

Other sort options:
- Newest first
- Alphabetical
- By milestone (grouped under their milestone)
- Unassigned first

---

## Bulk Actions

Select multiple tasks with checkboxes to:
- Assign owner to all selected
- Delete all selected (with confirmation)
- Move all selected to To Do (only succeeds for those with owners; others are skipped with a count shown)

---

## Unassigned Task Warning

A persistent banner at the top of the view shows:

```
⚠  12 tasks have no owner. Tasks without owners cannot progress.
   [ Assign owners → ]
```

This banner is also shown in the main navigation as a badge count so it is never invisible.

---

## Connection to Other Views

- Tasks created in the [Canvas](view-canvas-dag.md) start in `backlog` status by default (unless an owner is immediately assigned during creation).
- Moving a task to To Do here moves its card to the To Do column in [Kanban](view-kanban.md) and updates its node status ring in the [Canvas](view-canvas-dag.md).
- Tasks that are prerequisites of milestones are flagged in the backlog — an unassigned prerequisite is a hidden risk to a deadline shown in the [Gantt](view-gantt.md).
