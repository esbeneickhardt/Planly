/**
 * "Milestone columns" board view - the Trello-style alternative to the normal status-column board
 * (`KanbanColumn.tsx`), used when Execute's view mode is flipped: columns are milestones instead
 * of statuses, and cards are grouped into collapsible per-status sections instead (the mirror
 * image of the normal board's optional "Group by milestone" clustering).
 *
 * The milestone task itself is included as a card in its own status section - same reasoning as
 * `buildMilestoneClusters`: cards carry inline actions (subtask toggling, opening detail) that a
 * header-only summary can't provide. It can only be dragged between status sections WITHIN this
 * column (an ordinary status change) - `KanbanBoard.tsx`'s drag handler never fires the
 * milestone-reassignment mutation for a task that is itself a milestone.
 *
 * Column reordering reuses the exact `milestone-header` drag type already handled by
 * `KanbanBoard.tsx`'s `handleDragEnd` for cluster-header reordering, so this "column" is just
 * another draggable with that same `data.type` - no new drag-type handling needed for reordering.
 */
import { useDroppable } from '@dnd-kit/core';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task, KanbanColumn as KanbanColumnType } from '../../types';
import KanbanCard from './KanbanCard';
import { buildStatusClusters } from '../../utils/milestones';

interface Props {
  /** Real milestone task id, or the UNASSIGNED_CLUSTER sentinel for the "No milestone" column */
  milestoneId: string;
  /** null for the "No milestone" column */
  milestone: Task | null;
  /** This milestone's tasks (incl. the milestone task itself), already board-filtered */
  tasks: Task[];
  columns: KanbanColumnType[];
  color: string;
  onOpenDetail: (task: Task) => void;
  primaryMilestones: Map<string, Task>;
  milestoneColors: Map<string, string>;
  simpleMode?: boolean;
  collapsedStatuses: Set<string>;
  onToggleStatusCollapse: (statusKey: string) => void;
  isOverlay?: boolean;
  /** Omit to hide the status-change option in cards' quick-actions menu (e.g. read-only boards) */
  onQuickStatusChange?: (taskId: string, newStatus: string) => void;
}

function StatusSection({
  statusKey,
  milestoneId,
  label,
  color,
  tasks,
  collapsed,
  onToggleCollapse,
  renderCard,
}: {
  statusKey: string;
  milestoneId: string;
  label: string;
  color: string;
  tasks: Task[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  renderCard: (task: Task) => React.ReactNode;
}) {
  // The droppable spans the header + body (not just the body) so a card can be dropped onto a
  // COLLAPSED section too - if the drop zone only existed while expanded, a collapsed-by-default
  // section (e.g. Done) would be impossible to drag into without first opening it.
  const { setNodeRef, isOver } = useDroppable({
    id: `mcol:${milestoneId}:${statusKey}`,
    data: { type: 'column-drop', statusKey, milestoneId },
  });
  return (
    <div
      ref={setNodeRef}
      className="rounded-lg transition-colors"
      style={{ background: isOver ? `${color}15` : 'transparent' }}
    >
      <button
        onClick={onToggleCollapse}
        className="w-full flex items-center gap-1.5 px-1.5 py-1 mb-1 rounded text-[11px] font-semibold transition-colors"
        style={{ color: 'var(--text-2)', background: `${color}14` }}
      >
        <span
          className="inline-block flex-shrink-0"
          style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.1s' }}
        >
          ▾
        </span>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="truncate flex-1 text-left">{label}</span>
        <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>{tasks.length}</span>
      </button>
      {!collapsed && (
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2 mb-2">{tasks.map(renderCard)}</div>
        </SortableContext>
      )}
    </div>
  );
}

export default function KanbanMilestoneColumn({
  milestoneId,
  milestone,
  tasks,
  columns,
  color,
  onOpenDetail,
  primaryMilestones,
  milestoneColors,
  simpleMode,
  collapsedStatuses,
  onToggleStatusCollapse,
  isOverlay = false,
  onQuickStatusChange,
}: Props) {
  const isUnassigned = milestone === null;
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: milestoneId,
    data: { type: 'milestone-header', milestoneId },
    disabled: isUnassigned,
  });

  const clusters = buildStatusClusters(tasks, columns);

  function renderCard(task: Task) {
    const primaryMilestone = task.deadline ? undefined : primaryMilestones.get(task.id);
    const milestoneColor = task.deadline
      ? milestoneColors.get(task.id)
      : primaryMilestone
        ? milestoneColors.get(primaryMilestone.id)
        : undefined;
    return (
      <KanbanCard
        key={task.id}
        task={task}
        onOpenDetail={onOpenDetail}
        primaryMilestone={primaryMilestone}
        milestoneColor={milestoneColor}
        simpleMode={simpleMode}
        columns={columns}
        onQuickStatusChange={onQuickStatusChange}
      />
    );
  }

  const colStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={isOverlay ? {} : colStyle}
      className="flex flex-col w-72 flex-shrink-0 rounded-xl overflow-visible"
    >
      <div
        className="rounded-xl flex flex-col h-full"
        style={{
          background: 'var(--surface-2)',
          border: `${isUnassigned ? '1px solid var(--border)' : `2px solid ${color}`}`,
        }}
      >
        {/* Column header - drag handle for milestone reordering (shared with Gantt's own order) */}
        <div
          className="px-3 pt-3 pb-2 flex-shrink-0 flex items-start gap-2"
          style={{
            borderBottom: '1px solid var(--border)',
            cursor: isUnassigned || isOverlay ? 'default' : 'grab',
          }}
          {...(isUnassigned || isOverlay ? {} : { ...attributes, ...listeners })}
        >
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
              {isUnassigned ? 'No milestone' : milestone!.name}
            </h2>
            {!isUnassigned && milestone?.deadline && (
              <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                {new Date(milestone.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
          <span
            className="text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0"
            style={{ background: 'var(--surface)', color: 'var(--text-3)' }}
          >
            {tasks.length}
          </span>
          {!isUnassigned && milestone && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetail(milestone);
              }}
              className="text-xs flex-shrink-0"
              style={{ color: 'var(--text-3)' }}
              title="Open milestone task"
            >
              ↗
            </button>
          )}
        </div>

        {/* Status sections */}
        <div className="flex-1 p-2.5 space-y-1 min-h-28 rounded-b-xl">
          {clusters.map(({ statusKey, label, color: statusColor, children }) => (
            <StatusSection
              key={statusKey}
              statusKey={statusKey}
              milestoneId={milestoneId}
              label={label}
              color={statusColor}
              tasks={children}
              collapsed={collapsedStatuses.has(statusKey)}
              onToggleCollapse={() => onToggleStatusCollapse(statusKey)}
              renderCard={renderCard}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
