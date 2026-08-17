/**
 * Slide-in detail panel for viewing and editing a single task; supports three layout modes: fullscreen, sidebar-docked, and floating.
 * Dragging the header un-docks the panel from the sidebar into a freely-positionable floating window; eight resize handles allow resizing in any direction.
 * `isDirty` tracks unsaved field changes and sprint membership deltas; closing with unsaved changes auto-saves. Ctrl+Enter also saves.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { MarkdownEditorHandle } from './MarkdownEditor';
import TaskDetailFields from './TaskDetailFields';
import type { Task, KanbanColumn, Subtask } from '../../types';
import { api } from '../../api/client';
import { useProduct } from '../../context/ProductContext';
import { usePermission } from '../../context/PermissionContext';
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
  const { activeProduct, tasks } = useProduct();
  const { canWrite } = usePermission();
  // Setting which milestone a task feeds into edits a TaskDependency edge, which the backend gates
  // on Canvas-tab write access specifically - independent of whichever tab's permission set `readOnly`.
  const canEditMilestone = canWrite('canvas');
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
  // Which milestone task this task directly feeds into, if any - derived from `requiredBy` (the
  // set of tasks that depend on this one) filtered down to whichever of those is itself a
  // milestone (has a deadline). Doesn't follow multi-hop chains through intermediate tasks; see
  // `computePrimaryMilestones` for that transitive view used elsewhere in the app.
  const [milestoneId, setMilestoneId] = useState(() => {
    const milestoneIds = new Set(tasks.filter((t) => !!t.deadline).map((t) => t.id));
    return task.requiredBy.find((r) => milestoneIds.has(r.dependentId))?.dependentId ?? '';
  });
  const initialMilestoneIdRef = useRef(milestoneId);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const showChat = chatOpen && chatTaskId === task.id;

  // Starts fullscreen on mobile (matches ChatPanel.tsx's identical inline check) so the panel
  // never opens as a desktop-sized sidebar on a phone; still user-togglable afterward.
  const [fullscreen, setFullscreen] = useState(() => window.innerWidth < 768);

  // Re-check on resize (e.g. orientation change) while the panel is open
  useEffect(() => {
    function syncMobile() {
      if (window.innerWidth < 768) setFullscreen(true);
    }
    window.addEventListener('resize', syncMobile);
    return () => window.removeEventListener('resize', syncMobile);
  }, []);

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
  const headerDragRef = useRef<{
    startX: number;
    startY: number;
    px: number;
    py: number;
  } | null>(null);

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
    milestoneId !== initialMilestoneIdRef.current ||
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
          ...columns.map((c) => ({
            statusKey: c.statusKey,
            label: c.label,
            color: c.color,
          })),
        ]
      : DEFAULT_STATUSES;

  const currentStatus = statusOptions.find((s) => s.statusKey === status);

  // Ref so the Ctrl+Enter keydown handler always calls the latest save() without stale closure
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const descEditorRef = useRef<MarkdownEditorHandle>(null);

  async function handleClose() {
    if (saving) return;
    if (isDirty) {
      await save();
      return;
    }
    onClose();
  }

  // Swipe-down-to-dismiss for the fullscreen (mobile) layout - the ✕ button sits in the header's
  // far corner, a reach on a phone, so dragging down from the header closes it instead (same
  // pattern as Modal.tsx's fullscreen sheets, and auto-saves via handleClose like the ✕ does).
  const [fsDragY, setFsDragY] = useState(0);
  const [fsDragging, setFsDragging] = useState(false);
  const fsDragStartYRef = useRef<number | null>(null);
  const FS_DRAG_CLOSE_THRESHOLD = 100;
  const FS_DRAG_MAX = 300;

  function handleFsTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    fsDragStartYRef.current = t.clientY;
    setFsDragging(true);
  }

  function handleFsTouchMove(e: React.TouchEvent) {
    if (fsDragStartYRef.current === null) return;
    const t = e.touches[0];
    if (!t) return;
    const dy = t.clientY - fsDragStartYRef.current;
    setFsDragY(Math.max(0, Math.min(dy, FS_DRAG_MAX)));
  }

  function handleFsTouchEnd() {
    if (fsDragStartYRef.current === null) return;
    fsDragStartYRef.current = null;
    setFsDragging(false);
    if (fsDragY >= FS_DRAG_CLOSE_THRESHOLD) handleClose();
    setFsDragY(0);
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
        description: description || null,
        ownerId: ownerId || null,
        reviewerId: reviewerId || null,
        status,
        color: color || null,
        deadline: deadline || null,
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

      // Apply the milestone membership change: remove the old direct edge (if any) and/or add the
      // new one (if any) - a plain replace, not a merge, since this field represents "the one
      // milestone this task feeds into directly", not an accumulating list.
      if (milestoneId !== initialMilestoneIdRef.current) {
        const prevId = initialMilestoneIdRef.current;
        await Promise.all([
          prevId ? api.tasks.removeDependency(activeProduct.id, prevId, task.id) : null,
          milestoneId ? api.tasks.addDependency(activeProduct.id, milestoneId, task.id) : null,
        ]);
        initialMilestoneIdRef.current = milestoneId;
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
  useEffect(() => {
    saveRef.current = () => save(false);
  });

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
    headerDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      px: startPX,
      py: startPY,
    };
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
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          maxWidth: 280,
        }}
        role="button"
        tabIndex={0}
        onClick={() => setMinimized(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setMinimized(false);
          }
        }}
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
  // Field markup itself (name/description/status/owner/.../subtasks) lives in TaskDetailFields,
  // rendered once per layout branch below with variant="fullscreen" or variant="panel".

  const headerLeft = (
    <div className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full" style={{ background: currentStatus?.color ?? '#64748b' }} />
      <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
        Task detail
      </h2>
      {isDirty && (
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{
            background: 'rgba(245,158,11,0.15)',
            color: '#f59e0b',
            border: '1px solid rgba(245,158,11,0.3)',
          }}
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
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{
            background: 'var(--surface)',
            transform: fsDragY ? `translateY(${fsDragY}px)` : undefined,
            transition: fsDragging ? 'none' : 'transform 200ms ease',
          }}
        >
          <div
            onTouchStart={handleFsTouchStart}
            onTouchMove={handleFsTouchMove}
            onTouchEnd={handleFsTouchEnd}
            onTouchCancel={handleFsTouchEnd}
            className="md:hidden flex justify-center pt-2 flex-shrink-0"
            style={{ touchAction: 'none' }}
            aria-hidden="true"
          >
            <div className="w-9 h-1 rounded-full" style={{ background: 'var(--border-2)' }} />
          </div>
          <div
            onTouchStart={handleFsTouchStart}
            onTouchMove={handleFsTouchMove}
            onTouchEnd={handleFsTouchEnd}
            onTouchCancel={handleFsTouchEnd}
            className="flex items-center justify-between px-4 md:px-8 py-4 flex-shrink-0"
            style={{
              borderBottom: '1px solid var(--border)',
              touchAction: 'none',
            }}
          >
            {headerLeft}
            <div className="flex items-center gap-1">
              {chatBtn}
              {minimizeBtn}
              {expandBtn}
              {closeBtn}
            </div>
          </div>
          <TaskDetailFields
            variant="fullscreen"
            readOnly={readOnly}
            descEditorRef={descEditorRef}
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            status={status}
            setStatus={setStatus}
            statusOptions={statusOptions}
            ownerId={ownerId}
            setOwnerId={setOwnerId}
            reviewerId={reviewerId}
            setReviewerId={setReviewerId}
            users={users}
            sprints={sprints}
            sprintIds={sprintIds}
            setSprintIds={setSprintIds}
            deadline={deadline ?? ''}
            setDeadline={setDeadline}
            milestoneId={milestoneId}
            setMilestoneId={setMilestoneId}
            canEditMilestone={canEditMilestone}
            tasks={tasks}
            taskId={task.id}
            color={color}
            setColor={setColor}
            legend={legend}
            enabledColors={enabledColors}
            subtasks={subtasks}
            addingSubtask={addingSubtask}
            setAddingSubtask={setAddingSubtask}
            newSubtaskName={newSubtaskName}
            setNewSubtaskName={setNewSubtaskName}
            subtaskLoading={subtaskLoading}
            onToggleSubtask={toggleSubtask}
            onAddSubtask={addSubtask}
            onDeleteSubtask={deleteSubtask}
            githubUrl={task.githubUrl}
            completedAt={task.completedAt}
            error={error}
          />
          {footer('px-4 md:px-8')}
        </div>
      </>
    );
  }

  // ── Side panel / floating layout ────────────────────────────────
  return (
    <>
      {isSidebar && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- mouse-only backdrop dismiss; the panel's close button (closeBtn below) is the keyboard-accessible equivalent
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
              style={{
                position: 'absolute',
                top: 0,
                left: 12,
                right: 12,
                height: 5,
                cursor: 'n-resize',
                zIndex: 10,
              }}
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
              style={{
                position: 'absolute',
                top: 12,
                right: 0,
                bottom: 12,
                width: 5,
                cursor: 'e-resize',
                zIndex: 10,
              }}
            />
            <div
              onPointerDown={(e) => startResizeDir(e, 'w')}
              style={{
                position: 'absolute',
                top: 12,
                left: 0,
                bottom: 12,
                width: 5,
                cursor: 'w-resize',
                zIndex: 10,
              }}
            />
            <div
              onPointerDown={(e) => startResizeDir(e, 'nw')}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 12,
                height: 12,
                cursor: 'nw-resize',
                zIndex: 11,
              }}
            />
            <div
              onPointerDown={(e) => startResizeDir(e, 'ne')}
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: 12,
                height: 12,
                cursor: 'ne-resize',
                zIndex: 11,
              }}
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
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: 5,
              cursor: 'w-resize',
              zIndex: 10,
            }}
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
        <TaskDetailFields
          variant="panel"
          readOnly={readOnly}
          descEditorRef={descEditorRef}
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          status={status}
          setStatus={setStatus}
          statusOptions={statusOptions}
          ownerId={ownerId}
          setOwnerId={setOwnerId}
          reviewerId={reviewerId}
          setReviewerId={setReviewerId}
          users={users}
          sprints={sprints}
          sprintIds={sprintIds}
          setSprintIds={setSprintIds}
          deadline={deadline ?? ''}
          setDeadline={setDeadline}
          milestoneId={milestoneId}
          setMilestoneId={setMilestoneId}
          canEditMilestone={canEditMilestone}
          tasks={tasks}
          taskId={task.id}
          color={color}
          setColor={setColor}
          legend={legend}
          enabledColors={enabledColors}
          subtasks={subtasks}
          addingSubtask={addingSubtask}
          setAddingSubtask={setAddingSubtask}
          newSubtaskName={newSubtaskName}
          setNewSubtaskName={setNewSubtaskName}
          subtaskLoading={subtaskLoading}
          onToggleSubtask={toggleSubtask}
          onAddSubtask={addSubtask}
          onDeleteSubtask={deleteSubtask}
          githubUrl={task.githubUrl}
          completedAt={task.completedAt}
          error={error}
        />
        {footer('px-6')}
      </div>
    </>
  );
}
