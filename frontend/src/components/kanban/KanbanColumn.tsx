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

type SortMode = 'default' | 'alpha-asc' | 'alpha-desc' | 'deadline' | 'oldest' | 'newest';

interface Props {
  column: KanbanColumnType;
  tasks: Task[];
  onOpenDetail: (task: Task) => void;
  onRename: (columnId: string, label: string) => void;
  onDeleteRequest: (column: KanbanColumnType) => void;
  onAddTask?: (name: string) => Promise<void>;
  isOverlay?: boolean;
}

const SORT_LABELS: Record<SortMode, string> = {
  default:     'Custom (drag order)',
  'alpha-asc':  'A → Z',
  'alpha-desc': 'Z → A',
  deadline:    'Deadline',
  oldest:      'Oldest first',
  newest:      'Newest first',
};
const SORT_CYCLE: SortMode[] = ['default', 'alpha-asc', 'alpha-desc', 'deadline', 'oldest', 'newest'];

function sortTasks(tasks: Task[], mode: SortMode): Task[] {
  if (mode === 'default') return tasks;
  return [...tasks].sort((a, b) => {
    if (mode === 'alpha-asc')  return a.name.localeCompare(b.name);
    if (mode === 'alpha-desc') return b.name.localeCompare(a.name);
    if (mode === 'deadline') {
      if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return a.kanbanOrder - b.kanbanOrder;
    }
    if (mode === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export default function KanbanColumn({ column, tasks, onOpenDetail, onRename, onDeleteRequest, onAddTask, isOverlay = false }: Props) {
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
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const saved = localStorage.getItem(`planly-col-sort-${column.id}`) as SortMode | null;
    return saved && SORT_CYCLE.includes(saved) ? saved : 'default';
  });
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
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
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
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraft(column.label); setEditing(false); } }}
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

            <span className="text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'var(--surface)', color: 'var(--text-3)' }}>
              {tasks.length}
            </span>

            {/* Sort menu */}
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
                      onClick={() => { setSortMode(mode); try { localStorage.setItem(`planly-col-sort-${column.id}`, mode); } catch {} setShowSortMenu(false); }}
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
                onClick={(e) => { e.stopPropagation(); onDeleteRequest(column); }}
                className="text-xs transition-all flex-shrink-0"
                style={{ color: 'var(--text-3)', opacity: 0.35 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.opacity = '1'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.opacity = '0.35'; }}
                title="Delete column"
              >
                ✕
              </button>
            )}
          </div>

          {sortMode !== 'default' && (
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-[10px]" style={{ color: column.color }}>↕ {SORT_LABELS[sortMode]}</span>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => { setSortMode('default'); try { localStorage.removeItem(`planly-col-sort-${column.id}`); } catch {} }}
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
          {!isOverlay && onAddTask && !readOnly && (
            addingTask ? (
              <div className="mb-1 rounded-lg overflow-hidden" style={{ border: `1px solid ${column.color}`, background: 'var(--surface)' }}>
                <input
                  ref={addInputRef}
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); submitQuickAdd(); }
                    if (e.key === 'Escape') cancelQuickAdd();
                  }}
                  onBlur={() => { if (!newTaskName.trim()) cancelQuickAdd(); }}
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
                    style={{ background: column.color, color: 'white', opacity: submitting || !newTaskName.trim() ? 0.5 : 1 }}
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
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = column.color; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)'; }}
              >
                <span className="text-sm leading-none">+</span>
                New task
              </button>
            )
          )}

          <SortableContext items={sortedTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {sortedTasks.map((task) => (
              <KanbanCard key={task.id} task={task} onOpenDetail={onOpenDetail} />
            ))}
          </SortableContext>
          {tasks.length === 0 && !addingTask && (
            <div className="flex items-center justify-center h-16 rounded-lg border-2 border-dashed" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
              <span className="text-xs">Drop here</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
