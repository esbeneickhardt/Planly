/**
 * useKanbanDnd - dnd-kit wiring for the Kanban board's THREE distinct drag types, sharing one
 * DndContext/sensors/DragOverlay: milestone-header reorder, status-column reorder, and task
 * drag-and-drop (including cross-column status change and, in milestone-columns view, milestone
 * reassignment). They share one `onDragEnd` because dnd-kit only exposes a single callback per
 * DndContext and all three draggable kinds coexist in the same board - `active.data.current.type`
 * is what tells them apart. Branch order matters: milestone-header is checked (and allowed to run
 * even for read-only viewers, since it's a display preference, not a data mutation) before the
 * `readOnly` gate that blocks the other two.
 */
import { useState } from 'react';
import { DragEndEvent, DragStartEvent, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { Task, KanbanColumn as KanbanColumnType, Product } from '../types';
import { api } from '../api/client';
import { UNASSIGNED_CLUSTER } from '../utils/milestones';
import type { MilestoneOption } from '../components/kanban/KanbanMilestoneFilter';

interface UseKanbanDndArgs {
  activeProduct: Product | null;
  tasks: Task[];
  columns: KanbanColumnType[];
  setColumns: (cols: KanbanColumnType[]) => void;
  readOnly: boolean;
  viewMode: 'status' | 'milestone';
  orderedMilestoneIds: string[];
  milestoneMeta: Map<string, MilestoneOption>;
  primaryMilestones: Map<string, Task>;
  collapsedStatusesInMilestoneView: Set<string>;
  toggleStatusCollapsed: (statusKey: string) => void;
  loadColumns: () => Promise<void>;
  refreshTasks: () => Promise<void>;
  saveMilestoneOrder: (ids: string[]) => void;
  showToast: (msg: string) => void;
}

export function useKanbanDnd({
  activeProduct,
  tasks,
  columns,
  setColumns,
  readOnly,
  viewMode,
  orderedMilestoneIds,
  milestoneMeta,
  primaryMilestones,
  collapsedStatusesInMilestoneView,
  toggleStatusCollapsed,
  loadColumns,
  refreshTasks,
  saveMilestoneOrder,
  showToast,
}: UseKanbanDndArgs) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeColumn, setActiveColumn] = useState<KanbanColumnType | null>(null);
  const [activeMilestoneHeader, setActiveMilestoneHeader] = useState<MilestoneOption | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  // DnD handlers: `pointerWithin` collision (configured on the DndContext itself) detects both
  // column drops and task-on-task drops
  function onDragStart(event: DragStartEvent) {
    const type = event.active.data.current?.type;
    if (type === 'column') {
      setActiveColumn(columns.find((c) => c.id === event.active.id) ?? null);
    } else if (type === 'milestone-header') {
      const milestoneId = event.active.data.current?.milestoneId as string;
      setActiveMilestoneHeader(milestoneMeta.get(milestoneId) ?? null);
    } else {
      setActiveTask(tasks.find((t) => t.id === event.active.id) ?? null);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    setActiveColumn(null);
    setActiveMilestoneHeader(null);
    if (!over || !activeProduct) return;

    const activeType = active.data.current?.type;

    // ── Milestone header reorder (shared across all columns/milestone-columns; a display
    // preference, so it isn't gated behind write permission the way task/column mutations below
    // are). Must check the OVER type too: in milestone-columns mode, status-section drop zones
    // also carry a milestoneId in their data (so cross-milestone task drops can be detected below),
    // so a header dropped on a status section must not be mistaken for another header/column. ──
    if (activeType === 'milestone-header') {
      if (over.data.current?.type !== 'milestone-header') return;
      const activeMilestoneId = active.data.current?.milestoneId as string;
      const overMilestoneId = over.data.current?.milestoneId as string | undefined;
      if (!overMilestoneId || activeMilestoneId === overMilestoneId) return;
      const oldIdx = orderedMilestoneIds.indexOf(activeMilestoneId);
      const newIdx = orderedMilestoneIds.indexOf(overMilestoneId);
      if (oldIdx === -1 || newIdx === -1) return;
      saveMilestoneOrder(arrayMove(orderedMilestoneIds, oldIdx, newIdx));
      return;
    }

    if (readOnly) return;

    // ── Column reorder (status-columns mode only) ──
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
        await api.columns.reorder(
          activeProduct.id,
          reordered.map((c, i) => ({ id: c.id, order: i })),
        );
      } catch {
        await loadColumns(); // rollback
      }
      return;
    }

    // ── Task drag ──
    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const overId = over.id as string;
    const overTask = tasks.find((t) => t.id === overId);
    const overData = over.data.current as { type?: string; statusKey?: string; milestoneId?: string } | undefined;
    const overColumn = columns.find((c) => c.statusKey === overId);

    const targetStatusKey = overData?.statusKey ?? overColumn?.statusKey ?? overTask?.status ?? null;
    if (!targetStatusKey) return;

    // Milestone reassignment: only in milestone-columns mode, and never for a task that is itself
    // a milestone (it defines its own column - it can only move between status sections within
    // it, never into another milestone's column, so its scope always resolves to its own id).
    let currentMilestoneId: string | undefined;
    let targetMilestoneId: string | undefined;
    if (viewMode === 'milestone') {
      if (task.deadline) {
        currentMilestoneId = task.id;
        targetMilestoneId = task.id;
      } else {
        currentMilestoneId = primaryMilestones.get(task.id)?.id ?? UNASSIGNED_CLUSTER;
        targetMilestoneId =
          overData?.milestoneId ??
          (overTask ? (primaryMilestones.get(overTask.id)?.id ?? UNASSIGNED_CLUSTER) : undefined);
      }
    }
    const milestoneChanged =
      viewMode === 'milestone' && !task.deadline && !!targetMilestoneId && targetMilestoneId !== currentMilestoneId;

    const statusChanged = task.status !== targetStatusKey;
    if (statusChanged && !task.ownerId && targetStatusKey === 'todo') {
      showToast('Assign an owner before moving to To Do.');
      return;
    }

    if (milestoneChanged && targetMilestoneId) {
      // Reuses TaskDetailPanel's own milestone-switch logic: find the task's current DIRECT
      // milestone edge (single-hop, not the transitive primaryMilestones lookup) and swap it for a
      // direct edge to the new milestone.
      const milestoneTaskIds = new Set(tasks.filter((t) => !!t.deadline).map((t) => t.id));
      const directPrevId = task.requiredBy.find((r) => milestoneTaskIds.has(r.dependentId))?.dependentId ?? null;
      try {
        await Promise.all([
          directPrevId ? api.tasks.removeDependency(activeProduct.id, directPrevId, task.id) : null,
          targetMilestoneId !== UNASSIGNED_CLUSTER
            ? api.tasks.addDependency(activeProduct.id, targetMilestoneId, task.id)
            : null,
        ]);
        // A drop into a collapsed status section would otherwise vanish from view
        if (collapsedStatusesInMilestoneView.has(targetStatusKey)) toggleStatusCollapsed(targetStatusKey);
      } catch (err) {
        showToast((err as Error).message ?? 'Could not move task to that milestone');
        return;
      }
    }

    // Build the new ordered list for the target column - scoped to (status, milestone) when in
    // milestone-columns mode, so reordering only considers this milestone-column's own cards.
    const scopeMilestoneId = viewMode === 'milestone' ? (targetMilestoneId ?? currentMilestoneId) : undefined;
    const taskMilestoneKey = (t: Task) => (t.deadline ? t.id : (primaryMilestones.get(t.id)?.id ?? UNASSIGNED_CLUSTER));
    const inScope = (t: Task) => scopeMilestoneId === undefined || taskMilestoneKey(t) === scopeMilestoneId;

    const listChanged = statusChanged || milestoneChanged;
    const sorted = (s: string) =>
      tasks
        .filter((t) => t.status === s && t.id !== taskId && inScope(t))
        .sort((a, b) => a.kanbanOrder - b.kanbanOrder);

    let newColumnTasks: Task[];
    if (overTask && overTask.id !== taskId) {
      // Dropped on a specific task
      const peers = sorted(targetStatusKey);
      const insertAt = peers.findIndex((t) => t.id === overTask.id);
      if (!listChanged) {
        // Same-column reorder: insert AFTER the target when moving down, BEFORE when moving up.
        // Without this, dragging the top card onto a lower card inserts it before the target —
        // which produces no visible change when there are only two tasks (e.g. [A,B] → [A,B]).
        const col = tasks
          .filter((t) => t.status === task.status && inScope(t))
          .sort((a, b) => a.kanbanOrder - b.kanbanOrder);
        const movingDown = col.findIndex((t) => t.id === taskId) < col.findIndex((t) => t.id === overTask.id);
        peers.splice(movingDown ? insertAt + 1 : insertAt, 0, task);
      } else {
        // Cross-column: insert at the target's position (before it)
        peers.splice(insertAt === -1 ? peers.length : insertAt, 0, task);
      }
      newColumnTasks = peers;
    } else {
      // Dropped on the column/section droppable itself (not a specific task) - append at end
      const peers = sorted(targetStatusKey);
      peers.push(task);
      newColumnTasks = peers;
    }

    try {
      if (statusChanged) {
        await api.tasks.update(activeProduct.id, taskId, {
          status: targetStatusKey,
        });
      }
      await api.tasks.reorder(
        activeProduct.id,
        newColumnTasks.map((t, i) => ({ taskId: t.id, order: i })),
      );
      await refreshTasks();
    } catch (err) {
      showToast((err as Error).message);
    }
  }

  return {
    sensors,
    activeTask,
    activeColumn,
    activeMilestoneHeader,
    onDragStart,
    handleDragEnd,
  };
}
