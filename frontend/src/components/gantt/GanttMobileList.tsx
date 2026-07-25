/**
 * Mobile-only (`md:hidden`) list view for the Gantt/Progress tab, shown in place of the timeline
 * chart. Mirrors the desktop view's two modes (Milestones / Sub-plans) via the same `ganttView`
 * state. Tapping a row unfolds it in place to show its task breakdown (done vs not done) instead
 * of immediately opening a task; milestone rows are also drag-reorderable via the same
 * `onMilestoneDragEnd`/`milestoneOrder` mechanism the desktop sidebar list uses, so the order
 * stays in sync between the two.
 */
import { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { MilestoneResult, Sprint } from '../../api/client';
import type { Task } from '../../types';

type GanttView = 'milestones' | 'sprints';

export function progressColor(m: MilestoneResult): string {
  if (m.status === 'done') return '#10b981';
  const now = new Date();
  const deadline = new Date(m.deadline);
  if (deadline < now) return m.progress >= 0.5 ? '#f59e0b' : '#ef4444';
  return m.progress >= 0.75 ? '#10b981' : m.progress >= 0.4 ? '#f59e0b' : '#ef4444';
}

interface Props {
  ganttView: GanttView;
  setGanttView: (v: GanttView) => void;
  visibleMilestones: MilestoneResult[];
  milestones: MilestoneResult[];
  hideDone: boolean;
  doneCount: number;
  sprints: Sprint[];
  tasks: Task[];
  setSelectedTask: (task: Task | null) => void;
  setHideDone: (v: boolean | ((prev: boolean) => boolean)) => void;
  onMilestoneDragEnd: (event: DragEndEvent) => void;
}

/** One dependency/sprint task row inside an unfolded card - done tasks read as complete at a glance. */
function TaskRow({ task, onOpen }: { task: { id: string; name: string; status: string } | Task; onOpen: () => void }) {
  const isDone = task.status === 'done' || !!(task as Task).completedAt;
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg transition-colors"
      style={{ background: 'transparent' }}
    >
      <span
        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          background: isDone ? '#10b981' : 'transparent',
          border: isDone ? 'none' : '1.5px solid var(--border)',
        }}
      >
        {isDone && (
          <span style={{ color: 'white', fontSize: 9, lineHeight: 1 }}>✓</span>
        )}
      </span>
      <span
        className="text-xs truncate"
        style={{
          color: isDone ? 'var(--text-3)' : 'var(--text-2)',
          textDecoration: isDone ? 'line-through' : 'none',
        }}
      >
        {task.name}
      </span>
    </button>
  );
}

/** Draggable + tappable milestone card. Quick taps toggle the unfold (dnd-kit's activation
 * distance/delay means a plain tap never registers as a drag, same pattern KanbanCard already
 * relies on for drag + click to coexist). */
function SortableMilestoneCard({
  m,
  expanded,
  onToggleExpand,
  onOpenMilestone,
  onOpenTask,
  tasks,
}: {
  m: MilestoneResult;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenMilestone: () => void;
  onOpenTask: (id: string) => void;
  tasks: Task[];
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: m.id });
  const color = progressColor(m);
  const isDone = m.status === 'done';
  const isOverdue = new Date(m.deadline) < new Date() && !isDone;
  const sortedDeps = [...m.dependencyList].sort((a, b) => {
    const aDone = a.status === 'done';
    const bDone = b.status === 'done';
    if (aDone !== bDone) return aDone ? 1 : -1;
    return 0;
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="w-full text-left rounded-xl px-4 py-3 transition-colors bg-surface-2 border border-border"
    >
      <div className="flex items-start justify-between gap-2 cursor-pointer" onClick={onToggleExpand}>
        <div className="flex items-start gap-1.5 min-w-0">
          <span
            className="flex-shrink-0 mt-0.5 text-[10px]"
            style={{ color: 'var(--text-3)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
          >
            ▸
          </span>
          <p
            className="text-sm font-medium leading-tight"
            style={{
              color: isDone ? 'var(--text-3)' : 'var(--text)',
              textDecoration: isDone ? 'line-through' : 'none',
            }}
          >
            {isDone && <span className="mr-1">✓</span>}
            {m.name}
          </p>
        </div>
        <span
          className="text-xs font-semibold flex-shrink-0 px-2 py-0.5 rounded-full"
          style={{
            background: isOverdue ? 'rgba(239,68,68,0.12)' : 'rgba(100,116,139,0.12)',
            color: isOverdue ? '#ef4444' : 'var(--text-3)',
          }}
        >
          {new Date(m.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
        </span>
      </div>
      {!isDone && (
        <div className="mt-2 cursor-pointer" onClick={onToggleExpand}>
          <div className="h-1.5 rounded-full overflow-hidden bg-border">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${m.progress * 100}%`, background: color }}
            />
          </div>
          <p className="text-[11px] mt-1 text-token-3">
            {m.doneDependencies}/{m.totalDependencies} tasks done
          </p>
        </div>
      )}
      {expanded && (
        <div className="mt-2.5 pt-2.5 space-y-0.5" style={{ borderTop: '1px solid var(--border)' }}>
          {sortedDeps.length === 0 ? (
            <p className="text-xs px-2 py-1" style={{ color: 'var(--text-3)' }}>
              No tasks feed into this milestone
            </p>
          ) : (
            sortedDeps.map((dep) => (
              <TaskRow
                key={dep.id}
                task={dep}
                onOpen={() => {
                  const full = tasks.find((t) => t.id === dep.id);
                  if (full) onOpenTask(dep.id);
                }}
              />
            ))
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenMilestone();
            }}
            className="text-xs font-medium px-2 pt-1.5"
            style={{ color: 'var(--brand)' }}
          >
            Open milestone task →
          </button>
        </div>
      )}
    </div>
  );
}

export default function GanttMobileList({
  ganttView,
  setGanttView,
  visibleMilestones,
  milestones,
  hideDone,
  doneCount,
  sprints,
  tasks,
  setSelectedTask,
  setHideDone,
  onMilestoneDragEnd,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function openTask(id: string) {
    const t = tasks.find((t) => t.id === id);
    if (t) setSelectedTask(t);
  }

  return (
    <div className="md:hidden h-full overflow-y-auto px-4 py-3 space-y-2">
      {/* View toggle - mirrors the desktop segmented control */}
      <div
        className="inline-flex items-center gap-0.5 p-0.5 rounded-lg mb-2"
        style={{ background: 'var(--surface-2)' }}
      >
        <button
          onClick={() => setGanttView('milestones')}
          className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all"
          style={{
            background: ganttView === 'milestones' ? 'var(--surface)' : 'transparent',
            color: ganttView === 'milestones' ? 'var(--text)' : 'var(--text-3)',
          }}
        >
          Milestones
        </button>
        <button
          onClick={() => setGanttView('sprints')}
          className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all"
          style={{
            background: ganttView === 'sprints' ? 'var(--surface)' : 'transparent',
            color: ganttView === 'sprints' ? 'var(--text)' : 'var(--text-3)',
          }}
        >
          Sub-plans
        </button>
      </div>

      {ganttView === 'milestones' ? (
        <>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3 text-token-3">
            {doneCount}/{milestones.length} done - drag to reorder
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onMilestoneDragEnd}>
            <SortableContext items={visibleMilestones.map((m) => m.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {visibleMilestones.map((m) => (
                  <SortableMilestoneCard
                    key={m.id}
                    m={m}
                    expanded={expandedId === m.id}
                    onToggleExpand={() => toggleExpand(m.id)}
                    onOpenMilestone={() => openTask(m.id)}
                    onOpenTask={openTask}
                    tasks={tasks}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {doneCount > 0 && hideDone && (
            <button onClick={() => setHideDone(false)} className="w-full text-center text-xs py-2 text-token-3">
              Show {doneCount} completed milestone{doneCount !== 1 ? 's' : ''}
            </button>
          )}
        </>
      ) : (
        <>
          {sprints.length === 0 ? (
            <p className="text-xs leading-relaxed px-1 py-4" style={{ color: 'var(--text-3)' }}>
              No sub-plans yet. Create one in the Plan view to see it here.
            </p>
          ) : (
            <div className="space-y-2">
              {sprints.map((s) => {
                const sprintTasks = tasks.filter((t) => s.taskIds.includes(t.id));
                const doneTasks = sprintTasks.filter((t) => t.status === 'done' || !!t.completedAt);
                const expanded = expandedId === s.id;
                return (
                  <div
                    key={s.id}
                    className="w-full text-left rounded-xl px-4 py-3 transition-colors bg-surface-2 border border-border"
                  >
                    <div className="flex items-start justify-between gap-2 cursor-pointer" onClick={() => toggleExpand(s.id)}>
                      <div className="flex items-start gap-1.5 min-w-0">
                        <span
                          className="flex-shrink-0 mt-0.5 text-[10px]"
                          style={{ color: 'var(--text-3)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
                        >
                          ▸
                        </span>
                        <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: s.color }} />
                        <p className="text-sm font-medium leading-tight truncate" style={{ color: 'var(--text)' }}>
                          {s.name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-1.5 pl-5">
                      <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                        {new Date(s.startDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })} –{' '}
                        {new Date(s.endDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                        · {doneTasks.length}/{sprintTasks.length} done
                      </span>
                    </div>
                    {expanded && (
                      <div className="mt-2.5 pt-2.5 space-y-0.5" style={{ borderTop: '1px solid var(--border)' }}>
                        {sprintTasks.length === 0 ? (
                          <p className="text-xs px-2 py-1" style={{ color: 'var(--text-3)' }}>
                            No tasks in this sub-plan
                          </p>
                        ) : (
                          sprintTasks.map((t) => <TaskRow key={t.id} task={t} onOpen={() => setSelectedTask(t)} />)
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
