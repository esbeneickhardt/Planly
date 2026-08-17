/**
 * Task backlog rendered as a sortable, filterable table with per-status tabs and bulk operations.
 * Filtering and sorting are delegated to the useBacklogFilters hook; this page handles create,
 * bulk-move-to-todo, and bulk-delete mutations via the API, refreshing the shared ProductContext after each.
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useProduct } from '../context/ProductContext';
import { useTheme } from '../context/ThemeContext';
import { usePermission } from '../context/PermissionContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { api } from '../api/client';
import type { Task } from '../types';
import TaskDetailPanel from '../components/common/TaskDetailPanel';
import { useBacklogFilters } from '../hooks/useBacklogFilters';
import type { StatusKey } from '../hooks/useBacklogFilters';
import { computePrimaryMilestones, assignMilestoneColors } from '../utils/milestones';
import { sortTasks } from '../utils/backlogSort';
import type { SortColumn, SortDir } from '../utils/backlogSort';
import { SORT_COLUMNS, STATUS_TABS } from './backlog/constants';
import BacklogTable from './backlog/BacklogTable';
import BacklogBulkActionsBar from './backlog/BacklogBulkActionsBar';
import NewTaskModal from './backlog/NewTaskModal';
import EmptyState from '../components/common/EmptyState';

// Re-exported for BacklogRow.test.tsx, which imports it from here directly - the actual
// definition lives in ./backlog/BacklogTable.tsx alongside the table that renders it.
export { BacklogRow } from './backlog/BacklogTable';

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
      .sort(
        (a, b) =>
          a.milestone!.milestoneOrder - b.milestone!.milestoneOrder ||
          a.milestone!.name.localeCompare(b.milestone!.name),
      );
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

  // Single-task mutations handed down to BacklogTable, which applies them per-row.
  async function handleMoveTodo(task: Task) {
    if (!activeProduct) return;
    if (!task.ownerId) {
      setSelectedTask(task);
      return;
    }
    await api.tasks.update(activeProduct.id, task.id, { status: 'todo' });
    await refreshTasks();
  }
  async function handleQuickStatusChange(task: Task, status: string) {
    if (!activeProduct) return;
    await api.tasks.update(activeProduct.id, task.id, {
      status: status as Task['status'],
    });
    await refreshTasks();
  }
  async function handleDeleteTask(task: Task) {
    if (!activeProduct || !(await confirm('Delete this task?'))) return;
    await api.tasks.delete(activeProduct.id, task.id);
    await refreshTasks();
  }

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
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  color: '#ef4444',
                }}
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
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  maxHeight: '70vh',
                }}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-widest"
                      style={{ color: 'var(--text-3)' }}
                    >
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
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  maxHeight: '70vh',
                }}
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
            <BacklogBulkActionsBar selected={selected} onCleared={() => setSelected(new Set())} />
          )}
        </div>
      </div>

      {/* Table - explicit overflow-x-auto so long cell content (task names, owner names) grows the
          table wider via horizontal scroll instead of wrapping across many lines. */}
      <div className="flex-1 overflow-y-auto overflow-x-auto min-w-0">
        <BacklogTable
          filteredTasks={filteredTasks}
          sortedFilteredTasks={sortedFilteredTasks}
          milestoneGroups={milestoneGroups}
          search={search}
          readOnly={readOnly}
          sortColumn={sortColumn}
          sortDir={sortDir}
          onSort={handleSort}
          selected={selected}
          onToggleAll={toggleAll}
          onToggleSelect={toggleSelect}
          collapsedMilestones={collapsedMilestones}
          onToggleMilestoneCollapsed={toggleMilestoneCollapsed}
          primaryMilestones={primaryMilestones}
          milestoneColors={milestoneColors}
          onOpen={setSelectedTask}
          onMoveTodo={handleMoveTodo}
          onQuickStatusChange={readOnly ? undefined : handleQuickStatusChange}
          onDelete={handleDeleteTask}
          onAddFirstTask={() => setShowNewTask(true)}
        />
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

      {showNewTask && <NewTaskModal onClose={() => setShowNewTask(false)} />}
    </div>
  );
}
