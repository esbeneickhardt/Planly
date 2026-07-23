/**
 * Slide-in detail panel for viewing and editing a single task; supports three layout modes: fullscreen, sidebar-docked, and floating.
 * Dragging the header un-docks the panel from the sidebar into a freely-positionable floating window; eight resize handles allow resizing in any direction.
 * `isDirty` tracks unsaved field changes and sprint membership deltas; closing with unsaved changes auto-saves. Ctrl+Enter also saves.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import MarkdownEditor, { type MarkdownEditorHandle } from './MarkdownEditor';
import type { Task, KanbanColumn, Subtask } from '../../types';
import { api, displayName } from '../../api/client';
import { useProduct } from '../../context/ProductContext';
import { useColorLegend } from '../../hooks/useColorLegend';
import { useToast } from '../../context/ToastContext';
import { useChat } from '../../context/ChatContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useProductMembers } from '../../hooks/useProductMembers';
import { useSprints } from '../../hooks/useSprints';

interface Props {
  task: Task;
  columns?: KanbanColumn[];
  onClose: () => void;
  onUpdated: (task: Task) => void;
  onDeleted?: () => void;
  readOnly?: boolean;
}

const DEFAULT_STATUSES = [
  { statusKey: 'backlog', label: 'Not started', color: '#64748b' },
  { statusKey: 'todo', label: 'To Do', color: '#3b82f6' },
  { statusKey: 'in_progress', label: 'In Progress', color: '#f59e0b' },
  { statusKey: 'blocked', label: 'Blocked', color: '#ef4444' },
  { statusKey: 'done', label: 'Done', color: '#10b981' },
];

export default function TaskDetailPanel({ task, columns, onClose, onUpdated, onDeleted, readOnly = false }: Props) {
  const { activeProduct } = useProduct();
  const { legend, enabledColors } = useColorLegend(activeProduct?.id ?? '');
  const { showToast } = useToast();
  const { openChat, chatOpen, chatTaskId } = useChat();
  const { confirm } = useConfirm();
  const [minimized, setMinimized] = useState(false);
  const users = useProductMembers(activeProduct?.teamId);

  // Editable field state (mirrors task prop; isDirty compares these back to task)
  const [name, setName] = useState(task.name);
  const [description, setDescription] = useState(task.description ?? '');
  const [ownerId, setOwnerId] = useState(task.ownerId ?? '');
  const [reviewerId, setReviewerId] = useState(task.reviewerId ?? '');
  const [status, setStatus] = useState(task.status);
  const [color, setColor] = useState(task.color ?? '');
  const [deadline, setDeadline] = useState(task.deadline ? task.deadline.split('T')[0] : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const showChat = chatOpen && chatTaskId === task.id;

  const [fullscreen, setFullscreen] = useState(false);

  // Panel layout state: size + position persisted to localStorage; refs shadow state for pointer closures
  const [isSidebar, setIsSidebar] = useState(() => {
    try {
      return localStorage.getItem('planly-task-sidebar') !== 'false';
    } catch {
      return true;
    }
  });
  const [panelWidth, setPanelWidth] = useState(() => {
    try {
      return parseInt(localStorage.getItem('planly-task-width') ?? '480');
    } catch {
      return 480;
    }
  });
  const [panelHeight, setPanelHeight] = useState(() => {
    try {
      return parseInt(localStorage.getItem('planly-task-height') ?? '650');
    } catch {
      return 650;
    }
  });
  const [panelPos, setPanelPos] = useState<{ x: number; y: number }>(() => {
    try {
      const s = localStorage.getItem('planly-task-pos');
      if (s) return JSON.parse(s);
    } catch {}
    return { x: Math.max(0, window.innerWidth - 520), y: 40 };
  });
  const panelWidthRef = useRef(panelWidth);
  const panelHeightRef = useRef(panelHeight);
  const panelPosRef = useRef(panelPos);
  const isSidebarRef = useRef(isSidebar);
  const headerDragRef = useRef<{ startX: number; startY: number; px: number; py: number } | null>(null);

  // Subtask state
  const [subtasks, setSubtasks] = useState<Subtask[]>(task.subtasks ?? []);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtaskName, setNewSubtaskName] = useState('');
  const [subtaskLoading, setSubtaskLoading] = useState<string | null>(null);

  // Sprint membership: initialSprintIdsRef enables dirty detection without extra API calls
  const { sprints, refresh: refreshSprints } = useSprints(activeProduct?.id);
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
    reviewerId !== (task.reviewerId ?? '') ||
    status !== task.status ||
    color !== (task.color ?? '') ||
    deadline !== (task.deadline ? task.deadline.split('T')[0] : '') ||
    sprintsDirty;

  useEffect(() => {
    if (!activeProduct) return;
    refreshSprints().then((ss) => {
      const ids = new Set(ss.filter((s) => s.taskIds.includes(task.id)).map((s) => s.id));
      setSprintIds(ids);
      initialSprintIdsRef.current = new Set(ids);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSprints, task.id]);

  const statusOptions =
    columns && columns.length > 0
      ? [
          { statusKey: 'backlog', label: 'Not started', color: '#64748b' },
          ...columns.map((c) => ({ statusKey: c.statusKey, label: c.label, color: c.color })),
        ]
      : DEFAULT_STATUSES;

  const currentStatus = statusOptions.find((s) => s.statusKey === status);

  // Ref so the Ctrl+Enter keydown handler always calls the latest save() without stale closure
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const descEditorRef = useRef<MarkdownEditorHandle>(null);

  async function handleClose() {
    if (saving) return;
    if (isDirty) { await save(); return; }
    onClose();
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !readOnly) {
        e.preventDefault();
        saveRef.current();
        descEditorRef.current?.goToPreview();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readOnly]);

  async function save(close = true) {
    if (!activeProduct) return;
    setSaving(true);
    setError('');
    try {
      const updated = await api.tasks.update(activeProduct.id, task.id, {
        name,
        description: description || undefined,
        ownerId: ownerId || undefined,
        reviewerId: reviewerId || null,
        status,
        color: color || undefined,
        deadline: deadline || undefined,
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
      if (close) onClose();
    } catch (err) {
      setError((err as Error).message);
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // Keep ref current so Ctrl+Enter handler always calls the latest save(false) without stale closure
  useEffect(() => { saveRef.current = () => save(false); });

  async function toggleSubtask(s: Subtask) {
    if (!activeProduct) return;
    setSubtaskLoading(s.id);
    try {
      const updated = await api.subtasks.update(activeProduct.id, task.id, s.id, { completed: !s.completed });
      setSubtasks((prev) => prev.map((x) => (x.id === s.id ? { ...x, completed: updated.completed } : x)));
    } finally {
      setSubtaskLoading(null);
    }
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
    if (!(await confirm(`Delete "${task.name}"? This cannot be undone.`))) return;
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

  // Resize: 8-directional pointer capture; persists dimensions on pointer-up
  const startResizeDir = useCallback((e: React.PointerEvent, dir: string) => {
    e.preventDefault();
    e.stopPropagation();
    const sx = panelPosRef.current.x,
      sy = panelPosRef.current.y;
    const sw = panelWidthRef.current,
      sh = panelHeightRef.current;
    const startX = e.clientX,
      startY = e.clientY;
    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX,
        dy = ev.clientY - startY;
      let newW = sw,
        newH = sh,
        newX = sx,
        newY = sy;
      if (dir.includes('e')) newW = Math.max(360, Math.min(1200, sw + dx));
      if (dir.includes('w')) {
        newW = Math.max(360, Math.min(1200, sw - dx));
        if (!isSidebarRef.current) newX = sx + sw - newW;
      }
      if (dir.includes('s')) newH = Math.max(300, Math.min(window.innerHeight - 40, sh + dy));
      if (dir.includes('n')) {
        newH = Math.max(300, Math.min(window.innerHeight - 40, sh - dy));
        newY = sy + sh - newH;
      }
      newX = Math.max(0, Math.min(window.innerWidth - newW, newX));
      newY = Math.max(0, newY);
      setPanelWidth(newW);
      panelWidthRef.current = newW;
      setPanelHeight(newH);
      panelHeightRef.current = newH;
      if (!isSidebarRef.current) {
        setPanelPos({ x: newX, y: newY });
        panelPosRef.current = { x: newX, y: newY };
      }
    }
    function onUp() {
      try {
        localStorage.setItem('planly-task-width', String(panelWidthRef.current));
        localStorage.setItem('planly-task-height', String(panelHeightRef.current));
        localStorage.setItem('planly-task-pos', JSON.stringify(panelPosRef.current));
      } catch {}
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  // Header drag: un-docks from sidebar on first move, then free-positions
  const onHeaderDrag = useCallback((e: React.PointerEvent) => {
    if ((e.target as Element).closest('button')) return;
    e.preventDefault();
    const startPX = isSidebarRef.current ? window.innerWidth - panelWidthRef.current : panelPosRef.current.x;
    const startPY = isSidebarRef.current ? 0 : panelPosRef.current.y;
    headerDragRef.current = { startX: e.clientX, startY: e.clientY, px: startPX, py: startPY };
    function onMove(ev: PointerEvent) {
      if (!headerDragRef.current) return;
      const x = Math.max(
        0,
        Math.min(
          window.innerWidth - panelWidthRef.current,
          headerDragRef.current.px + (ev.clientX - headerDragRef.current.startX),
        ),
      );
      const y = Math.max(
        0,
        Math.min(window.innerHeight - 56, headerDragRef.current.py + (ev.clientY - headerDragRef.current.startY)),
      );
      if (isSidebarRef.current && x + panelWidthRef.current < window.innerWidth - 40) {
        setIsSidebar(false);
        isSidebarRef.current = false;
        try {
          localStorage.setItem('planly-task-sidebar', 'false');
        } catch {}
      }
      setPanelPos({ x, y });
      panelPosRef.current = { x, y };
    }
    function onUp() {
      const pos = panelPosRef.current;
      if (!isSidebarRef.current && pos.x + panelWidthRef.current >= window.innerWidth - 40) {
        setIsSidebar(true);
        isSidebarRef.current = true;
        try {
          localStorage.setItem('planly-task-sidebar', 'true');
        } catch {}
      }
      try {
        localStorage.setItem('planly-task-pos', JSON.stringify(panelPosRef.current));
      } catch {}
      headerDragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  if (minimized) {
    return (
      <div
        className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-xl cursor-pointer"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxWidth: 280 }}
        onClick={() => setMinimized(false)}
      >
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: currentStatus?.color ?? '#64748b' }}
        />
        <span className="text-sm font-medium truncate flex-1" style={{ color: 'var(--text)' }}>
          {name}
        </span>
        {isDirty && (
          <span
            className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
            style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}
          >
            ●
          </span>
        )}
        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>
          ↑ Restore
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
          className="flex-shrink-0 text-xs text-[var(--text-3)] hover:text-[#ef4444] transition-colors"
        >
          ✕
        </button>
      </div>
    );
  }

  // ── Shared sub-sections ──────────────────────────────────────────

  const descField = (rows: number) => (
    <div>
      <label className="label mb-1">Description</label>
      <MarkdownEditor
        ref={descEditorRef}
        value={description}
        onChange={setDescription}
        rows={rows}
        placeholder="Supports Markdown. Paste or drag images to upload."
        disabled={readOnly}
        initialPreview
      />
    </div>
  );

  const metaFields = (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input" disabled={readOnly}>
            {statusOptions.map((o) => (
              <option key={o.statusKey} value={o.statusKey}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Owner</label>
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="input" disabled={readOnly}>
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.avatarEmoji ? `${u.avatarEmoji} ` : ''}
                {displayName(u)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Reviewer</label>
          <select
            value={reviewerId}
            onChange={(e) => setReviewerId(e.target.value)}
            className="input"
            disabled={readOnly}
          >
            <option value="">None</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.avatarEmoji ? `${u.avatarEmoji} ` : ''}
                {displayName(u)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {sprints.length > 0 && (
        <div>
          <label className="label">Sub-plan</label>
          <div className="flex flex-wrap gap-2">
            {sprints.map((s) => {
              const active = sprintIds.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={readOnly}
                  onClick={() =>
                    setSprintIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(s.id)) next.delete(s.id);
                      else next.add(s.id);
                      return next;
                    })
                  }
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: active ? `${s.color}22` : 'var(--surface-2)',
                    color: active ? s.color : 'var(--text-2)',
                    border: `1px solid ${active ? s.color : 'var(--border)'}`,
                    opacity: readOnly ? 0.6 : 1,
                    cursor: readOnly ? 'default' : 'pointer',
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
        <label className="label">
          Deadline{' '}
          <span className="normal-case font-normal" style={{ color: 'var(--text-3)' }}>
            (makes this a Milestone)
          </span>
        </label>
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="input"
          disabled={readOnly}
        />
      </div>

      <div>
        <label className="label">Color tag</label>
        <div className="flex items-center gap-2 flex-wrap">
          {enabledColors.map((c) => (
            <button
              key={c}
              onClick={() => !readOnly && setColor(color === c ? '' : c)}
              title={legend[c] || c}
              className="w-6 h-6 rounded-full transition-transform relative group"
              style={{
                background: c,
                transform: color === c ? 'scale(1.25)' : 'scale(1)',
                boxShadow: color === c ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}` : 'none',
                cursor: readOnly ? 'default' : 'pointer',
              }}
            >
              {legend[c] && (
                <span
                  className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  style={{ background: 'var(--text)', color: 'var(--bg)' }}
                >
                  {legend[c]}
                </span>
              )}
            </button>
          ))}
          {color && !enabledColors.includes(color) && (
            <button
              onClick={() => !readOnly && setColor('')}
              title={legend[color] || color}
              className="w-6 h-6 rounded-full transition-transform relative group"
              style={{
                background: color,
                transform: 'scale(1.25)',
                boxShadow: `0 0 0 2px var(--surface), 0 0 0 4px ${color}`,
                cursor: readOnly ? 'default' : 'pointer',
              }}
            >
              {legend[color] && (
                <span
                  className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  style={{ background: 'var(--text)', color: 'var(--bg)' }}
                >
                  {legend[color]}
                </span>
              )}
            </button>
          )}
          {!readOnly && (
            <button
              onClick={() => setColor('')}
              className="text-xs px-2 py-1 rounded"
              style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

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
            <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-3)' }}>
              No subtasks yet
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {subtasks.map((s) => (
                <div key={s.id} className="flex items-center gap-2.5 px-3 py-2 group">
                  <input
                    type="checkbox"
                    checked={s.completed}
                    disabled={readOnly || subtaskLoading === s.id}
                    onChange={() => toggleSubtask(s)}
                    className="rounded flex-shrink-0"
                    style={{ accentColor: 'var(--brand)' }}
                  />
                  <span
                    className="flex-1 text-sm"
                    style={{
                      color: s.completed ? 'var(--text-3)' : 'var(--text-2)',
                      textDecoration: s.completed ? 'line-through' : 'none',
                    }}
                  >
                    {s.name}
                  </span>
                  {!readOnly && (
                    <button
                      onClick={() => deleteSubtask(s)}
                      className="opacity-0 group-hover:opacity-100 text-xs transition-all text-[var(--text-3)] hover:text-[#ef4444]"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {!readOnly &&
            (addingSubtask ? (
              <div
                className="flex gap-1.5 px-3 py-2"
                style={{ borderTop: subtasks.length > 0 ? '1px solid var(--border)' : 'none' }}
              >
                <input
                  autoFocus
                  type="text"
                  value={newSubtaskName}
                  onChange={(e) => setNewSubtaskName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addSubtask();
                    if (e.key === 'Escape') {
                      setAddingSubtask(false);
                      setNewSubtaskName('');
                    }
                  }}
                  placeholder="Subtask name…"
                  className="input text-sm py-1 flex-1"
                />
                <button onClick={addSubtask} className="text-xs font-medium px-2" style={{ color: 'var(--brand)' }}>
                  Add
                </button>
                <button
                  onClick={() => {
                    setAddingSubtask(false);
                    setNewSubtaskName('');
                  }}
                  className="text-xs"
                  style={{ color: 'var(--text-3)' }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingSubtask(true)}
                className="w-full text-left px-3 py-2 text-xs transition-colors text-[var(--text-3)] hover:text-[var(--brand)]"
                style={{ borderTop: subtasks.length > 0 ? '1px solid var(--border)' : 'none' }}
              >
                + Add subtask
              </button>
            ))}
        </div>
      </div>

      {task.githubUrl && (
        <a
          href={task.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs transition-colors"
          style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand)';
            (e.currentTarget as HTMLElement).style.color = 'var(--brand)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
            (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          View on GitHub ↗
        </a>
      )}

      {task.completedAt && (
        <div
          className="text-xs px-3 py-2.5 rounded-lg"
          style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}
        >
          Completed {new Date(task.completedAt).toLocaleString()}
        </div>
      )}
      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
      )}
    </div>
  );

  const headerLeft = (
    <div className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full" style={{ background: currentStatus?.color ?? '#64748b' }} />
      <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
        Task detail
      </h2>
      {isDirty && (
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
        >
          Unsaved
        </span>
      )}
    </div>
  );

  const iconBtn = (title: string, onClick: () => void, children: React.ReactNode, active = false) => (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:text-[var(--brand)] ${active ? 'text-[var(--brand)] bg-[var(--brand-subtle)]' : 'text-[var(--text-3)] bg-transparent'}`}
    >
      {children}
    </button>
  );

  const footer = (px: string) => (
    <div className={`${px} py-4 flex gap-3 flex-shrink-0`} style={{ borderTop: '1px solid var(--border)' }}>
      {readOnly ? (
        <div className="flex-1 flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
          🔒 View only
        </div>
      ) : (
        <button onClick={() => save()} disabled={saving} className="btn-primary flex-1 flex justify-center">
          {saving ? (
            <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            'Save changes'
          )}
        </button>
      )}
      <button onClick={handleClose} className="btn-secondary">
        Close
      </button>
      {!readOnly && onDeleted && (
        <button
          onClick={deleteTask}
          title="Delete task"
          className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors flex-shrink-0 bg-red-500/[8%] hover:bg-red-500/[16%]"
          style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="2,4 14,4" />
            <path d="M5 4V2h6v2" />
            <path d="M3 4l1 10h8l1-10" />
            <line x1="6" y1="7" x2="6" y2="11" />
            <line x1="10" y1="7" x2="10" y2="11" />
          </svg>
        </button>
      )}
    </div>
  );

  const ExpandIcon = () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="8,1 12,1 12,5" />
      <polyline points="5,12 1,12 1,8" />
      <line x1="12" y1="1" x2="7" y2="6" />
      <line x1="1" y1="12" x2="6" y2="7" />
    </svg>
  );

  const CollapseIcon = () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="12,8 12,12 8,12" />
      <polyline points="1,5 1,1 5,1" />
      <line x1="7" y1="7" x2="12" y2="12" />
      <line x1="1" y1="1" x2="6" y2="6" />
    </svg>
  );

  const chatBtn = iconBtn('Open chat', () => openChat(task.id, task.name), '💬', showChat);
  const minimizeBtn = iconBtn('Minimise', () => setMinimized(true), '−');
  const expandBtn = iconBtn(
    fullscreen ? 'Exit fullscreen' : 'Fullscreen',
    () => setFullscreen((v) => !v),
    fullscreen ? <CollapseIcon /> : <ExpandIcon />,
  );
  const closeBtn = iconBtn('Close', handleClose, '✕');

  // ── Fullscreen layout ────────────────────────────────────────────
  if (fullscreen) {
    return (
      <>
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--surface)' }}>
          <div
            className="flex items-center justify-between px-8 py-4 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            {headerLeft}
            <div className="flex items-center gap-1">
              {chatBtn}
              {minimizeBtn}
              {expandBtn}
              {closeBtn}
            </div>
          </div>
          <div className="flex-1 flex overflow-hidden">
            {/* Left: name + description */}
            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input font-medium text-base"
                />
              </div>
              {descField(18)}
            </div>
            {/* Right: metadata */}
            <div
              className="w-80 flex-shrink-0 overflow-y-auto px-6 py-6"
              style={{ borderLeft: '1px solid var(--border)' }}
            >
              {metaFields}
            </div>
          </div>
          {footer('px-8')}
        </div>
      </>
    );
  }

  // ── Side panel / floating layout ────────────────────────────────
  return (
    <>
      {isSidebar && (
        <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={handleClose} />
      )}
      <div
        className="fixed flex flex-col"
        style={
          isSidebar
            ? {
                top: 0,
                right: 0,
                bottom: 0,
                zIndex: 50,
                width: panelWidth,
                background: 'var(--surface)',
                borderLeft: '1px solid var(--border)',
                boxShadow: '-20px 0 60px rgba(0,0,0,0.3)',
                overflow: 'hidden',
              }
            : {
                left: panelPos.x,
                top: panelPos.y,
                zIndex: 50,
                width: panelWidth,
                height: panelHeight,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
                overflow: 'hidden',
              }
        }
      >
        {/* Resize handles - floating only */}
        {!isSidebar && (
          <>
            <div
              onPointerDown={(e) => startResizeDir(e, 'n')}
              style={{ position: 'absolute', top: 0, left: 12, right: 12, height: 5, cursor: 'n-resize', zIndex: 10 }}
            />
            <div
              onPointerDown={(e) => startResizeDir(e, 's')}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 12,
                right: 12,
                height: 5,
                cursor: 's-resize',
                zIndex: 10,
              }}
            />
            <div
              onPointerDown={(e) => startResizeDir(e, 'e')}
              style={{ position: 'absolute', top: 12, right: 0, bottom: 12, width: 5, cursor: 'e-resize', zIndex: 10 }}
            />
            <div
              onPointerDown={(e) => startResizeDir(e, 'w')}
              style={{ position: 'absolute', top: 12, left: 0, bottom: 12, width: 5, cursor: 'w-resize', zIndex: 10 }}
            />
            <div
              onPointerDown={(e) => startResizeDir(e, 'nw')}
              style={{ position: 'absolute', top: 0, left: 0, width: 12, height: 12, cursor: 'nw-resize', zIndex: 11 }}
            />
            <div
              onPointerDown={(e) => startResizeDir(e, 'ne')}
              style={{ position: 'absolute', top: 0, right: 0, width: 12, height: 12, cursor: 'ne-resize', zIndex: 11 }}
            />
            <div
              onPointerDown={(e) => startResizeDir(e, 'sw')}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: 12,
                height: 12,
                cursor: 'sw-resize',
                zIndex: 11,
              }}
            />
            <div
              onPointerDown={(e) => startResizeDir(e, 'se')}
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 12,
                height: 12,
                cursor: 'se-resize',
                zIndex: 11,
              }}
            />
          </>
        )}
        {/* Sidebar left-edge resize */}
        {isSidebar && (
          <div
            onPointerDown={(e) => startResizeDir(e, 'w')}
            style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 5, cursor: 'w-resize', zIndex: 10 }}
          />
        )}
        {/* Header - drag to detach / move */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0 select-none"
          style={{ borderBottom: '1px solid var(--border)', cursor: 'grab' }}
          onPointerDown={onHeaderDrag}
        >
          {headerLeft}
          <div className="flex items-center gap-1">
            {chatBtn}
            {minimizeBtn}
            {expandBtn}
            {closeBtn}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="label">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input font-medium"
              disabled={readOnly}
            />
          </div>
          {descField(4)}
          {metaFields}
        </div>
        {footer('px-6')}
      </div>
    </>
  );
}
