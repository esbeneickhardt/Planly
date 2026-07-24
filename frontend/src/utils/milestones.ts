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
