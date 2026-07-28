/**
 * Mobile-only (`md:hidden`) Kanban view, shown in place of the drag board. Instead of stacking
 * every column into one long vertical scroll, this shows one column at a time as a full-width
 * panel and lets the user swipe (native horizontal scroll-snap, not custom touch handling) or tap
 * a pager dot to move between columns. Tapping a card opens the TaskDetailPanel; long-pressing a
 * card opens a quick status-change menu instead (faster than opening the panel just to move a
 * card). In the flat (not grouped-by-milestone) status view, cards can also be drag-reordered via
 * a small handle icon - a separate handle rather than whole-card drag, since whole-card press-and-
 * hold is already claimed by the long-press status menu; dragging is scoped to its own per-column
 * DndContext, matching desktop's per-column custom order (`kanbanOrder`) and sort-mode ("Custom" /
 * alphabetical / deadline / created-date), persisted under the same `planly-col-sort-${id}` key so
 * a column's sort choice is shared between mobile and desktop.
 */
import { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DraggableAttributes,
  DraggableSyntheticListeners,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task, KanbanColumn } from '../../types';
import { displayName } from '../../api/client';
import { buildMilestoneClusters, buildStatusClusters, UNASSIGNED_CLUSTER } from '../../utils/milestones';
import { useTheme } from '../../context/ThemeContext';
import { useLongPress } from '../../hooks/useLongPress';
import { SortMode, SORT_LABELS, SORT_CYCLE, sortTasks, loadColumnSortMode, saveColumnSortMode } from '../../utils/kanbanSort';
import type { MilestoneOption } from './KanbanMilestoneFilter';

interface User {
  id: string;
  username: string;
  avatarEmoji?: string | null;
  realName?: string | null;
}

interface Props {
  columns: KanbanColumn[];
  tasks: Task[];
  users: User[];
  onOpenDetail: (task: Task) => void;
  onAddTask?: () => void;
  readOnly?: boolean;
  /** Collapsible per-milestone sections within each column, mirroring the desktop board's toggle */
  groupByMilestone?: boolean;
  primaryMilestones?: Map<string, Task>;
  milestoneColors?: Map<string, string>;
  milestoneOrderIds?: string[];
  collapsedMilestones?: Set<string>;
  onToggleMilestoneCollapse?: (id: string) => void;
  /** Trello-style alternate layout: pages are milestones instead of status columns, with cards
   * grouped into collapsible per-status sections within each - the mirror image of the above. */
  viewMode?: 'status' | 'milestone';
  orderedMilestoneIds?: string[];
  milestoneColumnTasks?: { byMilestoneId: Map<string, Task[]>; unassigned: Task[] };
  milestoneMeta?: Map<string, MilestoneOption>;
  collapsedStatuses?: Set<string>;
  onToggleStatusCollapse?: (statusKey: string) => void;
  /** Long-press a card to change its status without opening the detail panel */
  onQuickStatusChange?: (taskId: string, newStatus: string) => void;
  /** Drag-reorder within a status column (flat status view only - see file header comment) */
  onReorderTasks?: (statusKey: string, orderedTaskIds: string[]) => void;
}

/** Small popover listing every status column - long-press a card to open this instead of the full
 * detail panel, for the common case of "just move this to another column." */
function QuickStatusMenu({
  columns,
  current,
  onSelect,
  onClose,
}: {
  columns: KanbanColumn[];
  current: string;
  onSelect: (statusKey: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* Invisible backdrop - tapping anywhere outside the menu closes it */}
      <button
        className="fixed inset-0 z-40"
        style={{ background: 'transparent' }}
        aria-label="Close status menu"
        onClick={onClose}
      />
      <div
        className="absolute left-3 right-3 top-full mt-1 rounded-xl shadow-xl z-50 overflow-hidden animate-dropdown-in"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {columns.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.statusKey)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors"
            style={{
              color: c.statusKey === current ? c.color : 'var(--text)',
              background: c.statusKey === current ? `${c.color}14` : 'transparent',
              fontWeight: c.statusKey === current ? 600 : 400,
            }}
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
            <span className="flex-1">{c.label}</span>
            {c.statusKey === current && <span>✓</span>}
          </button>
        ))}
      </div>
    </>
  );
}

/** Card content shared by both the draggable and plain (grouped/milestone-view) render paths -
 * tap opens the task, long-press opens the QuickStatusMenu. */
function CardBody({
  task,
  col,
  columns,
  users,
  onOpenDetail,
  onQuickStatusChange,
  dragHandle,
}: {
  task: Task;
  col: KanbanColumn;
  columns: KanbanColumn[];
  users: User[];
  onOpenDetail: (task: Task) => void;
  onQuickStatusChange?: (taskId: string, newStatus: string) => void;
  dragHandle?: { attributes: DraggableAttributes; listeners: DraggableSyntheticListeners };
}) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const longPress = useLongPress(() => {
    if (onQuickStatusChange) setShowStatusMenu(true);
  });
  const owner = users.find((u) => u.id === task.ownerId);
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && !col.isDone;

  return (
    <div className="relative">
      <div
        className="w-full rounded-xl transition-colors flex items-stretch gap-1"
        style={{ background: 'var(--surface)', border: `2px solid ${task.color ?? 'var(--border)'}` }}
      >
        {dragHandle && (
          <span
            {...dragHandle.attributes}
            {...dragHandle.listeners}
            className="flex items-center px-2 flex-shrink-0 touch-none"
            style={{ color: 'var(--text-3)', cursor: 'grab' }}
            aria-label="Drag to reorder"
          >
            ⠿
          </span>
        )}
        <button
          className={`flex-1 min-w-0 text-left py-3 ${dragHandle ? 'pr-4' : 'px-4'}`}
          onClick={() => onOpenDetail(task)}
          {...longPress}
          aria-label={`${task.name}${owner ? `, assigned to ${displayName(owner)}` : ''}${task.deadline ? `, due ${new Date(task.deadline).toLocaleDateString()}` : ''}`}
        >
          <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text)' }}>
            {task.name}
          </p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {owner && (
              <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
                <span aria-hidden="true">{owner.avatarEmoji ?? '👤'}</span>
                <span>{displayName(owner)}</span>
              </span>
            )}
            {task.deadline && (
              <span className="text-xs" style={{ color: isOverdue ? '#ef4444' : 'var(--text-3)' }}>
                {isOverdue && <span aria-hidden="true">⚠ </span>}
                {new Date(task.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                {isOverdue && <span className="sr-only"> (overdue)</span>}
              </span>
            )}
            {task.subtasks.length > 0 && (
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length} subtasks
              </span>
            )}
          </div>
        </button>
      </div>
      {showStatusMenu && onQuickStatusChange && (
        <QuickStatusMenu
          columns={columns}
          current={col.statusKey}
          onClose={() => setShowStatusMenu(false)}
          onSelect={(statusKey) => {
            onQuickStatusChange(task.id, statusKey);
            setShowStatusMenu(false);
          }}
        />
      )}
    </div>
  );
}

/** Draggable card for the flat (ungrouped) status view - must be a real component (not a plain
 * render function) since it owns its own `useSortable` hook call. */
function SortableMobileCard(props: {
  task: Task;
  col: KanbanColumn;
  columns: KanbanColumn[];
  users: User[];
  onOpenDetail: (task: Task) => void;
  onQuickStatusChange?: (taskId: string, newStatus: string) => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: props.task.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}>
      <CardBody {...props} dragHandle={{ attributes, listeners }} />
    </li>
  );
}

/** One flat (ungrouped) status column's content on mobile: its own sort-mode control and its own
 * scoped DndContext, mirroring desktop's KanbanColumn.tsx per-column sort/drag. Kept as a distinct
 * component (rather than inline in the parent's `.map`) purely so it can own `sortMode` state and
 * call `useSortable` per card - neither is possible inside a bare `.map()` callback. */
function MobileStatusColumn({
  col,
  colTasks,
  columns,
  users,
  onOpenDetail,
  onQuickStatusChange,
  onReorderTasks,
}: {
  col: KanbanColumn;
  colTasks: Task[];
  columns: KanbanColumn[];
  users: User[];
  onOpenDetail: (task: Task) => void;
  onQuickStatusChange?: (taskId: string, newStatus: string) => void;
  onReorderTasks?: (statusKey: string, orderedTaskIds: string[]) => void;
}) {
  const [sortMode, setSortMode] = useState<SortMode>(() => loadColumnSortMode(col.id));
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );
  const sorted = sortTasks(colTasks, sortMode);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorderTasks) return;
    const oldIndex = sorted.findIndex((t) => t.id === active.id);
    const newIndex = sorted.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderTasks(
      col.statusKey,
      arrayMove(sorted, oldIndex, newIndex).map((t) => t.id),
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: col.color }} aria-hidden="true" />
        <h2
          id={`col-heading-${col.id}`}
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--text-3)' }}
        >
          {col.label}
        </h2>
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
          ({colTasks.length})
        </span>
        <div className="relative ml-auto flex-shrink-0">
          <button
            onClick={() => setShowSortMenu((v) => !v)}
            className="text-xs px-1.5 py-0.5 rounded transition-colors"
            style={{
              color: sortMode !== 'default' ? col.color : 'var(--text-3)',
              background: sortMode !== 'default' ? `${col.color}18` : 'transparent',
            }}
            title="Sort column"
          >
            ⇅
          </button>
          {showSortMenu && (
            <>
              <button className="fixed inset-0 z-40" style={{ background: 'transparent' }} aria-label="Close sort menu" onClick={() => setShowSortMenu(false)} />
              <div
                className="absolute right-0 top-full mt-1 rounded-lg shadow-xl z-50 py-1 overflow-hidden"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 160 }}
              >
                {SORT_CYCLE.map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setSortMode(mode);
                      saveColumnSortMode(col.id, mode);
                      setShowSortMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs transition-colors"
                    style={{
                      color: sortMode === mode ? col.color : 'var(--text-2)',
                      background: sortMode === mode ? `${col.color}12` : 'transparent',
                      fontWeight: sortMode === mode ? 600 : 400,
                    }}
                  >
                    {SORT_LABELS[mode]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {colTasks.length === 0 ? (
        <p className="text-xs px-2 py-3" style={{ color: 'var(--text-3)' }}>
          No tasks
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sorted.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {sorted.map((task) => (
                <SortableMobileCard
                  key={task.id}
                  task={task}
                  col={col}
                  columns={columns}
                  users={users}
                  onOpenDetail={onOpenDetail}
                  onQuickStatusChange={onQuickStatusChange}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </>
  );
}

export default function KanbanMobileList({
  columns,
  tasks,
  users,
  onOpenDetail,
  onAddTask,
  readOnly,
  groupByMilestone,
  primaryMilestones,
  milestoneColors,
  milestoneOrderIds,
  collapsedMilestones,
  onToggleMilestoneCollapse,
  viewMode = 'status',
  orderedMilestoneIds,
  milestoneColumnTasks,
  milestoneMeta,
  collapsedStatuses,
  onToggleStatusCollapse,
  onQuickStatusChange,
  onReorderTasks,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { mobileNavPosition } = useTheme();

  const showUnassignedPage = viewMode === 'milestone' && (milestoneColumnTasks?.unassigned.length ?? 0) > 0;
  // Page identity for both the pager dots and the "reset to first page" effect below - status
  // columns in status mode, milestones (+ "No milestone") in milestone mode.
  const pageIds =
    viewMode === 'milestone'
      ? [...(orderedMilestoneIds ?? []), ...(showUnassignedPage ? [UNASSIGNED_CLUSTER] : [])]
      : columns.map((c) => c.id);
  const pagesKey = pageIds.join(',');

  // Snap back to the first page when the page set changes (e.g. product switch, or flipping
  // viewMode). `scrollTo` isn't implemented in jsdom (or some older WebViews), so guard defensively.
  useEffect(() => {
    setActiveIndex(0);
    scrollerRef.current?.scrollTo?.({ left: 0 });
  }, [pagesKey]);

  function scrollToIndex(i: number) {
    const el = scrollerRef.current;
    if (!el?.scrollTo) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  }

  function onScroll() {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    setActiveIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  /** Plain (non-draggable) card used for grouped-by-milestone and milestone-view sections - drag
   * reorder is only offered in the flat status view (see file header comment). */
  function renderCard(task: Task, col: KanbanColumn) {
    return (
      <li key={task.id}>
        <CardBody
          task={task}
          col={col}
          columns={columns}
          users={users}
          onOpenDetail={onOpenDetail}
          onQuickStatusChange={onQuickStatusChange}
        />
      </li>
    );
  }

  return (
    <div className="md:hidden flex-1 flex flex-col overflow-hidden relative">
      {/* Pager: one dot per page, current one highlighted, tap to jump - pages are status columns
          or milestones depending on viewMode */}
      {pageIds.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-2 flex-shrink-0">
          {pageIds.map((id, i) => {
            const label =
              viewMode === 'milestone'
                ? (id === UNASSIGNED_CLUSTER ? 'No milestone' : (milestoneMeta?.get(id)?.name ?? 'Milestone'))
                : (columns.find((c) => c.id === id)?.label ?? '');
            const color =
              viewMode === 'milestone'
                ? id === UNASSIGNED_CLUSTER
                  ? 'var(--text-3)'
                  : (milestoneMeta?.get(id)?.color ?? '#64748b')
                : (columns.find((c) => c.id === id)?.color ?? 'var(--text-3)');
            return (
              <button
                key={id}
                onClick={() => scrollToIndex(i)}
                aria-label={`Go to ${label}`}
                className="rounded-full transition-all"
                style={{
                  width: i === activeIndex ? 18 : 6,
                  height: 6,
                  background: i === activeIndex ? color : 'var(--border)',
                }}
              />
            );
          })}
        </div>
      )}

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex-1 flex overflow-x-auto overflow-y-hidden"
        style={{ scrollSnapType: 'x mandatory' }}
        aria-label={viewMode === 'milestone' ? 'Milestone columns' : 'Kanban columns'}
      >
        {viewMode === 'milestone'
          ? pageIds.map((milestoneId) => {
              const isUnassigned = milestoneId === UNASSIGNED_CLUSTER;
              const pageTasks = isUnassigned
                ? (milestoneColumnTasks?.unassigned ?? [])
                : (milestoneColumnTasks?.byMilestoneId.get(milestoneId) ?? []);
              const meta = isUnassigned ? null : milestoneMeta?.get(milestoneId);
              const milestoneTask = isUnassigned ? null : tasks.find((t) => t.id === milestoneId);
              const label = isUnassigned ? 'No milestone' : (meta?.name ?? 'Milestone');
              const color = isUnassigned ? 'var(--text-3)' : (meta?.color ?? '#64748b');
              const statusClusters = buildStatusClusters(pageTasks, columns);
              return (
                <section
                  key={milestoneId}
                  aria-labelledby={`mcol-heading-${milestoneId}`}
                  className="w-full flex-shrink-0 overflow-y-auto px-4 py-3"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: color }}
                      aria-hidden="true"
                    />
                    <h2 id={`mcol-heading-${milestoneId}`} className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                      {label}
                    </h2>
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                      ({pageTasks.length})
                    </span>
                    {milestoneTask?.deadline && (
                      <span className="text-xs ml-auto" style={{ color: 'var(--text-3)' }}>
                        {new Date(milestoneTask.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>

                  {pageTasks.length === 0 && (
                    <p className="text-xs px-2 py-3" style={{ color: 'var(--text-3)' }}>
                      No tasks
                    </p>
                  )}

                  {statusClusters.map(({ statusKey, label: statusLabel, color: statusColor, children }) => {
                    const statusCol = columns.find((c) => c.statusKey === statusKey)!;
                    const collapsed = collapsedStatuses?.has(statusKey) ?? false;
                    return (
                      <div key={statusKey} className="mb-2">
                        <button
                          onClick={() => onToggleStatusCollapse?.(statusKey)}
                          className="w-full flex items-center gap-1.5 px-1.5 py-1.5 mb-1.5 rounded text-xs font-semibold"
                          style={{ color: 'var(--text-2)', background: `${statusColor}14` }}
                        >
                          <span
                            className="inline-block flex-shrink-0"
                            style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.1s' }}
                          >
                            ▾
                          </span>
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusColor }} />
                          <span className="truncate flex-1 text-left">{statusLabel}</span>
                          <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>{children.length}</span>
                        </button>
                        {!collapsed && (
                          <ul className="space-y-2 mb-2">{children.map((t) => renderCard(t, statusCol))}</ul>
                        )}
                      </div>
                    );
                  })}
                </section>
              );
            })
          : columns.map((col) => {
          const colTasks = tasks
            .filter((t) => t.status === col.statusKey)
            .sort((a, b) => a.kanbanOrder - b.kanbanOrder);
          const clusters =
            groupByMilestone && primaryMilestones
              ? buildMilestoneClusters(colTasks, primaryMilestones, milestoneOrderIds ?? [])
              : null;
          return (
            <section
              key={col.id}
              aria-labelledby={`col-heading-${col.id}`}
              className="w-full flex-shrink-0 overflow-y-auto px-4 py-3"
              style={{ scrollSnapAlign: 'start' }}
            >
              {clusters ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: col.color }}
                      aria-hidden="true"
                    />
                    <h2
                      id={`col-heading-${col.id}`}
                      className="text-xs font-semibold uppercase tracking-widest"
                      style={{ color: 'var(--text-3)' }}
                    >
                      {col.label}
                    </h2>
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                      ({colTasks.length})
                    </span>
                  </div>

                  {colTasks.length === 0 && (
                    <p className="text-xs px-2 py-3" style={{ color: 'var(--text-3)' }}>
                      No tasks
                    </p>
                  )}

                  {clusters.map(({ id, children }) => {
                    const isUnassigned = id === UNASSIGNED_CLUSTER;
                    const meta = isUnassigned ? null : milestoneColors?.get(id);
                    const milestoneTask = isUnassigned ? null : tasks.find((t) => t.id === id);
                    const label = isUnassigned ? 'No milestone' : (milestoneTask?.name ?? 'Milestone');
                    const color = isUnassigned ? 'var(--text-3)' : (meta ?? 'var(--text-3)');
                    const collapsed = collapsedMilestones?.has(id) ?? false;
                    return (
                      <div key={id} className="mb-2">
                        <button
                          onClick={() => onToggleMilestoneCollapse?.(id)}
                          className="w-full flex items-center gap-1.5 px-1.5 py-1.5 mb-1.5 rounded text-xs font-semibold"
                          style={{ color: 'var(--text-2)', background: `${color}14`, borderLeft: `3px solid ${color}` }}
                        >
                          <span
                            className="inline-block flex-shrink-0"
                            style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.1s' }}
                          >
                            ▾
                          </span>
                          {!isUnassigned && (
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                          )}
                          <span className="truncate flex-1 text-left">{label}</span>
                          <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>{children.length}</span>
                        </button>
                        {!collapsed && <ul className="space-y-2 mb-2">{children.map((t) => renderCard(t, col))}</ul>}
                      </div>
                    );
                  })}
                </>
              ) : (
                <MobileStatusColumn
                  col={col}
                  colTasks={colTasks}
                  columns={columns}
                  users={users}
                  onOpenDetail={onOpenDetail}
                  onQuickStatusChange={onQuickStatusChange}
                  onReorderTasks={onReorderTasks}
                />
              )}
            </section>
          );
        })}
        {pageIds.length === 0 && (
          <p className="text-sm text-center py-16 w-full" style={{ color: 'var(--text-3)' }}>
            {viewMode === 'milestone' ? 'No milestones yet' : 'No columns yet'}
          </p>
        )}
      </div>

      {/* Add task FAB - fixed to the viewport (not the scrollable column area) so it's always
          reliably visible regardless of scroll position, offset above the bottom nav bar when
          that preference is active. */}
      {!readOnly && onAddTask && (
        <button
          onClick={onAddTask}
          aria-label="Add task"
          className={`fixed right-4 flex items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold shadow-2xl ${
            mobileNavPosition === 'bottom' ? 'bottom-20' : 'bottom-5'
          }`}
          style={{ background: 'var(--brand)', color: 'white', display: 'flex', zIndex: 30 }}
        >
          <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>
            +
          </span>{' '}
          New task
        </button>
      )}
    </div>
  );
}
