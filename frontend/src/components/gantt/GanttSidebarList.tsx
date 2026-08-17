/**
 * Desktop Gantt's left name column (sticky to the left edge): sub-plan names, the drag-reorderable
 * milestone list, and the product/final-delivery row - mirrors the bar rows GanttTimelineBars
 * renders to their right, row-for-row, so the two stay visually aligned. The milestone list owns
 * its own DndContext (sensors/onDragEnd are still wired by GanttPage, which shares the same
 * `handleMilestoneDragEnd`/order-persistence with GanttMobileList's card list).
 */
import { DndContext, DragEndEvent, closestCenter, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { displayName } from '../../api/client';
import type { MilestoneResult, Sprint } from '../../api/client';
import type { Product, Task } from '../../types';
import { progressColor } from './GanttMobileList';

type GanttView = 'milestones' | 'sprints';

interface Props {
  ganttView: GanttView;
  sidebarWidth: number;
  activeProduct: Product;
  sprints: Sprint[];
  tasks: Task[];
  visibleMilestones: MilestoneResult[];
  milestoneDragSensors: ReturnType<typeof useSensors>;
  onMilestoneDragEnd: (event: DragEndEvent) => void;
  hoveredSprint: string | null;
  setHoveredSprint: (id: string | null) => void;
  hoveredMilestone: string | null;
  setHoveredMilestone: (id: string | null) => void;
  hoveredProduct: boolean;
  setHoveredProduct: (v: boolean) => void;
  setSelectedTask: (task: Task | null) => void;
  rowHeight: number;
}

export default function GanttSidebarList({
  ganttView,
  sidebarWidth,
  activeProduct,
  sprints,
  tasks,
  visibleMilestones,
  milestoneDragSensors,
  onMilestoneDragEnd,
  hoveredSprint,
  setHoveredSprint,
  hoveredMilestone,
  setHoveredMilestone,
  hoveredProduct,
  setHoveredProduct,
  setSelectedTask,
  rowHeight: ROW_H,
}: Props) {
  return (
    <div
      className="flex-shrink-0 sticky left-0 z-10"
      style={{
        width: sidebarWidth,
        borderRight: '1px solid var(--border)',
        background: 'var(--surface)',
      }}
    >
      {ganttView === 'sprints' &&
        sprints.map((s) => {
          const sprintTasks = tasks.filter((t) => s.taskIds.includes(t.id));
          const doneTasks = sprintTasks.filter((t) => t.status === 'done' || !!t.completedAt);
          return (
            <div
              key={s.id}
              className="px-3 flex flex-col justify-center cursor-default transition-colors"
              style={{
                height: ROW_H,
                borderBottom: '1px solid var(--border)',
                background: hoveredSprint === s.id ? 'var(--surface-2)' : 'transparent',
              }}
              onMouseEnter={() => setHoveredSprint(s.id)}
              onMouseLeave={() => setHoveredSprint(null)}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                <p
                  className="text-xs font-medium leading-tight min-w-0"
                  title={s.name}
                  style={{
                    color: 'var(--text)',
                    display: '-webkit-box',
                    WebkitLineClamp: 1,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {s.name}
                </p>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {new Date(s.startDate).toLocaleDateString('en', {
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  –{' '}
                  {new Date(s.endDate).toLocaleDateString('en', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                  ·
                </span>
                <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {doneTasks.length}/{sprintTasks.length} done
                </span>
              </div>
            </div>
          );
        })}
      {ganttView === 'sprints' && sprints.length === 0 && (
        <div className="px-3 py-5 flex flex-col gap-1.5">
          <p className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            No sub-plans yet
          </p>
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
            Create sprints in the <strong style={{ color: 'var(--text-2)' }}>Plan</strong> view to see them plotted as
            windows on the timeline.
          </p>
        </div>
      )}
      {ganttView === 'milestones' && (
        <DndContext sensors={milestoneDragSensors} collisionDetection={closestCenter} onDragEnd={onMilestoneDragEnd}>
          <SortableContext items={visibleMilestones.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            {visibleMilestones.map((m) => (
              <SortableMilestoneRow
                key={m.id}
                milestone={m}
                height={ROW_H}
                isHovered={hoveredMilestone === m.id}
                onMouseEnter={() => setHoveredMilestone(m.id)}
                onMouseLeave={() => setHoveredMilestone(null)}
                onClick={() => {
                  const t = tasks.find((t) => t.id === m.id);
                  if (t) setSelectedTask(t);
                }}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}

      {/* Product / Final Delivery row - milestones view only */}
      {ganttView === 'milestones' && (
        <div
          className="px-3 flex flex-col justify-center gap-1 cursor-default"
          style={{
            height: ROW_H,
            borderBottom: '1px solid var(--border)',
            background: hoveredProduct ? 'var(--surface-2)' : 'transparent',
          }}
          onMouseEnter={() => setHoveredProduct(true)}
          onMouseLeave={() => setHoveredProduct(false)}
        >
          <p
            className="text-xs font-semibold leading-tight"
            title={`${activeProduct.emoji ?? ''} ${activeProduct.name}`}
            style={{
              color: 'var(--text)',
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {activeProduct.emoji} {activeProduct.name}
          </p>
        </div>
      )}
    </div>
  );
}

// One row in the draggable sidebar milestone list. A plain click still opens the task (dnd-kit's
// distance-based activation constraint on the sensors means a click that doesn't move the pointer
// never starts a drag), same click/drag split used by Kanban's cards and columns.
function SortableMilestoneRow({
  milestone: m,
  height,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  milestone: MilestoneResult;
  height: number;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: m.id });
  const color = progressColor(m);
  const isDone = m.status === 'done';

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- `attributes` (spread below) already gives this row role="button"/tabIndex from dnd-kit's useSortable; adding our own Enter/Space handler for onClick would conflict with dnd-kit's own keyboard drag-and-drop, which uses those same keys to lift/drop the row
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="px-3 flex flex-col justify-center cursor-pointer transition-colors"
      style={{
        height,
        borderBottom: '1px solid var(--border)',
        background: isHovered ? 'var(--surface-2)' : 'transparent',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5">
        {isDone && (
          <span
            className="flex-shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold"
            style={{ background: '#10b981', color: 'white' }}
          >
            ✓
          </span>
        )}
        <p
          className="text-xs font-medium leading-tight min-w-0"
          title={m.name}
          style={{
            color: isDone ? 'var(--text-3)' : 'var(--text)',
            textDecoration: isDone ? 'line-through' : 'none',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {m.name}
        </p>
      </div>
      {!isDone && (
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
          <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            {m.doneDependencies}/{m.totalDependencies || 0} done
          </span>
          {m.owner && (
            <span className="text-[11px] truncate" style={{ color: 'var(--text-3)' }}>
              · {m.owner.avatarEmoji ?? '👤'} {displayName(m.owner)}
            </span>
          )}
        </div>
      )}
      {isDone && (
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-[11px]" style={{ color: '#10b981' }}>
            {new Date(m.deadline).toLocaleDateString('en', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </div>
      )}
    </div>
  );
}
