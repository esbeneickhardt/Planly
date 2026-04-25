import { useState, useMemo } from 'react';
import { useProduct } from '../context/ProductContext';
import { api } from '../api/client';
import type { Task } from '../types';
import TaskDetailPanel from '../components/common/TaskDetailPanel';
import Modal from '../components/common/Modal';

type SortKey = 'oldest' | 'newest' | 'alpha' | 'unassigned';

export default function BacklogPage() {
  const { activeProduct, tasks, refreshTasks, createTask } = useProduct();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('oldest');
  const [bulkMsg, setBulkMsg] = useState('');
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [creating, setCreating] = useState(false);

  const backlogTasks = useMemo(() => {
    const bt = tasks.filter((t) => t.status === 'backlog');
    return [...bt].sort((a, b) => {
      if (sortKey === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortKey === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortKey === 'alpha') return a.name.localeCompare(b.name);
      return (a.ownerId ? 1 : 0) - (b.ownerId ? 1 : 0);
    });
  }, [tasks, sortKey]);

  const unassignedCount = backlogTasks.filter((t) => !t.ownerId).length;

  function toggleSelect(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleAll() {
    setSelected(selected.size === backlogTasks.length ? new Set() : new Set(backlogTasks.map((t) => t.id)));
  }

  async function bulkMoveTodo() {
    if (!activeProduct) return;
    const eligible = backlogTasks.filter((t) => selected.has(t.id) && t.ownerId);
    const skipped = selected.size - eligible.length;
    await Promise.all(eligible.map((t) => api.tasks.update(activeProduct.id, t.id, { status: 'todo' })));
    await refreshTasks();
    setSelected(new Set());
    if (skipped > 0) { setBulkMsg(`${skipped} skipped — no owner assigned.`); setTimeout(() => setBulkMsg(''), 4000); }
  }

  async function bulkDelete() {
    if (!activeProduct || !confirm(`Delete ${selected.size} task(s)?`)) return;
    await Promise.all(Array.from(selected).map((id) => api.tasks.delete(activeProduct.id, id)));
    await refreshTasks();
    setSelected(new Set());
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskName.trim()) return;
    setCreating(true);
    try {
      await createTask({ name: newTaskName.trim() });
      setNewTaskName('');
      setShowNewTask(false);
    } finally {
      setCreating(false);
    }
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
      {/* Header */}
      <div className="px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Backlog</h1>
          <button onClick={() => setShowNewTask(true)} className="btn-primary flex items-center gap-1.5">
            <span className="text-base leading-none">+</span> New task
          </button>
        </div>

        {unassignedCount > 0 && (
          <div className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg mb-3" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
            <span>⚠</span>
            <span>{unassignedCount} task{unassignedCount !== 1 ? 's' : ''} without an owner — they cannot progress.</span>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="input" style={{ width: 'auto' }}>
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
            <option value="alpha">A–Z</option>
            <option value="unassigned">Unassigned first</option>
          </select>
          {selected.size > 0 && (
            <div className="flex items-center gap-3 text-sm">
              <span style={{ color: 'var(--text-3)' }}>{selected.size} selected</span>
              <button onClick={bulkMoveTodo} className="font-medium transition-colors" style={{ color: 'var(--brand)' }}>Move to To Do</button>
              <button onClick={bulkDelete} className="font-medium transition-colors" style={{ color: '#ef4444' }}>Delete</button>
            </div>
          )}
          {bulkMsg && <span className="text-sm" style={{ color: '#f59e0b' }}>{bulkMsg}</span>}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {backlogTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3" style={{ color: 'var(--text-3)' }}>
            <span className="text-4xl opacity-30">✓</span>
            <p className="text-sm">Backlog is empty</p>
            <button onClick={() => setShowNewTask(true)} className="btn-primary text-xs">+ Add first task</button>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={selected.size === backlogTasks.length && backlogTasks.length > 0} onChange={toggleAll} style={{ accentColor: 'var(--brand)' }} />
                </th>
                {['Task', 'Owner', 'Subtasks', 'Created', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {backlogTasks.map((task) => (
                <BacklogRow
                  key={task.id}
                  task={task}
                  selected={selected.has(task.id)}
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
          onClose={() => setSelectedTask(null)}
          onUpdated={async (updated) => { setSelectedTask(updated); await refreshTasks(); }}
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

function BacklogRow({ task, selected, onToggle, onOpen, onMoveTodo, onDelete }: {
  task: Task; selected: boolean;
  onToggle: () => void; onOpen: () => void; onMoveTodo: () => void; onDelete: () => void;
}) {
  const done = task.subtasks.filter((s) => s.completed).length;

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
      <td className="px-4 py-3 w-10">
        <input type="checkbox" checked={selected} onChange={onToggle} style={{ accentColor: 'var(--brand)' }} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {task.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: task.color }} />}
          <button onClick={onOpen} className="font-medium text-left hover:underline" style={{ color: 'var(--text)' }}>{task.name}</button>
        </div>
      </td>
      <td className="px-4 py-3">
        {task.owner ? (
          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-2)' }}>
            <span>{task.owner.avatarEmoji ?? '👤'}</span>
            <span>{task.owner.username}</span>
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>Unassigned</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-3)' }}>
        {task.subtasks.length > 0 ? `${done}/${task.subtasks.length}` : '—'}
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-3)' }}>
        {new Date(task.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 justify-end">
          <button onClick={onMoveTodo} className="text-xs font-medium whitespace-nowrap transition-colors" style={{ color: 'var(--brand)' }}>
            {task.ownerId ? 'Move to To Do →' : 'Assign owner'}
          </button>
          <button onClick={onDelete} className="text-xs transition-colors" style={{ color: 'var(--text-3)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
