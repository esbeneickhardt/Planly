# View: Kanban

← [Back to README](README.md)

The Kanban board provides the day-to-day work surface. It maps directly to the `status` field on each task and stays in sync with the [Canvas / DAG](view-canvas-dag.md) in real time.

---

## Columns

| Column | Status Value | Description |
|--------|-------------|-------------|
| Backlog | `backlog` | Triage zone. Tasks here must get an owner before they can move forward. See [Backlog view](view-backlog.md). |
| To Do | `todo` | Committed work, not yet started. Owner assigned. |
| In Progress | `in_progress` | Actively being worked on. |
| Done | `done` | Completed. `completedBy` and `completedAt` are set. |

A fifth visual state — **Blocked** — is surfaced as a red banner on the card rather than a separate column. Blocked tasks remain in their current column but are visually flagged. See [Data Model — Status Transitions](data-model.md#status-transitions).

---

## Card Design

Each card shows:
- Task name (bold)
- Owner avatar + username
- Color accent strip on the left edge (from `task.color`)
- Milestone badge if this task is a direct dependency of a milestone (shows milestone name and its deadline)
- Subtask progress chip: `3 / 5 ✓` — only shown if the task has subtasks
- Blocked indicator (red banner): shown if any prerequisite task is `blocked` or `in_progress` with no recent activity

Cards are compact by default. The name and owner are always visible.

---

## Subtask Fold-Out

Inspired by [Instagantt's Kanban](https://www.instagantt.com/features/kanban-board-view), each card expands to show its subtask checklist inline.

**Collapsed state (default):**
```
┌─────────────────────────────┐
│ ▶  Implement login flow     │
│    👤 alice    3 / 5 ✓      │
└─────────────────────────────┘
```

**Expanded state (click card or ▶ arrow):**
```
┌─────────────────────────────┐
│ ▼  Implement login flow     │
│    👤 alice    3 / 5 ✓      │
│  ─────────────────────────  │
│  ✅ Set up JWT middleware    │
│  ✅ Create /login endpoint  │
│  ✅ Create /logout endpoint │
│  ☐  Add refresh tokens      │
│  ☐  Write auth tests        │
│  + Add subtask              │
└─────────────────────────────┘
```

Behaviour:
- Clicking a subtask checkbox marks it complete inline — no modal, no page reload
- Completed subtasks show with strikethrough text
- The subtask progress chip on the collapsed card updates immediately
- `+ Add subtask` appends a new empty subtask with an inline text input
- Subtasks can be reordered by drag within the expanded card

Subtasks are **not** DAG nodes — they are a simple checklist belonging to their parent task. See [Data Model — Subtask](data-model.md#subtask-embedded-in-task).

---

## Moving Cards

Cards move between columns by:
- **Drag and drop** — drag a card to a different column
- **Status selector** — open the task detail panel and change status from a dropdown

**Constraint:** A card in `backlog` cannot be dragged to `todo` if `ownerId` is not set. The UI prevents the drop and shows a tooltip: *"Assign an owner before moving to To Do."*

---

## Filtering

The Kanban toolbar supports:
- Filter by owner (show only cards assigned to selected users)
- Hide done (collapse the Done column)
- Show only tasks with approaching milestone deadlines (within N days)

Filters are session-local and not persisted.

---

## Connection to Other Views

- Changing a card's column here changes `task.status` — this is immediately reflected in the [Canvas](view-canvas-dag.md) (node status ring updates) and [Gantt](view-gantt.md) (progress bars update).
- Cards in the Backlog column link to the [Backlog view](view-backlog.md) for bulk triage operations (assigning owners, setting priorities).
- A milestone task appears as a card in the Kanban too — its subtask fold-out shows the same subtask checklist, but its progress chip shows transitive DAG dependency progress, not subtask count.
