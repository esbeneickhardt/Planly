import { useState, useEffect, useRef } from 'react';
import type { Task, KanbanColumn, User, Subtask } from '../../types';
import type { Sprint } from '../../api/client';
import { api } from '../../api/client';
import { useProduct } from '../../context/ProductContext';
import { useColorLegend } from '../../hooks/useColorLegend';
import { useToast } from '../../context/ToastContext';
import ChatPanel from './ChatPanel';

interface Props {
  task: Task;
  columns?: KanbanColumn[];
  onClose: () => void;
  onUpdated: (task: Task) => void;
  onDeleted?: () => void;
  readOnly?: boolean;
}

const DEFAULT_STATUSES = [
  { statusKey: 'backlog',     label: 'Backlog',      color: '#64748b' },
  { statusKey: 'todo',        label: 'To Do',        color: '#3b82f6' },
  { statusKey: 'in_progress', label: 'In Progress',  color: '#f59e0b' },
  { statusKey: 'blocked',     label: 'Blocked',      color: '#ef4444' },
  { statusKey: 'done',        label: 'Done',         color: '#10b981' },
];

export default function TaskDetailPanel({ task, columns, onClose, onUpdated, onDeleted, readOnly = false }: Props) {
  const { activeProduct } = useProduct();
  const { legend, enabledColors } = useColorLegend(activeProduct?.id ?? '');
  const { showToast } = useToast();
  const [minimized, setMinimized] = useState(false);
  const [users, setUsers] = useState<Pick<User, 'id' | 'username' | 'avatarEmoji'>[]>([]);
  const [name, setName] = useState(task.name);
  const [description, setDescription] = useState(task.description ?? '');
  const [ownerId, setOwnerId] = useState(task.ownerId ?? '');
  const [status, setStatus] = useState(task.status);
  const [color, setColor] = useState(task.color ?? '');
  const [deadline, setDeadline] = useState(task.deadline ? task.deadline.split('T')[0] : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const [subtasks, setSubtasks] = useState<Subtask[]>(task.subtasks);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtaskName, setNewSubtaskName] = useState('');
  const [subtaskLoading, setSubtaskLoading] = useState<string | null>(null);

  // Sprint membership
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [sprintIds, setSprintIds] = useState<Set<string>>(new Set());
  const initialSprintIdsRef = useRef<Set<string>>(new Set());

  const sprintsDirty = (() => {
    const init = initialSprintIdsRef.current;
    if (sprintIds.size !== init.size) return true;
    for (const id of sprintIds) if (!init.has(id)) return true;
    return false;
  })();

  const isDirty =
    name !== task.name ||
    description !== (task.description ?? '') ||
    ownerId !== (task.ownerId ?? '') ||
    status !== task.status ||
    color !== (task.color ?? '') ||
    deadline !== (task.deadline ? task.deadline.split('T')[0] : '') ||
    sprintsDirty;

  useEffect(() => { api.users.list().then(setUsers).catch(() => {}); }, []);

  useEffect(() => {
    if (!activeProduct) return;
    api.sprints.list(activeProduct.id).then((ss) => {
      setSprints(ss);
      const ids = new Set(ss.filter((s) => s.taskIds.includes(task.id)).map((s) => s.id));
      setSprintIds(ids);
      initialSprintIdsRef.current = new Set(ids);
    }).catch(() => {});
  }, [activeProduct?.id, task.id]);

  const statusOptions = columns && columns.length > 0
    ? [
        { statusKey: 'backlog', label: 'Backlog', color: '#64748b' },
        ...columns.map((c) => ({ statusKey: c.statusKey, label: c.label, color: c.color })),
      ]
    : DEFAULT_STATUSES;

  const currentStatus = statusOptions.find((s) => s.statusKey === status);

  function handleClose() {
    if (isDirty && !confirm('You have unsaved changes. Close anyway?')) return;
    onClose();
  }

  async function save() {
    if (!activeProduct) return;
    setSaving(true);
    setError('');
    try {
      const updated = await api.tasks.update(activeProduct.id, task.id, {
        name, description: description || undefined, ownerId: ownerId || undefined,
        status, color: color || undefined, deadline: deadline || undefined,
      });

      // Apply sprint membership changes
      if (sprintsDirty) {
        const init = initialSprintIdsRef.current;
        const toAdd = [...sprintIds].filter((id) => !init.has(id));
        const toRemove = [...init].filter((id) => !sprintIds.has(id));
        await Promise.all([
          ...toAdd.map((sprintId) => api.sprints.addTasks(activeProduct.id, sprintId, [task.id])),
          ...toRemove.map((sprintId) => api.sprints.removeTask(activeProduct.id, sprintId, task.id)),
        ]);
        initialSprintIdsRef.current = new Set(sprintIds);
      }

      onUpdated(updated);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      showToast((err as Error).message, 'error');
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

  async function deleteTask() {
    if (!activeProduct) return;
    if (!confirm(`Delete "${task.name}"? This cannot be undone.`)) return;
    try {
      await api.tasks.delete(activeProduct.id, task.id);
      onDeleted?.();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }

  async function deleteSubtask(s: Subtask) {
    if (!activeProduct) return;
    await api.subtasks.delete(activeProduct.id, task.id, s.id);
    setSubtasks((prev) => prev.filter((x) => x.id !== s.id));
  }

  if (minimized) {
    return (
      <div
        className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-xl cursor-pointer"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxWidth: 280 }}
        onClick={() => setMinimized(false)}
      >
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: currentStatus?.color ?? '#64748b' }} />
        <span className="text-sm font-medium truncate flex-1" style={{ color: 'var(--text)' }}>{name}</span>
        {isDirty && (
          <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>●</span>
        )}
        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>↑ Restore</span>
        <button
          onClick={(e) => { e.stopPropagation(); handleClose(); }}
          className="flex-shrink-0 text-xs"
          style={{ color: 'var(--text-3)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
        >✕</button>
      </div>
    );
  }

  return (
    <>
      {showChat && (
        <ChatPanel
          taskId={task.id}
          taskName={task.name}
          onClose={() => setShowChat(false)}
        />
      )}
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={handleClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-md z-50 flex flex-col" style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-20px 0 60px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: currentStatus?.color ?? '#64748b' }} />
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Task detail</h2>
            {isDirty && (
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                Unsaved
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowChat((v) => !v)}
              title="Open chat"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-colors"
              style={{ color: showChat ? 'var(--brand)' : 'var(--text-3)', background: showChat ? 'var(--brand-subtle)' : 'transparent' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = showChat ? 'var(--brand)' : 'var(--text-3)')}
            >💬</button>
            <button
              onClick={() => setMinimized(true)}
              title="Minimise"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-colors"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
            >−</button>
            <button
              onClick={handleClose}
              title="Close"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-colors"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
            >✕</button>
          </div>
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

          {sprints.length > 0 && (
            <div>
              <label className="label">Sprint</label>
              <div className="flex flex-wrap gap-2">
                {sprints.map((s) => {
                  const active = sprintIds.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSprintIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                        return next;
                      })}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: active ? 'var(--brand-subtle)' : 'var(--surface-2)',
                        color: active ? 'var(--brand)' : 'var(--text-2)',
                        border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
                      }}
                    >
                      ⚡ {s.name}
                      {active && <span style={{ color: 'var(--brand)', fontSize: 10 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
                      >✕</button>
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
          {readOnly ? (
            <div className="flex-1 flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
              <span>🔒</span> View only — you don't have write access to this tab
            </div>
          ) : (
            <button onClick={save} disabled={saving} className="btn-primary flex-1 flex justify-center">
              {saving ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Save changes'}
            </button>
          )}
          <button onClick={handleClose} className="btn-secondary">Close</button>
          {!readOnly && onDeleted && (
            <button
              onClick={deleteTask}
              title="Delete task"
              className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors flex-shrink-0"
              style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.16)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
            >🗑</button>
          )}
        </div>
      </div>
    </>
  );
}
