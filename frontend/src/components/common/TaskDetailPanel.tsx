import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
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

  const [fullscreen, setFullscreen] = useState(false);
  const [descPreview, setDescPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);

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

  async function insertUploadedImage(file: File) {
    if (!file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const result = await api.upload(file);
      const markdown = `![${file.name}](${result.url})`;
      const el = descRef.current;
      if (el) {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const next = description.slice(0, start) + (start > 0 && description[start - 1] !== '\n' ? '\n' : '') + markdown + '\n' + description.slice(end);
        setDescription(next);
        setTimeout(() => { el.focus(); el.selectionStart = el.selectionEnd = start + markdown.length + 1; }, 0);
      } else {
        setDescription((d) => d + (d && !d.endsWith('\n') ? '\n' : '') + markdown + '\n');
      }
    } catch {
      showToast('Image upload failed', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleDescPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const image = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (!image) return;
    e.preventDefault();
    const file = image.getAsFile();
    if (file) await insertUploadedImage(file);
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
        {isDirty && <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>●</span>}
        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>↑ Restore</span>
        <button onClick={(e) => { e.stopPropagation(); handleClose(); }} className="flex-shrink-0 text-xs" style={{ color: 'var(--text-3)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
        >✕</button>
      </div>
    );
  }

  // ── Shared sub-sections ──────────────────────────────────────────

  const descField = (rows: number) => (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="label mb-0">Description</label>
        <div className="flex items-center gap-1">
          {['Edit', 'Preview'].map((m) => (
            <button key={m} type="button" onClick={() => setDescPreview(m === 'Preview')}
              className="text-xs px-2 py-0.5 rounded transition-colors"
              style={{ background: descPreview === (m === 'Preview') ? 'var(--brand-subtle)' : 'transparent', color: descPreview === (m === 'Preview') ? 'var(--brand)' : 'var(--text-3)' }}
            >{m}</button>
          ))}
        </div>
      </div>
      {descPreview ? (
        <div className="input overflow-auto cursor-default" style={{ minHeight: rows * 22, color: 'var(--text)' }} onClick={() => setDescPreview(false)}>
          {description ? (
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={{
              img: ({ src, alt }) => {
                const filename = src?.split('/').pop() ?? '';
                return (
                  <span className="group/img relative inline-block" style={{ maxWidth: '100%' }}>
                    <img src={src} alt={alt ?? ''} style={{ maxWidth: '100%', borderRadius: 6, marginTop: 4, display: 'block' }} />
                    {!readOnly && (
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={async () => {
                          try {
                            await api.deleteUpload(filename);
                            setDescription((d) => d.replace(new RegExp(`!\\[[^\\]]*\\]\\(${src?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)\\n?`, 'g'), ''));
                          } catch { showToast('Failed to delete image', 'error'); }
                        }}
                        title="Delete image"
                        className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                        style={{ background: 'rgba(239,68,68,0.85)', color: 'white' }}
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" />
                        </svg>
                      </button>
                    )}
                  </span>
                );
              },
              a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)' }}>{children}</a>,
              code: ({ children, className }) => className
                ? <code style={{ display: 'block', background: 'var(--surface-2)', padding: '8px 12px', borderRadius: 6, fontSize: 12, overflowX: 'auto' }}>{children}</code>
                : <code style={{ background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 4, fontSize: 12 }}>{children}</code>,
            }}>{description}</ReactMarkdown>
          ) : (
            <span className="text-xs italic" style={{ color: 'var(--text-3)' }}>No description - click to edit</span>
          )}
        </div>
      ) : (
        <div className="relative">
          <textarea ref={descRef} rows={rows} value={description} onChange={(e) => setDescription(e.target.value)}
            onPaste={handleDescPaste} className="input resize-y w-full"
            placeholder="Supports Markdown. Paste or upload images." style={{ paddingBottom: 30 }}
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
            {uploading && <span className="text-xs" style={{ color: 'var(--text-3)' }}>Uploading…</span>}
            <label title="Upload image" className="cursor-pointer flex items-center justify-center w-6 h-6 rounded transition-colors"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="14" height="10" rx="1.5" />
                <circle cx="5.5" cy="7" r="1.2" />
                <polyline points="1,12.5 5,8.5 8,11 11,8 15,12.5" />
              </svg>
              <input type="file" accept="image/*" className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) insertUploadedImage(f); e.target.value = ''; }} />
            </label>
            <span className="text-[10px]" style={{ color: 'var(--text-3)', opacity: 0.5 }}>Markdown</span>
          </div>
        </div>
      )}
    </div>
  );

  const metaFields = (
    <div className="space-y-5">
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
                <button key={s.id} type="button"
                  onClick={() => setSprintIds((prev) => { const next = new Set(prev); if (next.has(s.id)) next.delete(s.id); else next.add(s.id); return next; })}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: active ? `${s.color}22` : 'var(--surface-2)',
                    color: active ? s.color : 'var(--text-2)',
                    border: `1px solid ${active ? s.color : 'var(--border)'}`,
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  {s.name}
                  {active && <span style={{ fontSize: 10 }}>✓</span>}
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
            <button key={c} onClick={() => setColor(color === c ? '' : c)} title={legend[c] || c}
              className="w-6 h-6 rounded-full transition-transform relative group"
              style={{ background: c, transform: color === c ? 'scale(1.25)' : 'scale(1)', boxShadow: color === c ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}` : 'none' }}
            >
              {legend[c] && <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10" style={{ background: 'var(--text)', color: 'var(--bg)' }}>{legend[c]}</span>}
            </button>
          ))}
          {color && !enabledColors.includes(color) && (
            <button onClick={() => setColor('')} title={legend[color] || color}
              className="w-6 h-6 rounded-full transition-transform relative group"
              style={{ background: color, transform: 'scale(1.25)', boxShadow: `0 0 0 2px var(--surface), 0 0 0 4px ${color}` }}
            >
              {legend[color] && <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10" style={{ background: 'var(--text)', color: 'var(--bg)' }}>{legend[color]}</span>}
            </button>
          )}
          <button onClick={() => setColor('')} className="text-xs px-2 py-1 rounded" style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}>Clear</button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Subtasks</label>
          {subtasks.length > 0 && <span className="text-xs" style={{ color: 'var(--text-3)' }}>{subtasks.filter((s) => s.completed).length}/{subtasks.length} done</span>}
        </div>
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {subtasks.length === 0 && !addingSubtask
            ? <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-3)' }}>No subtasks yet</div>
            : <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {subtasks.map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5 px-3 py-2 group">
                    <input type="checkbox" checked={s.completed} disabled={subtaskLoading === s.id} onChange={() => toggleSubtask(s)} className="rounded flex-shrink-0" style={{ accentColor: 'var(--brand)' }} />
                    <span className="flex-1 text-sm" style={{ color: s.completed ? 'var(--text-3)' : 'var(--text-2)', textDecoration: s.completed ? 'line-through' : 'none' }}>{s.name}</span>
                    <button onClick={() => deleteSubtask(s)} className="opacity-0 group-hover:opacity-100 text-xs transition-opacity" style={{ color: 'var(--text-3)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                    >✕</button>
                  </div>
                ))}
              </div>
          }
          {addingSubtask ? (
            <div className="flex gap-1.5 px-3 py-2" style={{ borderTop: subtasks.length > 0 ? '1px solid var(--border)' : 'none' }}>
              <input autoFocus type="text" value={newSubtaskName} onChange={(e) => setNewSubtaskName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addSubtask(); if (e.key === 'Escape') { setAddingSubtask(false); setNewSubtaskName(''); } }}
                placeholder="Subtask name…" className="input text-sm py-1 flex-1" />
              <button onClick={addSubtask} className="text-xs font-medium px-2" style={{ color: 'var(--brand)' }}>Add</button>
              <button onClick={() => { setAddingSubtask(false); setNewSubtaskName(''); }} className="text-xs" style={{ color: 'var(--text-3)' }}>✕</button>
            </div>
          ) : (
            <button onClick={() => setAddingSubtask(true)} className="w-full text-left px-3 py-2 text-xs transition-colors"
              style={{ color: 'var(--text-3)', borderTop: subtasks.length > 0 ? '1px solid var(--border)' : 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
            >+ Add subtask</button>
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
  );

  const headerLeft = (
    <div className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full" style={{ background: currentStatus?.color ?? '#64748b' }} />
      <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Task detail</h2>
      {isDirty && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>Unsaved</span>}
    </div>
  );

  const iconBtn = (title: string, onClick: () => void, children: React.ReactNode, active = false) => (
    <button onClick={onClick} title={title}
      className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
      style={{ color: active ? 'var(--brand)' : 'var(--text-3)', background: active ? 'var(--brand-subtle)' : 'transparent' }}
      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand)')}
      onMouseLeave={(e) => (e.currentTarget.style.color = active ? 'var(--brand)' : 'var(--text-3)')}
    >{children}</button>
  );

  const footer = (px: string) => (
    <div className={`${px} py-4 flex gap-3 flex-shrink-0`} style={{ borderTop: '1px solid var(--border)' }}>
      {readOnly ? (
        <div className="flex-1 flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>🔒 View only</div>
      ) : (
        <button onClick={save} disabled={saving} className="btn-primary flex-1 flex justify-center">
          {saving ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Save changes'}
        </button>
      )}
      <button onClick={handleClose} className="btn-secondary">Close</button>
      {!readOnly && onDeleted && (
        <button onClick={deleteTask} title="Delete task"
          className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors flex-shrink-0"
          style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.16)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2,4 14,4" /><path d="M5 4V2h6v2" /><path d="M3 4l1 10h8l1-10" /><line x1="6" y1="7" x2="6" y2="11" /><line x1="10" y1="7" x2="10" y2="11" />
          </svg>
        </button>
      )}
    </div>
  );

  const ExpandIcon = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8,1 12,1 12,5" /><polyline points="5,12 1,12 1,8" />
      <line x1="12" y1="1" x2="7" y2="6" /><line x1="1" y1="12" x2="6" y2="7" />
    </svg>
  );

  const CollapseIcon = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="12,8 12,12 8,12" /><polyline points="1,5 1,1 5,1" />
      <line x1="7" y1="7" x2="12" y2="12" /><line x1="1" y1="1" x2="6" y2="6" />
    </svg>
  );

  const chatBtn = iconBtn('Open chat', () => setShowChat((v) => !v), '💬', showChat);
  const minimizeBtn = iconBtn('Minimise', () => setMinimized(true), '−');
  const expandBtn = iconBtn(fullscreen ? 'Exit fullscreen' : 'Fullscreen', () => setFullscreen((v) => !v), fullscreen ? <CollapseIcon /> : <ExpandIcon />);
  const closeBtn = iconBtn('Close', handleClose, '✕');

  // ── Fullscreen layout ────────────────────────────────────────────
  if (fullscreen) {
    return (
      <>
        {showChat && <ChatPanel taskId={task.id} taskName={task.name} onClose={() => setShowChat(false)} />}
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--surface)' }}>
          <div className="flex items-center justify-between px-8 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            {headerLeft}
            <div className="flex items-center gap-1">{chatBtn}{minimizeBtn}{expandBtn}{closeBtn}</div>
          </div>
          <div className="flex-1 flex overflow-hidden">
            {/* Left: name + description */}
            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
              <div>
                <label className="label">Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input font-medium text-base" />
              </div>
              {descField(18)}
            </div>
            {/* Right: metadata */}
            <div className="w-80 flex-shrink-0 overflow-y-auto px-6 py-6" style={{ borderLeft: '1px solid var(--border)' }}>
              {metaFields}
            </div>
          </div>
          {footer('px-8')}
        </div>
      </>
    );
  }

  // ── Side panel layout ────────────────────────────────────────────
  return (
    <>
      {showChat && <ChatPanel taskId={task.id} taskName={task.name} onClose={() => setShowChat(false)} />}
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={handleClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-md z-50 flex flex-col" style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-20px 0 60px rgba(0,0,0,0.3)' }}>
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          {headerLeft}
          <div className="flex items-center gap-1">{chatBtn}{minimizeBtn}{expandBtn}{closeBtn}</div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="label">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input font-medium" />
          </div>
          {descField(4)}
          {metaFields}
        </div>
        {footer('px-6')}
      </div>
    </>
  );
}
