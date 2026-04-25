# View: Gantt

← [Back to README](README.md)

The Gantt chart is **fully auto-generated** from the DAG and milestone deadlines. Nobody fills in anything here — it is a read-only visualization derived from the data entered in the [Canvas](view-canvas-dag.md) and [Kanban](view-kanban.md).

---

## What Appears on the Gantt

Only **Milestone tasks** (tasks with a `deadline` set) appear as rows in the Gantt. Regular tasks without deadlines do not get rows — they contribute to milestone progress but are not directly plotted.

The **Product** itself always appears as the final row, using its own `deadline` as the anchor.

See [Data Model — Milestone Detection](data-model.md#milestone-detection) for how progress is computed.

---

## Layout

```
Timeline: Jan ──────────── Mar ─────────────── Jun ──── [Product Deadline]
                │ Today

Feature: Auth   [████████░░░░░░░░░░░░░] Dec 15   6 / 10 tasks done
Feature: Dash   [██░░░░░░░░░░░░░░░░░░░] Feb 1    2 / 9 tasks done
Feature: API    [██████████████░░░░░░░] Mar 30   7 / 8 tasks done  ⚠ overdue
Product         [░░░░░░░░░░░░░░░░░░░░░] Jun 30   15 / 27 tasks done
```

### Columns
- **Row label** — milestone name (or product name for the final row)
- **Progress bar** — fills proportionally to `done / total` transitive dependency tasks
- **Deadline marker** — vertical tick on the timeline axis at the deadline date
- **Progress label** — `X / Y tasks done` shown to the right of the bar

### Timeline axis
- X axis spans from the earliest task `createdAt` date to the product `deadline`
- A vertical **"Today" line** crosses all rows
- Month labels along the top

---

## Progress Bar Behaviour

The progress bar represents:

```
done_count  =  count of tasks in the transitive dependency set with status = 'done'
total_count =  count of all tasks in the transitive dependency set
progress    =  done_count / total_count
```

The bar fills left-to-right. It does **not** represent time — it represents task completion fraction. This is intentional: no estimates, no time-boxing, just honest progress.

The bar colour:
- **Green** — on track (deadline is in the future and progress is proportional to time elapsed)
- **Amber** — at risk (deadline is within 14 days and progress < 70%)
- **Red** — overdue (deadline has passed and status is not done) — a `⚠` warning icon also appears

---

## Milestone Dependency Chain

When you hover over a milestone row, its direct prerequisite tasks are listed in a popover:

```
Feature: Auth — Dec 15
  Dependencies:
  ✅ Set up JWT (done by alice, Nov 3)
  ✅ Create /login endpoint (done by bob, Nov 5)
  🔄 Add refresh tokens (in_progress — alice)
  ☐  Write auth tests (todo — charlie)
  ☐  Security review (backlog — unassigned ⚠)
```

Unassigned tasks surface here as a warning — they are blockers hiding in the backlog.

---

## Filters

| Filter | Effect |
|--------|--------|
| Show all milestones | Default — all milestone tasks shown |
| Filter by owner | Show only milestones where at least one dependency task is owned by the selected user |
| Hide completed milestones | Collapse rows where progress = 100% |
| Zoom timeline | Compress or expand the X axis (month / quarter / year granularity) |

---

## Connection to Other Views

- The Gantt is **read-only** — no editing happens here. To add or change dependencies, go to the [Canvas](view-canvas-dag.md).
- To set or change a deadline (making a task a milestone), open the task detail panel from the [Canvas](view-canvas-dag.md) or [Kanban](view-kanban.md).
- Clicking a milestone row label navigates to that task's detail panel.
- The progress bars update in real time as tasks are completed in the Kanban or Canvas.
