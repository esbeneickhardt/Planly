/**
 * dnd-kit sortable card representing a single task in a Kanban column.
 * `CardContent` is extracted as an inner component so the same JSX renders both the live card and the drag overlay (which passes static no-op props).
 * Left border colour comes from `task.color`; subtask expand/add controls live directly on the card without opening the detail panel.
 */
import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task, Subtask, KanbanColumn as KanbanColumnType } from '../../types';
import { api, displayName } from '../../api/client';
import { useProduct } from '../../context/ProductContext';
import { useChat } from '../../context/ChatContext';
import { useLongPress } from '../../hooks/useLongPress';
import { QuickStatusMenu } from './KanbanMobileList';

interface Props {
  task: Task;
  onOpenDetail: (task: Task) => void;
  isOverlay?: boolean;
  /** The milestone this task feeds into, if any (never set for a task that's itself a milestone) */
  primaryMilestone?: Task;
  /** This task's own color if it's a milestone, or the color of the milestone it feeds into */
  milestoneColor?: string;
  /** Dense display: title only, everything else (owner, reviewer, milestone, subtasks) hidden */
  simpleMode?: boolean;
  /** All status columns, needed by the hover quick-actions menu below to list status options */
  columns?: KanbanColumnType[];
  /** Omit (or leave undefined) to hide the status-change option in the quick-actions menu, same
   * convention KanbanMobileList.tsx already uses for read-only boards. */
  onQuickStatusChange?: (taskId: string, newStatus: string) => void;
}

function CardContent({
  task,
  onOpenDetail,
  primaryMilestone,
  milestoneColor,
  simpleMode,
  columns,
  onQuickStatusChange,
  expanded,
  setExpanded,
  addingSubtask,
  setAddingSubtask,
  newName,
  setNewName,
  toggleSubtask,
  addSubtask,
}: {
  task: Task;
  onOpenDetail: (task: Task) => void;
  primaryMilestone?: Task;
  milestoneColor?: string;
  simpleMode?: boolean;
  columns?: KanbanColumnType[];
  onQuickStatusChange?: (taskId: string, newStatus: string) => void;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  addingSubtask: boolean;
  setAddingSubtask: (v: boolean) => void;
  newName: string;
  setNewName: (v: string) => void;
  toggleSubtask: (s: Subtask) => void;
  addSubtask: () => void;
}) {
  const doneSubtasks = task.subtasks.filter((s) => s.completed).length;
  const isMilestone = !!task.deadline;
  const { openChat } = useChat();
  // Touch-only - a no-op for mouse users, but lets touchscreen laptops/tablets long-press a card
  // to jump straight into its chat instead of opening the full detail panel first.
  const longPressChat = useLongPress(() => openChat(task.id, task.name));
  // Desktop/mouse equivalent of the long-press above: a hover-revealed trigger (hidden entirely on
  // touch, which already has the long-press) opening the exact same quick-actions menu mobile
  // uses - single click still opens the full detail panel as it always has.
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  return (
    <div className="p-3 relative">
      {columns && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowStatusMenu(true);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Quick actions (change status, open chat)"
            aria-label="Quick actions"
            className="hidden md:flex absolute top-1.5 right-1.5 items-center justify-center w-6 h-6 rounded-md text-sm opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}
          >
            ⋯
          </button>
          {showStatusMenu && (
            <QuickStatusMenu
              columns={columns}
              current={task.status}
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
        </>
      )}
      <button
        onClick={() => onOpenDetail(task)}
        className={`text-sm font-medium text-left w-full leading-snug hover:underline ${simpleMode ? '' : 'mb-1.5'}`}
        style={{ color: 'var(--text)', wordBreak: 'break-word', whiteSpace: 'normal' }}
        title="Long-press to open this task's chat"
        {...longPressChat}
      >
        {task.name}
      </button>

      {!simpleMode && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {task.owner && (
              <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
                <span>{task.owner.avatarEmoji ?? '👤'}</span>
                <span className="max-w-[90px] truncate">{displayName(task.owner)}</span>
              </span>
            )}

            {task.reviewer && (
              <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-3)' }} title="Reviewer">
                <span className="opacity-70">→</span>
                <span>{task.reviewer.avatarEmoji ?? '👤'}</span>
                <span className="max-w-[90px] truncate opacity-90">{displayName(task.reviewer)}</span>
              </span>
            )}

            {isMilestone && (
              <span
                className="text-xs px-1.5 py-0.5 rounded font-medium flex items-center gap-1"
                style={{ background: `${milestoneColor ?? '#f59e0b'}26`, color: milestoneColor ?? '#f59e0b' }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: milestoneColor ?? '#f59e0b' }} />
                Milestone
              </span>
            )}

            {task.subtasks.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
                className="text-xs flex items-center gap-1 transition-opacity"
                style={{ color: 'var(--text-3)' }}
              >
                {expanded ? '▾' : '▸'} {doneSubtasks}/{task.subtasks.length}
              </button>
            )}
          </div>

          {!isMilestone && primaryMilestone && (
            <p className="text-xs truncate mt-1 flex items-center gap-1.5" style={{ color: 'var(--text-3)' }} title={primaryMilestone.name}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: milestoneColor ?? 'var(--text-3)' }} />
              {primaryMilestone.name}
            </p>
          )}
        </>
      )}

      {!simpleMode && expanded && (
        <div className="mt-2.5 pt-2.5 space-y-1.5" style={{ borderTop: '1px solid var(--border)' }}>
          {task.subtasks.map((s) => (
            <label key={s.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={s.completed}
                onChange={() => toggleSubtask(s)}
                className="rounded flex-shrink-0"
                style={{ accentColor: 'var(--brand)' }}
              />
              <span
                className="text-xs"
                style={{
                  color: s.completed ? 'var(--text-3)' : 'var(--text-2)',
                  textDecoration: s.completed ? 'line-through' : 'none',
                }}
              >
                {s.name}
              </span>
            </label>
          ))}

          {addingSubtask ? (
            <div className="flex gap-1.5 mt-1">
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addSubtask();
                  if (e.key === 'Escape') setAddingSubtask(false);
                }}
                placeholder="Subtask name"
                className="input text-xs py-1 flex-1"
              />
              <button onClick={addSubtask} className="text-xs font-medium" style={{ color: 'var(--brand)' }}>
                Add
              </button>
              <button onClick={() => setAddingSubtask(false)} className="text-xs" style={{ color: 'var(--text-3)' }}>
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingSubtask(true)}
              className="text-xs mt-0.5 transition-colors"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
            >
              + Add subtask
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function KanbanCard({
  task,
  onOpenDetail,
  isOverlay = false,
  primaryMilestone,
  milestoneColor,
  simpleMode,
  columns,
  onQuickStatusChange,
}: Props) {
  const { activeProduct, refreshTasks } = useProduct();
  // Subtask expand + inline-add state lives here, not in the detail panel
  const [expanded, setExpanded] = useState(false);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newName, setNewName] = useState('');

  // dnd-kit sortable: card fades to 0 opacity while being dragged (overlay renders in its place)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task' },
  });

  async function toggleSubtask(s: Subtask) {
    if (!activeProduct) return;
    await api.subtasks.update(activeProduct.id, task.id, s.id, { completed: !s.completed });
    await refreshTasks();
  }

  async function addSubtask() {
    if (!newName.trim() || !activeProduct) return;
    await api.subtasks.create(activeProduct.id, task.id, newName.trim());
    setNewName('');
    setAddingSubtask(false);
    await refreshTasks();
  }

  const borderStyle = task.color ? `3px solid ${task.color}` : '3px solid transparent';

  // Overlay render: static, non-interactive clone shown under the cursor during drag
  if (isOverlay) {
    return (
      <div className="card rounded-xl overflow-hidden shadow-2xl" style={{ borderLeft: borderStyle, cursor: 'grabbing' }}>
        <CardContent
          task={task}
          onOpenDetail={() => {}}
          primaryMilestone={primaryMilestone}
          milestoneColor={milestoneColor}
          simpleMode={simpleMode}
          expanded={false}
          setExpanded={() => {}}
          addingSubtask={false}
          setAddingSubtask={() => {}}
          newName=""
          setNewName={() => {}}
          toggleSubtask={() => {}}
          addSubtask={() => {}}
        />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: [transition, 'box-shadow 150ms ease'].filter(Boolean).join(', '),
        opacity: isDragging ? 0 : 1,
        borderLeft: borderStyle,
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      className="card rounded-xl overflow-hidden select-none hover:shadow-md group relative"
    >
      <CardContent
        task={task}
        onOpenDetail={onOpenDetail}
        primaryMilestone={primaryMilestone}
        milestoneColor={milestoneColor}
        simpleMode={simpleMode}
        columns={columns}
        onQuickStatusChange={onQuickStatusChange}
        expanded={expanded}
        setExpanded={setExpanded}
        addingSubtask={addingSubtask}
        setAddingSubtask={setAddingSubtask}
        newName={newName}
        setNewName={setNewName}
        toggleSubtask={toggleSubtask}
        addSubtask={addSubtask}
      />
    </div>
  );
}
