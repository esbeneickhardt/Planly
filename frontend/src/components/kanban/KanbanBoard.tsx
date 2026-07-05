import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverlay,
  MouseSensor, TouchSensor, useSensor, useSensors,
  pointerWithin,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import type { Task, KanbanColumn as KanbanColumnType, User } from '../../types';
import type { Sprint } from '../../api/client';
import { api } from '../../api/client';
import { useProduct } from '../../context/ProductContext';
import { usePermission } from '../../context/PermissionContext';
import { useAuth } from '../../context/AuthContext';
import { useColorLegend } from '../../hooks/useColorLegend';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import TaskDetailPanel from '../common/TaskDetailPanel';
import SprintBacklogPanel from './SprintBacklogPanel';
import Modal from '../common/Modal';

const FILTER_COLORS = ['#7c3aed','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#f97316'];

const KANBAN_BACKGROUNDS: { id: string; label: string; gradient: string }[] = [
  { id: 'misty-forest',   label: 'Misty Forest',   gradient: 'linear-gradient(135deg,#0d2b1a 0%,#1a4a2e 50%,#2d6b45 100%)' },
  { id: 'tokyo-night',    label: 'Tokyo Night',    gradient: 'linear-gradient(135deg,#0a0a2e 0%,#1a1a5e 40%,#2a0a4a 100%)' },
  { id: 'miami-dusk',     label: 'Miami Dusk',     gradient: 'linear-gradient(135deg,#0d0821 0%,#4a0a3a 50%,#7a1050 100%)' },
  { id: 'arctic-void',    label: 'Arctic Void',    gradient: 'linear-gradient(135deg,#030508 0%,#070e1a 50%,#142030 100%)' },
  { id: 'cyber-city',     label: 'Cyber City',     gradient: 'linear-gradient(135deg,#0a0a18 0%,#1a0a2e 40%,#0a1a2e 100%)' },
  { id: 'sakura-rain',    label: 'Sakura Rain',    gradient: 'linear-gradient(135deg,#0a0f10 0%,#111a1c 50%,#1a3020 100%)' },
  { id: 'mountain-peaks', label: 'Mountain Peaks', gradient: 'linear-gradient(135deg,#0a0a14 0%,#141428 40%,#1e2840 100%)' },
];

export default function KanbanBoard() {
  const { activeProduct, tasks, refreshTasks, createTask } = useProduct();
  const { canWrite } = usePermission();
  const { user } = useAuth();
  const readOnly = !canWrite('kanban');
  const [columns, setColumns] = useState<KanbanColumnType[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeColumn, setActiveColumn] = useState<KanbanColumnType | null>(null);
  const [toast, setToast] = useState('');
  const [showNewTask, setShowNewTask] = useState(false);
  const [showNewColumn, setShowNewColumn] = useState(false);
  const [pendingDeleteCol, setPendingDeleteCol] = useState<KanbanColumnType | null>(null);
  const [newTaskName, setNewTaskName] = useState('');
  const [newColLabel, setNewColLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Multi-select filters
  const [ownerFilters, setOwnerFilters] = useState<Set<string>>(new Set());
  const [colorFilters, setColorFilters] = useState<Set<string>>(new Set());
  const [sprintFilter, setSprintFilter] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
  const [users, setUsers] = useState<Pick<User, 'id' | 'username' | 'avatarEmoji'>[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const sprintInitialized = useRef<string | null>(null);
  const [compact, setCompact] = useState(() => localStorage.getItem('planly_kanban_compact') === '1');
  const [compactSort, setCompactSort] = useState<{ key: 'name' | 'status' | 'owner' | 'deadline'; dir: 1 | -1 }>({ key: 'status', dir: 1 });
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [showSprintPanel, setShowSprintPanel] = useState(false);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const bgPickerRef = useRef<HTMLDivElement>(null);

  const { legend: colorLegend } = useColorLegend(activeProduct?.id ?? '');

  useLayoutEffect(() => {
    if (!activeProduct) { setBgImage(null); return; }
    const saved = localStorage.getItem(`planly-kanban-bg-${activeProduct.id}`);
    setBgImage(saved && KANBAN_BACKGROUNDS.some((b) => b.id === saved) ? saved : null);
  }, [activeProduct?.id]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (bgPickerRef.current && !bgPickerRef.current.contains(e.target as Node)) setShowBgPicker(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function setSprintFilterAndSave(val: string | null) {
    setSprintFilter(val);
    if (activeProduct) {
      if (val !== null) localStorage.setItem(`planly_sprint_${activeProduct.id}`, val);
      else localStorage.removeItem(`planly_sprint_${activeProduct.id}`);
    }
  }

  // Board pan-scroll
  const boardRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, scrollLeft: 0 });

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  useEffect(() => {
    if (!activeProduct?.teamId) return;
    api.teams.get(activeProduct.teamId)
      .then((team) => setUsers(team.members.map((m) => m.user)))
      .catch(() => {});
  }, [activeProduct?.teamId]);

  useEffect(() => {
    if (!activeProduct) return;
    sprintInitialized.current = null;
    api.sprints.list(activeProduct.id).then((ss) => {
      setSprints(ss);
      // Restore last user selection; fall back to current overlapping sprint
      const saved = localStorage.getItem(`planly_sprint_${activeProduct.id}`);
      if (saved && ss.some((s) => s.id === saved)) {
        setSprintFilter(saved);
      } else {
        const now = new Date();
        const current = [...ss]
          .filter((s) => new Date(s.startDate) <= now && new Date(s.endDate) >= now)
          .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];
        setSprintFilter(current?.id ?? null);
      }
      sprintInitialized.current = activeProduct.id;
    }).catch(() => {});
  }, [activeProduct?.id]);

  const loadColumns = useCallback(async () => {
    if (!activeProduct) return;
    const cols = await api.columns.list(activeProduct.id);
    setColumns(cols);
  }, [activeProduct]);

  useEffect(() => { loadColumns(); }, [loadColumns]);

  const taskOwners = useMemo(() => {
    const ids = new Set(tasks.filter((t) => t.ownerId).map((t) => t.ownerId!));
    return users.filter((u) => ids.has(u.id));
  }, [tasks, users]);

  const taskColors = useMemo(() => {
    const used = new Set(tasks.filter((t) => t.color).map((t) => t.color!));
    return FILTER_COLORS.filter((c) => used.has(c));
  }, [tasks]);

  const visibleStatusKeys = useMemo(() => new Set(columns.map((c) => c.statusKey)), [columns]);

  const hasFilters = ownerFilters.size > 0 || colorFilters.size > 0 || sprintFilter !== null || mineOnly;

  const filteredTasks = useMemo(() => {
    const sprintTaskIds = sprintFilter
      ? new Set(sprints.find((s) => s.id === sprintFilter)?.taskIds ?? [])
      : null;
    return tasks.filter((t) => {
      if (!visibleStatusKeys.has(t.status)) return false;
      if (mineOnly && t.ownerId !== user?.id) return false;
      if (ownerFilters.size > 0 && (!t.ownerId || !ownerFilters.has(t.ownerId))) return false;
      if (colorFilters.size > 0 && (!t.color || !colorFilters.has(t.color))) return false;
      if (sprintFilter && !sprintTaskIds?.has(t.id)) return false;
      return true;
    });
  }, [tasks, visibleStatusKeys, mineOnly, ownerFilters, colorFilters, sprintFilter, sprints, user?.id]);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  function selectBg(id: string | null) {
    setBgImage(id);
    setShowBgPicker(false);
    if (!activeProduct) return;
    if (id) localStorage.setItem(`planly-kanban-bg-${activeProduct.id}`, id);
    else localStorage.removeItem(`planly-kanban-bg-${activeProduct.id}`);
  }

  function toggleOwner(id: string) {
    setOwnerFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleColor(c: string) {
    setColorFilters((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }

  // Board horizontal pan
  function onBoardMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    // Only pan on the board background, not on cards/columns
    const target = e.target as HTMLElement;
    if (target.closest('.kanban-col') || target.closest('.kanban-card-wrap')) return;
    if (e.button !== 0) return;
    isPanning.current = true;
    panStart.current = { x: e.pageX, scrollLeft: boardRef.current?.scrollLeft ?? 0 };
    if (boardRef.current) boardRef.current.style.cursor = 'grabbing';
    e.preventDefault();
  }

  function onBoardMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!isPanning.current || !boardRef.current) return;
    const dx = e.pageX - panStart.current.x;
    boardRef.current.scrollLeft = panStart.current.scrollLeft - dx;
  }

  function onBoardMouseUp() {
    isPanning.current = false;
    if (boardRef.current) boardRef.current.style.cursor = '';
  }

  // DnD handlers
  function onDragStart(event: DragStartEvent) {
    const type = event.active.data.current?.type;
    if (type === 'column') {
      setActiveColumn(columns.find((c) => c.id === event.active.id) ?? null);
    } else {
      setActiveTask(tasks.find((t) => t.id === event.active.id) ?? null);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    setActiveColumn(null);
    if (!over || !activeProduct || readOnly) return;

    const activeType = active.data.current?.type;

    // ── Column reorder ──
    if (activeType === 'column') {
      const fromId = active.id as string;
      const toId = over.id as string;
      if (fromId === toId) return;
      const oldIdx = columns.findIndex((c) => c.id === fromId);
      const newIdx = columns.findIndex((c) => c.id === toId);
      if (oldIdx === -1 || newIdx === -1) return;
      const reordered = arrayMove(columns, oldIdx, newIdx);
      setColumns(reordered); // optimistic
      try {
        await api.columns.reorder(activeProduct.id, reordered.map((c, i) => ({ id: c.id, order: i })));
      } catch {
        await loadColumns(); // rollback
      }
      return;
    }

    // ── Task drag ──
    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const overId = over.id as string;
    const overColumn = columns.find((c) => c.statusKey === overId);
    const overTask = tasks.find((t) => t.id === overId);
    const targetStatusKey = overColumn?.statusKey ?? overTask?.status ?? null;
    if (!targetStatusKey) return;

    const statusChanged = task.status !== targetStatusKey;
    if (statusChanged && !task.ownerId && targetStatusKey === 'todo') {
      showToast('Assign an owner before moving to To Do.');
      return;
    }

    // Build the new ordered list for the target column
    const sorted = (s: string) =>
      tasks.filter((t) => t.status === s && t.id !== taskId).sort((a, b) => a.kanbanOrder - b.kanbanOrder);

    let newColumnTasks: Task[];
    if (overTask && overTask.id !== taskId) {
      // Dropped on a specific task - insert at its position
      const peers = sorted(targetStatusKey);
      const insertAt = peers.findIndex((t) => t.id === overTask.id);
      peers.splice(insertAt === -1 ? peers.length : insertAt, 0, task);
      newColumnTasks = peers;
    } else if (!statusChanged) {
      // Same-column drop on the column droppable - move to end
      const peers = sorted(targetStatusKey);
      peers.push(task);
      newColumnTasks = peers;
    } else {
      // Cross-column drop on the column droppable - append at end
      const peers = sorted(targetStatusKey);
      peers.push(task);
      newColumnTasks = peers;
    }

    try {
      if (statusChanged) {
        await api.tasks.update(activeProduct.id, taskId, { status: targetStatusKey });
      }
      await api.tasks.reorder(
        activeProduct.id,
        newColumnTasks.map((t, i) => ({ taskId: t.id, order: i })),
      );
      await refreshTasks();
    } catch (err) { showToast((err as Error).message); }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskName.trim()) return;
    setCreating(true);
    try { await createTask({ name: newTaskName.trim() }); setNewTaskName(''); setShowNewTask(false); }
    finally { setCreating(false); }
  }

  async function handleQuickAddTask(statusKey: string, name: string) {
    if (!activeProduct) return;
    const task = await api.tasks.create(activeProduct.id, { name, status: statusKey });
    if (sprintFilter) {
      await api.sprints.addTasks(activeProduct.id, sprintFilter, [task.id]);
    }
    await refreshTasks();
    if (sprintFilter) {
      // Refresh sprint list so taskIds is up to date for filtering
      const updated = await api.sprints.list(activeProduct.id);
      setSprints(updated);
    }
  }

  async function handleCreateColumn(e: React.FormEvent) {
    e.preventDefault();
    if (!newColLabel.trim() || !activeProduct) return;
    setCreating(true);
    try {
      await api.columns.create(activeProduct.id, { label: newColLabel.trim() });
      await loadColumns();
      setNewColLabel('');
      setShowNewColumn(false);
    } finally { setCreating(false); }
  }

  async function handleRenameColumn(columnId: string, label: string) {
    if (!activeProduct) return;
    try { await api.columns.update(activeProduct.id, columnId, { label }); await loadColumns(); }
    catch (err) { showToast((err as Error).message); }
  }

  async function handleCompactStatusChange(taskId: string, newStatus: string) {
    if (!activeProduct || readOnly) return;
    setUpdatingStatus(taskId);
    try {
      await api.tasks.update(activeProduct.id, taskId, { status: newStatus });
      await refreshTasks();
    } catch (err) { showToast((err as Error).message); }
    finally { setUpdatingStatus(null); }
  }

  async function handleDeleteColumn() {
    if (!pendingDeleteCol || !activeProduct) return;
    setDeleting(true);
    try {
      await api.columns.delete(activeProduct.id, pendingDeleteCol.id);
      await Promise.all([loadColumns(), refreshTasks()]);
      setPendingDeleteCol(null);
    } catch (err) { showToast((err as Error).message); }
    finally { setDeleting(false); }
  }

  if (!activeProduct) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ color: 'var(--text-3)' }}>
        <div className="text-5xl opacity-30">▦</div>
        <p className="text-sm">Create a product to get started</p>
      </div>
    );
  }

  const pendingTaskCount = pendingDeleteCol
    ? tasks.filter((t) => t.status === pendingDeleteCol.statusKey).length
    : 0;

  const boardBgStyle = bgImage ? {
    backgroundImage: `linear-gradient(rgba(0,0,0,0.38),rgba(0,0,0,0.38)),url(/backgrounds/${bgImage}.jpg)`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  } : {};

  return (
    <div className="h-full flex flex-col" style={boardBgStyle}>
      {/* ── Filters ── */}
      <div className="px-6 pt-4 pb-3 flex-shrink-0 flex items-center gap-3 flex-wrap">
        {/* Task count */}
        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>
          {filteredTasks.length}{hasFilters ? ' filtered' : ''} tasks
        </span>

        <div className="w-px h-4 flex-shrink-0" style={{ background: 'var(--border)' }} />

        {/* Mine toggle */}
        <button
          onClick={() => setMineOnly((v) => !v)}
          className="text-xs flex items-center gap-1 px-2 py-1 rounded-md transition-all flex-shrink-0"
          style={{
            color: mineOnly ? 'var(--brand)' : 'var(--text-3)',
            background: mineOnly ? 'var(--brand-subtle)' : 'transparent',
            border: `1px solid ${mineOnly ? 'var(--brand)' : 'var(--border)'}`,
          }}
          title="Show only my tasks"
        >
          {user?.avatarEmoji ?? '👤'} Mine
        </button>

        {/* Reset */}
        <button
          onClick={() => { setOwnerFilters(new Set()); setColorFilters(new Set()); setSprintFilterAndSave(null); setMineOnly(false); }}
          className="text-xs flex items-center gap-1 px-2 py-1 rounded-md transition-all flex-shrink-0"
          style={{
            color: hasFilters ? 'var(--brand)' : 'var(--text-3)',
            background: hasFilters ? 'var(--brand-subtle)' : 'transparent',
            border: `1px solid ${hasFilters ? 'var(--brand)' : 'var(--border)'}`,
            opacity: hasFilters ? 1 : 0.45,
            cursor: hasFilters ? 'pointer' : 'default',
          }}
        >
          ↺ Reset
        </button>

        {/* Owner filter */}
        {taskOwners.length > 0 && (
          <div className="relative flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>Owner</span>
            <button
              onClick={() => setShowOwnerDropdown((v) => !v)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-all"
              style={{
                background: ownerFilters.size > 0 ? 'var(--brand-subtle)' : 'var(--surface-2)',
                color: ownerFilters.size > 0 ? 'var(--brand)' : 'var(--text-2)',
                border: `1px solid ${ownerFilters.size > 0 ? 'var(--brand)' : 'var(--border)'}`,
              }}
            >
              {ownerFilters.size === 0 ? 'All' : `${ownerFilters.size} selected`}
              <span className="text-[10px] ml-0.5">▾</span>
            </button>
            {showOwnerDropdown && (
              <div
                className="absolute left-0 top-full mt-1 rounded-lg shadow-xl z-40 py-1 overflow-hidden"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 180 }}
                onMouseLeave={() => setShowOwnerDropdown(false)}
              >
                {taskOwners.map((u) => {
                  const active = ownerFilters.has(u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => toggleOwner(u.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors"
                      style={{ background: active ? 'var(--brand-subtle)' : 'transparent', color: active ? 'var(--brand)' : 'var(--text)' }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span>{u.avatarEmoji ?? '👤'}</span>
                      <span className="flex-1 text-left truncate">{u.username}</span>
                      {active && <span style={{ color: 'var(--brand)' }}>✓</span>}
                    </button>
                  );
                })}
                {ownerFilters.size > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    <button onClick={() => { setOwnerFilters(new Set()); setShowOwnerDropdown(false); }} className="w-full text-left px-3 py-1.5 text-xs transition-colors" style={{ color: 'var(--text-3)' }}>
                      Clear owners
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Color dots */}
        {taskColors.length > 0 && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>Color</span>
            <div className="flex items-center gap-2">
              {taskColors.map((c) => {
                const active = colorFilters.has(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggleColor(c)}
                    className="w-4 h-4 rounded-full flex-shrink-0 transition-all"
                    style={{
                      background: c,
                      outline: active ? `2px solid ${c}` : 'none',
                      outlineOffset: active ? '2px' : '0',
                      boxShadow: active ? `0 0 0 1px var(--surface)` : 'none',
                    }}
                    title={colorLegend[c] || c}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Sprint filter */}
        {sprints.length > 0 && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>Sub-plan</span>
            {sprintFilter && (() => { const s = sprints.find((s) => s.id === sprintFilter); return s ? <span style={{ width: 16, height: 16, borderRadius: '50%', background: s.color, display: 'inline-block', flexShrink: 0 }} /> : null; })()}
            <select
              value={sprintFilter ?? ''}
              onChange={(e) => setSprintFilterAndSave(e.target.value === '' ? null : e.target.value)}
              className="text-xs px-2 py-0.5 rounded transition-all"
              style={{
                background: sprintFilter !== null ? 'var(--brand-subtle)' : 'var(--surface-2)',
                color: sprintFilter !== null ? 'var(--brand)' : 'var(--text-2)',
                border: `1px solid ${sprintFilter !== null ? 'var(--brand)' : 'var(--border)'}`,
              }}
            >
              <option value="">All sub-plans</option>
              {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {sprintFilter && (
              <button
                onClick={() => setShowSprintPanel(true)}
                className="text-xs px-2 py-0.5 rounded transition-all flex-shrink-0"
                style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)'; }}
                title="Manage sub-plan tasks"
              >
                Manage
              </button>
            )}
          </div>
        )}

        {toast && (
          <div className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
            {toast}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {/* Background picker */}
          {!compact && (
            <div ref={bgPickerRef} className="relative">
              <button
                onClick={() => setShowBgPicker((v) => !v)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all"
                title="Board background"
                style={{
                  background: bgImage ? 'var(--brand-subtle)' : 'var(--surface-2)',
                  color: bgImage ? 'var(--brand)' : 'var(--text-3)',
                  border: `1px solid ${bgImage ? 'var(--brand)' : 'var(--border)'}`,
                }}
              >
                <span>🖼</span> Background
              </button>
              {showBgPicker && (
                <div
                  className="absolute right-0 top-full mt-1 rounded-xl shadow-2xl overflow-hidden py-1.5 z-50"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 200 }}
                >
                  <button
                    onClick={() => selectBg(null)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors"
                    style={{ background: !bgImage ? 'var(--brand-subtle)' : 'transparent', color: !bgImage ? 'var(--brand)' : 'var(--text-2)' }}
                    onMouseEnter={(e) => { if (bgImage) e.currentTarget.style.background = 'var(--surface-2)'; }}
                    onMouseLeave={(e) => { if (bgImage) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span className="w-8 h-6 rounded flex-shrink-0" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }} />
                    <span>None</span>
                    {!bgImage && <span className="ml-auto" style={{ color: 'var(--brand)' }}>✓</span>}
                  </button>
                  {KANBAN_BACKGROUNDS.map((b) => {
                    const active = bgImage === b.id;
                    return (
                      <button
                        key={b.id}
                        onClick={() => selectBg(b.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors"
                        style={{ background: active ? 'var(--brand-subtle)' : 'transparent', color: active ? 'var(--brand)' : 'var(--text)' }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
                        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span className="w-8 h-6 rounded flex-shrink-0" style={{ background: b.gradient }} />
                        <span>{b.label}</span>
                        {active && <span className="ml-auto" style={{ color: 'var(--brand)' }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {/* Compact toggle */}
          <button
            onClick={() => {
              const next = !compact;
              setCompact(next);
              localStorage.setItem('planly_kanban_compact', next ? '1' : '0');
            }}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all"
            title={compact ? 'Switch to board view' : 'Switch to compact list view'}
            style={{
              background: compact ? 'var(--brand-subtle)' : 'var(--surface-2)',
              color: compact ? 'var(--brand)' : 'var(--text-3)',
              border: `1px solid ${compact ? 'var(--brand)' : 'var(--border)'}`,
            }}
          >
            {compact ? '▦ Board' : '☰ Compact'}
          </button>
        </div>
      </div>

      {/* ── Compact list view ── */}
      {compact && (() => {
        const colOrder = Object.fromEntries(columns.map((c, i) => [c.statusKey, i]));
        const sorted = [...filteredTasks].sort((a, b) => {
          const { key, dir } = compactSort;
          if (key === 'status') {
            const diff = (colOrder[a.status] ?? 99) - (colOrder[b.status] ?? 99);
            return diff * dir;
          }
          if (key === 'name') return a.name.localeCompare(b.name) * dir;
          if (key === 'owner') {
            const an = users.find((u) => u.id === a.ownerId)?.username ?? '';
            const bn = users.find((u) => u.id === b.ownerId)?.username ?? '';
            return an.localeCompare(bn) * dir;
          }
          if (key === 'deadline') {
            if (!a.deadline && !b.deadline) return 0;
            if (!a.deadline) return 1;
            if (!b.deadline) return -1;
            return (new Date(a.deadline).getTime() - new Date(b.deadline).getTime()) * dir;
          }
          return 0;
        });

        function SortHeader({ k, label }: { k: typeof compactSort['key']; label: string }) {
          const active = compactSort.key === k;
          return (
            <button
              onClick={() => setCompactSort((prev) => prev.key === k ? { key: k, dir: (prev.dir * -1) as 1 | -1 } : { key: k, dir: 1 })}
              className="flex items-center gap-1 text-left"
              style={{ color: active ? 'var(--brand)' : 'var(--text-3)', fontWeight: active ? 600 : 400 }}
            >
              {label}
              <span className="text-[10px]">{active ? (compactSort.dir === 1 ? '▲' : '▼') : '⇅'}</span>
            </button>
          );
        }

        return (
          <div className="flex-1 overflow-auto px-6 pb-6">
            <table className="w-full text-sm border-separate" style={{ borderSpacing: '0 2px' }}>
              <thead>
                <tr className="text-xs" style={{ color: 'var(--text-3)' }}>
                  <th className="text-left px-3 py-2 w-36"><SortHeader k="status" label="Status" /></th>
                  <th className="text-left px-3 py-2"><SortHeader k="name" label="Task" /></th>
                  <th className="text-left px-3 py-2 w-32"><SortHeader k="owner" label="Owner" /></th>
                  <th className="text-left px-3 py-2 w-28"><SortHeader k="deadline" label="Deadline" /></th>
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((task) => {
                  const col = columns.find((c) => c.statusKey === task.status);
                  const owner = users.find((u) => u.id === task.ownerId);
                  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && !col?.isDone;
                  return (
                    <tr
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className="group cursor-pointer rounded-xl"
                      style={{ background: 'var(--surface)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                    >
                      {/* Status */}
                      <td className="px-3 py-2 rounded-l-xl" onClick={(e) => e.stopPropagation()}>
                        {readOnly ? (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ background: `${col?.color ?? '#64748b'}20`, color: col?.color ?? '#64748b' }}
                          >
                            {col?.label ?? task.status}
                          </span>
                        ) : (
                          <select
                            value={task.status}
                            onChange={(e) => handleCompactStatusChange(task.id, e.target.value)}
                            disabled={updatingStatus === task.id}
                            className="text-xs px-2 py-0.5 rounded-full font-medium border-0 outline-none cursor-pointer"
                            style={{
                              background: `${col?.color ?? '#64748b'}20`,
                              color: col?.color ?? '#64748b',
                              opacity: updatingStatus === task.id ? 0.6 : 1,
                            }}
                          >
                            {columns.map((c) => (
                              <option key={c.statusKey} value={c.statusKey}>{c.label}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      {/* Name */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {task.color && (
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: task.color }} />
                          )}
                          <span
                            className="font-medium truncate max-w-xs"
                            style={{
                              color: 'var(--text)',
                              textDecoration: col?.isDone ? 'line-through' : 'none',
                              opacity: col?.isDone ? 0.6 : 1,
                            }}
                          >{task.name}</span>
                          {(task.subtasks?.length ?? 0) > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                              {task.subtasks!.filter((s) => s.completed).length}/{task.subtasks!.length}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Owner */}
                      <td className="px-3 py-2">
                        {owner ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{owner.avatarEmoji ?? '👤'}</span>
                            <span className="text-xs truncate" style={{ color: 'var(--text-2)' }}>{owner.username}</span>
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--text-3)', opacity: 0.5 }}>-</span>
                        )}
                      </td>
                      {/* Deadline */}
                      <td className="px-3 py-2">
                        {task.deadline ? (
                          <span className="text-xs" style={{ color: isOverdue ? '#ef4444' : 'var(--text-3)' }}>
                            {isOverdue && '⚠ '}
                            {new Date(task.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--text-3)', opacity: 0.5 }}>-</span>
                        )}
                      </td>
                      {/* Arrow */}
                      <td className="px-2 py-2 rounded-r-xl">
                        <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-3)' }}>›</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sorted.length === 0 && (
              <div className="text-center py-16 text-sm" style={{ color: 'var(--text-3)' }}>No tasks match the current filters</div>
            )}
          </div>
        );
      })()}

      {/* ── Board ── */}
      {!compact && <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
          <div
            ref={boardRef}
            className="flex-1 overflow-x-auto overflow-y-auto select-none"
            style={{ cursor: 'default' }}
            onMouseDown={onBoardMouseDown}
            onMouseMove={onBoardMouseMove}
            onMouseUp={onBoardMouseUp}
            onMouseLeave={onBoardMouseUp}
          >
            <div className="flex gap-4 p-6 min-w-max items-start">
              {columns.map((col) => (
                <div key={col.id} className="kanban-col">
                  <KanbanColumn
                    column={col}
                    tasks={filteredTasks.filter((t) => t.status === col.statusKey).sort((a, b) => a.kanbanOrder - b.kanbanOrder)}
                    onOpenDetail={setSelectedTask}
                    onRename={handleRenameColumn}
                    onDeleteRequest={setPendingDeleteCol}
                    onAddTask={readOnly ? undefined : (name) => handleQuickAddTask(col.statusKey, name)}
                  />
                </div>
              ))}

              {/* Add column - hidden for read-only users */}
              {!readOnly && (
                <button
                  onClick={() => setShowNewColumn(true)}
                  className="w-72 flex-shrink-0 flex items-center gap-2 px-3 rounded-xl border-2 border-dashed transition-all text-sm"
                  style={{ height: 44, borderColor: 'var(--border)', color: 'var(--text-3)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-3)'; }}
                >
                  <span className="text-base leading-none">+</span>
                  <span>Add column</span>
                </button>
              )}
            </div>
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div style={{ transform: 'rotate(2deg)', width: 288 }}>
              <KanbanCard task={activeTask} onOpenDetail={() => {}} isOverlay />
            </div>
          ) : activeColumn ? (
            <div style={{ opacity: 0.9, width: 288 }}>
              <KanbanColumn
                column={activeColumn}
                tasks={tasks.filter((t) => t.status === activeColumn.statusKey)}
                onOpenDetail={() => {}}
                onRename={() => {}}
                onDeleteRequest={() => {}}
                isOverlay
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>}

      {/* Detail panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          columns={columns}
          readOnly={readOnly}
          onClose={() => setSelectedTask(null)}
          onUpdated={async (updated) => { setSelectedTask(updated); await refreshTasks(); }}
          onDeleted={async () => { setSelectedTask(null); await refreshTasks(); }}
        />
      )}

      {/* New task modal */}
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

      {/* New column modal */}
      {showNewColumn && (
        <Modal title="Add column" onClose={() => setShowNewColumn(false)} width="max-w-sm">
          <form onSubmit={handleCreateColumn} className="space-y-4">
            <div>
              <label className="label">Column name</label>
              <input autoFocus required type="text" value={newColLabel} onChange={(e) => setNewColLabel(e.target.value)} className="input" placeholder="e.g. Review, Testing…" />
            </div>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>Added before the completion column. Tasks can be dragged into it.</p>
            <div className="flex gap-3">
              <button type="submit" disabled={creating} className="btn-primary flex-1 flex justify-center">
                {creating ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Add column'}
              </button>
              <button type="button" onClick={() => setShowNewColumn(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete column confirmation modal */}
      {showSprintPanel && sprintFilter && activeProduct && (() => {
        const s = sprints.find((sp) => sp.id === sprintFilter);
        return s ? (
          <SprintBacklogPanel
            sprint={s}
            productId={activeProduct.id}
            tasks={tasks}
            onClose={() => setShowSprintPanel(false)}
            onUpdated={(updated) => {
              setSprints((prev) => prev.map((sp) => sp.id === updated.id ? updated : sp));
              refreshTasks();
            }}
          />
        ) : null;
      })()}

      {pendingDeleteCol && (
        <Modal title="Delete column" onClose={() => setPendingDeleteCol(null)} width="max-w-sm">
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <span className="text-lg">⚠️</span>
              <p className="text-sm" style={{ color: 'var(--text)' }}>
                Delete <strong>"{pendingDeleteCol.label}"</strong>?
                {pendingTaskCount > 0
                  ? ` ${pendingTaskCount} task${pendingTaskCount !== 1 ? 's' : ''} will be moved to To Do.`
                  : ' The column is empty.'}
              </p>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteColumn}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg text-sm font-medium flex justify-center transition-colors"
                style={{ background: '#ef4444', color: 'white' }}
              >
                {deleting ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Delete column'}
              </button>
              <button type="button" onClick={() => setPendingDeleteCol(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
