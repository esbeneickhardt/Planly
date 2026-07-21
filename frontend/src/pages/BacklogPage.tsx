/**
 * Task backlog rendered as a sortable, filterable table with per-status tabs and bulk operations.
 * Filtering and sorting are delegated to the useBacklogFilters hook; this page handles create,
 * bulk-move-to-todo, and bulk-delete mutations via the API, refreshing the shared ProductContext after each.
 */
import { useState } from 'react';
import { useProduct } from '../context/ProductContext';
import { usePermission } from '../context/PermissionContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { api, displayName } from '../api/client';
import type { Task } from '../types';
import TaskDetailPanel from '../components/common/TaskDetailPanel';
import Modal from '../components/common/Modal';
import { useBacklogFilters } from '../hooks/useBacklogFilters';
import type { StatusTab } from '../hooks/useBacklogFilters';
import type { SortKey } from '../hooks/useBacklogFilters';
import { isBeforeToday } from '../utils/dates';

const STATUS_TABS: { key: StatusTab; label: string; color: string }[] = [
  { key: 'all',         label: 'All',         color: 'var(--text-3)' },
  { key: 'backlog',     label: 'Not started',  color: '#64748b' },
  { key: 'todo',        label: 'To Do',        color: '#3b82f6' },
  { key: 'in_progress', label: 'In Progress',  color: '#f59e0b' },
  { key: 'blocked',     label: 'Blocked',      color: '#ef4444' },
  { key: 'done',        label: 'Done',         color: '#10b981' },
];

export default function BacklogPage() {
  const { activeProduct, tasks, refreshTasks, createTask } = useProduct();
  const { canWrite } = usePermission();
  const { user } = useAuth();
  const readOnly = !canWrite('backlog');
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [creating, setCreating] = useState(false);

  const { sortKey, setSortKey, statusTab, setStatusTab, mineOnly, setMineOnly, search, setSearch, filteredTasks, tabCounts, unassignedCount, overdueCount } =
    useBacklogFilters(tasks, user?.id);

  // Toggle a single row in/out of the multi-select set
  function toggleSelect(id: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) { n.delete(id); } else { n.add(id); } return n; });
  }

  function toggleAll() {
    setSelected(selected.size === filteredTasks.length ? new Set() : new Set(filteredTasks.map((t) => t.id)));
  }

  // Bulk-promote selected tasks to "todo"; skips tasks with no owner and shows a count of skipped
  async function bulkMoveTodo() {
    if (!activeProduct) return;
    const eligible = filteredTasks.filter((t) => selected.has(t.id) && t.ownerId);
    const skipped = selected.size - eligible.length;
    await Promise.all(eligible.map((t) => api.tasks.update(activeProduct.id, t.id, { status: 'todo' })));
    await refreshTasks();
    setSelected(new Set());
    if (skipped > 0) showToast(`${skipped} skipped - no owner assigned.`, 'info');
    else showToast(`Moved ${eligible.length} task${eligible.length !== 1 ? 's' : ''} to To Do`, 'success');
  }

  // Confirm-then-delete all selected tasks in parallel
  async function bulkDelete() {
    if (!activeProduct || !await confirm(`Delete ${selected.size} task(s)?`)) return;
    await Promise.all(Array.from(selected).map((id) => api.tasks.delete(activeProduct.id, id)));
    await refreshTasks();
    setSelected(new Set());
    showToast('Tasks deleted', 'info');
  }

  // Create a minimal task (name only); additional fields can be set via TaskDetailPanel afterwards
  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskName.trim()) return;
    setCreating(true);
    try {
      await createTask({ name: newTaskName.trim() });
      setNewTaskName('');
      setShowNewTask(false);
    } finally { setCreating(false); }
  }

  if (!activeProduct) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ color: 'var(--text-3)' }}>
        <div className="text-5xl opacity-30">☰</div>
        <p className="text-sm">Create a product to get started</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Filters */}
      <div className="px-6 pt-5 pb-3 flex-shrink-0">

        {/* Warning banners */}
        {(unassignedCount > 0 || overdueCount > 0) && (
          <div className="flex flex-wrap gap-2 mb-3">
            {unassignedCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}>
                ⚠ {unassignedCount} unassigned in backlog
              </div>
            )}
            {overdueCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                ⏰ {overdueCount} overdue
              </div>
            )}
          </div>
        )}

        {/* Status tabs + search + sort on one row */}
        <div className="flex items-center gap-1 flex-wrap">
          {STATUS_TABS.map((tab) => {
            const count = tabCounts[tab.key] ?? 0;
            const active = statusTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => { setStatusTab(tab.key); setSelected(new Set()); }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0"
                style={{
                  background: active ? 'var(--surface-2)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--text-3)',
                  border: active ? '1px solid var(--border)' : '1px solid transparent',
                }}
              >
                {tab.key !== 'all' && <span className="w-2 h-2 rounded-full" style={{ background: tab.color }} />}
                {tab.label}
                <span className="px-1 py-0.5 rounded text-[10px] leading-none" style={{
                  background: active ? 'var(--brand-subtle)' : 'var(--surface-2)',
                  color: active ? 'var(--brand)' : 'var(--text-3)',
                }}>{count}</span>
              </button>
            );
          })}

          {/* Mine toggle */}
          <button
            onClick={() => setMineOnly((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium flex-shrink-0 transition-all"
            style={{
              background: mineOnly ? 'var(--brand-subtle)' : 'transparent',
              color: mineOnly ? 'var(--brand)' : 'var(--text-3)',
              border: `1px solid ${mineOnly ? 'var(--brand)' : 'transparent'}`,
            }}
            title="Show only my tasks"
          >
            {user?.avatarEmoji ?? '👤'} Mine
          </button>

          <div className="flex-1" />

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="input text-xs"
            style={{ width: 160 }}
          />
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="input text-xs" style={{ width: 'auto' }}>
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
            <option value="alpha">A–Z</option>
            <option value="deadline">By deadline</option>
            <option value="unassigned">Unassigned first</option>
          </select>

          {selected.size > 0 && !readOnly && (
            <div className="flex items-center gap-3 text-xs ml-2">
              <span style={{ color: 'var(--text-3)' }}>{selected.size} selected</span>
              {statusTab !== 'done' && (
                <button onClick={bulkMoveTodo} className="font-medium" style={{ color: 'var(--brand)' }}>Move to To Do</button>
              )}
              <button onClick={bulkDelete} className="font-medium" style={{ color: '#ef4444' }}>Delete</button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-w-0">
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3" style={{ color: 'var(--text-3)' }}>
            <span className="text-4xl opacity-30">{search ? '🔍' : '✓'}</span>
            <p className="text-sm">{search ? `No tasks matching "${search}"` : 'No tasks in this view'}</p>
            {!search && !readOnly && <button onClick={() => setShowNewTask(true)} className="btn-primary text-xs">+ Add first task</button>}
          </div>
        ) : (
          <table className="w-full min-w-[640px] text-sm border-collapse">
            <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {!readOnly && (
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" checked={selected.size === filteredTasks.length && filteredTasks.length > 0} onChange={toggleAll} style={{ accentColor: 'var(--brand)' }} />
                  </th>
                )}
                {['Task', 'Status', 'Owner', 'Subtasks', 'Deadline', 'Created', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task) => (
                <BacklogRow
                  key={task.id}
                  task={task}
                  selected={selected.has(task.id)}
                  isOverdue={!!task.deadline && task.status !== 'done' && isBeforeToday(task.deadline)}
                  readOnly={readOnly}
                  onToggle={() => toggleSelect(task.id)}
                  onOpen={() => setSelectedTask(task)}
                  onMoveTodo={async () => {
                    if (!task.ownerId) { setSelectedTask(task); return; }
                    await api.tasks.update(activeProduct.id, task.id, { status: 'todo' });
                    await refreshTasks();
                  }}
                  onDelete={async () => {
                    if (!confirm('Delete this task?')) return;
                    await api.tasks.delete(activeProduct.id, task.id);
                    await refreshTasks();
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          readOnly={readOnly}
          onClose={() => setSelectedTask(null)}
          onUpdated={async (updated) => { setSelectedTask(updated); await refreshTasks(); }}
          onDeleted={async () => { setSelectedTask(null); await refreshTasks(); }}
        />
      )}

      {showNewTask && (
        <Modal title="New task" onClose={() => setShowNewTask(false)} width="max-w-sm">
          <form onSubmit={handleCreateTask} className="space-y-4">
            <div>
              <label className="label">Task name</label>
              <input autoFocus required type="text" value={newTaskName} onChange={(e) => setNewTaskName(e.target.value)} className="input" placeholder="What needs to be done?" />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={creating} className="btn-primary flex-1 flex justify-center">
                {creating ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Create task'}
              </button>
              <button type="button" onClick={() => setShowNewTask(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  backlog: '#64748b', todo: '#3b82f6', in_progress: '#f59e0b', done: '#10b981', blocked: '#ef4444',
};
const STATUS_LABEL: Record<string, string> = {
  backlog: 'Not started', todo: 'To Do', in_progress: 'In Progress', done: 'Done', blocked: 'Blocked',
};

function BacklogRow({ task, selected, isOverdue, onToggle, onOpen, onMoveTodo, onDelete, readOnly }: {
  task: Task; selected: boolean; isOverdue: boolean; readOnly?: boolean;
  onToggle: () => void; onOpen: () => void; onMoveTodo: () => void; onDelete: () => void;
}) {
  const done = task.subtasks.filter((s) => s.completed).length;
  const statusColor = STATUS_COLOR[task.status] ?? '#64748b';

  return (
    <tr
      style={{
        borderBottom: '1px solid var(--border)',
        background: selected ? 'var(--brand-subtle)' : 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
    >
      {!readOnly && (
        <td className="px-4 py-3 w-10">
          <input type="checkbox" checked={selected} onChange={onToggle} style={{ accentColor: 'var(--brand)' }} />
        </td>
      )}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {task.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: task.color }} />}
          <button onClick={onOpen} className="font-medium text-left hover:underline" style={{ color: 'var(--text)' }}>{task.name}</button>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="flex items-center gap-1.5 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ background: statusColor }} />
          <span style={{ color: 'var(--text-2)' }}>{STATUS_LABEL[task.status] ?? task.status}</span>
        </span>
      </td>
      <td className="px-4 py-3">
        {task.owner ? (
          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-2)' }}>
            <span>{task.owner.avatarEmoji ?? '👤'}</span>
            <span>{displayName(task.owner)}</span>
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>Unassigned</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-3)' }}>
        {task.subtasks.length > 0 ? `${done}/${task.subtasks.length}` : '-'}
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: isOverdue ? '#ef4444' : 'var(--text-3)' }}>
        {task.deadline ? (
          <span className="flex items-center gap-1">
            {isOverdue && <span>⏰</span>}
            {new Date(task.deadline).toLocaleDateString()}
          </span>
        ) : '-'}
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-3)' }}>
        {new Date(task.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 justify-end">
          {!readOnly && task.status !== 'todo' && task.status !== 'done' && (
            <button onClick={onMoveTodo} className="text-xs font-medium whitespace-nowrap transition-colors" style={{ color: 'var(--brand)' }}>
              {task.ownerId ? 'Move to To Do →' : 'Assign owner'}
            </button>
          )}
          {!readOnly && (
            <button onClick={onDelete} className="text-xs transition-colors" style={{ color: 'var(--text-3)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
            >
              Delete
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
