/**
 * Column-based sort comparators for the Tasks (Backlog) table. Shared by the flat list and by
 * "group by milestone" section ordering - a section is ordered by applying the same comparator
 * to its milestone task, so whichever column the user picked controls both row and section order.
 */
import type { Task } from '../types';

export type SortColumn = 'name' | 'status' | 'owner' | 'milestone' | 'deadline' | 'created';
export type SortDir = 'asc' | 'desc';

// Matches the pipeline order used elsewhere (e.g. BacklogPage's STATUS_TABS) - done ranks last
const STATUS_RANK: Record<string, number> = { backlog: 0, todo: 1, in_progress: 2, blocked: 3, done: 4 };

function ownerLabel(t: Task): string {
  return t.owner?.realName ?? t.owner?.username ?? '';
}

// Missing values (no deadline) always sort last regardless of direction - there's no meaningful
// "first" or "last" intent for absent data, so keep it out of the way either way round.
function compareNullableTime(aTime: number | null, bTime: number | null, dir: SortDir): number {
  if (aTime == null && bTime == null) return 0;
  if (aTime == null) return 1;
  if (bTime == null) return -1;
  return dir === 'asc' ? aTime - bTime : bTime - aTime;
}

/**
 * Compares two tasks by the given column. `primaryMilestones` is only consulted for the
 * 'milestone' column. A task that is itself a milestone (has a deadline) is treated as its own
 * milestone reference, so this also works for comparing milestone tasks directly against each
 * other (e.g. sorting "group by milestone" section headers) - no redirect to another column needed.
 */
export function compareTasks(
  a: Task,
  b: Task,
  column: SortColumn,
  dir: SortDir,
  primaryMilestones: Map<string, Task>,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (column) {
    case 'name':
      return sign * a.name.localeCompare(b.name);
    case 'status':
      return sign * ((STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99));
    case 'owner':
      // Unassigned tasks map to '', which naturally sorts before any name in ascending order.
      return sign * ownerLabel(a).localeCompare(ownerLabel(b));
    case 'milestone': {
      // Sorted by the shared, backend-persisted milestoneOrder (same order as Gantt/Kanban),
      // falling back to name for milestones that have never been dragged (all share order 0).
      const aMilestone = a.deadline ? a : primaryMilestones.get(a.id);
      const bMilestone = b.deadline ? b : primaryMilestones.get(b.id);
      if (!aMilestone && !bMilestone) return 0;
      if (!aMilestone) return 1;
      if (!bMilestone) return -1;
      if (aMilestone.id === bMilestone.id) return 0;
      return (
        sign *
        (aMilestone.milestoneOrder - bMilestone.milestoneOrder || aMilestone.name.localeCompare(bMilestone.name))
      );
    }
    case 'deadline':
      return compareNullableTime(
        a.deadline ? new Date(a.deadline).getTime() : null,
        b.deadline ? new Date(b.deadline).getTime() : null,
        dir,
      );
    case 'created':
      return sign * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    default:
      return 0;
  }
}

export function sortTasks(
  tasks: Task[],
  column: SortColumn,
  dir: SortDir,
  primaryMilestones: Map<string, Task>,
): Task[] {
  return [...tasks].sort((a, b) => compareTasks(a, b, column, dir, primaryMilestones));
}
