/**
 * Kanban column that is both a dnd-kit sortable item (column reorder) and a droppable zone (task drops).
 * Two refs are used: `setSortableRef` wires the column drag handle; `setDropRef` wires the task drop zone.
 * Double-clicking the column header activates inline rename; per-column sort mode cycles through 6 options.
 */
import { useState, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Task, KanbanColumn as KanbanColumnType } from '../../types';
import KanbanCard from './KanbanCard';
import { usePermission } from '../../context/PermissionContext';
import type { MilestoneOption } from './KanbanMilestoneFilter';
import { buildMilestoneClusters, UNASSIGNED_CLUSTER } from '../../utils/milestones';
import { SORT_LABELS, SORT_CYCLE, sortTasks, loadColumnSortMode, saveColumnSortMode } from '../../utils/kanbanSort';
import type { SortMode } from '../../utils/kanbanSort';

// Re-exported so existing imports from this file (e.g. KanbanBoard.tsx) keep working unchanged
export { UNASSIGNED_CLUSTER };

interface Props {
  column: KanbanColumnType;
  tasks: Task[];
  onOpenDetail: (task: Task) => void;
  onRename: (columnId: string, label: string) => void;
  onDeleteRequest: (column: KanbanColumnType) => void;
  onAddTask?: (name: string) => Promise<void>;
  isOverlay?: boolean;
  primaryMilestones?: Map<string, Task>;
  milestoneColors?: Map<string, string>;
  simpleMode?: boolean;
  /** Collapsible per-milestone sections within the column, ordered per milestoneOrderIds */
  groupByMilestone?: boolean;
  milestoneOrderIds?: string[];
  milestoneMeta?: Map<string, MilestoneOption>;
  collapsedMilestones?: Set<string>;
  onToggleMilestoneCollapse?: (id: string) => void;
  /** All status columns - passed through to each card's hover quick-actions menu (status list) */
  allColumns?: KanbanColumnType[];
  /** Omit to hide the status-change option in cards' quick-actions menu (e.g. read-only boards) */
  onQuickStatusChange?: (taskId: string, newStatus: string) => void;
}

/**
 * Draggable milestone section header. Its sortable id is namespaced per-column
 * (`hdr:${columnId}:${milestoneId}`) so the same milestone can appear as a distinct draggable in
 * every column without id collisions in the shared board DndContext; KanbanBoard's handleDragEnd
 * reads the real milestone id back out of `data.current.milestoneId` and reorders the single
 * shared order, so a drag in any one column's header list repositions it everywhere.
 */
function SortableMilestoneHeader({
  id,
  milestoneId,
  label,
  color,
  isUnassigned,
  collapsed,
  count,
  onToggleCollapse,
}: {
  id: string;
  milestoneId: string;
  label: string;
  color: string;
  isUnassigned: boolean;
  collapsed: boolean;
  count: number;
  onToggleCollapse: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
    data: { type: 'milestone-header', milestoneId },
    disabled: isUnassigned,
  });
  return (
    <div
      ref={setNodeRef}
      {...(isUnassigned ? {} : { ...attributes, ...listeners })}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        color: 'var(--text-2)',
        background: `${color}14`,
        borderLeft: `3px solid ${color}`,
        cursor: isUnassigned ? 'default' : 'grab',
        touchAction: isUnassigned ? undefined : 'none',
      }}
      className="w-full flex items-center gap-1.5 px-1.5 py-1 mb-1 rounded text-[11px] font-semibold transition-colors select-none"
    >
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onToggleCollapse}
        className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
      >
        <span
          className="inline-block flex-shrink-0"
          style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.1s' }}
        >
          ▾
        </span>
        {!isUnassigned && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />}
        <span className="truncate flex-1">{label}</span>
      </button>
      <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>{count}</span>
    </div>
  );
}

export default function KanbanColumn({
  column,
  tasks,
  onOpenDetail,
  onRename,
  onDeleteRequest,
  onAddTask,
  isOverlay = false,
  primaryMilestones,
  milestoneColors,
  simpleMode,
  groupByMilestone,
  milestoneOrderIds,
  milestoneMeta,
  collapsedMilestones,
  onToggleMilestoneCollapse,
  allColumns,
  onQuickStatusChange,
}: Props) {
  // Sortable (for column reordering)
  const {
    setNodeRef: setSortableRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id, data: { type: 'column' } });

  // Droppable (for task drops)
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: column.statusKey, data: { type: 'column-drop' } });

  const { canWrite } = usePermission();
  const readOnly = !canWrite('kanban');

  // Column UI state
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(column.label);
  const [sortMode, setSortMode] = useState<SortMode>(() => loadColumnSortMode(column.id));
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  async function submitQuickAdd() {
    const name = newTaskName.trim();
    if (!name || !onAddTask) return;
    setSubmitting(true);
    try {
      await onAddTask(name);
      setNewTaskName('');
      setAddingTask(false);
    } finally {
      setSubmitting(false);
    }
  }

  function openQuickAdd() {
    setAddingTask(true);
    setTimeout(() => addInputRef.current?.focus(), 0);
  }

  function cancelQuickAdd() {
    setAddingTask(false);
    setNewTaskName('');
  }

  const sortedTasks = sortTasks(tasks, sortMode);

  // Partition this column's (already-sorted) tasks into collapsible per-milestone sections - see
  // buildMilestoneClusters' own doc comment for why a milestone task still appears as a card.
  const clusters = groupByMilestone
    ? buildMilestoneClusters(sortedTasks, primaryMilestones ?? new Map(), milestoneOrderIds ?? [])
    : null;

  function renderCard(task: Task) {
    const primaryMilestone = primaryMilestones?.get(task.id);
    const milestoneColor = task.deadline
      ? milestoneColors?.get(task.id)
      : primaryMilestone
        ? milestoneColors?.get(primaryMilestone.id)
        : undefined;
    return (
      <KanbanCard
        key={task.id}
        task={task}
        onOpenDetail={onOpenDetail}
        primaryMilestone={primaryMilestone}
        milestoneColor={milestoneColor}
        simpleMode={simpleMode}
        columns={allColumns}
        onQuickStatusChange={onQuickStatusChange}
      />
    );
  }

  function commitRename() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== column.label) onRename(column.id, trimmed);
    else setDraft(column.label);
  }

  const colStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div
      ref={setSortableRef}
      style={isOverlay ? {} : colStyle}
      className="flex flex-col w-72 flex-shrink-0 rounded-xl overflow-visible"
      {...(isOverlay ? {} : {})}
    >
      <div
        className="rounded-xl flex flex-col h-full"
        // Colored by the column's own status color (blue for To Do, etc.) - matches the Milestone
        // columns view's own 2px colored border exactly, instead of the plain neutral gray this had
        // before, so status columns get the same "cool" colored look.
        style={{ background: 'var(--surface-2)', border: `2px solid ${column.color}` }}
      >
        {/* Column header - drag handle for column reordering */}
        <div
          className="px-3 pt-3 pb-2 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)', cursor: isOverlay ? 'grabbing' : 'grab' }}
          {...(isOverlay ? {} : { ...attributes, ...listeners })}
          onDoubleClick={(e) => {
            // Stop drag-start from propagating when double-clicking to rename
            e.stopPropagation();
            setEditing(true);
            setTimeout(() => inputRef.current?.select(), 0);
          }}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: column.color }} />

            {editing ? (
              <input
                ref={inputRef}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- field just revealed by double-clicking the column title to rename it
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') {
                    setDraft(column.label);
                    setEditing(false);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 text-sm font-semibold bg-transparent border-b outline-none"
                style={{ color: 'var(--text)', borderColor: column.color, cursor: 'text' }}
              />
            ) : (
              <h2
                className="text-sm font-semibold flex-1 select-none"
                style={{ color: 'var(--text)' }}
                title="Drag to reorder · Double-click to rename"
              >
                {column.label}
              </h2>
            )}

            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0"
              style={{ background: 'var(--surface)', color: 'var(--text-3)' }}
            >
              {tasks.length}
            </span>

            {/* Sort menu */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only guard against the column header's drag/rename handlers */}
            <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setShowSortMenu((s) => !s)}
                className="text-xs px-1.5 py-0.5 rounded transition-colors"
                style={{
                  color: sortMode !== 'default' ? column.color : 'var(--text-3)',
                  background: sortMode !== 'default' ? `${column.color}18` : 'transparent',
                }}
                title="Sort column"
              >
                ⇅
              </button>
              {showSortMenu && (
                <div
                  className="absolute right-0 top-full mt-1 rounded-lg shadow-xl z-30 py-1 overflow-hidden"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 140 }}
                  onMouseLeave={() => setShowSortMenu(false)}
                >
                  {SORT_CYCLE.map((mode) => (
                    <button
                      key={mode}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        setSortMode(mode);
                        saveColumnSortMode(column.id, mode);
                        setShowSortMenu(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs transition-colors"
                      style={{
                        color: sortMode === mode ? column.color : 'var(--text-2)',
                        background: sortMode === mode ? `${column.color}12` : 'transparent',
                        fontWeight: sortMode === mode ? 600 : 400,
                      }}
                    >
                      {SORT_LABELS[mode]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Delete - only for non-completion columns */}
            {!column.isDone && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteRequest(column);
                }}
                className="text-xs transition-all flex-shrink-0"
                style={{ color: 'var(--text-3)', opacity: 0.35 }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ef4444';
                  e.currentTarget.style.opacity = '1';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-3)';
                  e.currentTarget.style.opacity = '0.35';
                }}
                title="Delete column"
              >
                ✕
              </button>
            )}
          </div>

          {sortMode !== 'default' && (
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-[10px]" style={{ color: column.color }}>
                ↕ {SORT_LABELS[sortMode]}
              </span>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setSortMode('default');
                  try {
                    localStorage.removeItem(`planly-col-sort-${column.id}`);
                  } catch {}
                }}
                className="text-[10px] underline"
                style={{ color: 'var(--text-3)' }}
              >
                reset
              </button>
            </div>
          )}
        </div>

        {/* Task drop zone */}
        <div
          ref={setDropRef}
          className="group flex-1 p-2.5 space-y-2 min-h-28 rounded-b-xl transition-colors duration-150"
          style={{ background: isOver ? `${column.color}15` : 'transparent' }}
        >
          {/* Quick-add form - pinned to top of column */}
          {!isOverlay &&
            onAddTask &&
            !readOnly &&
            (addingTask ? (
              <div
                className="mb-1 rounded-lg overflow-hidden"
                style={{ border: `1px solid ${column.color}`, background: 'var(--surface)' }}
              >
                <input
                  ref={addInputRef}
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitQuickAdd();
                    }
                    if (e.key === 'Escape') cancelQuickAdd();
                  }}
                  onBlur={() => {
                    if (!newTaskName.trim()) cancelQuickAdd();
                  }}
                  placeholder="Task name…"
                  className="w-full px-2.5 py-2 text-xs bg-transparent outline-none"
                  style={{ color: 'var(--text)' }}
                />
                <div className="flex gap-1 px-2 pb-2">
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={submitQuickAdd}
                    disabled={submitting || !newTaskName.trim()}
                    className="text-xs px-2.5 py-1 rounded font-medium transition-colors"
                    style={{
                      background: column.color,
                      color: 'white',
                      opacity: submitting || !newTaskName.trim() ? 0.5 : 1,
                    }}
                  >
                    {submitting ? '…' : 'Add'}
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={cancelQuickAdd}
                    className="text-xs px-2 py-1 rounded transition-colors"
                    style={{ color: 'var(--text-3)' }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={openQuickAdd}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-all mb-1"
                style={{ color: 'var(--text-3)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface)';
                  e.currentTarget.style.color = column.color;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-3)';
                }}
              >
                <span className="text-sm leading-none">+</span>
                New task
              </button>
            ))}

          {clusters ? (
            <SortableContext
              items={clusters.filter((s) => s.id !== UNASSIGNED_CLUSTER).map((s) => `hdr:${column.id}:${s.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {clusters.map(({ id, children }) => {
                const isUnassigned = id === UNASSIGNED_CLUSTER;
                const meta = isUnassigned ? null : milestoneMeta?.get(id);
                const label = isUnassigned ? 'No milestone' : (meta?.name ?? 'Milestone');
                const color = isUnassigned ? 'var(--text-3)' : (meta?.color ?? 'var(--text-3)');
                const collapsed = collapsedMilestones?.has(id) ?? false;
                return (
                  <div key={id}>
                    <SortableMilestoneHeader
                      id={`hdr:${column.id}:${id}`}
                      milestoneId={id}
                      label={label}
                      color={color}
                      isUnassigned={isUnassigned}
                      collapsed={collapsed}
                      count={children.length}
                      onToggleCollapse={() => onToggleMilestoneCollapse?.(id)}
                    />
                    {!collapsed && (
                      <SortableContext items={children.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2 mb-2">{children.map(renderCard)}</div>
                      </SortableContext>
                    )}
                  </div>
                );
              })}
            </SortableContext>
          ) : (
            <SortableContext items={sortedTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {sortedTasks.map(renderCard)}
            </SortableContext>
          )}
          {tasks.length === 0 && !addingTask && (
            <div
              className="flex items-center justify-center h-16 rounded-lg border-2 border-dashed"
              style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
            >
              <span className="text-xs">Drop here</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
