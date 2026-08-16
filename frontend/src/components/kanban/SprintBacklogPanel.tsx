/**
 * Right-side drawer for managing which tasks belong to a sprint (sub-plan).
 * Shows two columns: tasks in the sprint (left) and all other non-done tasks (right).
 * Add/remove operations are optimistic — the UI updates immediately and rolls back on API failure.
 */
import { useState } from 'react';
import type { Task } from '../../types';
import type { Sprint } from '../../api/client';
import { api } from '../../api/client';

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

interface Props {
  sprint: Sprint;
  productId: string;
  tasks: Task[];
  onClose: () => void;
  onUpdated: (sprint: Sprint) => void;
}

export default function SprintBacklogPanel({ sprint, productId, tasks, onClose, onUpdated }: Props) {
  // Local task-ID set drives optimistic UI; loading holds the ID of the in-flight task
  const [sprintTaskIds, setSprintTaskIds] = useState(new Set(sprint.taskIds));
  const [loading, setLoading] = useState<string | null>(null);

  // Done tasks are intentionally excluded from the backlog (right) column
  const sprintTasks = tasks.filter((t) => sprintTaskIds.has(t.id));
  const backlogTasks = tasks.filter((t) => !sprintTaskIds.has(t.id) && t.status !== 'done');

  async function addToSprint(task: Task) {
    setLoading(task.id);
    const newIds = new Set(sprintTaskIds);
    newIds.add(task.id);
    setSprintTaskIds(newIds); // optimistic
    try {
      await api.sprints.addTasks(productId, sprint.id, [task.id]);
      onUpdated({ ...sprint, taskIds: [...newIds] });
    } catch {
      setSprintTaskIds(sprintTaskIds); // rollback
    } finally {
      setLoading(null);
    }
  }

  async function removeFromSprint(task: Task) {
    setLoading(task.id);
    const newIds = new Set(sprintTaskIds);
    newIds.delete(task.id);
    setSprintTaskIds(newIds); // optimistic
    try {
      await api.sprints.removeTask(productId, sprint.id, task.id);
      onUpdated({ ...sprint, taskIds: [...newIds] });
    } catch {
      setSprintTaskIds(sprintTaskIds); // rollback
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- mouse-only backdrop dismiss; the header's close button is the keyboard-accessible equivalent */}
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={onClose} />
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only guard against the backdrop's onClick */}
      <div
        className="fixed right-0 top-0 h-full z-50 flex flex-col shadow-2xl overflow-hidden"
        style={{ width: 640, background: 'var(--surface)', borderLeft: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: sprint.color }} />
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {sprint.name}
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                {new Date(sprint.startDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })} –{' '}
                {new Date(sprint.endDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-colors"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            ✕
          </button>
        </div>

        {/* Two-column body */}
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT - tasks in sprint */}
          <div className="flex-1 flex flex-col overflow-hidden" style={{ borderRight: '1px solid var(--border)' }}>
            <div
              className="px-4 py-2.5 flex-shrink-0 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                In sub-plan
              </span>
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: 'var(--brand-subtle)', color: 'var(--brand)', fontWeight: 600 }}
              >
                {sprintTasks.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {sprintTasks.length === 0 && (
                <p className="px-4 py-6 text-xs text-center" style={{ color: 'var(--text-3)' }}>
                  No tasks in this sub-plan yet
                </p>
              )}
              {sprintTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  action="remove"
                  loading={loading === task.id}
                  onClick={() => removeFromSprint(task)}
                />
              ))}
            </div>
          </div>

          {/* RIGHT - backlog (not in sprint, not done) */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div
              className="px-4 py-2.5 flex-shrink-0 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                Other tasks
              </span>
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: 'var(--surface-2)', color: 'var(--text-3)', fontWeight: 600 }}
              >
                {backlogTasks.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {backlogTasks.length === 0 && (
                <p className="px-4 py-6 text-xs text-center" style={{ color: 'var(--text-3)' }}>
                  All tasks are in a sub-plan
                </p>
              )}
              {backlogTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  action="add"
                  loading={loading === task.id}
                  onClick={() => addToSprint(task)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function TaskRow({
  task,
  action,
  loading,
  onClick,
}: {
  task: Task;
  action: 'add' | 'remove';
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full text-left px-4 py-2.5 flex items-center gap-2.5 transition-colors group"
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: STATUS_COLOR[task.status] ?? '#64748b' }}
      />
      <span className="flex-1 min-w-0">
        <span className="text-sm truncate block" style={{ color: 'var(--text)' }}>
          {task.name}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
          {STATUS_LABEL[task.status] ?? task.status}
        </span>
      </span>
      {loading ? (
        <span
          className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin flex-shrink-0"
          style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }}
        />
      ) : (
        <span
          className="text-xs opacity-0 group-hover:opacity-100 flex-shrink-0 px-2 py-0.5 rounded transition-all"
          style={{
            background: action === 'add' ? 'var(--brand-subtle)' : 'rgba(239,68,68,0.1)',
            color: action === 'add' ? 'var(--brand)' : '#ef4444',
          }}
        >
          {action === 'add' ? '+ Add' : '– Remove'}
        </span>
      )}
    </button>
  );
}
