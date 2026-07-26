/**
 * Shared milestone/dependency-graph utilities. A "milestone" is any task with a deadline set
 * (see `frontend/src/components/canvas/canvasUtils.ts` and `backend/src/routes/milestones.ts`
 * for the same convention). Used by both the Canvas dependency graph and the Backlog table.
 */
import type { Task } from '../types';
import { PRESET_COLORS } from '../hooks/useColorLegend';

/** BFS over dependsOn links returning all transitive prerequisite IDs of the given task IDs. */
export function getAncestorIds(taskIds: string[], allTasks: Task[]): Set<string> {
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  const result = new Set<string>();
  const queue = [...taskIds];
  while (queue.length) {
    const id = queue.shift()!;
    const task = byId.get(id);
    if (!task) continue;
    for (const dep of task.dependsOn) {
      if (!result.has(dep.prerequisiteId)) {
        result.add(dep.prerequisiteId);
        queue.push(dep.prerequisiteId);
      }
    }
  }
  return result;
}

/**
 * For every non-milestone task, finds the "primary" milestone it transitively feeds into by
 * walking `requiredBy` forward until hitting a deadline-bearing task. A task can reach more than
 * one milestone through different dependency paths; when it does, the nearest-deadline one wins.
 * Each task's reachable-milestone set is memoized, so every edge in the graph is visited once
 * overall (O(V+E)) rather than once per milestone.
 */
export function computePrimaryMilestones(tasks: Task[]): Map<string, Task> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const memo = new Map<string, Task[]>();

  function reachableMilestones(id: string, stack: Set<string>): Task[] {
    const cached = memo.get(id);
    if (cached) return cached;
    if (stack.has(id)) return []; // cycle guard - dependency graphs shouldn't have cycles, but don't hang if one slips through
    stack.add(id);
    const task = byId.get(id);
    const found: Task[] = [];
    if (task) {
      for (const { dependentId } of task.requiredBy) {
        const dependent = byId.get(dependentId);
        if (!dependent) continue;
        if (dependent.deadline) found.push(dependent);
        else found.push(...reachableMilestones(dependentId, stack));
      }
    }
    stack.delete(id);
    memo.set(id, found);
    return found;
  }

  const primary = new Map<string, Task>();
  for (const t of tasks) {
    if (t.deadline) continue;
    const reached = reachableMilestones(t.id, new Set());
    if (reached.length === 0) continue;
    const nearest = reached.reduce((a, b) => (new Date(a.deadline!) < new Date(b.deadline!) ? a : b));
    primary.set(t.id, nearest);
  }
  return primary;
}

/**
 * Assigns each milestone a distinct, stable color so it reads the same way everywhere it's shown
 * (Tasks tab badge/column, Kanban card, Kanban milestone filter). A milestone that already has an
 * explicit `color` set (via the normal color-tag picker) keeps it; the rest cycle through
 * PRESET_COLORS in deadline order, so the assignment doesn't reshuffle across reloads as long as
 * the milestone set is unchanged.
 */
export function assignMilestoneColors(tasks: Task[]): Map<string, string> {
  const milestones = tasks
    .filter((t) => !!t.deadline)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());
  const colors = new Map<string, string>();
  let cycleIndex = 0;
  for (const m of milestones) {
    if (m.color) {
      colors.set(m.id, m.color);
    } else {
      colors.set(m.id, PRESET_COLORS[cycleIndex % PRESET_COLORS.length]!);
      cycleIndex++;
    }
  }
  return colors;
}

/** Synthetic cluster id for tasks that don't feed into any milestone, in "Group by milestone" mode */
export const UNASSIGNED_CLUSTER = '__unassigned__';

export interface MilestoneCluster {
  id: string;
  children: Task[];
}

/**
 * Partitions an already status/column-filtered task list into per-milestone clusters for "Group by
 * milestone" displays (Kanban board columns, Kanban mobile list). A milestone task heads its own
 * cluster and appears within it as the first child - Kanban cards carry inline actions like
 * subtask toggling that a header-only summary can't provide, so hiding the card entirely would
 * lose them. Tasks that don't feed into any milestone land in a trailing synthetic
 * `UNASSIGNED_CLUSTER` bucket. Cluster order follows `milestoneOrderIds` (the user's
 * manually-dragged order), with any milestone not yet in that list appended at the end.
 */
export function buildMilestoneClusters(
  tasks: Task[],
  primaryMilestones: Map<string, Task>,
  milestoneOrderIds: string[] = [],
): MilestoneCluster[] {
  const childrenByMilestoneId = new Map<string, Task[]>();
  const unassigned: Task[] = [];
  for (const t of tasks) {
    if (t.deadline) {
      if (!childrenByMilestoneId.has(t.id)) childrenByMilestoneId.set(t.id, []);
      childrenByMilestoneId.get(t.id)!.unshift(t);
      continue;
    }
    const m = primaryMilestones.get(t.id);
    if (!m) {
      unassigned.push(t);
      continue;
    }
    if (!childrenByMilestoneId.has(m.id)) childrenByMilestoneId.set(m.id, []);
    childrenByMilestoneId.get(m.id)!.push(t);
  }
  const orderedIds = [
    ...milestoneOrderIds.filter((id) => childrenByMilestoneId.has(id)),
    ...Array.from(childrenByMilestoneId.keys()).filter((id) => !milestoneOrderIds.includes(id)),
  ];
  const clusters = orderedIds.map((id) => ({ id, children: childrenByMilestoneId.get(id)! }));
  if (unassigned.length > 0) clusters.push({ id: UNASSIGNED_CLUSTER, children: unassigned });
  return clusters;
}

export interface StatusCluster {
  statusKey: string;
  label: string;
  color: string;
  children: Task[];
}

/**
 * Partitions one milestone-column's tasks (the milestone task itself plus everything that feeds
 * into it) into per-status buckets, ordered by the real Kanban column order - the "milestone
 * columns" board view's equivalent of buildMilestoneClusters above, but grouping by the directly
 * stored `status` field instead of walking the dependency graph. Every real column gets a bucket
 * even when empty, so an empty status still renders as a valid drop target.
 */
export function buildStatusClusters(
  tasks: Task[],
  columns: { statusKey: string; label: string; color: string }[],
): StatusCluster[] {
  const byStatus = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!byStatus.has(t.status)) byStatus.set(t.status, []);
    byStatus.get(t.status)!.push(t);
  }
  return columns.map((c) => ({
    statusKey: c.statusKey,
    label: c.label,
    color: c.color,
    children: byStatus.get(c.statusKey) ?? [],
  }));
}
