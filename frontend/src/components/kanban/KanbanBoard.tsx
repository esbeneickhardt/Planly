/**
 * Main Kanban board: renders columns from the API, wires up dnd-kit drag for both tasks and column reorder.
 * Sprint filter auto-selects the currently active sprint on product change and persists the selection to localStorage per product.
 * Board background image, compact list view, and all filter states are kept local (not in global context).
 */
import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DndContext, DragOverlay, pointerWithin, MeasuringStrategy } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import type { Task, KanbanColumn as KanbanColumnType } from '../../types';
import { api } from '../../api/client';
import { useProduct } from '../../context/ProductContext';
import { usePermission } from '../../context/PermissionContext';
import { useAuth } from '../../context/AuthContext';
import { useColorLegend, PRESET_COLORS } from '../../hooks/useColorLegend';
import { useProductMembers } from '../../hooks/useProductMembers';
import { useSprints } from '../../hooks/useSprints';
import { useKanbanDnd } from '../../hooks/useKanbanDnd';
import { computePrimaryMilestones, assignMilestoneColors } from '../../utils/milestones';
import { KANBAN_BACKGROUNDS } from '../../constants/kanbanBackgrounds';
import KanbanColumn, { UNASSIGNED_CLUSTER } from './KanbanColumn';
import EmptyState from '../common/EmptyState';
import KanbanMilestoneColumn from './KanbanMilestoneColumn';
import KanbanCard from './KanbanCard';
import KanbanMobileList from './KanbanMobileList';
import KanbanFiltersBar from './KanbanFiltersBar';
import KanbanCompactList from './KanbanCompactList';
import KanbanModals from './KanbanModals';
import type { MilestoneOption } from './KanbanMilestoneFilter';
import TaskDetailPanel from '../common/TaskDetailPanel';

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
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());
  const [sprintFilter, setSprintFilter] = useState<string | null>(null);
  const [milestoneFilter, setMilestoneFilter] = useState<string | null>(null);
  // Group cards into collapsible per-milestone sections within each column, instead of filtering
  // down to one milestone at a time - persisted per product like the other board display toggles.
  const [groupByMilestone, setGroupByMilestone] = useState(
    () => localStorage.getItem('planly_kanban_group_by_milestone') === '1',
  );
  const [collapsedMilestones, setCollapsedMilestones] = useState<Set<string>>(new Set());
  // Trello-style alternate board layout: columns = milestones instead of status, with cards
  // grouped into collapsible per-status sections inside each - persisted globally like groupByMilestone.
  const [viewMode, setViewMode] = useState<'status' | 'milestone'>(() =>
    localStorage.getItem('planly_kanban_view_mode') === 'milestone' ? 'milestone' : 'status',
  );
  const [collapsedStatusesInMilestoneView, setCollapsedStatusesInMilestoneView] = useState<Set<string>>(new Set());
  const [mineOnly, setMineOnly] = useState(false);
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
  const [showFiltersMenu, setShowFiltersMenu] = useState(false);
  const filtersMenuRef = useRef<HTMLDivElement>(null);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);

  const { legend: colorLegend } = useColorLegend(activeProduct?.id ?? '');

  useLayoutEffect(() => {
    if (!activeProduct) {
      setBgImage(null);
      return;
    }
    const saved = localStorage.getItem(`planly-kanban-bg-${activeProduct.id}`);
    setBgImage(saved && KANBAN_BACKGROUNDS.some((b) => b.id === saved) ? saved : null);
    // activeProduct: only `.id` drives this effect; object identity changes on every context
    // re-render regardless of which product is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProduct?.id]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (filtersMenuRef.current && !filtersMenuRef.current.contains(e.target as Node)) setShowFiltersMenu(false);
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) setShowViewMenu(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // A cleared sub-plan filter is saved as the literal string 'none', not by deleting the
  // localStorage key - the init effect below needs to tell "you explicitly chose no filter" apart
  // from "you've never chosen one" (an absent key), since only the latter should fall back to
  // auto-selecting today's current sub-plan. Without this distinction, clearing the filter looked
  // identical to never having set it, so the next time this component mounted (switching back to
  // this product, or just revisiting the tab) it would silently reapply the current sub-plan again.
  function setSprintFilterAndSave(val: string | null) {
    setSprintFilter(val);
    if (activeProduct) localStorage.setItem(`planly_sprint_${activeProduct.id}`, val ?? 'none');
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
    // activeProduct: only `.id` drives this effect; object identity changes on every context
    // re-render regardless of which product is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProduct?.id]);

  // Restore owner/color/status filters and mine-only per product - so leaving and returning to
  // the Execute tab doesn't silently drop them (each toggle below re-persists on its own change,
  // matching the milestone/sprint filters' explicit-setter pattern rather than a blanket
  // persist-on-any-change effect, which would race with this restore on product switch).
  useEffect(() => {
    if (!activeProduct) {
      setOwnerFilters(new Set());
      setColorFilters(new Set());
      setStatusFilters(new Set());
      setMineOnly(false);
      return;
    }
    const readSet = (key: string) => {
      const saved = localStorage.getItem(key);
      return saved ? new Set(saved.split(',').filter(Boolean)) : new Set<string>();
    };
    setOwnerFilters(readSet(`planly_kanban_owner_filters_${activeProduct.id}`));
    setColorFilters(readSet(`planly_kanban_color_filters_${activeProduct.id}`));
    setStatusFilters(readSet(`planly_kanban_status_filters_${activeProduct.id}`));
    setMineOnly(localStorage.getItem(`planly_kanban_mine_only_${activeProduct.id}`) === '1');
    // activeProduct: only `.id` drives this effect; object identity changes on every context
    // re-render regardless of which product is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProduct?.id]);

  function persistOwnerFilters(next: Set<string>) {
    if (!activeProduct) return;
    try {
      localStorage.setItem(`planly_kanban_owner_filters_${activeProduct.id}`, Array.from(next).join(','));
    } catch {}
  }
  function persistColorFilters(next: Set<string>) {
    if (!activeProduct) return;
    try {
      localStorage.setItem(`planly_kanban_color_filters_${activeProduct.id}`, Array.from(next).join(','));
    } catch {}
  }
  function persistStatusFilters(next: Set<string>) {
    if (!activeProduct) return;
    try {
      localStorage.setItem(`planly_kanban_status_filters_${activeProduct.id}`, Array.from(next).join(','));
    } catch {}
  }
  function persistMineOnly(next: boolean) {
    if (!activeProduct) return;
    try {
      localStorage.setItem(`planly_kanban_mine_only_${activeProduct.id}`, next ? '1' : '0');
    } catch {}
  }

  function toggleGroupByMilestone() {
    const next = !groupByMilestone;
    setGroupByMilestone(next);
    localStorage.setItem('planly_kanban_group_by_milestone', next ? '1' : '0');
    // Grouping already shows every milestone at once - clear the single-milestone filter so it
    // doesn't linger, hidden, and cause confusion if the user switches back to filter mode.
    if (next) setMilestoneFilterAndSave(null);
  }

  function toggleViewMode() {
    const next = viewMode === 'status' ? 'milestone' : 'status';
    setViewMode(next);
    localStorage.setItem('planly_kanban_view_mode', next);
  }

  function persistCollapsedStatuses(next: Set<string>) {
    if (!activeProduct) return;
    try {
      localStorage.setItem(`planly-kanban-collapsedStatuses-${activeProduct.id}`, JSON.stringify(Array.from(next)));
    } catch {}
  }

  function toggleStatusCollapsed(statusKey: string) {
    // Capture scroll position before this triggers the dndBoardKey remount below (see boardRef's
    // declaration for why the remount itself is necessary) - otherwise the board would visibly
    // snap back to its left edge every time a status section is collapsed or expanded.
    preservedScrollLeftRef.current = boardRef.current?.scrollLeft ?? null;
    setCollapsedStatusesInMilestoneView((prev) => {
      const next = new Set(prev);
      if (next.has(statusKey)) next.delete(statusKey);
      else next.add(statusKey);
      persistCollapsedStatuses(next);
      return next;
    });
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

  // Forces the DndContext below to fully remount whenever a milestone column's status-section
  // collapse state changes. Collapsing/expanding changes a milestone column's real height without
  // any drag ever happening, and even with measuring.droppable.strategy set to Always (see the
  // DndContext below), dragging that column right afterwards could still pick up a stale, wrong-
  // sized rect - a shrunken ghost with no valid drop target - until something forced a fully fresh
  // start, like a page refresh. A remount reproduces exactly that "fresh start" without a reload.
  // Scroll position is preserved across it (see toggleStatusCollapsed/the layout effect below)
  // since remounting the board's own scroll container would otherwise snap it back to the left edge.
  const dndBoardKey = Array.from(collapsedStatusesInMilestoneView).sort().join(',');
  const preservedScrollLeftRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (preservedScrollLeftRef.current != null && boardRef.current) {
      boardRef.current.scrollLeft = preservedScrollLeftRef.current;
      preservedScrollLeftRef.current = null;
    }
  }, [dndBoardKey]);

  useEffect(() => {
    if (!activeProduct) return;
    lastInitializedProductId.current = null;
    refreshSprints().then((ss) => {
      // Restore last user selection; fall back to current overlapping sprint - but only when
      // nothing has been chosen yet. 'none' means the user explicitly cleared the filter, which
      // must stick (not silently reapply the current sub-plan on the next visit).
      const saved = localStorage.getItem(`planly_sprint_${activeProduct.id}`);
      if (saved === 'none') {
        setSprintFilter(null);
      } else if (saved && ss.some((s) => s.id === saved)) {
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

  // dnd-kit wiring for all three drag types (milestone-header reorder, column reorder, task drag)
  // - see useKanbanDnd's own header comment for why they share one hook/DndContext.
  const {
    sensors,
    activeTask,
    activeColumn,
    activeMilestoneHeader,
    onDragStart,
    handleDragEnd,
  } = useKanbanDnd({
    activeProduct,
    tasks,
    columns,
    setColumns,
    readOnly,
    viewMode,
    orderedMilestoneIds,
    milestoneMeta,
    primaryMilestones,
    collapsedStatusesInMilestoneView,
    toggleStatusCollapsed,
    loadColumns,
    refreshTasks,
    saveMilestoneOrder,
    showToast,
  });

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

  // Same pattern as collapsedMilestones above, but for the milestone-columns view's per-status
  // sections: restore the saved set, falling back to "everything collapsed" only the first time
  // (once `columns` has actually loaded - unlike `tasks`, `columns` only changes on real column
  // CRUD/reorders, not on every task edit, so depending on it directly doesn't risk repeatedly
  // recomputing the default).
  useEffect(() => {
    if (viewMode !== 'milestone' || !activeProduct) return;
    try {
      const saved = localStorage.getItem(`planly-kanban-collapsedStatuses-${activeProduct.id}`);
      if (saved) {
        setCollapsedStatusesInMilestoneView(new Set(JSON.parse(saved) as string[]));
        return;
      }
    } catch {}
    if (columns.length === 0) return;
    const next = new Set(columns.map((c) => c.statusKey));
    setCollapsedStatusesInMilestoneView(next);
    persistCollapsedStatuses(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, activeProduct?.id, columns]);

  const hasFilters =
    ownerFilters.size > 0 ||
    colorFilters.size > 0 ||
    statusFilters.size > 0 ||
    sprintFilter !== null ||
    milestoneFilter !== null ||
    mineOnly;

  const filteredTasks = useMemo(() => {
    const sprintTaskIds = sprintFilter ? new Set(sprints.find((s) => s.id === sprintFilter)?.taskIds ?? []) : null;
    return tasks.filter((t) => {
      if (!visibleStatusKeys.has(t.status)) return false;
      if (mineOnly && t.ownerId !== user?.id) return false;
      if (ownerFilters.size > 0 && (!t.ownerId || !ownerFilters.has(t.ownerId))) return false;
      if (colorFilters.size > 0 && (!t.color || !colorFilters.has(t.color))) return false;
      if (statusFilters.size > 0 && !statusFilters.has(t.status)) return false;
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
    statusFilters,
    sprintFilter,
    sprints,
    user?.id,
    milestoneFilter,
    primaryMilestones,
  ]);

  // Per-milestone task groupings for the "milestone columns" view: each milestone's own task first
  // (same convention as buildMilestoneClusters), followed by everything that feeds into it; tasks
  // reaching no milestone land in the "No milestone" bucket.
  const milestoneColumnTasks = useMemo(() => {
    const byMilestoneId = new Map<string, Task[]>();
    for (const id of orderedMilestoneIds) byMilestoneId.set(id, []);
    const unassigned: Task[] = [];
    for (const t of filteredTasks) {
      if (t.deadline) {
        if (!byMilestoneId.has(t.id)) byMilestoneId.set(t.id, []);
        byMilestoneId.get(t.id)!.unshift(t);
        continue;
      }
      const m = primaryMilestones.get(t.id);
      if (m && byMilestoneId.has(m.id)) byMilestoneId.get(m.id)!.push(t);
      else unassigned.push(t);
    }
    return { byMilestoneId, unassigned };
  }, [filteredTasks, orderedMilestoneIds, primaryMilestones]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  function selectBg(id: string | null) {
    setBgImage(id);
    if (!activeProduct) return;
    if (id) localStorage.setItem(`planly-kanban-bg-${activeProduct.id}`, id);
    else localStorage.removeItem(`planly-kanban-bg-${activeProduct.id}`);
  }

  function toggleOwner(id: string) {
    setOwnerFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistOwnerFilters(next);
      return next;
    });
  }

  function toggleColor(c: string) {
    setColorFilters((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      persistColorFilters(next);
      return next;
    });
  }

  function toggleStatus(statusKey: string) {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(statusKey)) next.delete(statusKey);
      else next.add(statusKey);
      persistStatusFilters(next);
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

  // Mobile Kanban's drag-reorder within a single status column - same bulk reorder endpoint the
  // desktop same-column drag branch of handleDragEnd uses, just without the cross-column/milestone
  // scoping that only applies to a live drag-and-drop event.
  async function handleMobileReorderTasks(_statusKey: string, orderedTaskIds: string[]) {
    if (!activeProduct || readOnly) return;
    try {
      await api.tasks.reorder(
        activeProduct.id,
        orderedTaskIds.map((taskId, i) => ({ taskId, order: i })),
      );
      await refreshTasks();
    } catch (err) {
      showToast((err as Error).message);
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
    return <EmptyState icon="▦" size="lg" description="Create a product to get started" className="h-full" />;
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
        onMineToggle={() =>
          setMineOnly((v) => {
            const next = !v;
            persistMineOnly(next);
            return next;
          })
        }
        taskOwners={taskOwners}
        ownerFilters={ownerFilters}
        onToggleOwner={toggleOwner}
        onClearOwners={() => {
          setOwnerFilters(new Set());
          persistOwnerFilters(new Set());
        }}
        taskColors={taskColors}
        colorFilters={colorFilters}
        colorLegend={colorLegend}
        onToggleColor={toggleColor}
        statuses={columns}
        statusFilters={statusFilters}
        onToggleStatus={toggleStatus}
        sprints={sprints}
        sprintFilter={sprintFilter}
        onSprintChange={setSprintFilterAndSave}
        milestones={orderedMilestoneOptions}
        milestoneFilter={milestoneFilter}
        onMilestoneChange={setMilestoneFilterAndSave}
        groupByMilestone={groupByMilestone}
        onToggleGroupByMilestone={toggleGroupByMilestone}
        viewMode={viewMode}
        onToggleViewMode={toggleViewMode}
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
        onSelectBg={selectBg}
        onReset={() => {
          setOwnerFilters(new Set());
          setColorFilters(new Set());
          setStatusFilters(new Set());
          setSprintFilterAndSave(null);
          setMilestoneFilterAndSave(null);
          setMineOnly(false);
          persistOwnerFilters(new Set());
          persistColorFilters(new Set());
          persistStatusFilters(new Set());
          persistMineOnly(false);
        }}
        showFiltersMenu={showFiltersMenu}
        filtersMenuRef={filtersMenuRef}
        onToggleFiltersMenu={() => setShowFiltersMenu((v) => !v)}
        showViewMenu={showViewMenu}
        viewMenuRef={viewMenuRef}
        onToggleViewMenu={() => setShowViewMenu((v) => !v)}
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
        viewMode={viewMode}
        orderedMilestoneIds={orderedMilestoneIds}
        milestoneColumnTasks={milestoneColumnTasks}
        milestoneMeta={milestoneMeta}
        collapsedStatuses={collapsedStatusesInMilestoneView}
        onToggleStatusCollapse={toggleStatusCollapsed}
        onQuickStatusChange={readOnly ? undefined : handleCompactStatusChange}
        onReorderTasks={readOnly ? undefined : handleMobileReorderTasks}
        bgImage={bgImage}
        simpleMode={simpleMode}
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
            key={dndBoardKey}
            sensors={sensors}
            collisionDetection={pointerWithin}
            // Without this, dnd-kit only re-measures a droppable/sortable's rect lazily, so
            // collapsing/expanding a "Group by milestone" section (which changes a column's real
            // height without a drag ever happening) can leave a stale, wrong-sized rect cached -
            // the next drag on that column then measures/animates against the old size, producing
            // a shrunken drag ghost with no valid drop target until a full page refresh forces a
            // fresh measurement. Always re-measuring on every drag start is the standard fix.
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            onDragStart={onDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={viewMode === 'milestone' ? orderedMilestoneIds : columns.map((c) => c.id)}
              strategy={horizontalListSortingStrategy}
            >
              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- click-drag-to-pan is a mouse-only enhancement layered on an already natively scrollable (and thus keyboard-scrollable) container; there's no discrete action to give a keyboard equivalent for */}
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
                  {viewMode === 'milestone' ? (
                    <>
                      {orderedMilestoneIds.map((milestoneId) => (
                        <div key={milestoneId} className="kanban-col">
                          <KanbanMilestoneColumn
                            milestoneId={milestoneId}
                            milestone={tasks.find((t) => t.id === milestoneId) ?? null}
                            tasks={milestoneColumnTasks.byMilestoneId.get(milestoneId) ?? []}
                            columns={columns}
                            color={milestoneMeta.get(milestoneId)?.color ?? '#64748b'}
                            onOpenDetail={setSelectedTask}
                            primaryMilestones={primaryMilestones}
                            milestoneColors={milestoneColors}
                            simpleMode={simpleMode}
                            collapsedStatuses={collapsedStatusesInMilestoneView}
                            onToggleStatusCollapse={toggleStatusCollapsed}
                            onQuickStatusChange={readOnly ? undefined : handleCompactStatusChange}
                          />
                        </div>
                      ))}
                      {milestoneColumnTasks.unassigned.length > 0 && (
                        <div className="kanban-col">
                          <KanbanMilestoneColumn
                            milestoneId={UNASSIGNED_CLUSTER}
                            milestone={null}
                            tasks={milestoneColumnTasks.unassigned}
                            columns={columns}
                            color="var(--text-3)"
                            onOpenDetail={setSelectedTask}
                            primaryMilestones={primaryMilestones}
                            milestoneColors={milestoneColors}
                            simpleMode={simpleMode}
                            collapsedStatuses={collapsedStatusesInMilestoneView}
                            onToggleStatusCollapse={toggleStatusCollapsed}
                            onQuickStatusChange={readOnly ? undefined : handleCompactStatusChange}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    columns.map((col) => (
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
                          allColumns={columns}
                          onQuickStatusChange={readOnly ? undefined : handleCompactStatusChange}
                        />
                      </div>
                    ))
                  )}

                  {/* Add column - status-columns mode only, hidden for read-only users */}
                  {!readOnly && viewMode === 'status' && (
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
                // Mirrors every display-affecting prop the live column gets (below, in the board
                // itself) - missing groupByMilestone/milestoneOrderIds/etc previously made the
                // dragged ghost silently fall back to the flat task list even when "Group by
                // milestone" was on, showing a different view than what was actually being dragged.
                <div style={{ opacity: 0.9, width: 288 }}>
                  <KanbanColumn
                    column={activeColumn}
                    tasks={filteredTasks
                      .filter((t) => t.status === activeColumn.statusKey)
                      .sort((a, b) => a.kanbanOrder - b.kanbanOrder)}
                    onOpenDetail={() => {}}
                    onRename={() => {}}
                    onDeleteRequest={() => {}}
                    primaryMilestones={primaryMilestones}
                    milestoneColors={milestoneColors}
                    simpleMode={simpleMode}
                    groupByMilestone={groupByMilestone}
                    milestoneOrderIds={orderedMilestoneIds}
                    milestoneMeta={milestoneMeta}
                    collapsedMilestones={collapsedMilestones}
                    onToggleMilestoneCollapse={() => {}}
                    isOverlay
                  />
                </div>
              ) : activeMilestoneHeader && viewMode === 'milestone' ? (
                // Dragging a whole milestone column - show a full column ghost, same treatment as
                // activeColumn above, instead of the small cluster-header chip used below (that
                // chip is for reordering a milestone header *within* a status column when grouped).
                <div style={{ opacity: 0.9, width: 288 }}>
                  <KanbanMilestoneColumn
                    milestoneId={activeMilestoneHeader.id}
                    milestone={tasks.find((t) => t.id === activeMilestoneHeader.id) ?? null}
                    tasks={milestoneColumnTasks.byMilestoneId.get(activeMilestoneHeader.id) ?? []}
                    columns={columns}
                    color={activeMilestoneHeader.color}
                    onOpenDetail={() => {}}
                    primaryMilestones={primaryMilestones}
                    milestoneColors={milestoneColors}
                    simpleMode={simpleMode}
                    collapsedStatuses={collapsedStatusesInMilestoneView}
                    onToggleStatusCollapse={() => {}}
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

      <KanbanModals
        showNewTask={showNewTask}
        onCloseNewTask={() => setShowNewTask(false)}
        newTaskName={newTaskName}
        onNewTaskNameChange={setNewTaskName}
        onSubmitNewTask={handleCreateTask}
        creatingTask={creating}
        showNewColumn={showNewColumn}
        onCloseNewColumn={() => setShowNewColumn(false)}
        newColLabel={newColLabel}
        onNewColLabelChange={setNewColLabel}
        onSubmitNewColumn={handleCreateColumn}
        creatingColumn={creating}
        pendingDeleteCol={pendingDeleteCol}
        onCancelDeleteColumn={() => setPendingDeleteCol(null)}
        onConfirmDeleteColumn={handleDeleteColumn}
        pendingTaskCount={pendingTaskCount}
        deletingColumn={deleting}
      />
    </div>
  );
}
