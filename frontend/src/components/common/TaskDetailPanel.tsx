import { useState, useEffect } from 'react';
import type { Task, KanbanColumn, User, Subtask } from '../../types';
import { api } from '../../api/client';
import { useProduct } from '../../context/ProductContext';
import { useColorLegend } from '../../hooks/useColorLegend';

interface Props {
  task: Task;
  columns?: KanbanColumn[];
  onClose: () => void;
  onUpdated: (task: Task) => void;
}

const DEFAULT_STATUSES = [
  { statusKey: 'backlog',     label: 'Backlog',      color: '#64748b' },
  { statusKey: 'todo',        label: 'To Do',        color: '#3b82f6' },
  { statusKey: 'in_progress', label: 'In Progress',  color: '#f59e0b' },
  { statusKey: 'blocked',     label: 'Blocked',      color: '#ef4444' },
  { statusKey: 'done',        label: 'Done',         color: '#10b981' },
];

export default function TaskDetailPanel({ task, columns, onClose, onUpdated }: Props) {
  const { activeProduct } = useProduct();
  const { legend, enabledColors } = useColorLegend(activeProduct?.id ?? '');
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState(task.name);
  const [description, setDescription] = useState(task.description ?? '');
  const [ownerId, setOwnerId] = useState(task.ownerId ?? '');
  const [status, setStatus] = useState(task.status);
  const [color, setColor] = useState(task.color ?? '');
  const [deadline, setDeadline] = useState(task.deadline ? task.deadline.split('T')[0] : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Subtask state
  const [subtasks, setSubtasks] = useState<Subtask[]>(task.subtasks);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtaskName, setNewSubtaskName] = useState('');
  const [subtaskLoading, setSubtaskLoading] = useState<string | null>(null);

  useEffect(() => { api.users.list().then(setUsers).catch(() => {}); }, []);

  const statusOptions = columns && columns.length > 0
    ? [
        { statusKey: 'backlog', label: 'Backlog', color: '#64748b' },
        ...columns.map((c) => ({ statusKey: c.statusKey, label: c.label, color: c.color })),
      ]
    : DEFAULT_STATUSES;

  const currentStatus = statusOptions.find((s) => s.statusKey === status);

  async function save() {
    if (!activeProduct) return;
    setSaving(true);
    setError('');
    try {
      const updated = await api.tasks.update(activeProduct.id, task.id, {
        name, description: description || undefined, ownerId: ownerId || undefined,
        status, color: color || undefined, deadline: deadline || undefined,
      });
      onUpdated(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleSubtask(s: Subtask) {
    if (!activeProduct) return;
    setSubtaskLoading(s.id);
    try {
      const updated = await api.subtasks.update(activeProduct.id, task.id, s.id, { completed: !s.completed });
      setSubtasks((prev) => prev.map((x) => (x.id === s.id ? { ...x, completed: updated.completed } : x)));
    } finally { setSubtaskLoading(null); }
  }

  async function addSubtask() {
    if (!newSubtaskName.trim() || !activeProduct) return;
    const created = await api.subtasks.create(activeProduct.id, task.id, newSubtaskName.trim());
    setSubtasks((prev) => [...prev, created]);
    setNewSubtaskName('');
    setAddingSubtask(false);
  }

  async function deleteSubtask(s: Subtask) {
    if (!activeProduct) return;
    await api.subtasks.delete(activeProduct.id, task.id, s.id);
    setSubtasks((prev) => prev.filter((x) => x.id !== s.id));
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-md z-50 flex flex-col" style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-20px 0 60px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: currentStatus?.color ?? '#64748b' }} />
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Task detail</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-colors" style={{ color: 'var(--text-3)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="label">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input font-medium" />
          </div>

          <div>
            <label className="label">Description</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="input resize-none" placeholder="Add a description…" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
                {statusOptions.map((o) => <option key={o.statusKey} value={o.statusKey}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Owner</label>
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="input">
                <option value="">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.avatarEmoji ? `${u.avatarEmoji} ` : ''}{u.username}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Deadline <span className="normal-case font-normal" style={{ color: 'var(--text-3)' }}>(makes this a Milestone)</span></label>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="input" />
          </div>

          <div>
            <label className="label">Color tag</label>
            <div className="flex items-center gap-2 flex-wrap">
              {enabledColors.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(color === c ? '' : c)}
                  title={legend[c] || c}
                  className="w-6 h-6 rounded-full transition-transform relative group"
                  style={{ background: c, transform: color === c ? 'scale(1.25)' : 'scale(1)', boxShadow: color === c ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}` : 'none' }}
                >
                  {legend[c] && (
                    <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      style={{ background: 'var(--text)', color: 'var(--bg)' }}>
                      {legend[c]}
                    </span>
                  )}
                </button>
              ))}
              {color && !enabledColors.includes(color) && (
                <button
                  title={legend[color] || color}
                  className="w-6 h-6 rounded-full transition-transform relative group"
                  style={{ background: color, transform: 'scale(1.25)', boxShadow: `0 0 0 2px var(--surface), 0 0 0 4px ${color}` }}
                  onClick={() => setColor('')}
                >
                  {legend[color] && (
                    <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      style={{ background: 'var(--text)', color: 'var(--bg)' }}>
                      {legend[color]}
                    </span>
                  )}
                </button>
              )}
              <button onClick={() => setColor('')} className="text-xs px-2 py-1 rounded" style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}>Clear</button>
            </div>
          </div>

          {/* Subtasks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Subtasks</label>
              {subtasks.length > 0 && (
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                  {subtasks.filter((s) => s.completed).length}/{subtasks.length} done
                </span>
              )}
            </div>

            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {subtasks.length === 0 && !addingSubtask ? (
                <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-3)' }}>No subtasks yet</div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {subtasks.map((s) => (
                    <div key={s.id} className="flex items-center gap-2.5 px-3 py-2 group">
                      <input
                        type="checkbox"
                        checked={s.completed}
                        disabled={subtaskLoading === s.id}
                        onChange={() => toggleSubtask(s)}
                        className="rounded flex-shrink-0"
                        style={{ accentColor: 'var(--brand)' }}
                      />
                      <span className="flex-1 text-sm" style={{
                        color: s.completed ? 'var(--text-3)' : 'var(--text-2)',
                        textDecoration: s.completed ? 'line-through' : 'none',
                      }}>
                        {s.name}
                      </span>
                      <button
                        onClick={() => deleteSubtask(s)}
                        className="opacity-0 group-hover:opacity-100 text-xs transition-opacity"
                        style={{ color: 'var(--text-3)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {addingSubtask ? (
                <div className="flex gap-1.5 px-3 py-2" style={{ borderTop: subtasks.length > 0 ? '1px solid var(--border)' : 'none' }}>
                  <input
                    autoFocus
                    type="text"
                    value={newSubtaskName}
                    onChange={(e) => setNewSubtaskName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addSubtask(); if (e.key === 'Escape') { setAddingSubtask(false); setNewSubtaskName(''); } }}
                    placeholder="Subtask name…"
                    className="input text-sm py-1 flex-1"
                  />
                  <button onClick={addSubtask} className="text-xs font-medium px-2" style={{ color: 'var(--brand)' }}>Add</button>
                  <button onClick={() => { setAddingSubtask(false); setNewSubtaskName(''); }} className="text-xs" style={{ color: 'var(--text-3)' }}>✕</button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingSubtask(true)}
                  className="w-full text-left px-3 py-2 text-xs transition-colors"
                  style={{ color: 'var(--text-3)', borderTop: subtasks.length > 0 ? '1px solid var(--border)' : 'none' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                >
                  + Add subtask
                </button>
              )}
            </div>
          </div>

          {task.completedAt && (
            <div className="text-xs px-3 py-2.5 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
              Completed {new Date(task.completedAt).toLocaleString()}
            </div>
          )}

          {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex gap-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 flex justify-center">
            {saving ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Save changes'}
          </button>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </>
  );
}
