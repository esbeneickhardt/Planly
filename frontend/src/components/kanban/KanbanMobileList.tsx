/**
 * Mobile-only (`md:hidden`) Kanban view, shown in place of the drag board. Instead of stacking
 * every column into one long vertical scroll, this shows one column at a time as a full-width
 * panel and lets the user swipe (native horizontal scroll-snap, not custom touch handling) or tap
 * a pager dot to move between columns. Tapping a card opens the TaskDetailPanel; long-pressing a
 * card opens a quick-actions menu instead (open the task's chat, or - task-write permitting -
 * change its status), faster than opening the panel just to move a card or say something about
 * it. In the flat (not grouped-by-milestone) status view, cards can also be drag-reordered via
 * a small handle icon - a separate handle rather than whole-card drag, since whole-card press-and-
 * hold is already claimed by the long-press quick-actions menu; dragging is scoped to its own per-column
 * DndContext, matching desktop's per-column custom order (`kanbanOrder`) and sort-mode ("Custom" /
 * alphabetical / deadline / created-date), persisted under the same `planly-col-sort-${id}` key so
 * a column's sort choice is shared between mobile and desktop.
 *
 * Trello-style three-layer look per swiped page: the page's own background (photo wallpaper if
 * one's set, plain otherwise), a rounded "status board" panel on top of it tinted with the page's
 * own status/milestone color (`boardTint`), and finally the task cards inset within that board's
 * own padding so they read visibly smaller than the board itself.
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
import { useChat } from '../../context/ChatContext';
import { useLongPress } from '../../hooks/useLongPress';
import {
  SortMode,
  SORT_LABELS,
  SORT_CYCLE,
  sortTasks,
  loadColumnSortMode,
  saveColumnSortMode,
} from '../../utils/kanbanSort';
import type { MilestoneOption } from './KanbanMilestoneFilter';

// Background for the "status board" panel (see the per-page render below for the three-layer
// idea: page background, then this board, then task cards on top of it) - a tint of the page's
// own status/milestone color so each swiped-to page reads as a distinct board immediately, true
// out of the box even before anyone picks a custom wallpaper. Guards against non-hex values
// ('var(--text-3)' for the "No milestone" page) since those can't take a hex alpha suffix.
function boardTint(color: string): string {
  return color.startsWith('#') ? `${color}26` : 'var(--surface-2)';
}

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
  milestoneColumnTasks?: {
    byMilestoneId: Map<string, Task[]>;
    unassigned: Task[];
  };
  milestoneMeta?: Map<string, MilestoneOption>;
  collapsedStatuses?: Set<string>;
  onToggleStatusCollapse?: (statusKey: string) => void;
  /** Long-press a card to change its status without opening the detail panel */
  onQuickStatusChange?: (taskId: string, newStatus: string) => void;
  /** Drag-reorder within a status column (flat status view only - see file header comment) */
  onReorderTasks?: (statusKey: string, orderedTaskIds: string[]) => void;
  /** Trello-style board background (same id/persistence as desktop's picker) - rendered behind
   * the swiped column pages with a subtle parallax shift as you scroll between them. */
  bgImage?: string | null;
  /** Dense display: title only, everything else (owner, due date, subtasks) hidden - mirrors
   * desktop KanbanCard's own simpleMode, now respected on mobile too. */
  simpleMode?: boolean;
}

/** Small "quick actions" menu - long-press a card to open this instead of the full detail
 * panel: jump straight to the task's chat, or (task-write permitting) change its status without
 * opening the panel just to move it. Both actions share this one long-press gesture since a card
 * can only claim the gesture once.
 *
 * A bottom sheet, not a popover anchored to the card (`absolute ... top-full`, as this used to
 * be) - anchoring to the card broke for any card in the lower half of the screen, since the
 * popover had nowhere to open without running past the bottom edge. Fixed to the viewport bottom
 * instead, mirroring the identical long-press pattern already used for per-message actions in the
 * chat panel (MessageBubble.tsx) - same slide-up-on-open animation and swipe-down-to-dismiss, so
 * both feel like the same gesture across the app. */
function QuickStatusMenu({
  columns,
  current,
  onSelect,
  onOpenChat,
  onClose,
}: {
  columns: KanbanColumn[];
  current: string;
  onSelect?: (statusKey: string) => void;
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

  // Swipe-down-to-dismiss, mirroring MessageBubble.tsx's own message-actions sheet.
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
          style={{
            color: 'var(--text)',
            borderBottom: onSelect ? '1px solid var(--border)' : 'none',
          }}
        >
          <span className="flex-shrink-0">💬</span>
          <span className="flex-1">Open chat</span>
        </button>
        {onSelect &&
          columns.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.statusKey)}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-left transition-colors"
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
  simpleMode,
}: {
  task: Task;
  col: KanbanColumn;
  columns: KanbanColumn[];
  users: User[];
  onOpenDetail: (task: Task) => void;
  onQuickStatusChange?: (taskId: string, newStatus: string) => void;
  dragHandle?: {
    attributes: DraggableAttributes;
    listeners: DraggableSyntheticListeners;
  };
  /** Dense display: title only, everything else (owner, due date, subtasks) hidden - mirrors
   * desktop KanbanCard's own simpleMode. */
  simpleMode?: boolean;
}) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const { openChat } = useChat();
  const longPress = useLongPress(() => setShowStatusMenu(true));
  const owner = users.find((u) => u.id === task.ownerId);
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && !col.isDone;
  const doneSubtasks = task.subtasks.filter((s) => s.completed).length;

  return (
    <div className="relative">
      {/* Trello-inspired card: a plain surface + soft shadow instead of leaning on the colored
          border alone for weight, small icon+value metadata chips instead of bare text. The owner
          is a left-aligned chip (emoji + name) in that same metadata row, not a floating badge -
          this is the who/when/how-much-done row, and identity belongs in it like everything else.
          Color is a thin left accent stripe (matching desktop KanbanCard.tsx exactly), not a full
          all-around border - a solid colored box on all four sides reads as chunky/heavy at this
          size, where the accent-stripe treatment is what actually looks sharp. */}
      <div
        className="relative w-full rounded-2xl shadow-sm transition-shadow active:shadow-none flex items-stretch gap-1"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          // Neutral fallback, not 'transparent' - a transparent left border next to the 1px
          // neutral border on the other 3 sides left a visible "hole" in the outline for any
          // uncolored task, since the (3px) left edge fell back to nothing instead of matching.
          borderLeft: `3px solid ${task.color ?? 'var(--border)'}`,
        }}
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
          className={`flex-1 min-w-0 text-left py-3.5 ${dragHandle ? 'pr-4' : 'px-4'}`}
          onClick={() => onOpenDetail(task)}
          {...longPress}
          aria-label={`${task.name}${owner ? `, assigned to ${displayName(owner)}` : ''}${task.deadline ? `, due ${new Date(task.deadline).toLocaleDateString()}` : ''}`}
        >
          <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--text)' }}>
            {task.name}
          </p>
          {!simpleMode && (owner || task.deadline || task.subtasks.length > 0) && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {owner && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md max-w-[140px]"
                  style={{
                    background: 'var(--surface-2)',
                    color: 'var(--text-3)',
                  }}
                >
                  <span aria-hidden="true">{owner.avatarEmoji ?? '👤'}</span>
                  <span className="truncate">{displayName(owner)}</span>
                </span>
              )}
              {task.deadline && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md"
                  style={{
                    background: isOverdue ? 'rgba(239,68,68,0.12)' : 'var(--surface-2)',
                    color: isOverdue ? '#ef4444' : 'var(--text-3)',
                  }}
                >
                  <span aria-hidden="true">{isOverdue ? '⚠' : '🕐'}</span>
                  {new Date(task.deadline).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                  })}
                  {isOverdue && <span className="sr-only"> (overdue)</span>}
                </span>
              )}
              {task.subtasks.length > 0 && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md"
                  style={{
                    background: 'var(--surface-2)',
                    color: 'var(--text-3)',
                  }}
                >
                  <span aria-hidden="true">☑</span>
                  {doneSubtasks}/{task.subtasks.length}
                </span>
              )}
            </div>
          )}
        </button>
      </div>
      {showStatusMenu && (
        <QuickStatusMenu
          columns={columns}
          current={col.statusKey}
          onClose={() => setShowStatusMenu(false)}
          onOpenChat={() => {
            openChat(task.id, task.name);
            setShowStatusMenu(false);
          }}
          onSelect={
            onQuickStatusChange
              ? (statusKey) => {
                  onQuickStatusChange(task.id, statusKey);
                  setShowStatusMenu(false);
                }
              : undefined
          }
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
  simpleMode?: boolean;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: props.task.id });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
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
  simpleMode,
}: {
  col: KanbanColumn;
  colTasks: Task[];
  columns: KanbanColumn[];
  users: User[];
  onOpenDetail: (task: Task) => void;
  onQuickStatusChange?: (taskId: string, newStatus: string) => void;
  onReorderTasks?: (statusKey: string, orderedTaskIds: string[]) => void;
  simpleMode?: boolean;
}) {
  const [sortMode, setSortMode] = useState<SortMode>(() => loadColumnSortMode(col.id));
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
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
      {/* A genuine header row - not `position: sticky` layered over the scrolling list (that
          needed an opaque background faked in to mask cards scrolling underneath, and still only
          ever covered the list's own padding box, not the panel's full width). Instead, same
          structure as desktop's KanbanColumn.tsx: a separate flex-shrink-0 row above a separately-
          scrollable body below, so it's trivially full-bleed edge-to-edge within the panel and
          never has to fight a scroll container's own clipping to stay covered or aligned. */}
      <div
        className="flex items-center gap-2 px-3 pt-3 pb-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h2 id={`col-heading-${col.id}`} className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          {col.label}
        </h2>
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
          {colTasks.length}
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
              <button
                className="fixed inset-0 z-40"
                style={{ background: 'transparent' }}
                aria-label="Close sort menu"
                onClick={() => setShowSortMenu(false)}
              />
              <div
                className="absolute right-0 top-full mt-1 rounded-lg shadow-xl z-50 py-1 overflow-hidden"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  minWidth: 160,
                }}
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

      <div className="flex-1 overflow-y-auto p-3 pt-2">
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
                    simpleMode={simpleMode}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>
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
  bgImage,
  simpleMode,
}: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bgLayerRef = useRef<HTMLDivElement>(null);
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
    // Trello-style subtle parallax: shift the background a few px opposite the scroll direction,
    // mutating the DOM directly (not via React state) so it doesn't force a re-render on every
    // scroll tick - the layer is oversized (see render below) so this never exposes its edges.
    if (bgLayerRef.current) {
      const maxShift = 24;
      const range = el.scrollWidth - el.clientWidth;
      const progress = range > 0 ? el.scrollLeft / range : 0;
      bgLayerRef.current.style.transform = `translateX(${(0.5 - progress) * maxShift * 2}px)`;
    }
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
          simpleMode={simpleMode}
        />
      </li>
    );
  }

  return (
    <div className="md:hidden flex-1 flex flex-col overflow-hidden relative">
      {/* Trello-style board background, behind the pager/scroller - oversized (extra 24px each
          side) so the parallax shift in onScroll never exposes an edge. Same darkened-photo
          technique as desktop's wallpaper (KanbanBoard.tsx), just scoped to this component instead
          of the whole page. */}
      {bgImage && (
        <div
          ref={bgLayerRef}
          className="absolute -z-10"
          style={{
            top: 0,
            bottom: 0,
            left: -24,
            right: -24,
            backgroundImage: `linear-gradient(rgba(0,0,0,0.38),rgba(0,0,0,0.38)),url(/backgrounds/${bgImage}.jpg)`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />
      )}

      {/* Pager: one dot per page, current one highlighted, tap to jump - pages are status columns
          or milestones depending on viewMode */}
      {pageIds.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-0.5 flex-shrink-0">
          {pageIds.map((id, i) => {
            const label =
              viewMode === 'milestone'
                ? id === UNASSIGNED_CLUSTER
                  ? 'No milestone'
                  : (milestoneMeta?.get(id)?.name ?? 'Milestone')
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
                  className="w-full flex-shrink-0 p-3 flex flex-col"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  {/* The "status board" panel - the Trello list layer, sitting on top of the page
                      background above (photo wallpaper if set, otherwise just the plain page) and
                      tinted with this page's own color so it reads as a distinct board while
                      swiping. Task cards then sit inset within its own padding below, appearing
                      visibly smaller than the page itself: background -> board -> cards. A thin
                      neutral border plus a colored top accent bar (not a full-strength colored
                      outline on every edge) keeps this reading as a compact list card rather than
                      a big solid-colored box. */}
                  <div
                    className="rounded-xl flex-1 flex flex-col shadow-sm overflow-hidden"
                    style={{
                      background: bgImage ? 'color-mix(in srgb, var(--surface) 88%, transparent)' : boardTint(color),
                      border: '1px solid var(--border)',
                      borderTop: `3px solid ${color.startsWith('#') ? color : 'var(--border)'}`,
                    }}
                  >
                    {/* A genuine header row - not `position: sticky` layered over the scrolling
                        list (that needed an opaque background faked in to mask cards scrolling
                        underneath, and still only ever covered the list's own padding box, not
                        the panel's full width). Instead, same structure as desktop's
                        KanbanColumn.tsx: a separate flex-shrink-0 row above a separately-
                        scrollable body below, so it's trivially full-bleed edge-to-edge and never
                        has to fight a scroll container's own clipping to stay covered or aligned. */}
                    <div
                      className="flex items-center gap-2 px-3 pt-3 pb-2 flex-shrink-0"
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
                      {/* No color dot here - the panel's own top accent bar (borderTop, set from
                          this same `color`) already conveys it, so a second color chip next to
                          the title was redundant. */}
                      <h2
                        id={`mcol-heading-${milestoneId}`}
                        className="text-sm font-semibold"
                        style={{ color: 'var(--text)' }}
                      >
                        {label}
                      </h2>
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                        {pageTasks.length}
                      </span>
                      {milestoneTask?.deadline && (
                        <span className="text-xs ml-auto" style={{ color: 'var(--text-3)' }}>
                          {new Date(milestoneTask.deadline).toLocaleDateString('en', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 pt-2">
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
                              style={{
                                color: 'var(--text-2)',
                                background: `${statusColor}14`,
                              }}
                            >
                              <span
                                className="inline-block flex-shrink-0"
                                style={{
                                  transform: collapsed ? 'rotate(-90deg)' : 'none',
                                  transition: 'transform 0.1s',
                                }}
                              >
                                ▾
                              </span>
                              <span
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{ background: statusColor }}
                              />
                              <span className="truncate flex-1 text-left">{statusLabel}</span>
                              <span
                                style={{
                                  color: 'var(--text-3)',
                                  fontWeight: 400,
                                }}
                              >
                                {children.length}
                              </span>
                            </button>
                            {!collapsed && (
                              <ul className="space-y-2 mb-2">{children.map((t) => renderCard(t, statusCol))}</ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
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
              const boardBg = bgImage ? 'color-mix(in srgb, var(--surface) 88%, transparent)' : boardTint(col.color);
              return (
                <section
                  key={col.id}
                  aria-labelledby={`col-heading-${col.id}`}
                  className="w-full flex-shrink-0 p-3 flex flex-col"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  {/* The "status board" panel - see the milestone-mode branch above for the full
                  three-layer explanation (page background -> this board -> task cards). A thin
                  neutral border plus a colored top accent bar (not a full-strength colored
                  outline) keeps this reading as a compact list card, not a big solid-colored box. */}
                  <div
                    className="rounded-xl flex-1 flex flex-col shadow-sm overflow-hidden"
                    style={{
                      background: boardBg,
                      border: '1px solid var(--border)',
                      borderTop: `3px solid ${col.color}`,
                    }}
                  >
                    {clusters ? (
                      <>
                        {/* A genuine header row - not `position: sticky` layered over the scrolling
                        list (that needed an opaque background faked in to mask cards scrolling
                        underneath, and still only ever covered the list's own padding box, not
                        the panel's full width). Instead, same structure as desktop's
                        KanbanColumn.tsx: a separate flex-shrink-0 row above a separately-
                        scrollable body below, so it's trivially full-bleed edge-to-edge and never
                        has to fight a scroll container's own clipping to stay covered or aligned. */}
                        <div
                          className="flex items-center gap-2 px-3 pt-3 pb-2 flex-shrink-0"
                          style={{ borderBottom: '1px solid var(--border)' }}
                        >
                          <h2
                            id={`col-heading-${col.id}`}
                            className="text-sm font-semibold"
                            style={{ color: 'var(--text)' }}
                          >
                            {col.label}
                          </h2>
                          <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                            {colTasks.length}
                          </span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 pt-2">
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
                                  style={{
                                    color: 'var(--text-2)',
                                    background: `${color}14`,
                                    borderLeft: `3px solid ${color}`,
                                  }}
                                >
                                  <span
                                    className="inline-block flex-shrink-0"
                                    style={{
                                      transform: collapsed ? 'rotate(-90deg)' : 'none',
                                      transition: 'transform 0.1s',
                                    }}
                                  >
                                    ▾
                                  </span>
                                  {!isUnassigned && (
                                    <span
                                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                      style={{ background: color }}
                                    />
                                  )}
                                  <span className="truncate flex-1 text-left">{label}</span>
                                  <span
                                    style={{
                                      color: 'var(--text-3)',
                                      fontWeight: 400,
                                    }}
                                  >
                                    {children.length}
                                  </span>
                                </button>
                                {!collapsed && (
                                  <ul className="space-y-2 mb-2">{children.map((t) => renderCard(t, col))}</ul>
                                )}
                              </div>
                            );
                          })}
                        </div>
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
                        simpleMode={simpleMode}
                      />
                    )}
                  </div>
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
          style={{
            background: 'var(--brand)',
            color: 'white',
            display: 'flex',
            zIndex: 30,
          }}
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
