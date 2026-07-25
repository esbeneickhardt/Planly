/**
 * Mobile-only (`md:hidden`) Kanban view, shown in place of the drag board. Instead of stacking
 * every column into one long vertical scroll, this shows one column at a time as a full-width
 * panel and lets the user swipe (native horizontal scroll-snap, not custom touch handling) or tap
 * a pager dot to move between columns. Tapping a card opens the TaskDetailPanel - reordering and
 * status changes happen there, not via drag, since a drag-to-reorder gesture would conflict with
 * the swipe-to-change-column gesture on a touch screen.
 */
import { useEffect, useRef, useState } from 'react';
import type { Task, KanbanColumn } from '../../types';
import { displayName } from '../../api/client';
import { buildMilestoneClusters, UNASSIGNED_CLUSTER } from '../../utils/milestones';

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
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const columnsKey = columns.map((c) => c.id).join(',');

  // Snap back to the first column when the column set changes (e.g. product switch).
  // `scrollTo` isn't implemented in jsdom (or some older WebViews), so guard it defensively.
  useEffect(() => {
    setActiveIndex(0);
    scrollerRef.current?.scrollTo?.({ left: 0 });
  }, [columnsKey]);

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

  function renderCard(task: Task, col: KanbanColumn) {
    const owner = users.find((u) => u.id === task.ownerId);
    const isOverdue = task.deadline && new Date(task.deadline) < new Date() && !col.isDone;
    return (
      <li key={task.id}>
        <button
          className="w-full text-left rounded-xl px-4 py-3 transition-colors"
          style={{ background: 'var(--surface)', border: `2px solid ${task.color ?? 'var(--border)'}` }}
          onClick={() => onOpenDetail(task)}
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
      </li>
    );
  }

  return (
    <div className="md:hidden flex-1 flex flex-col overflow-hidden relative">
      {/* Pager: one dot per column, current one highlighted, tap to jump */}
      {columns.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-2 flex-shrink-0">
          {columns.map((col, i) => (
            <button
              key={col.id}
              onClick={() => scrollToIndex(i)}
              aria-label={`Go to ${col.label}`}
              className="rounded-full transition-all"
              style={{
                width: i === activeIndex ? 18 : 6,
                height: 6,
                background: i === activeIndex ? col.color : 'var(--border)',
              }}
            />
          ))}
        </div>
      )}

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex-1 flex overflow-x-auto overflow-y-hidden"
        style={{ scrollSnapType: 'x mandatory' }}
        aria-label="Kanban columns"
      >
        {columns.map((col) => {
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

              {clusters ? (
                clusters.map(({ id, children }) => {
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
                })
              ) : (
                <ul className="space-y-2">{colTasks.map((task) => renderCard(task, col))}</ul>
              )}
            </section>
          );
        })}
        {columns.length === 0 && (
          <p className="text-sm text-center py-16 w-full" style={{ color: 'var(--text-3)' }}>
            No columns yet
          </p>
        )}
      </div>

      {/* Add task FAB */}
      {!readOnly && onAddTask && (
        <button
          onClick={onAddTask}
          aria-label="Add task"
          className="absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg"
          style={{ background: 'var(--brand)', color: 'white', display: 'flex' }}
        >
          <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>
            +
          </span>{' '}
          Add task
        </button>
      )}
    </div>
  );
}
