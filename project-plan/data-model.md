# Data Model

← [Back to README](README.md)

---

## Entities

### User

The human actor. Every task must have an owner drawn from the user pool.

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `id` | yes | uuid | |
| `username` | yes | string | Unique. Used for @mentions and display. |
| `email` | yes | string | Unique. Used for login and notifications. |
| `realName` | no | string | Display alongside username when set. |
| `phone` | no | string | Optional contact info. |
| `avatarEmoji` | no | string | Single emoji or URL to image. |
| `passwordHash` | yes | string | Stored as bcrypt hash. |
| `createdAt` | yes | timestamp | |

---

### Team

A named group of users. A product is assigned to one team, which scopes who can be task owners.

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `id` | yes | uuid | |
| `name` | yes | string | |
| `memberIds` | yes | uuid[] | References `User.id`. |
| `createdAt` | yes | timestamp | |

---

### Product

The top-level container for all work. Represents the product vision — the rightmost node in every DAG view.

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `id` | yes | uuid | |
| `name` | yes | string | |
| `emoji` | no | string | Visual identity in nav and cards. |
| `description` | no | string | The vision statement. |
| `deadline` | yes | date | The product's target completion date. |
| `teamId` | yes | uuid | References `Team.id`. |
| `createdAt` | yes | timestamp | |

---

### Task

The core unit of work. Every task belongs to a product and lives in the DAG. A task with a `deadline` is treated as a **Milestone** (feature checkpoint) throughout the UI — see [Gantt view](view-gantt.md) and [Canvas view](view-canvas-dag.md).

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `id` | yes | uuid | |
| `productId` | yes | uuid | References `Product.id`. |
| `name` | yes | string | |
| `description` | no | string | Rich text or plain. |
| `status` | yes | enum | `backlog`, `todo`, `in_progress`, `done`, `blocked` |
| `ownerId` | yes | uuid | References `User.id`. Required before task can leave backlog. |
| `color` | no | string | Hex color. Used in canvas nodes and Kanban cards. |
| `deadline` | no | date | If set, this task is a **Milestone** and appears in the Gantt. |
| `dependsOn` | yes | uuid[] | References other `Task.id`s in same product. Forms the DAG edges. |
| `subtasks` | no | Subtask[] | Inline checklist — not full tasks. See below. |
| `completedBy` | no | uuid | Set when status transitions to `done`. References `User.id`. |
| `completedAt` | no | timestamp | Set when status transitions to `done`. |
| `createdAt` | yes | timestamp | |
| `createdBy` | yes | uuid | References `User.id`. |

---

### Subtask (embedded in Task)

Simple checklist items nested inside a task. Visible as a foldable checklist in the [Kanban view](view-kanban.md). Not nodes in the DAG.

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `id` | yes | uuid | |
| `name` | yes | string | |
| `completed` | yes | boolean | Default false. |
| `completedBy` | no | uuid | References `User.id`. |
| `completedAt` | no | timestamp | |
| `order` | yes | integer | Display order within the task. |

---

## Relationships

```
User ←──────────── Team.memberIds[]
                       │
                       ▼
                    Product
                       │
              ┌────────┴────────┐
              ▼                 ▼
            Task ──dependsOn──► Task
              │
              └── Subtask[]
```

---

## DAG Rules

The `dependsOn` array on each task forms a **Directed Acyclic Graph** within a product. The following rules are enforced:

1. **No cycles.** Before accepting a new `dependsOn` edge, the backend traverses the graph using a recursive query to check that adding the edge would not create a cycle. If it would, the request is rejected with a clear error.
2. **Same product only.** A task may only depend on other tasks within the same product.
3. **Product node is terminal.** The product itself is conceptually the rightmost node. No task has the product as a dependency — tasks lead *toward* the product.

DAG edges are stored as a simple join table: `task_dependencies(from_task_id, to_task_id)`, where `to_task_id` is the prerequisite. This makes graph traversal queries straightforward.

---

## Milestone Detection

A task is a **Milestone** if `deadline IS NOT NULL`. The system computes its progress automatically:

```
progress = count(done tasks in transitive dependency set)
         / count(all tasks in transitive dependency set)
```

This is computed on read, not stored — it updates the moment any dependency task changes status. See [Gantt view](view-gantt.md) for how this is displayed.

---

## Status Transitions

```
backlog ──► todo ──► in_progress ──► done
                   └──► blocked ──► in_progress
```

- A task cannot move from `backlog` to `todo` unless `ownerId` is set.
- When status becomes `done`, `completedBy` and `completedAt` are set automatically from the authenticated user and server time.
- A task is automatically surfaced as `blocked` in the UI if any of its `dependsOn` tasks are `blocked` or have been in `in_progress` for an unusually long time (heuristic, configurable).
