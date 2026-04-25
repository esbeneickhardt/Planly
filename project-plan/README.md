# Minimal Project Management Tool — Product Plan

A focused, visual project management tool built around one idea: **every task is on a visible path toward the product vision**. No bloat, no estimates that rot, no complexity for its own sake.

The core differentiator is the DAG canvas — a freeform planning surface where tasks are nodes and dependencies are edges you draw by hand. From this single source of truth, a Kanban board, Gantt chart, and backlog are all derived automatically.

---

## Documents

| Document | Description |
|----------|-------------|
| [Data Model](data-model.md) | Entities, fields, relationships, and DAG rules |
| [View: Canvas / DAG](view-canvas-dag.md) | The freeform planning canvas with drag-to-connect |
| [View: Kanban](view-kanban.md) | Status columns with foldable subtask checklists |
| [View: Gantt](view-gantt.md) | Auto-generated timeline from milestones and DAG progress |
| [View: Backlog](view-backlog.md) | Triage list ensuring every task has an owner |
| [Tech Stack](tech-stack.md) | Frontend, backend, database, auth, and key libraries |
| [Docker & Deployment](docker.md) | Per-company Docker Compose setup and upgrade process |
| [Build Phases](build-phases.md) | Phased implementation plan with validation goals |

---

## Core Principles

- **No time estimates.** They rot. Deadlines live on features (milestone tasks), not on individual tasks.
- **Every task points toward the product.** The DAG always reads left-to-right: prerequisites on the left, product vision on the right. Teams always see where they are headed.
- **Ownership is mandatory.** Every task must have an owner. Tasks without owners cannot leave the backlog.
- **One database per company.** Deployed as a Docker Compose stack. Simple to run, simple to upgrade, complete tenant isolation.
- **Progress is derived, never entered.** The Gantt and milestone progress bars are computed from the DAG — nobody fills in status reports.

---

## Entity Summary

```
User ──────────┐
               ├── Team ──── Product ──── Task ──── Task (dependsOn)
               └────────────────────────────┘
```

A **Task** with a `deadline` becomes a **Milestone** (feature checkpoint). Its progress is the fraction of all transitively prerequisite tasks that are `done`. See [Data Model](data-model.md) for full details.

---

## Key Views at a Glance

- **[Canvas](view-canvas-dag.md)** — drag nodes, pull edges, auto-layout. The planning session surface.
- **[Kanban](view-kanban.md)** — four columns, expandable cards showing subtask checklists inline.
- **[Gantt](view-gantt.md)** — auto-generated timeline, milestone progress bars, today line.
- **[Backlog](view-backlog.md)** — triage surface; owner assignment gate before tasks enter the board.

---

## Build Order

See [Build Phases](build-phases.md) for the full phased plan. In short:

1. Foundation — users, teams, products, tasks, Kanban, Backlog
2. DAG Canvas — nodes, edges, auto-layout, milestone rendering
3. Gantt — auto-generated from milestones and DAG progress
4. Polish — path highlighting, blocked detection, filters
