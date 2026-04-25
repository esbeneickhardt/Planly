import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task, Subtask } from '../../types';
import { api } from '../../api/client';
import { useProduct } from '../../context/ProductContext';

interface Props {
  task: Task;
  onOpenDetail: (task: Task) => void;
  isOverlay?: boolean;
}

function CardContent({ task, onOpenDetail, expanded, setExpanded, addingSubtask, setAddingSubtask, newName, setNewName, toggleSubtask, addSubtask }: {
  task: Task;
  onOpenDetail: (task: Task) => void;
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
        className="text-sm font-medium text-left w-full leading-snug hover:underline mb-1.5"
        style={{ color: 'var(--text)', wordBreak: 'break-word', whiteSpace: 'normal' }}
      >
        {task.name}
      </button>

      <div className="flex items-center gap-2 flex-wrap">
        {task.owner && (
          <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
            <span>{task.owner.avatarEmoji ?? '👤'}</span>
            <span className="max-w-[90px] truncate">{task.owner.username}</span>
          </span>
        )}

        {isMilestone && (
          <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
            Milestone
          </span>
        )}

        {task.subtasks.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="text-xs flex items-center gap-1 transition-opacity"
            style={{ color: 'var(--text-3)' }}
          >
            {expanded ? '▾' : '▸'} {doneSubtasks}/{task.subtasks.length}
          </button>
        )}
      </div>

      {expanded && (
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
              <span className="text-xs" style={{
                color: s.completed ? 'var(--text-3)' : 'var(--text-2)',
                textDecoration: s.completed ? 'line-through' : 'none',
              }}>
                {s.name}
              </span>
            </label>
          ))}

          {addingSubtask ? (
            <div className="flex gap-1.5 mt-1">
              <input
                autoFocus type="text" value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addSubtask(); if (e.key === 'Escape') setAddingSubtask(false); }}
                placeholder="Subtask name"
                className="input text-xs py-1 flex-1"
              />
              <button onClick={addSubtask} className="text-xs font-medium" style={{ color: 'var(--brand)' }}>Add</button>
              <button onClick={() => setAddingSubtask(false)} className="text-xs" style={{ color: 'var(--text-3)' }}>✕</button>
            </div>
          ) : (
            <button onClick={() => setAddingSubtask(true)} className="text-xs mt-0.5 transition-colors" style={{ color: 'var(--text-3)' }}
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

export default function KanbanCard({ task, onOpenDetail, isOverlay = false }: Props) {
  const { activeProduct, refreshTasks } = useProduct();
  const [expanded, setExpanded] = useState(false);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newName, setNewName] = useState('');

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

  if (isOverlay) {
    return (
      <div className="card rounded-xl overflow-hidden" style={{ borderLeft: borderStyle, cursor: 'grabbing' }}>
        <CardContent task={task} onOpenDetail={() => {}} expanded={false} setExpanded={() => {}} addingSubtask={false} setAddingSubtask={() => {}} newName="" setNewName={() => {}} toggleSubtask={() => {}} addSubtask={() => {}} />
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
        transition,
        opacity: isDragging ? 0 : 1,
        borderLeft: borderStyle,
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      className="card rounded-xl overflow-hidden select-none"
    >
      <CardContent task={task} onOpenDetail={onOpenDetail} expanded={expanded} setExpanded={setExpanded} addingSubtask={addingSubtask} setAddingSubtask={setAddingSubtask} newName={newName} setNewName={setNewName} toggleSubtask={toggleSubtask} addSubtask={addSubtask} />
    </div>
  );
}
