/**
 * Shared per-column task sort modes for Kanban - used by both the desktop board (KanbanColumn.tsx)
 * and the mobile list (KanbanMobileList.tsx) so a column's chosen sort mode (persisted under
 * `planly-col-sort-${columnId}`) stays consistent regardless of which view you're looking at it in.
 */
import type { Task } from '../types';

export type SortMode = 'default' | 'alpha-asc' | 'alpha-desc' | 'deadline' | 'oldest' | 'newest';

export const SORT_LABELS: Record<SortMode, string> = {
  default: 'Custom (drag order)',
  'alpha-asc': 'A → Z',
  'alpha-desc': 'Z → A',
  deadline: 'Deadline',
  oldest: 'Oldest first',
  newest: 'Newest first',
};

export const SORT_CYCLE: SortMode[] = ['default', 'alpha-asc', 'alpha-desc', 'deadline', 'oldest', 'newest'];

export function sortTasks(tasks: Task[], mode: SortMode): Task[] {
  if (mode === 'default') return tasks;
  return [...tasks].sort((a, b) => {
    if (mode === 'alpha-asc') return a.name.localeCompare(b.name);
    if (mode === 'alpha-desc') return b.name.localeCompare(a.name);
    if (mode === 'deadline') {
      if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return a.kanbanOrder - b.kanbanOrder;
    }
    if (mode === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function loadColumnSortMode(columnId: string): SortMode {
  try {
    const saved = localStorage.getItem(`planly-col-sort-${columnId}`) as SortMode | null;
    return saved && SORT_CYCLE.includes(saved) ? saved : 'default';
  } catch {
    return 'default';
  }
}

export function saveColumnSortMode(columnId: string, mode: SortMode) {
  try {
    localStorage.setItem(`planly-col-sort-${columnId}`, mode);
  } catch {}
}
