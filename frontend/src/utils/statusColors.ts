/**
 * Shared task-status color/label mapping - previously defined independently (with identical
 * values, but no shared source) in both BacklogPage.tsx and GanttPage.tsx, risking silent drift.
 */
export const STATUS_COLORS: Record<string, string> = {
  backlog: '#64748b',
  todo: '#3b82f6',
  in_progress: '#f59e0b',
  done: '#10b981',
  blocked: '#ef4444',
};

export const STATUS_LABELS: Record<string, string> = {
  backlog: 'Not started',
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
  blocked: 'Blocked',
};
