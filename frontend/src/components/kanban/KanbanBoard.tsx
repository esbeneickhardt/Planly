import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverlay,
  MouseSensor, TouchSensor, useSensor, useSensors,
  pointerWithin,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import type { Task, KanbanColumn as KanbanColumnType, User } from '../../types';
import { api } from '../../api/client';
import { useProduct } from '../../context/ProductContext';
import { useColorLegend } from '../../hooks/useColorLegend';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import TaskDetailPanel from '../common/TaskDetailPanel';
import Modal from '../common/Modal';

const FILTER_COLORS = ['#7c3aed','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#f97316'];

export default function KanbanBoard() {
  const { activeProduct, tasks, refreshTasks, createTask } = useProduct();
  const [columns, setColumns] = useState<KanbanColumnType[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeColumn, setActiveColumn] = useState<KanbanColumnType | null>(null);
  const [toast, setToast] = useState('');
  const [showNewTask, setShowNewTask] = useState(false);
  const [showNewColumn, setShowNewColumn] = useState(false);
  const [pendingDeleteCol, setPendingDeleteCol] = useState<KanbanColumnType | null>(null);
  const [newTaskName, setNewTaskName] = useState('');
  const [newColLabel, setNewColLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Multi-select filters
  const [ownerFilters, setOwnerFilters] = useState<Set<string>>(new Set());
  const [colorFilters, setColorFilters] = useState<Set<string>>(new Set());
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
  const [users, setUsers] = useState<User[]>([]);

  const { legend: colorLegend } = useColorLegend(activeProduct?.id ?? '');

  // Board pan-scroll
  const boardRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, scrollLeft: 0 });

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  useEffect(() => { api.users.list().then(setUsers).catch(() => {}); }, []);

  const loadColumns = useCallback(async () => {
    if (!activeProduct) return;
    const cols = await api.columns.list(activeProduct.id);
    setColumns(cols);
  }, [activeProduct]);

  useEffect(() => { loadColumns(); }, [loadColumns]);

  const taskOwners = useMemo(() => {
    const ids = new Set(tasks.filter((t) => t.ownerId).map((t) => t.ownerId!));
    return users.filter((u) => ids.has(u.id));
  }, [tasks, users]);

  const taskColors = useMemo(() => {
    const used = new Set(tasks.filter((t) => t.color).map((t) => t.color!));
    return FILTER_COLORS.filter((c) => used.has(c));
  }, [tasks]);

  const visibleStatusKeys = useMemo(() => new Set(columns.map((c) => c.statusKey)), [columns]);

  const hasFilters = ownerFilters.size > 0 || colorFilters.size > 0;

  const filteredTasks = useMemo(() =>
    tasks.filter((t) => {
      if (!visibleStatusKeys.has(t.status)) return false;
      if (ownerFilters.size > 0 && (!t.ownerId || !ownerFilters.has(t.ownerId))) return false;
      if (colorFilters.size > 0 && (!t.color || !colorFilters.has(t.color))) return false;
      return true;
    }),
    [tasks, visibleStatusKeys, ownerFilters, colorFilters]
  );

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  function toggleOwner(id: string) {
    setOwnerFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleColor(c: string) {
    setColorFilters((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }

  // Board horizontal pan
  function onBoardMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    // Only pan on the board background, not on cards/columns
    const target = e.target as HTMLElement;
    if (target.closest('.kanban-col') || target.closest('.kanban-card-wrap')) return;
    if (e.button !== 0) return;
    isPanning.current = true;
    panStart.current = { x: e.pageX, scrollLeft: boardRef.current?.scrollLeft ?? 0 };
    if (boardRef.current) boardRef.current.style.cursor = 'grabbing';
    e.preventDefault();
  }

  function onBoardMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!isPanning.current || !boardRef.current) return;
    const dx = e.pageX - panStart.current.x;
    boardRef.current.scrollLeft = panStart.current.scrollLeft - dx;
  }

  function onBoardMouseUp() {
    isPanning.current = false;
    if (boardRef.current) boardRef.current.style.cursor = '';
  }

  // DnD handlers
  function onDragStart(event: DragStartEvent) {
    const type = event.active.data.current?.type;
    if (type === 'column') {
      setActiveColumn(columns.find((c) => c.id === event.active.id) ?? null);
    } else {
      setActiveTask(tasks.find((t) => t.id === event.active.id) ?? null);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    setActiveColumn(null);
    if (!over || !activeProduct) return;

    const activeType = active.data.current?.type;

    // ── Column reorder ──
    if (activeType === 'column') {
      const fromId = active.id as string;
      const toId = over.id as string;
      if (fromId === toId) return;
      const oldIdx = columns.findIndex((c) => c.id === fromId);
      const newIdx = columns.findIndex((c) => c.id === toId);
      if (oldIdx === -1 || newIdx === -1) return;
      const reordered = arrayMove(columns, oldIdx, newIdx);
      setColumns(reordered); // optimistic
      try {
        await api.columns.reorder(activeProduct.id, reordered.map((c, i) => ({ id: c.id, order: i })));
      } catch {
        await loadColumns(); // rollback
      }
      return;
    }

    // ── Task move ──
    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // over.id might be a column statusKey or another task id
    const targetStatusKey = (() => {
      const col = columns.find((c) => c.statusKey === (over.id as string));
      if (col) return col.statusKey;
      const otherTask = tasks.find((t) => t.id === (over.id as string));
      return otherTask?.status ?? null;
    })();

    if (!targetStatusKey || task.status === targetStatusKey) return;
    if (!task.ownerId && targetStatusKey === 'todo') {
      showToast('Assign an owner before moving to To Do.');
      return;
    }
    try {
      await api.tasks.update(activeProduct.id, taskId, { status: targetStatusKey });
      await refreshTasks();
    } catch (err) { showToast((err as Error).message); }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskName.trim()) return;
    setCreating(true);
    try { await createTask({ name: newTaskName.trim() }); setNewTaskName(''); setShowNewTask(false); }
    finally { setCreating(false); }
  }

  async function handleCreateColumn(e: React.FormEvent) {
    e.preventDefault();
    if (!newColLabel.trim() || !activeProduct) return;
    setCreating(true);
    try {
      await api.columns.create(activeProduct.id, { label: newColLabel.trim() });
      await loadColumns();
      setNewColLabel('');
      setShowNewColumn(false);
    } finally { setCreating(false); }
  }

  async function handleRenameColumn(columnId: string, label: string) {
    if (!activeProduct) return;
    try { await api.columns.update(activeProduct.id, columnId, { label }); await loadColumns(); }
    catch (err) { showToast((err as Error).message); }
  }

  async function handleDeleteColumn() {
    if (!pendingDeleteCol || !activeProduct) return;
    setDeleting(true);
    try {
      await api.columns.delete(activeProduct.id, pendingDeleteCol.id);
      await Promise.all([loadColumns(), refreshTasks()]);
      setPendingDeleteCol(null);
    } catch (err) { showToast((err as Error).message); }
    finally { setDeleting(false); }
  }

  if (!activeProduct) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ color: 'var(--text-3)' }}>
        <div className="text-5xl opacity-30">▦</div>
        <p className="text-sm">Create a product to get started</p>
      </div>
    );
  }

  const pendingTaskCount = pendingDeleteCol
    ? tasks.filter((t) => t.status === pendingDeleteCol.statusKey).length
    : 0;

  return (
    <div className="h-full flex flex-col">
      {/* ── Header ── */}
      <div className="flex-shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>

        {/* Title row */}
        <div className="px-6 flex items-center gap-3 min-w-0" style={{ height: 56 }}>
          {activeProduct.emoji && <span className="text-xl flex-shrink-0">{activeProduct.emoji}</span>}
          <h1 className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{activeProduct.name}</h1>
          <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
            {filteredTasks.length}{hasFilters ? ' filtered' : ''}
          </span>
        </div>

        {/* Filter bar — New task sits at the far right, vertically aligned with filters */}
        <div className="px-6 pb-2.5 flex items-center gap-3">
          {/* filters take the left side */}
          <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
          {/* Reset */}
          <button
            onClick={() => { setOwnerFilters(new Set()); setColorFilters(new Set()); }}
            className="text-xs flex items-center gap-1 px-2 py-1 rounded-md transition-all flex-shrink-0"
            style={{
              color: hasFilters ? 'var(--brand)' : 'var(--text-3)',
              background: hasFilters ? 'var(--brand-subtle)' : 'transparent',
              border: `1px solid ${hasFilters ? 'var(--brand)' : 'var(--border)'}`,
              opacity: hasFilters ? 1 : 0.45,
              cursor: hasFilters ? 'pointer' : 'default',
            }}
          >
            ↺ Reset
          </button>

          {/* Owner filter — compact dropdown */}
          {taskOwners.length > 0 && (
            <div className="relative flex items-center gap-1.5 flex-shrink-0">
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>Owner</span>
              <button
                onClick={() => setShowOwnerDropdown((v) => !v)}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-all"
                style={{
                  background: ownerFilters.size > 0 ? 'var(--brand-subtle)' : 'var(--surface-2)',
                  color: ownerFilters.size > 0 ? 'var(--brand)' : 'var(--text-2)',
                  border: `1px solid ${ownerFilters.size > 0 ? 'var(--brand)' : 'var(--border)'}`,
                }}
              >
                {ownerFilters.size === 0 ? 'All' : `${ownerFilters.size} selected`}
                <span className="text-[10px] ml-0.5">▾</span>
              </button>

              {showOwnerDropdown && (
                <div
                  className="absolute left-0 top-full mt-1 rounded-lg shadow-xl z-40 py-1 overflow-hidden"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 180 }}
                  onMouseLeave={() => setShowOwnerDropdown(false)}
                >
                  {taskOwners.map((u) => {
                    const active = ownerFilters.has(u.id);
                    return (
                      <button
                        key={u.id}
                        onClick={() => toggleOwner(u.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors"
                        style={{ background: active ? 'var(--brand-subtle)' : 'transparent', color: active ? 'var(--brand)' : 'var(--text)' }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
                        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span>{u.avatarEmoji ?? '👤'}</span>
                        <span className="flex-1 text-left truncate">{u.realName ?? u.username}</span>
                        {active && <span style={{ color: 'var(--brand)' }}>✓</span>}
                      </button>
                    );
                  })}
                  {ownerFilters.size > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)' }}>
                      <button
                        onClick={() => { setOwnerFilters(new Set()); setShowOwnerDropdown(false); }}
                        className="w-full text-left px-3 py-1.5 text-xs transition-colors"
                        style={{ color: 'var(--text-3)' }}
                      >
                        Clear owners
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Color dots — with legend tooltips */}
          {taskColors.length > 0 && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>Color</span>
              <div className="flex items-center gap-3">
                {taskColors.map((c) => {
                  const active = colorFilters.has(c);
                  const legendName = colorLegend[c];
                  return (
                    <button
                      key={c}
                      onClick={() => toggleColor(c)}
                      className="w-4 h-4 rounded-full flex-shrink-0 transition-all"
                      style={{
                        background: c,
                        outline: active ? `2px solid ${c}` : 'none',
                        outlineOffset: active ? '2px' : '0',
                        boxShadow: active ? `0 0 0 1px var(--surface)` : 'none',
                      }}
                      title={legendName || c}
                    />
                  );
                })}
              </div>
            </div>
          )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {toast && (
              <div className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                {toast}
              </div>
            )}
            <button
              onClick={() => setShowNewTask(true)}
              className="btn-primary text-xs px-3 py-1 flex-shrink-0"
            >
              + New task
            </button>
          </div>
        </div>
      </div>

      {/* ── Board ── */}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
          <div
            ref={boardRef}
            className="flex-1 overflow-x-auto overflow-y-auto select-none"
            style={{ cursor: 'default' }}
            onMouseDown={onBoardMouseDown}
            onMouseMove={onBoardMouseMove}
            onMouseUp={onBoardMouseUp}
            onMouseLeave={onBoardMouseUp}
          >
            <div className="flex gap-4 p-6 min-w-max items-start">
              {columns.map((col) => (
                <div key={col.id} className="kanban-col">
                  <KanbanColumn
                    column={col}
                    tasks={filteredTasks.filter((t) => t.status === col.statusKey)}
                    onOpenDetail={setSelectedTask}
                    onRename={handleRenameColumn}
                    onDeleteRequest={setPendingDeleteCol}
                  />
                </div>
              ))}

              {/* Add column — same width as columns, header height only */}
              <button
                onClick={() => setShowNewColumn(true)}
                className="w-72 flex-shrink-0 flex items-center gap-2 px-3 rounded-xl border-2 border-dashed transition-all text-sm"
                style={{ height: 44, borderColor: 'var(--border)', color: 'var(--text-3)' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-3)'; }}
              >
                <span className="text-base leading-none">+</span>
                <span>Add column</span>
              </button>
            </div>
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div style={{ transform: 'rotate(2deg)', width: 288 }}>
              <KanbanCard task={activeTask} onOpenDetail={() => {}} isOverlay />
            </div>
          ) : activeColumn ? (
            <div style={{ opacity: 0.9, width: 288 }}>
              <KanbanColumn
                column={activeColumn}
                tasks={tasks.filter((t) => t.status === activeColumn.statusKey)}
                onOpenDetail={() => {}}
                onRename={() => {}}
                onDeleteRequest={() => {}}
                isOverlay
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Detail panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          columns={columns}
          onClose={() => setSelectedTask(null)}
          onUpdated={async (updated) => { setSelectedTask(updated); await refreshTasks(); }}
        />
      )}

      {/* New task modal */}
      {showNewTask && (
        <Modal title="New task" onClose={() => setShowNewTask(false)} width="max-w-sm">
          <form onSubmit={handleCreateTask} className="space-y-4">
            <div>
              <label className="label">Task name</label>
              <input autoFocus required type="text" value={newTaskName} onChange={(e) => setNewTaskName(e.target.value)} className="input" placeholder="What needs to be done?" />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={creating} className="btn-primary flex-1 flex justify-center">
                {creating ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Create task'}
              </button>
              <button type="button" onClick={() => setShowNewTask(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {/* New column modal */}
      {showNewColumn && (
        <Modal title="Add column" onClose={() => setShowNewColumn(false)} width="max-w-sm">
          <form onSubmit={handleCreateColumn} className="space-y-4">
            <div>
              <label className="label">Column name</label>
              <input autoFocus required type="text" value={newColLabel} onChange={(e) => setNewColLabel(e.target.value)} className="input" placeholder="e.g. Review, Testing…" />
            </div>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>Added before the completion column. Tasks can be dragged into it.</p>
            <div className="flex gap-3">
              <button type="submit" disabled={creating} className="btn-primary flex-1 flex justify-center">
                {creating ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Add column'}
              </button>
              <button type="button" onClick={() => setShowNewColumn(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete column confirmation modal */}
      {pendingDeleteCol && (
        <Modal title="Delete column" onClose={() => setPendingDeleteCol(null)} width="max-w-sm">
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <span className="text-lg">⚠️</span>
              <p className="text-sm" style={{ color: 'var(--text)' }}>
                Delete <strong>"{pendingDeleteCol.label}"</strong>?
                {pendingTaskCount > 0
                  ? ` ${pendingTaskCount} task${pendingTaskCount !== 1 ? 's' : ''} will be moved to To Do.`
                  : ' The column is empty.'}
              </p>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteColumn}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg text-sm font-medium flex justify-center transition-colors"
                style={{ background: '#ef4444', color: 'white' }}
              >
                {deleting ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Delete column'}
              </button>
              <button type="button" onClick={() => setPendingDeleteCol(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
