# View: Canvas / DAG

← [Back to README](README.md)

The canvas is the heart of the tool — a freeform planning surface where tasks are nodes and dependencies are edges drawn by hand. It is the primary view for planning sessions and is the single source of truth from which all other views are derived.

---

## Mental Model

The DAG always reads **left to right**:

```
[Task A] ──► [Task B] ──► [Milestone: Feature X] ──► [Product Vision]
[Task C] ──────────────────────────────────────────► [Product Vision]
```

- **Left** = things you can start today (no incomplete dependencies)
- **Right** = the product (always visible as the terminal node)
- Every node is visibly on a path toward the product, giving the team a continuous sense of progression

The `dependsOn` relationship means: *Task B cannot start until Task A is done.* In the canvas, this is represented as an arrow from A to B. See [Data Model — DAG Rules](data-model.md#dag-rules) for enforcement details.

---

## Node Types

### Regular Task Node
- Rounded rectangle
- Shows: task name, owner avatar, status color ring, task color accent
- Status color ring: grey (backlog), blue (todo), yellow (in_progress), green (done), red (blocked)
- Connection handles: one on the right edge (output), one on the left edge (input)

### Milestone Node (task with deadline)
- Same as regular task node but with a thicker border and a deadline badge below the name
- Badge format: `📅 Dec 15` — turns red when deadline is within 7 days and task is not done
- Shows progress fraction: `4 / 7 tasks done` computed from transitive dependencies
- See [Data Model — Milestone Detection](data-model.md#milestone-detection)

### Product Node
- Visually distinct — larger, always on the far right, cannot be deleted
- Shows: product name, emoji, deadline, overall progress
- All paths in the DAG terminate here
- Cannot have outgoing edges (it is the terminal node)

---

## Drawing Edges

To create a dependency:
1. Hover over the source node — a handle appears on its **right edge**
2. Click and drag from the right handle to the **left handle** of the destination node
3. Release — a `dependsOn` edge is created (destination depends on source)
4. If the edge would create a cycle, it snaps back and a toast error is shown

To delete an edge: click the edge to select it, then press `Delete` or `Backspace`.

---

## Interactions

| Action | How |
|--------|-----|
| Create task | Double-click empty canvas area — opens inline name input, creates node on confirm |
| Edit task | Click node to open task detail panel (slides in from right) |
| Move node | Drag the node body |
| Draw edge | Drag from right handle of source to left handle of destination |
| Delete node | Select node, press `Delete` (confirms if node has dependents) |
| Delete edge | Click edge to select, press `Delete` |
| Pan canvas | Click and drag empty canvas, or use middle mouse button |
| Zoom | Scroll wheel, or pinch on trackpad |
| Select multiple | `Shift+click` or drag a selection box |
| Auto-layout | Toolbar button — runs dagre left-to-right layout algorithm |

---

## Auto-Layout

The **Auto-Layout** button re-positions all nodes using the `dagre` graph layout algorithm with a left-to-right direction (`rankdir: LR`). Node positions are saved after layout so manual adjustments persist.

Manual positions are preserved between sessions. Running Auto-Layout again resets to the computed positions.

---

## Filters

The canvas toolbar exposes filters that dim (not hide) non-matching nodes to keep spatial context:

| Filter | Effect |
|--------|--------|
| Hide done | Done tasks are shown as 20% opacity, their edges remain |
| Owner filter | Select one or more users — non-matching tasks dimmed |
| Show only path to milestone | Select a milestone node — only its transitive dependency chain is highlighted, rest dimmed |
| Time window | Dim tasks whose milestone ancestor deadline falls outside the selected range |

Filters are local to the session and not persisted.

---

## Toolbar

```
[ Auto-Layout ] [ Filters ▼ ] [ Zoom: 100% ] [ Fit to screen ]   [ + New Task ]
```

---

## Implementation Notes

Built with **React Flow**. See [Tech Stack](tech-stack.md#react-flow) for library details.

Key React Flow configuration:
- `connectionMode: 'strict'` — only right-to-left handle connections allowed
- Custom node components for each node type
- Edge type: `smoothstep` for clean routing around nodes
- `dagre` integration for auto-layout (standard React Flow + dagre pattern)
- Node positions stored in `task.canvasPosition: {x, y}` field on the backend

The product node is a special non-deletable node created automatically when a product is created. It has no `dependsOn` and cannot be given any.
