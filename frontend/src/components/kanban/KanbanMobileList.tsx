/**
 * Mobile-only (`md:hidden`) scrollable task list for the Kanban view, shown in place of the drag board.
 * Tasks are grouped by column and displayed as tappable cards. Tapping opens the TaskDetailPanel.
 */
import type { Task, KanbanColumn } from '../../types';
import { displayName } from '../../api/client';

interface User {
  id: string;
  username: string;
  avatarEmoji?: string | null;
  realName?: string | null;
}

interface Props {
  columns: KanbanColumn[];
  tasks: Task[];
  users: User[];
  onOpenDetail: (task: Task) => void;
  onAddTask?: () => void;
  readOnly?: boolean;
}

export default function KanbanMobileList({ columns, tasks, users, onOpenDetail, onAddTask, readOnly }: Props) {
  return (
    <div className="md:hidden flex-1 overflow-y-auto px-4 py-3 space-y-4 relative" aria-label="Task list">
      {columns.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.statusKey).sort((a, b) => a.kanbanOrder - b.kanbanOrder);
        return (
          <section key={col.id} aria-labelledby={`col-heading-${col.id}`}>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: col.color }}
                aria-hidden="true"
              />
              <h2
                id={`col-heading-${col.id}`}
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: 'var(--text-3)' }}
              >
                {col.label}
              </h2>
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                ({colTasks.length})
              </span>
            </div>

            {colTasks.length === 0 && (
              <p className="text-xs px-2 py-3" style={{ color: 'var(--text-3)' }}>
                No tasks
              </p>
            )}

            <ul className="space-y-2">
              {colTasks.map((task) => {
                const owner = users.find((u) => u.id === task.ownerId);
                const isOverdue = task.deadline && new Date(task.deadline) < new Date() && !col.isDone;
                return (
                  <li key={task.id}>
                    <button
                      className="w-full text-left rounded-xl px-4 py-3 transition-colors"
                      style={{ background: 'var(--surface)', border: `2px solid ${task.color ?? 'var(--border)'}` }}
                      onClick={() => onOpenDetail(task)}
                      aria-label={`${task.name}${owner ? `, assigned to ${displayName(owner)}` : ''}${task.deadline ? `, due ${new Date(task.deadline).toLocaleDateString()}` : ''}`}
                    >
                      <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text)' }}>
                        {task.name}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {owner && (
                          <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
                            <span aria-hidden="true">{owner.avatarEmoji ?? '👤'}</span>
                            <span>{displayName(owner)}</span>
                          </span>
                        )}
                        {task.deadline && (
                          <span className="text-xs" style={{ color: isOverdue ? '#ef4444' : 'var(--text-3)' }}>
                            {isOverdue && <span aria-hidden="true">⚠ </span>}
                            {new Date(task.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                            {isOverdue && <span className="sr-only"> (overdue)</span>}
                          </span>
                        )}
                        {task.subtasks.length > 0 && (
                          <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                            {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length} subtasks
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {tasks.length === 0 && (
        <p className="text-sm text-center py-16" style={{ color: 'var(--text-3)' }}>
          No tasks match the current filters
        </p>
      )}

      {/* Add task FAB */}
      {!readOnly && onAddTask && (
        <button
          onClick={onAddTask}
          aria-label="Add task"
          className="sticky bottom-4 ml-auto flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg"
          style={{ background: 'var(--brand)', color: 'white', display: 'flex' }}
        >
          <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>
            +
          </span>{' '}
          Add task
        </button>
      )}
    </div>
  );
}
