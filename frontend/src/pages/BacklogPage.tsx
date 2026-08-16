/**
 * Task backlog rendered as a sortable, filterable table with per-status tabs and bulk operations.
 * Filtering and sorting are delegated to the useBacklogFilters hook; this page handles create,
 * bulk-move-to-todo, and bulk-delete mutations via the API, refreshing the shared ProductContext after each.
 */
import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useProduct } from '../context/ProductContext';
import { useTheme } from '../context/ThemeContext';
import { usePermission } from '../context/PermissionContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { useChat } from '../context/ChatContext';
import { useLongPress } from '../hooks/useLongPress';
import { api, displayName } from '../api/client';
import type { Task } from '../types';
import TaskDetailPanel from '../components/common/TaskDetailPanel';
import Modal from '../components/common/Modal';
import EmptyState from '../components/common/EmptyState';
import { useBacklogFilters } from '../hooks/useBacklogFilters';
import type { StatusKey, StatusTab } from '../hooks/useBacklogFilters';
import { isBeforeToday } from '../utils/dates';
import { useColorLegend } from '../hooks/useColorLegend';
import { computePrimaryMilestones, assignMilestoneColors } from '../utils/milestones';
import { sortTasks } from '../utils/backlogSort';
import type { SortColumn, SortDir } from '../utils/backlogSort';
import { STATUS_COLORS, STATUS_LABELS } from '../utils/statusColors';

const SORT_COLUMNS: SortColumn[] = ['name', 'status', 'owner', 'milestone', 'deadline', 'created'];
// Column headers, in table order. `column` is omitted for headers that aren't sortable.
const COLUMN_HEADERS: { label: string; column?: SortColumn }[] = [
  { label: 'Task', column: 'name' },
  { label: 'Status', column: 'status' },
  { label: 'Owner', column: 'owner' },
  { label: 'Milestone', column: 'milestone' },
  { label: 'Subtasks' },
  { label: 'Deadline', column: 'deadline' },
  { label: 'Created', column: 'created' },
  { label: '' },
];

const STATUS_TABS: { key: StatusTab; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: 'var(--text-3)' },
  { key: 'backlog', label: STATUS_LABELS.backlog!, color: STATUS_COLORS.backlog! },
  { key: 'todo', label: STATUS_LABELS.todo!, color: STATUS_COLORS.todo! },
  { key: 'in_progress', label: STATUS_LABELS.in_progress!, color: STATUS_COLORS.in_progress! },
  { key: 'blocked', label: STATUS_LABELS.blocked!, color: STATUS_COLORS.blocked! },
  { key: 'done', label: STATUS_LABELS.done!, color: STATUS_COLORS.done! },
];

export default function BacklogPage() {
  const { activeProduct, tasks, refreshTasks, createTask } = useProduct();
  const { mobileNavPosition } = useTheme();
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
  const [showOwnerPicker, setShowOwnerPicker] = useState(false);
  const [showReviewerPicker, setShowReviewerPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [members, setMembers] = useState<{ userId: string; user: { id: string; username: string; realName: string | null; avatarEmoji: string | null } }[]>([]);
  const [assigningOwner, setAssigningOwner] = useState(false);
  const ownerPickerRef = useRef<HTMLDivElement>(null);
  const reviewerPickerRef = useRef<HTMLDivElement>(null);
  const statusPickerRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const { legend, enabledColors } = useColorLegend(activeProduct?.id ?? '');

  // Desktop "Filters" (status/mine) and "View" (group-by-milestone) popovers - same pattern as
  // KanbanFiltersBar/KanbanBoard.
  const [showFiltersMenu, setShowFiltersMenu] = useState(false);
  const filtersMenuRef = useRef<HTMLDivElement>(null);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (filtersMenuRef.current && !filtersMenuRef.current.contains(e.target as Node)) setShowFiltersMenu(false);
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) setShowViewMenu(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Supports search's "Create new task" result, which navigates here with ?newTask=1 to open the
  // modal directly instead of requiring a second click once the page loads.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('newTask') !== '1') return;
    if (!readOnly) setShowNewTask(true);
    const next = new URLSearchParams(searchParams);
    next.delete('newTask');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const {
    statusFilters,
    toggleStatusFilter,
    setStatusFilters,
    mineOnly,
    setMineOnly,
    search,
    setSearch,
    groupByMilestone,
    setGroupByMilestone,
    filteredTasks,
    tabCounts,
    unassignedCount,
    overdueCount,
  } = useBacklogFilters(tasks, user?.id);

  const activeFilterCount = statusFilters.size + (mineOnly ? 1 : 0);

  // Column sort - click a header to sort by it; click again to flip direction. Persisted so the
  // choice survives a reload, matching the same pattern as groupByMilestone above.
  const [sortColumn, setSortColumnState] = useState<SortColumn>(() => {
    const s = localStorage.getItem('planly_backlog_sort_column');
    return s && (SORT_COLUMNS as string[]).includes(s) ? (s as SortColumn) : 'created';
  });
  const [sortDir, setSortDirState] = useState<SortDir>(() =>
    localStorage.getItem('planly_backlog_sort_dir') === 'desc' ? 'desc' : 'asc',
  );
  function handleSort(column: SortColumn) {
    const nextDir: SortDir = sortColumn === column && sortDir === 'asc' ? 'desc' : 'asc';
    setSortColumnState(column);
    setSortDirState(nextDir);
    try {
      localStorage.setItem('planly_backlog_sort_column', column);
      localStorage.setItem('planly_backlog_sort_dir', nextDir);
    } catch {}
  }

  // For each non-milestone task, which milestone it feeds into (nearest deadline if more than one)
  const primaryMilestones = useMemo(() => computePrimaryMilestones(tasks), [tasks]);
  // A distinct, stable color per milestone so tasks belonging to different milestones are
  // visually distinguishable at a glance, not just by name.
  const milestoneColors = useMemo(() => assignMilestoneColors(tasks), [tasks]);
  const sortedFilteredTasks = useMemo(
    () => sortTasks(filteredTasks, sortColumn, sortDir, primaryMilestones),
    [filteredTasks, sortColumn, sortDir, primaryMilestones],
  );
  const [collapsedMilestones, setCollapsedMilestones] = useState<Set<string>>(new Set());
  function toggleMilestoneCollapsed(id: string) {
    setCollapsedMilestones((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Group the currently-filtered tasks by the milestone they feed into (for the "Group by
  // milestone" view). Section order is always the shared milestoneOrder (same order as
  // Gantt/Kanban) regardless of the active column sort - changing the sort column only reorders
  // tasks WITHIN each section, it never reshuffles which milestone section appears first. A
  // milestone whose own row got filtered out of view (e.g. by status tab) can still show as a
  // section header via `tasks`, so its children aren't orphaned. Tasks with no milestone link land
  // in a trailing "Ungrouped" section.
  const milestoneGroups = useMemo(() => {
    if (!groupByMilestone) return null;
    const childrenByMilestoneId = new Map<string, Task[]>();
    const ungrouped: Task[] = [];
    // Partitioning an already-sorted array preserves that order within each group, so children
    // don't need a separate sort pass - they inherit whatever column sort is currently active.
    sortedFilteredTasks.forEach((t) => {
      if (t.deadline) {
        if (!childrenByMilestoneId.has(t.id)) childrenByMilestoneId.set(t.id, []);
        return;
      }
      const milestone = primaryMilestones.get(t.id);
      if (!milestone) {
        ungrouped.push(t);
        return;
      }
      if (!childrenByMilestoneId.has(milestone.id)) childrenByMilestoneId.set(milestone.id, []);
      childrenByMilestoneId.get(milestone.id)!.push(t);
    });
    const sections = Array.from(childrenByMilestoneId.entries())
      .map(([milestoneId, children]) => ({
        milestone: tasks.find((t) => t.id === milestoneId) ?? null,
        children,
      }))
      .filter((s) => s.milestone)
      .sort((a, b) => a.milestone!.milestoneOrder - b.milestone!.milestoneOrder || a.milestone!.name.localeCompare(b.milestone!.name));
    return { sections, ungrouped };
  }, [groupByMilestone, sortedFilteredTasks, tasks, primaryMilestones]);

  // Toggle a single row in/out of the multi-select set
  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
      }
      return n;
    });
  }

  function toggleAll() {
    setSelected(selected.size === filteredTasks.length ? new Set() : new Set(filteredTasks.map((t) => t.id)));
  }

  // Shared row renderer for both the flat table and the grouped-by-milestone view
  function renderRows(taskList: Task[]) {
    return taskList.map((task) => {
      const milestone = task.deadline ? task : (primaryMilestones.get(task.id) ?? null);
      return (
      <BacklogRow
        key={task.id}
        task={task}
        selected={selected.has(task.id)}
        isOverdue={!!task.deadline && task.status !== 'done' && isBeforeToday(task.deadline)}
        readOnly={readOnly}
        milestoneName={task.deadline ? null : (primaryMilestones.get(task.id)?.name ?? null)}
        milestoneColor={milestone ? (milestoneColors.get(milestone.id) ?? null) : null}
        onToggle={() => toggleSelect(task.id)}
        onOpen={() => setSelectedTask(task)}
        onMoveTodo={async () => {
          if (!activeProduct) return;
          if (!task.ownerId) {
            setSelectedTask(task);
            return;
          }
          await api.tasks.update(activeProduct.id, task.id, { status: 'todo' });
          await refreshTasks();
        }}
        onQuickStatusChange={
          readOnly
            ? undefined
            : async (status) => {
                if (!activeProduct) return;
                await api.tasks.update(activeProduct.id, task.id, { status: status as Task['status'] });
                await refreshTasks();
              }
        }
        onDelete={async () => {
          if (!activeProduct || !(await confirm('Delete this task?'))) return;
          await api.tasks.delete(activeProduct.id, task.id);
          await refreshTasks();
        }}
      />
      );
    });
  }

  // Confirm-then-delete all selected tasks in one bulk request
  async function bulkDelete() {
    if (!activeProduct || !(await confirm(`Delete ${selected.size} task(s)?`))) return;
    try {
      await api.tasks.bulkDelete(activeProduct.id, Array.from(selected));
      await refreshTasks();
      setSelected(new Set());
      showToast('Tasks deleted', 'info');
    } catch {
      showToast('Failed to delete tasks - please try again', 'error');
    }
  }

  // Assign a single owner to all selected tasks in one bulk request
  async function bulkAssignOwner(userId: string) {
    if (!activeProduct) return;
    setAssigningOwner(true);
    setShowOwnerPicker(false);
    const count = selected.size;
    try {
      await api.tasks.bulkUpdate(activeProduct.id, Array.from(selected), { ownerId: userId });
      await refreshTasks();
      setSelected(new Set());
      showToast(`Assigned owner to ${count} task${count !== 1 ? 's' : ''}`, 'success');
    } catch {
      showToast('Failed to assign owner - please try again', 'error');
    } finally {
      setAssigningOwner(false);
    }
  }

  // Assign a single reviewer to all selected tasks in one bulk request
  async function bulkAssignReviewer(userId: string) {
    if (!activeProduct) return;
    setShowReviewerPicker(false);
    const count = selected.size;
    try {
      await api.tasks.bulkUpdate(activeProduct.id, Array.from(selected), { reviewerId: userId });
      await refreshTasks();
      setSelected(new Set());
      showToast(`Assigned reviewer to ${count} task${count !== 1 ? 's' : ''}`, 'success');
    } catch {
      showToast('Failed to assign reviewer - please try again', 'error');
    }
  }

  // Fetch members when the owner or reviewer picker opens; reset cache on product change
  useEffect(() => { setMembers([]); }, [activeProduct?.id]);
  useEffect(() => {
    if ((!showOwnerPicker && !showReviewerPicker) || !activeProduct || members.length > 0) return;
    api.products
      .getAbout(activeProduct.id)
      .then((data) => setMembers(data.members))
      .catch(() => showToast('Failed to load members - please try again', 'error'));
  }, [showOwnerPicker, showReviewerPicker, activeProduct, members.length, showToast]);

  // Set status on all selected tasks in one bulk request
  async function bulkSetStatus(status: string) {
    if (!activeProduct) return;
    setShowStatusPicker(false);
    const count = selected.size;
    try {
      await api.tasks.bulkUpdate(activeProduct.id, Array.from(selected), { status: status as Task['status'] });
      await refreshTasks();
      setSelected(new Set());
      showToast(`Updated status for ${count} task${count !== 1 ? 's' : ''}`, 'success');
    } catch {
      showToast('Failed to update status - please try again', 'error');
    }
  }

  // Set (or clear, with color: null) the color tag on all selected tasks in one bulk request
  async function bulkSetColor(color: string | null) {
    if (!activeProduct) return;
    setShowColorPicker(false);
    const count = selected.size;
    try {
      await api.tasks.bulkUpdate(activeProduct.id, Array.from(selected), { color });
      await refreshTasks();
      setSelected(new Set());
      showToast(`Updated color for ${count} task${count !== 1 ? 's' : ''}`, 'success');
    } catch {
      showToast('Failed to update color - please try again', 'error');
    }
  }

  // Close pickers on outside click
  useEffect(() => {
    if (!showOwnerPicker) return;
    function onClickOutside(e: MouseEvent) {
      if (ownerPickerRef.current && !ownerPickerRef.current.contains(e.target as Node)) {
        setShowOwnerPicker(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showOwnerPicker]);
  useEffect(() => {
    if (!showReviewerPicker) return;
    function onClickOutside(e: MouseEvent) {
      if (reviewerPickerRef.current && !reviewerPickerRef.current.contains(e.target as Node)) {
        setShowReviewerPicker(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showReviewerPicker]);
  useEffect(() => {
    if (!showStatusPicker) return;
    function onClickOutside(e: MouseEvent) {
      if (statusPickerRef.current && !statusPickerRef.current.contains(e.target as Node)) {
        setShowStatusPicker(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showStatusPicker]);
  useEffect(() => {
    if (!showColorPicker) return;
    function onClickOutside(e: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showColorPicker]);

  // Mobile "+ New task" FAB: unlike the desktop name-only quick-add, this creates a stub task
  // immediately and opens it straight in the full TaskDetailPanel (fullscreen on mobile) so status,
  // owner, etc. can all be set right away instead of needing a second trip back into the task.
  async function handleMobileAddTask() {
    try {
      const task = await createTask({ name: 'New task' });
      setSelectedTask(task);
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
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
    } finally {
      setCreating(false);
    }
  }

  if (!activeProduct) {
    return <EmptyState icon="☰" size="lg" description="Create a product to get started" className="h-full" />;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Filters */}
      <div className="px-6 pt-5 pb-3 flex-shrink-0">
        {/* Warning banners */}
        {(unassignedCount > 0 || overdueCount > 0) && (
          <div className="flex flex-wrap gap-2 mb-3">
            {unassignedCount > 0 && (
              <div
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg"
                style={{
                  background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.2)',
                  color: '#f59e0b',
                }}
              >
                ⚠ {unassignedCount} unassigned in backlog
              </div>
            )}
            {overdueCount > 0 && (
              <div
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}
              >
                ⏰ {overdueCount} overdue
              </div>
            )}
          </div>
        )}

        {/* Filters + View + search - one bar at every breakpoint (no more separate mobile-only
            controls), same two-popover pattern as KanbanFiltersBar, so Execute and Task tabs feel
            consistent everywhere, not just on desktop. The dropdown panels below already use
            "fixed full-bleed on mobile, absolute-anchored on desktop" positioning. */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filters menu: status (multi-select) + mine */}
          <div className="relative flex-shrink-0" ref={filtersMenuRef}>
            <button
              onClick={() => setShowFiltersMenu((v) => !v)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all"
              style={{
                background: activeFilterCount > 0 ? 'var(--brand-subtle)' : 'var(--surface-2)',
                color: activeFilterCount > 0 ? 'var(--brand)' : 'var(--text-3)',
                border: `1px solid ${activeFilterCount > 0 ? 'var(--brand)' : 'var(--border)'}`,
              }}
            >
              Filters
              {activeFilterCount > 0 && (
                <span
                  className="text-[10px] leading-none px-1 py-0.5 rounded-full"
                  style={{ background: 'var(--brand)', color: '#fff' }}
                >
                  {activeFilterCount}
                </span>
              )}
              <span className="text-[10px]">▾</span>
            </button>
            {showFiltersMenu && (
              <div
                className="fixed left-2 right-2 top-14 md:absolute md:left-0 md:right-auto md:top-full md:mt-1 md:w-64 rounded-xl shadow-xl z-40 p-3 space-y-3 overflow-y-auto animate-dropdown-in"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '70vh' }}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                      Status
                    </span>
                    {statusFilters.size > 0 && (
                      <button
                        onClick={() => setStatusFilters(new Set())}
                        className="text-[10px]"
                        style={{ color: 'var(--text-3)' }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {STATUS_TABS.filter((tab) => tab.key !== 'all').map((tab) => {
                      const key = tab.key as StatusKey;
                      const active = statusFilters.has(key);
                      const count = tabCounts[tab.key] ?? 0;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => {
                            toggleStatusFilter(key);
                            setSelected(new Set());
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors"
                          style={{
                            background: active ? 'var(--brand-subtle)' : 'var(--surface-2)',
                            color: active ? 'var(--brand)' : 'var(--text-2)',
                            border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
                          }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tab.color }} />
                          {tab.label}
                          <span style={{ opacity: 0.7 }}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={() => setMineOnly((v) => !v)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left"
                  style={{
                    background: mineOnly ? 'var(--brand-subtle)' : 'transparent',
                    color: mineOnly ? 'var(--brand)' : 'var(--text-2)',
                  }}
                >
                  <span className="flex-1">{user?.avatarEmoji ?? '👤'} Mine only</span>
                  {mineOnly && <span style={{ color: 'var(--brand)' }}>✓</span>}
                </button>
              </div>
            )}
          </div>

          {/* View menu: group by milestone - the only "how it looks" setting Backlog has */}
          <div className="relative flex-shrink-0" ref={viewMenuRef}>
            <button
              onClick={() => setShowViewMenu((v) => !v)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all"
              style={{
                background: groupByMilestone ? 'var(--brand-subtle)' : 'var(--surface-2)',
                color: groupByMilestone ? 'var(--brand)' : 'var(--text-3)',
                border: `1px solid ${groupByMilestone ? 'var(--brand)' : 'var(--border)'}`,
              }}
            >
              View
              <span className="text-[10px]">▾</span>
            </button>
            {showViewMenu && (
              <div
                className="fixed left-2 right-2 top-14 md:absolute md:left-0 md:right-auto md:top-full md:mt-1 md:w-56 rounded-xl shadow-xl z-40 p-2 space-y-1 overflow-y-auto animate-dropdown-in"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '70vh' }}
              >
                <button
                  onClick={() => setGroupByMilestone(!groupByMilestone)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left"
                  style={{
                    background: groupByMilestone ? 'var(--brand-subtle)' : 'transparent',
                    color: groupByMilestone ? 'var(--brand)' : 'var(--text-2)',
                  }}
                >
                  <span className="flex-1">🏁 Group by milestone</span>
                  {groupByMilestone && <span style={{ color: 'var(--brand)' }}>✓</span>}
                </button>
              </div>
            )}
          </div>

          <div className="flex-1" />

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="input text-xs"
            style={{ width: 160 }}
          />

          {selected.size > 0 && !readOnly && (
            <div className="flex items-center gap-3 text-xs ml-2">
              <span style={{ color: 'var(--text-3)' }}>{selected.size} selected</span>
              {/* Owner picker */}
              <div ref={ownerPickerRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowOwnerPicker((v) => !v)}
                  disabled={assigningOwner}
                  className="font-medium"
                  style={{ color: 'var(--brand)' }}
                >
                  {assigningOwner ? 'Assigning…' : 'Assign owner ▾'}
                </button>
                {showOwnerPicker && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: 6,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                      minWidth: 180,
                      zIndex: 50,
                      overflow: 'hidden',
                    }}
                  >
                    {members.length === 0 ? (
                      <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>
                        Loading…
                      </div>
                    ) : (
                      members.map((m) => (
                        <button
                          key={m.userId}
                          onClick={() => bulkAssignOwner(m.userId)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors"
                          style={{ color: 'var(--text)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span>{m.user.avatarEmoji ?? '👤'}</span>
                          <span>{m.user.realName ?? m.user.username}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {/* Reviewer picker */}
              <div ref={reviewerPickerRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowReviewerPicker((v) => !v)}
                  className="font-medium"
                  style={{ color: 'var(--brand)' }}
                >
                  Assign reviewer ▾
                </button>
                {showReviewerPicker && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: 6,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                      minWidth: 180,
                      zIndex: 50,
                      overflow: 'hidden',
                    }}
                  >
                    {members.length === 0 ? (
                      <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>
                        Loading…
                      </div>
                    ) : (
                      members.map((m) => (
                        <button
                          key={m.userId}
                          onClick={() => bulkAssignReviewer(m.userId)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors"
                          style={{ color: 'var(--text)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span>{m.user.avatarEmoji ?? '👤'}</span>
                          <span>{m.user.realName ?? m.user.username}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {/* Status picker */}
              <div ref={statusPickerRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowStatusPicker((v) => !v)}
                  className="font-medium"
                  style={{ color: 'var(--brand)' }}
                >
                  Set status ▾
                </button>
                {showStatusPicker && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: 6,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                      minWidth: 160,
                      zIndex: 50,
                      overflow: 'hidden',
                    }}
                  >
                    {[
                      { key: 'backlog', label: 'Not started', color: '#64748b' },
                      { key: 'todo', label: 'To Do', color: '#3b82f6' },
                      { key: 'in_progress', label: 'In Progress', color: '#f59e0b' },
                      { key: 'blocked', label: 'Blocked', color: '#ef4444' },
                      { key: 'done', label: 'Done', color: '#10b981' },
                    ].map((s) => (
                      <button
                        key={s.key}
                        onClick={() => bulkSetStatus(s.key)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left"
                        style={{ color: 'var(--text)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                        <span>{s.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Color picker */}
              <div ref={colorPickerRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowColorPicker((v) => !v)}
                  className="font-medium"
                  style={{ color: 'var(--brand)' }}
                >
                  Set color ▾
                </button>
                {showColorPicker && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: 6,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                      minWidth: 180,
                      zIndex: 50,
                      overflow: 'hidden',
                    }}
                  >
                    <div className="flex items-center gap-2 flex-wrap p-2.5">
                      {enabledColors.map((c) => (
                        <button
                          key={c}
                          onClick={() => bulkSetColor(c)}
                          title={legend[c] || c}
                          className="w-6 h-6 rounded-full transition-transform"
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => bulkSetColor(null)}
                      className="w-full text-left px-3 py-2 text-xs"
                      style={{ color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      Clear color
                    </button>
                  </div>
                )}
              </div>
              <button onClick={bulkDelete} className="font-medium" style={{ color: '#ef4444' }}>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table - explicit overflow-x-auto so long cell content (task names, owner names) grows the
          table wider via horizontal scroll instead of wrapping across many lines. */}
      <div className="flex-1 overflow-y-auto overflow-x-auto min-w-0">
        {filteredTasks.length === 0 ? (
          <EmptyState
            icon={search ? '🔍' : '✓'}
            description={search ? `No tasks matching "${search}"` : 'No tasks in this view'}
            className="h-48"
            action={
              !search && !readOnly ? (
                <button onClick={() => setShowNewTask(true)} className="btn-primary text-xs">
                  + Add first task
                </button>
              ) : undefined
            }
          />
        ) : (
          <table className="w-full min-w-[640px] text-sm border-collapse">
            <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {!readOnly && (
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.size === filteredTasks.length && filteredTasks.length > 0}
                      onChange={toggleAll}
                      style={{ accentColor: 'var(--brand)' }}
                    />
                  </th>
                )}
                {COLUMN_HEADERS.map(({ label, column }) => (
                  <th
                    key={label || 'actions'}
                    className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--text-3)' }}
                  >
                    {column ? (
                      <button
                        onClick={() => handleSort(column)}
                        className="flex items-center gap-1 uppercase tracking-wide font-semibold"
                        style={{ color: sortColumn === column ? 'var(--text)' : 'var(--text-3)' }}
                      >
                        {label}
                        <span style={{ opacity: sortColumn === column ? 1 : 0.3, fontSize: 9 }}>
                          {sortColumn === column && sortDir === 'desc' ? '▼' : '▲'}
                        </span>
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            {milestoneGroups ? (
              <>
                {milestoneGroups.sections.map(({ milestone, children }) => {
                  const collapsed = collapsedMilestones.has(milestone!.id);
                  const doneCount = children.filter((t) => t.status === 'done').length;
                  const color = milestoneColors.get(milestone!.id) ?? 'var(--text-3)';
                  return (
                    <tbody key={milestone!.id}>
                      <tr
                        onClick={() => toggleMilestoneCollapsed(milestone!.id)}
                        style={{
                          background: 'var(--surface-2)',
                          borderBottom: '1px solid var(--border)',
                          borderLeft: `3px solid ${color}`,
                          cursor: 'pointer',
                        }}
                      >
                        <td colSpan={readOnly ? 8 : 9} className="px-4 py-2">
                          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                            <span style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.1s' }}>▾</span>
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                            <span>{milestone!.name}</span>
                            <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>
                              {doneCount}/{children.length} done
                            </span>
                          </div>
                        </td>
                      </tr>
                      {!collapsed && renderRows(children)}
                    </tbody>
                  );
                })}
                {milestoneGroups.ungrouped.length > 0 && (
                  <tbody>
                    <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                      <td colSpan={readOnly ? 8 : 9} className="px-4 py-2 text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                        Ungrouped
                      </td>
                    </tr>
                    {renderRows(milestoneGroups.ungrouped)}
                  </tbody>
                )}
              </>
            ) : (
              <tbody>{renderRows(sortedFilteredTasks)}</tbody>
            )}
          </table>
        )}
      </div>

      {/* Add task FAB (mobile only) - fixed to the viewport, offset above the bottom nav bar when
          that preference is active. Creates a stub task and opens it straight in the full
          TaskDetailPanel (fullscreen on mobile) so status/owner/etc. can be set right away. */}
      {!readOnly && (
        <button
          onClick={handleMobileAddTask}
          aria-label="Add task"
          className={`md:hidden fixed right-4 flex items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold shadow-2xl ${
            mobileNavPosition === 'bottom' ? 'bottom-20' : 'bottom-5'
          }`}
          style={{ background: 'var(--brand)', color: 'white', zIndex: 30 }}
        >
          <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>
            +
          </span>
          New task
        </button>
      )}

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
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

      {showNewTask && (
        <Modal title="New task" onClose={() => setShowNewTask(false)} width="max-w-sm">
          <form onSubmit={handleCreateTask} className="space-y-4">
            <div>
              <label className="label" htmlFor="backlog-new-task-name">
                Task name
              </label>
              <input
                id="backlog-new-task-name"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- first field in a freshly-opened modal
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
    </div>
  );
}

/** Small "quick actions" menu - long-press a task name to open this instead of jumping straight
 * to its chat: pick "Open chat" or change status without opening the full detail panel.
 *
 * A bottom sheet, not a popover anchored to the row (`absolute ... top-full`, as this used to
 * be) - anchoring to the row broke for any task low on screen, since the popover had nowhere to
 * open without running past the bottom edge. Fixed to the viewport bottom instead, mirroring the
 * identical long-press pattern used for mobile Kanban cards (`KanbanMobileList.tsx`'s
 * `QuickStatusMenu`) - same slide-up-on-open animation and swipe-down-to-dismiss, so both feel
 * like the same gesture across the app. */
function QuickTaskMenu({
  current,
  onSelect,
  onOpenChat,
  onClose,
}: {
  current: string;
  onSelect?: (status: string) => void;
  onOpenChat: () => void;
  onClose: () => void;
}) {
  // Mounts already translated off-screen, then flips to translateY(0) one frame later so the
  // transition actually animates a slide-up instead of just appearing in place.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Swipe-down-to-dismiss, mirroring KanbanMobileList.tsx's own quick-actions sheet.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<number | null>(null);
  const DISMISS_THRESHOLD = 80;
  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    dragStartRef.current = t.clientY;
    setDragging(true);
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (dragStartRef.current === null) return;
    const t = e.touches[0];
    if (!t) return;
    setDragY(Math.max(0, t.clientY - dragStartRef.current));
  }
  function handleTouchEnd() {
    if (dragStartRef.current === null) return;
    dragStartRef.current = null;
    setDragging(false);
    if (dragY > DISMISS_THRESHOLD) onClose();
    setDragY(0);
  }

  return (
    <>
      <button
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        aria-label="Close quick actions menu"
        onClick={onClose}
      />
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- onClick is a stopPropagation-only guard against the backdrop button's onClick={onClose}; onTouch* handlers are swipe-to-dismiss */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className="fixed left-0 right-0 bottom-0 z-50 rounded-t-2xl shadow-2xl overflow-hidden"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderBottom: 'none',
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
          transform: visible ? `translateY(${dragY}px)` : 'translateY(100%)',
          transition: dragging ? 'none' : 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)',
          touchAction: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2 pb-1" aria-hidden="true">
          <div className="w-9 h-1 rounded-full" style={{ background: 'var(--border-2)' }} />
        </div>
        <button
          onClick={onOpenChat}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm text-left transition-colors"
          style={{ color: 'var(--text)', borderBottom: onSelect ? '1px solid var(--border)' : 'none' }}
        >
          <span className="flex-shrink-0">💬</span>
          <span className="flex-1">Open chat</span>
        </button>
        {onSelect &&
          STATUS_TABS.filter((t) => t.key !== 'all').map((t) => (
            <button
              key={t.key}
              onClick={() => onSelect(t.key)}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-left transition-colors"
              style={{
                color: t.key === current ? t.color : 'var(--text)',
                background: t.key === current ? `${t.color}14` : 'transparent',
                fontWeight: t.key === current ? 600 : 400,
              }}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color }} />
              <span className="flex-1">{t.label}</span>
              {t.key === current && <span>✓</span>}
            </button>
          ))}
      </div>
    </>
  );
}

export function BacklogRow({
  task,
  selected,
  isOverdue,
  milestoneName,
  milestoneColor,
  onToggle,
  onOpen,
  onMoveTodo,
  onQuickStatusChange,
  onDelete,
  readOnly,
}: {
  task: Task;
  selected: boolean;
  isOverdue: boolean;
  /** Name of the milestone this task feeds into; null for milestone tasks themselves or unlinked tasks */
  milestoneName: string | null;
  /** This task's own color if it's a milestone, or the color of the milestone it feeds into */
  milestoneColor: string | null;
  readOnly?: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onMoveTodo: () => void;
  onQuickStatusChange?: (status: string) => void;
  onDelete: () => void;
}) {
  const isMilestone = !!task.deadline;
  const done = task.subtasks.filter((s) => s.completed).length;
  const statusColor = STATUS_COLORS[task.status] ?? '#64748b';
  const { openChat } = useChat();
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const longPress = useLongPress(() => setShowQuickMenu(true));

  // Desktop-friendly status dropdown on the Status cell itself - the long-press bottom sheet above
  // (on the task name) covers mobile, but a long-press isn't a natural desktop/mouse gesture, and
  // opening the full TaskDetailPanel just to flip a status was overkill for the common case.
  // `position: fixed`, measured from the trigger button's own on-screen position (same pattern as
  // MessageBubble's reaction picker), rather than `position: absolute` anchored to the row - this
  // table can be long enough that a row near the bottom would otherwise have its dropdown clipped
  // by the scroll container instead of just opening upward.
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const statusBtnRef = useRef<HTMLButtonElement>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const [statusMenuStyle, setStatusMenuStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });
  useLayoutEffect(() => {
    if (!showStatusMenu) return;
    const btn = statusBtnRef.current;
    if (!btn) return;
    const btnRect = btn.getBoundingClientRect();
    const menuRect = statusMenuRef.current?.getBoundingClientRect();
    const menuHeight = menuRect?.height ?? 220;
    const menuWidth = menuRect?.width ?? 170;
    const margin = 4;
    let top = btnRect.bottom + margin;
    if (top + menuHeight > window.innerHeight - margin) {
      top = Math.max(margin, btnRect.top - menuHeight - margin);
    }
    const left = Math.max(margin, Math.min(btnRect.left, window.innerWidth - menuWidth - margin));
    setStatusMenuStyle({ position: 'fixed', top, left, zIndex: 50 });
  }, [showStatusMenu]);
  useEffect(() => {
    if (!showStatusMenu) return;
    function onDown(e: MouseEvent) {
      if (
        statusMenuRef.current &&
        !statusMenuRef.current.contains(e.target as Node) &&
        statusBtnRef.current &&
        !statusBtnRef.current.contains(e.target as Node)
      ) {
        setShowStatusMenu(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showStatusMenu]);

  return (
    <tr
      style={{
        borderBottom: '1px solid var(--border)',
        background: selected ? 'var(--brand-subtle)' : 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = 'var(--surface-2)';
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent';
      }}
    >
      {!readOnly && (
        <td className="px-4 py-3 w-10">
          <input type="checkbox" checked={selected} onChange={onToggle} style={{ accentColor: 'var(--brand)' }} />
        </td>
      )}
      <td className="px-4 py-3">
        <div className="relative flex items-center gap-2">
          {isMilestone ? (
            <span title="Milestone">⭐</span>
          ) : (
            task.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: task.color }} />
          )}
          <button
            onClick={onOpen}
            className="font-medium text-left hover:underline whitespace-nowrap"
            style={{ color: 'var(--text)' }}
            title="Long-press for quick actions (chat, change status)"
            {...longPress}
          >
            {task.name}
          </button>
          {showQuickMenu && (
            <QuickTaskMenu
              current={task.status}
              onClose={() => setShowQuickMenu(false)}
              onOpenChat={() => {
                openChat(task.id, task.name);
                setShowQuickMenu(false);
              }}
              onSelect={
                onQuickStatusChange
                  ? (status) => {
                      onQuickStatusChange(status);
                      setShowQuickMenu(false);
                    }
                  : undefined
              }
            />
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        {onQuickStatusChange ? (
          <>
            <button
              ref={statusBtnRef}
              onClick={() => setShowStatusMenu((v) => !v)}
              className="flex items-center gap-1.5 text-xs whitespace-nowrap px-2 py-1 -mx-2 -my-1 rounded-lg transition-colors"
              style={{ color: 'var(--text-2)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColor }} />
              <span>{STATUS_LABELS[task.status] ?? task.status}</span>
              <span className="text-[9px]" style={{ color: 'var(--text-3)' }}>
                ▾
              </span>
            </button>
            {showStatusMenu && (
              <div
                ref={statusMenuRef}
                className="rounded-xl shadow-xl overflow-hidden animate-dropdown-in"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 170, ...statusMenuStyle }}
              >
                {STATUS_TABS.filter((t) => t.key !== 'all').map((t) => (
                  <button
                    key={t.key}
                    onClick={() => {
                      onQuickStatusChange(t.key);
                      setShowStatusMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors"
                    style={{
                      color: t.key === task.status ? t.color : 'var(--text)',
                      background: t.key === task.status ? `${t.color}14` : 'transparent',
                      fontWeight: t.key === task.status ? 600 : 400,
                    }}
                    onMouseEnter={(e) => {
                      if (t.key !== task.status) e.currentTarget.style.background = 'var(--surface-2)';
                    }}
                    onMouseLeave={(e) => {
                      if (t.key !== task.status) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color }} />
                    <span className="flex-1">{t.label}</span>
                    {t.key === task.status && <span>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-xs whitespace-nowrap">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColor }} />
            <span style={{ color: 'var(--text-2)' }}>{STATUS_LABELS[task.status] ?? task.status}</span>
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {task.owner ? (
          <span className="flex items-center gap-1.5 text-xs whitespace-nowrap" style={{ color: 'var(--text-2)' }}>
            <span>{task.owner.avatarEmoji ?? '👤'}</span>
            <span>{displayName(task.owner)}</span>
          </span>
        ) : (
          <span
            className="text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}
          >
            Unassigned
          </span>
        )}
      </td>
      <td
        className="px-4 py-3 text-xs truncate max-w-[180px]"
        style={{ color: 'var(--text-3)' }}
        title={milestoneName ?? undefined}
      >
        {milestoneName ? (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: milestoneColor ?? 'var(--text-3)' }} />
            {milestoneName}
          </span>
        ) : (
          '—'
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
        ) : (
          '-'
        )}
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-3)' }}>
        {new Date(task.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 justify-end">
          {/* Only for genuinely "Not started" (backlog) tasks - this used to fire for anything
              that wasn't literally 'todo' or 'done', which wrongly suggested moving already
              in-progress or blocked tasks backward to To Do. */}
          {!readOnly && task.status === 'backlog' && (
            <button
              onClick={onMoveTodo}
              className="text-xs font-medium whitespace-nowrap transition-colors"
              style={{ color: 'var(--brand)' }}
            >
              {task.ownerId ? 'Move to To Do →' : 'Assign owner'}
            </button>
          )}
          {!readOnly && (
            <button
              onClick={onDelete}
              className="text-xs transition-colors"
              style={{ color: 'var(--text-3)' }}
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
