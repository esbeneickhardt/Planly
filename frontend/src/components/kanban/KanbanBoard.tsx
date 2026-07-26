/**
 * Main Kanban board: renders columns from the API, wires up dnd-kit drag for both tasks and column reorder.
 * Sprint filter auto-selects the currently active sprint on product change and persists the selection to localStorage per product.
 * Board background image, compact list view, and all filter states are kept local (not in global context).
 */
import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import type { Task, KanbanColumn as KanbanColumnType } from '../../types';
import { api } from '../../api/client';
import { useProduct } from '../../context/ProductContext';
import { usePermission } from '../../context/PermissionContext';
import { useAuth } from '../../context/AuthContext';
import { useColorLegend, PRESET_COLORS } from '../../hooks/useColorLegend';
import { useProductMembers } from '../../hooks/useProductMembers';
import { useSprints } from '../../hooks/useSprints';
import { computePrimaryMilestones, assignMilestoneColors } from '../../utils/milestones';
import { KANBAN_BACKGROUNDS } from '../../constants/kanbanBackgrounds';
import KanbanColumn, { UNASSIGNED_CLUSTER } from './KanbanColumn';
import KanbanCard from './KanbanCard';
import KanbanMobileList from './KanbanMobileList';
import KanbanFiltersBar from './KanbanFiltersBar';
import KanbanCompactList from './KanbanCompactList';
import type { MilestoneOption } from './KanbanMilestoneFilter';
import TaskDetailPanel from '../common/TaskDetailPanel';
import Modal from '../common/Modal';

const FILTER_COLORS = PRESET_COLORS;

export default function KanbanBoard() {
  const { activeProduct, tasks, tasksLoaded, refreshTasks, createTask, patchMilestoneOrder } = useProduct();
  const { canWrite } = usePermission();
  const { user } = useAuth();
  const readOnly = !canWrite('kanban');
  const [searchParams, setSearchParams] = useSearchParams();

  // State: columns, dnd active items, modals, task/column forms
  const [columns, setColumns] = useState<KanbanColumnType[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeColumn, setActiveColumn] = useState<KanbanColumnType | null>(null);
  const [activeMilestoneHeader, setActiveMilestoneHeader] = useState<MilestoneOption | null>(null);
  const [toast, setToast] = useState('');
  const [showNewTask, setShowNewTask] = useState(false);
  const [showNewColumn, setShowNewColumn] = useState(false);
  const [pendingDeleteCol, setPendingDeleteCol] = useState<KanbanColumnType | null>(null);
  const [newTaskName, setNewTaskName] = useState('');
  const [newColLabel, setNewColLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Filter state: multi-select owner/color, sprint, mine-only
  const [ownerFilters, setOwnerFilters] = useState<Set<string>>(new Set());
  const [colorFilters, setColorFilters] = useState<Set<string>>(new Set());
  const [sprintFilter, setSprintFilter] = useState<string | null>(null);
  const [milestoneFilter, setMilestoneFilter] = useState<string | null>(null);
  // Group cards into collapsible per-milestone sections within each column, instead of filtering
  // down to one milestone at a time - persisted per product like the other board display toggles.
  const [groupByMilestone, setGroupByMilestone] = useState(
    () => localStorage.getItem('planly_kanban_group_by_milestone') === '1',
  );
  const [collapsedMilestones, setCollapsedMilestones] = useState<Set<string>>(new Set());
  const [mineOnly, setMineOnly] = useState(false);
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
  const lastInitializedProductId = useRef<string | null>(null);
  const users = useProductMembers(activeProduct?.teamId);
  const { sprints, refresh: refreshSprints } = useSprints(activeProduct?.id);
  const [compact, setCompact] = useState(() => localStorage.getItem('planly_kanban_compact') === '1');
  // Dense card display: title only, no owner/reviewer/milestone/subtasks (board view only)
  const [simpleMode, setSimpleMode] = useState(() => localStorage.getItem('planly_kanban_simple') === '1');
  const [compactSort, setCompactSort] = useState<{ key: 'name' | 'status' | 'owner' | 'deadline'; dir: 1 | -1 }>(() => {
    try {
      const s = localStorage.getItem('planly_kanban_sort');
      return s ? JSON.parse(s) : { key: 'status', dir: 1 };
    } catch {
      return { key: 'status', dir: 1 };
    }
  });
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const bgPickerRef = useRef<HTMLDivElement>(null);

  const { legend: colorLegend } = useColorLegend(activeProduct?.id ?? '');

  useLayoutEffect(() => {
    if (!activeProduct) {
      setBgImage(null);
      return;
    }
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

  function setMilestoneFilterAndSave(val: string | null) {
    setMilestoneFilter(val);
    if (activeProduct) {
      if (val !== null) localStorage.setItem(`planly_kanban_milestone_${activeProduct.id}`, val);
      else localStorage.removeItem(`planly_kanban_milestone_${activeProduct.id}`);
    }
  }

  // Restore the milestone filter per product (no auto-select - unlike sprint, there's no "current" milestone)
  useEffect(() => {
    if (!activeProduct) return;
    setMilestoneFilter(localStorage.getItem(`planly_kanban_milestone_${activeProduct.id}`));
  }, [activeProduct?.id]);

  function toggleGroupByMilestone() {
    const next = !groupByMilestone;
    setGroupByMilestone(next);
    localStorage.setItem('planly_kanban_group_by_milestone', next ? '1' : '0');
    // Grouping already shows every milestone at once - clear the single-milestone filter so it
    // doesn't linger, hidden, and cause confusion if the user switches back to filter mode.
    if (next) setMilestoneFilterAndSave(null);
  }

  function persistCollapsedMilestones(next: Set<string>) {
    if (!activeProduct) return;
    try {
      localStorage.setItem(`planly-kanban-collapsedMilestones-${activeProduct.id}`, JSON.stringify(Array.from(next)));
    } catch {}
  }

  function toggleMilestoneCollapsed(id: string) {
    setCollapsedMilestones((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistCollapsedMilestones(next);
      return next;
    });
  }

  // Persists a full reordering by assigning sequential milestoneOrder values and syncing to the
  // backend, so Gantt and Kanban share one order regardless of which page the drag happened on.
  function saveMilestoneOrder(ids: string[]) {
    const updates = ids.map((id, i) => ({ taskId: id, order: i }));
    patchMilestoneOrder(updates);
    if (!activeProduct) return;
    api.tasks.reorderMilestones(activeProduct.id, updates).catch(() => {});
  }

  // Board pan: pointer drag on empty board area scrolls horizontally
  const boardRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, scrollLeft: 0 });

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  useEffect(() => {
    if (!activeProduct) return;
    lastInitializedProductId.current = null;
    refreshSprints().then((ss) => {
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
      lastInitializedProductId.current = activeProduct.id;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSprints]);

  const loadColumns = useCallback(async () => {
    if (!activeProduct) return;
    const cols = await api.columns.list(activeProduct.id);
    if (!Array.isArray(cols)) return;
    setColumns(cols);
  }, [activeProduct]);

  useEffect(() => {
    loadColumns();
  }, [loadColumns]);

  // Deep-link support for "jump to this task" from elsewhere in the app (e.g. a notification click)
  // via /kanban?openTask=<id>. Waits for tasks to finish loading (they may belong to a project just
  // switched into) before looking the task up, then clears the param so it doesn't re-trigger.
  useEffect(() => {
    const openTaskId = searchParams.get('openTask');
    if (!openTaskId || !tasksLoaded) return;
    const task = tasks.find((t) => t.id === openTaskId);
    if (task) setSelectedTask(task);
    const next = new URLSearchParams(searchParams);
    next.delete('openTask');
    setSearchParams(next, { replace: true });
  }, [searchParams, tasks, tasksLoaded, setSearchParams]);

  const taskOwners = useMemo(() => {
    const ids = new Set(tasks.filter((t) => t.ownerId).map((t) => t.ownerId!));
    return users.filter((u) => ids.has(u.id));
  }, [tasks, users]);

  const taskColors = useMemo(() => {
    const used = new Set(tasks.filter((t) => t.color).map((t) => t.color!));
    return FILTER_COLORS.filter((c) => used.has(c));
  }, [tasks]);

  const visibleStatusKeys = useMemo(() => new Set(columns.map((c) => c.statusKey)), [columns]);
  const doneStatusKeys = useMemo(() => new Set(columns.filter((c) => c.isDone).map((c) => c.statusKey)), [columns]);

  // For each non-milestone task, which milestone it feeds into, and a stable distinct color per
  // milestone - both used for the milestone filter dropdown and the per-card milestone indicator.
  const primaryMilestones = useMemo(() => computePrimaryMilestones(tasks), [tasks]);
  const milestoneColors = useMemo(() => assignMilestoneColors(tasks), [tasks]);
  // Completed milestones are sorted after active ones, so Prev/Next and the dropdown both surface
  // active milestones first - "done" ones are still reachable, just de-prioritized.
  const milestoneOptions: MilestoneOption[] = useMemo(() => {
    const countByMilestoneId = new Map<string, number>();
    for (const t of tasks) {
      if (t.deadline) continue;
      const m = primaryMilestones.get(t.id);
      if (m) countByMilestoneId.set(m.id, (countByMilestoneId.get(m.id) ?? 0) + 1);
    }
    return tasks
      .filter((t) => !!t.deadline)
      .map((m) => ({
        id: m.id,
        name: m.name,
        color: milestoneColors.get(m.id) ?? '#64748b',
        count: countByMilestoneId.get(m.id) ?? 0,
        done: doneStatusKeys.has(m.status),
      }))
      .sort((a, b) => (a.done !== b.done ? (a.done ? 1 : -1) : a.name.localeCompare(b.name)));
  }, [tasks, primaryMilestones, milestoneColors, doneStatusKeys]);

  const milestoneMeta = useMemo(() => new Map(milestoneOptions.map((m) => [m.id, m])), [milestoneOptions]);

  // Sorted by the shared, backend-persisted milestoneOrder (set by dragging in either Gantt or
  // Kanban). Milestones that have never been dragged all share the default 0, so the stable sort
  // falls through to milestoneOptions' own done-last/alphabetical fallback order.
  const orderedMilestoneIds = useMemo(() => {
    const orderById = new Map(tasks.filter((t) => t.deadline).map((t) => [t.id, t.milestoneOrder]));
    return [...milestoneOptions]
      .sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0))
      .map((m) => m.id);
  }, [milestoneOptions, tasks]);
  // Same order as orderedMilestoneIds, but as full MilestoneOption objects for the filter dropdown
  const orderedMilestoneOptions = useMemo(
    () => orderedMilestoneIds.map((id) => milestoneMeta.get(id)).filter((m): m is MilestoneOption => !!m),
    [orderedMilestoneIds, milestoneMeta],
  );

  // Restore the saved per-milestone collapse state whenever grouping is turned on or the product
  // changes, so it survives a reload (e.g. mobile pull-to-refresh) instead of resetting. Only when
  // nothing has been saved yet for this product (first time grouping this board) does it fall back
  // to collapsing everything - browsing a fresh grouped board fully expanded is just noise.
  //
  // Computing that "collapse everything" default has to wait for `tasksLoaded`: tasks (and so
  // `milestoneOptions`, derived from them) load asynchronously, and this effect's first run after
  // a fresh page load can land before they arrive. Computing the default too early would seed
  // (and - worse - PERSIST) a set containing only UNASSIGNED_CLUSTER, since milestoneOptions was
  // still empty - permanently "poisoning" localStorage into showing everything expanded on every
  // future load, since a saved entry (even a wrong one) always wins over recomputing.
  useEffect(() => {
    if (!groupByMilestone || !activeProduct) return;
    try {
      const saved = localStorage.getItem(`planly-kanban-collapsedMilestones-${activeProduct.id}`);
      if (saved) {
        setCollapsedMilestones(new Set(JSON.parse(saved) as string[]));
        return;
      }
    } catch {}
    if (!tasksLoaded) return;
    const next = new Set([...milestoneOptions.map((m) => m.id), UNASSIGNED_CLUSTER]);
    setCollapsedMilestones(next);
    persistCollapsedMilestones(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupByMilestone, activeProduct?.id, tasksLoaded]);

  const hasFilters =
    ownerFilters.size > 0 || colorFilters.size > 0 || sprintFilter !== null || milestoneFilter !== null || mineOnly;

  const filteredTasks = useMemo(() => {
    const sprintTaskIds = sprintFilter ? new Set(sprints.find((s) => s.id === sprintFilter)?.taskIds ?? []) : null;
    return tasks.filter((t) => {
      if (!visibleStatusKeys.has(t.status)) return false;
      if (mineOnly && t.ownerId !== user?.id) return false;
      if (ownerFilters.size > 0 && (!t.ownerId || !ownerFilters.has(t.ownerId))) return false;
      if (colorFilters.size > 0 && (!t.color || !colorFilters.has(t.color))) return false;
      if (sprintFilter && !sprintTaskIds?.has(t.id)) return false;
      if (milestoneFilter && t.id !== milestoneFilter && primaryMilestones.get(t.id)?.id !== milestoneFilter)
        return false;
      return true;
    });
  }, [
    tasks,
    visibleStatusKeys,
    mineOnly,
    ownerFilters,
    colorFilters,
    sprintFilter,
    sprints,
    user?.id,
    milestoneFilter,
    primaryMilestones,
  ]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

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
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleColor(c: string) {
    setColorFilters((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
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

  // DnD handlers: `pointerWithin` collision detects both column drops and task-on-task drops
  function onDragStart(event: DragStartEvent) {
    const type = event.active.data.current?.type;
    if (type === 'column') {
      setActiveColumn(columns.find((c) => c.id === event.active.id) ?? null);
    } else if (type === 'milestone-header') {
      const milestoneId = event.active.data.current?.milestoneId as string;
      setActiveMilestoneHeader(milestoneMeta.get(milestoneId) ?? null);
    } else {
      setActiveTask(tasks.find((t) => t.id === event.active.id) ?? null);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    setActiveColumn(null);
    setActiveMilestoneHeader(null);
    if (!over || !activeProduct) return;

    const activeType = active.data.current?.type;

    // ── Milestone header reorder (shared across all columns; a display preference, so it isn't
    // gated behind write permission the way task/column mutations below are) ──
    if (activeType === 'milestone-header') {
      const activeMilestoneId = active.data.current?.milestoneId as string;
      const overMilestoneId = over.data.current?.milestoneId as string | undefined;
      if (!overMilestoneId || activeMilestoneId === overMilestoneId) return;
      const oldIdx = orderedMilestoneIds.indexOf(activeMilestoneId);
      const newIdx = orderedMilestoneIds.indexOf(overMilestoneId);
      if (oldIdx === -1 || newIdx === -1) return;
      saveMilestoneOrder(arrayMove(orderedMilestoneIds, oldIdx, newIdx));
      return;
    }

    if (readOnly) return;

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
        await api.columns.reorder(
          activeProduct.id,
          reordered.map((c, i) => ({ id: c.id, order: i })),
        );
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
      // Dropped on a specific task
      const peers = sorted(targetStatusKey);
      const insertAt = peers.findIndex((t) => t.id === overTask.id);
      if (!statusChanged) {
        // Same-column reorder: insert AFTER the target when moving down, BEFORE when moving up.
        // Without this, dragging the top card onto a lower card inserts it before the target —
        // which produces no visible change when there are only two tasks (e.g. [A,B] → [A,B]).
        const col = tasks.filter((t) => t.status === task.status).sort((a, b) => a.kanbanOrder - b.kanbanOrder);
        const movingDown = col.findIndex((t) => t.id === taskId) < col.findIndex((t) => t.id === overTask.id);
        peers.splice(movingDown ? insertAt + 1 : insertAt, 0, task);
      } else {
        // Cross-column: insert at the target's position (before it)
        peers.splice(insertAt === -1 ? peers.length : insertAt, 0, task);
      }
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
    } catch (err) {
      showToast((err as Error).message);
    }
  }

  // Mobile "+ New task" FAB: unlike the desktop name-only quick-add, this creates a stub task
  // immediately and opens it straight in the full TaskDetailPanel (fullscreen on mobile) so status,
  // owner, etc. can all be set right away instead of needing a second trip back into the task.
  async function handleMobileAddTask() {
    if (!activeProduct) return;
    try {
      const statusKey = columns[0]?.statusKey;
      const task = await api.tasks.create(activeProduct.id, {
        name: 'New task',
        ...(statusKey ? { status: statusKey } : {}),
      });
      await refreshTasks();
      setSelectedTask(task);
    } catch (err) {
      showToast((err as Error).message);
    }
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

  async function handleQuickAddTask(statusKey: string, name: string) {
    if (!activeProduct) return;
    const task = await api.tasks.create(activeProduct.id, { name, status: statusKey });
    if (sprintFilter) {
      await api.sprints.addTasks(activeProduct.id, sprintFilter, [task.id]);
    }
    await refreshTasks();
    if (sprintFilter) {
      // Refresh sprint list so taskIds is up to date for filtering
      await refreshSprints();
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
    } finally {
      setCreating(false);
    }
  }

  async function handleRenameColumn(columnId: string, label: string) {
    if (!activeProduct) return;
    try {
      await api.columns.update(activeProduct.id, columnId, { label });
      await loadColumns();
    } catch (err) {
      showToast((err as Error).message);
    }
  }

  async function handleCompactStatusChange(taskId: string, newStatus: string) {
    if (!activeProduct || readOnly) return;
    setUpdatingStatus(taskId);
    try {
      await api.tasks.update(activeProduct.id, taskId, { status: newStatus });
      await refreshTasks();
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setUpdatingStatus(null);
    }
  }

  async function handleDeleteColumn() {
    if (!pendingDeleteCol || !activeProduct) return;
    setDeleting(true);
    try {
      await api.columns.delete(activeProduct.id, pendingDeleteCol.id);
      await Promise.all([loadColumns(), refreshTasks()]);
      setPendingDeleteCol(null);
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  if (!activeProduct) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ color: 'var(--text-3)' }}>
        <div className="text-5xl opacity-30">▦</div>
        <p className="text-sm">Create a product to get started</p>
      </div>
    );
  }

  const pendingTaskCount = pendingDeleteCol ? tasks.filter((t) => t.status === pendingDeleteCol.statusKey).length : 0;

  const boardBgStyle = bgImage
    ? {
        backgroundImage: `linear-gradient(rgba(0,0,0,0.38),rgba(0,0,0,0.38)),url(/backgrounds/${bgImage}.jpg)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    : {};

  return (
    <div className="h-full flex flex-col" style={boardBgStyle}>
      {/* ── Filters ── */}
      <KanbanFiltersBar
        taskCount={filteredTasks.length}
        hasFilters={hasFilters}
        user={user}
        mineOnly={mineOnly}
        onMineToggle={() => setMineOnly((v) => !v)}
        taskOwners={taskOwners}
        ownerFilters={ownerFilters}
        showOwnerDropdown={showOwnerDropdown}
        onToggleOwnerDropdown={() => setShowOwnerDropdown((v) => !v)}
        onToggleOwner={toggleOwner}
        onClearOwners={() => {
          setOwnerFilters(new Set());
          setShowOwnerDropdown(false);
        }}
        taskColors={taskColors}
        colorFilters={colorFilters}
        colorLegend={colorLegend}
        onToggleColor={toggleColor}
        sprints={sprints}
        sprintFilter={sprintFilter}
        onSprintChange={setSprintFilterAndSave}
        milestones={orderedMilestoneOptions}
        milestoneFilter={milestoneFilter}
        onMilestoneChange={setMilestoneFilterAndSave}
        groupByMilestone={groupByMilestone}
        onToggleGroupByMilestone={toggleGroupByMilestone}
        toast={toast}
        compact={compact}
        onToggleCompact={() => {
          const next = !compact;
          setCompact(next);
          localStorage.setItem('planly_kanban_compact', next ? '1' : '0');
        }}
        simpleMode={simpleMode}
        onToggleSimpleMode={() => {
          const next = !simpleMode;
          setSimpleMode(next);
          localStorage.setItem('planly_kanban_simple', next ? '1' : '0');
        }}
        bgImage={bgImage}
        showBgPicker={showBgPicker}
        bgPickerRef={bgPickerRef}
        onToggleBgPicker={() => setShowBgPicker((v) => !v)}
        onSelectBg={selectBg}
        onReset={() => {
          setOwnerFilters(new Set());
          setColorFilters(new Set());
          setSprintFilterAndSave(null);
          setMilestoneFilterAndSave(null);
          setMineOnly(false);
        }}
      />

      {/* Mobile scrollable task list - hidden on md+ where the full board renders */}
      <KanbanMobileList
        columns={columns}
        tasks={filteredTasks}
        users={users}
        onOpenDetail={setSelectedTask}
        onAddTask={handleMobileAddTask}
        readOnly={readOnly}
        groupByMilestone={groupByMilestone}
        primaryMilestones={primaryMilestones}
        milestoneColors={milestoneColors}
        milestoneOrderIds={orderedMilestoneIds}
        collapsedMilestones={collapsedMilestones}
        onToggleMilestoneCollapse={toggleMilestoneCollapsed}
      />

      {/* Desktop board area - hidden on small screens to give way to KanbanMobileList */}
      <div className="hidden md:flex flex-col flex-1 overflow-hidden">
        {/* ── Compact list view ── */}
        {compact && (
          <KanbanCompactList
            tasks={filteredTasks}
            columns={columns}
            users={users}
            sortKey={compactSort.key}
            sortDir={compactSort.dir}
            onSortChange={(key) =>
              setCompactSort((prev) => {
                const next = prev.key === key ? { key, dir: (prev.dir * -1) as 1 | -1 } : { key, dir: 1 as const };
                try {
                  localStorage.setItem('planly_kanban_sort', JSON.stringify(next));
                } catch {}
                return next;
              })
            }
            readOnly={readOnly}
            updatingStatus={updatingStatus}
            onStatusChange={handleCompactStatusChange}
            onOpenDetail={setSelectedTask}
          />
        )}

        {/* ── Board ── */}
        {!compact && (
          <DndContext
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
                <div className="flex gap-4 px-6 pt-2 pb-6 min-w-max items-start">
                  {columns.map((col) => (
                    <div key={col.id} className="kanban-col">
                      <KanbanColumn
                        column={col}
                        tasks={filteredTasks
                          .filter((t) => t.status === col.statusKey)
                          .sort((a, b) => a.kanbanOrder - b.kanbanOrder)}
                        onOpenDetail={setSelectedTask}
                        onRename={handleRenameColumn}
                        onDeleteRequest={setPendingDeleteCol}
                        onAddTask={readOnly ? undefined : (name) => handleQuickAddTask(col.statusKey, name)}
                        primaryMilestones={primaryMilestones}
                        milestoneColors={milestoneColors}
                        simpleMode={simpleMode}
                        groupByMilestone={groupByMilestone}
                        milestoneOrderIds={orderedMilestoneIds}
                        milestoneMeta={milestoneMeta}
                        collapsedMilestones={collapsedMilestones}
                        onToggleMilestoneCollapse={toggleMilestoneCollapsed}
                      />
                    </div>
                  ))}

                  {/* Add column - hidden for read-only users */}
                  {!readOnly && (
                    <button
                      onClick={() => setShowNewColumn(true)}
                      className="w-72 flex-shrink-0 flex items-center gap-2 px-3 rounded-xl border-2 border-dashed transition-all text-sm border-[var(--border)] text-[var(--text-3)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
                      style={{ height: 44 }}
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
                  <KanbanCard
                    task={activeTask}
                    onOpenDetail={() => {}}
                    isOverlay
                    primaryMilestone={primaryMilestones.get(activeTask.id)}
                    milestoneColor={
                      activeTask.deadline
                        ? milestoneColors.get(activeTask.id)
                        : primaryMilestones.get(activeTask.id)
                          ? milestoneColors.get(primaryMilestones.get(activeTask.id)!.id)
                          : undefined
                    }
                  />
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
              ) : activeMilestoneHeader ? (
                <div
                  className="text-[11px] font-semibold px-2 py-1 rounded flex items-center gap-1.5"
                  style={{
                    width: 260,
                    background: `${activeMilestoneHeader.color}22`,
                    color: activeMilestoneHeader.color,
                    border: `1px solid ${activeMilestoneHeader.color}`,
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: activeMilestoneHeader.color }} />
                  {activeMilestoneHeader.name}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
      {/* end desktop board area */}

      {/* Detail panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          columns={columns}
          readOnly={readOnly}
          onClose={() => setSelectedTask(null)}
          onUpdated={async (updated) => {
            setSelectedTask(updated);
            await refreshTasks();
          }}
          onDeleted={async () => {
            setSelectedTask(null);
            await refreshTasks();
          }}
        />
      )}

      {/* New task modal */}
      {showNewTask && (
        <Modal title="New task" onClose={() => setShowNewTask(false)} width="max-w-sm">
          <form onSubmit={handleCreateTask} className="space-y-4">
            <div>
              <label className="label">Task name</label>
              <input
                autoFocus
                required
                type="text"
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                className="input"
                placeholder="What needs to be done?"
              />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={creating} className="btn-primary flex-1 flex justify-center">
                {creating ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  'Create task'
                )}
              </button>
              <button type="button" onClick={() => setShowNewTask(false)} className="btn-secondary">
                Cancel
              </button>
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
              <input
                autoFocus
                required
                type="text"
                value={newColLabel}
                onChange={(e) => setNewColLabel(e.target.value)}
                className="input"
                placeholder="e.g. Review, Testing…"
              />
            </div>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Added before the completion column. Tasks can be dragged into it.
            </p>
            <div className="flex gap-3">
              <button type="submit" disabled={creating} className="btn-primary flex-1 flex justify-center">
                {creating ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  'Add column'
                )}
              </button>
              <button type="button" onClick={() => setShowNewColumn(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete column confirmation modal */}

      {pendingDeleteCol && (
        <Modal title="Delete column" onClose={() => setPendingDeleteCol(null)} width="max-w-sm">
          <div className="space-y-4">
            <div
              className="flex items-center gap-3 p-3 rounded-lg"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <span className="text-lg">⚠️</span>
              <p className="text-sm" style={{ color: 'var(--text)' }}>
                Delete <strong>"{pendingDeleteCol.label}"</strong>?
                {pendingTaskCount > 0
                  ? ` ${pendingTaskCount} task${pendingTaskCount !== 1 ? 's' : ''} will be moved to To Do.`
                  : ' The column is empty.'}
              </p>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteColumn}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg text-sm font-medium flex justify-center transition-colors"
                style={{ background: '#ef4444', color: 'white' }}
              >
                {deleting ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  'Delete column'
                )}
              </button>
              <button type="button" onClick={() => setPendingDeleteCol(null)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
