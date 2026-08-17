/**
 * Renders the "Milestones" and "Tasks" result blocks in the search modal. The two are always
 * shown together (never independently toggled) since they're just a status/deadline split of the
 * same `results.tasks` array, computed by the caller before reaching here.
 */
import { displayName } from '../../../api/client';
import type { SearchResults } from '../../../api/client';

const STATUS_COLOR: Record<string, string> = {
  backlog: '#64748b',
  todo: '#3b82f6',
  in_progress: '#f59e0b',
  done: '#10b981',
  blocked: '#ef4444',
};
const STATUS_LABEL: Record<string, string> = {
  backlog: 'Not started',
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
  blocked: 'Blocked',
};

type TaskResult = SearchResults['tasks'][number];

interface Props {
  milestones: TaskResult[];
  regular: TaskResult[];
  highlightIdx: number;
  nextIdx: () => number;
  onTaskClick: (task: TaskResult) => void;
}

export default function TasksSection({ milestones, regular, highlightIdx, nextIdx, onTaskClick }: Props) {
  return (
    <>
      {milestones.length > 0 && (
        <div className="py-1">
          <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            Milestones
          </div>
          {milestones.map((task) => {
            const i = nextIdx();
            const isHighlighted = highlightIdx === i;
            return (
              <button
                key={task.id}
                data-idx={i}
                onClick={() => onTaskClick(task)}
                className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                style={{ background: isHighlighted ? 'var(--brand-subtle)' : 'transparent' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')
                }
              >
                <span className="text-xs flex-shrink-0">🏁</span>
                <span className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block" style={{ color: 'var(--text)' }}>
                    {task.name}
                  </span>
                  <span className="text-xs truncate block" style={{ color: 'var(--text-3)' }}>
                    {STATUS_LABEL[task.status] ?? task.status}
                    {task.deadline &&
                      ` · due ${new Date(task.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {regular.length > 0 && (
        <div className="py-1">
          <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            Tasks
          </div>
          {regular.map((task) => {
            const i = nextIdx();
            const isHighlighted = highlightIdx === i;
            return (
              <button
                key={task.id}
                data-idx={i}
                onClick={() => onTaskClick(task)}
                className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                style={{ background: isHighlighted ? 'var(--brand-subtle)' : 'transparent' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')
                }
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: STATUS_COLOR[task.status] ?? '#64748b' }}
                />
                <span className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block" style={{ color: 'var(--text)' }}>
                    {task.name}
                  </span>
                  <span className="text-xs truncate block" style={{ color: 'var(--text-3)' }}>
                    {STATUS_LABEL[task.status] ?? task.status}
                    {task.owner && ` · ${displayName(task.owner)}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
