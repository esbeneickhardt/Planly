/**
 * dnd-kit sortable card representing a single task in a Kanban column.
 * `CardContent` is extracted as an inner component so the same JSX renders both the live card and the drag overlay (which passes static no-op props).
 * Left border colour comes from `task.color`; subtask expand/add controls live directly on the card without opening the detail panel.
 */
import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task, Subtask } from '../../types';
import { api, displayName } from '../../api/client';
import { useProduct } from '../../context/ProductContext';

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
}

function CardContent({
  task,
  onOpenDetail,
  primaryMilestone,
  milestoneColor,
  simpleMode,
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

  return (
    <div className="p-3">
      <button
        onClick={() => onOpenDetail(task)}
        className={`text-sm font-medium text-left w-full leading-snug hover:underline ${simpleMode ? '' : 'mb-1.5'}`}
        style={{ color: 'var(--text)', wordBreak: 'break-word', whiteSpace: 'normal' }}
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
      className="card rounded-xl overflow-hidden select-none hover:shadow-md"
    >
      <CardContent
        task={task}
        onOpenDetail={onOpenDetail}
        primaryMilestone={primaryMilestone}
        milestoneColor={milestoneColor}
        simpleMode={simpleMode}
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
