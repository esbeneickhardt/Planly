/**
 * Gantt chart page that plots tasks-with-deadlines as milestone bars and sprints as time-window bars
 * against a zoomable, pannable timeline.  View state (zoom, pan, hide-done) is managed by
 * useGanttDragZoom and persisted to localStorage; drag-resize handles write deadline/date changes back to the API on pointer-up.
 */
import { useState, useEffect, useRef } from 'react';
import {
  DndContext,
  DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api, displayName } from '../api/client';
import type { MilestoneResult } from '../api/client';
import { useProduct } from '../context/ProductContext';
import { usePermission } from '../context/PermissionContext';
import TaskDetailPanel from '../components/common/TaskDetailPanel';
import Tooltip from '../components/common/Tooltip';
import type { Task } from '../types';
import GanttMobileList, { progressColor } from '../components/gantt/GanttMobileList';
import { useGanttDragZoom } from '../hooks/useGanttDragZoom';
import { useGanttData } from '../hooks/useGanttData';
import { isBeforeToday } from '../utils/dates';

type GanttView = 'milestones' | 'sprints';

const STATUS_COLOR: Record<string, string> = {
  backlog: '#64748b',
  todo: '#3b82f6',
  in_progress: '#f59e0b',
  done: '#10b981',
  blocked: '#ef4444',
};

function pct(date: Date, start: Date, end: Date): number {
  const total = end.getTime() - start.getTime();
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, (date.getTime() - start.getTime()) / total));
}

// Adaptive time markers - max ~15 labels regardless of zoom level
function getTimeMarkers(start: Date, end: Date): { date: Date; label: string }[] {
  const spanDays = (end.getTime() - start.getTime()) / 86_400_000;
  const MAX = 15;

  // Monthly / quarterly / annual
  if (spanDays > MAX * 14) {
    let monthStep = 1;
    if (spanDays > MAX * 360) monthStep = 12;
    else if (spanDays > MAX * 90) monthStep = 6;
    else if (spanDays > MAX * 30) monthStep = 3;
    const out: { date: Date; label: string }[] = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cur <= last) {
      out.push({
        date: new Date(cur),
        label:
          monthStep >= 12
            ? cur.getFullYear().toString()
            : cur.toLocaleDateString('en', { month: 'short', ...(monthStep >= 3 ? { year: '2-digit' } : {}) }),
      });
      cur.setMonth(cur.getMonth() + monthStep);
    }
    return out;
  }

  // Daily / every-N-days / weekly / bi-weekly
  let intervalDays = 1;
  if (spanDays > MAX * 7) intervalDays = 14;
  else if (spanDays > MAX * 3) intervalDays = 7;
  else if (spanDays > MAX) intervalDays = Math.ceil(spanDays / MAX);

  const out: { date: Date; label: string }[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  if (intervalDays >= 7) cur.setDate(cur.getDate() + ((1 - cur.getDay() + 7) % 7)); // snap to Monday
  while (cur <= end) {
    out.push({ date: new Date(cur), label: cur.toLocaleDateString('en', { month: 'short', day: 'numeric' }) });
    cur.setDate(cur.getDate() + intervalDays);
  }
  return out;
}

// Default sort when no manual order has been set: active milestones soonest-first, done pushed to the bottom
function fallbackMilestoneSort(a: MilestoneResult, b: MilestoneResult): number {
  const aDone = a.status === 'done';
  const bDone = b.status === 'done';
  if (aDone !== bDone) return aDone ? 1 : -1;
  return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
}

// Sorts by the shared, backend-persisted milestoneOrder (set by dragging in either Gantt or
// Kanban). Milestones that have never been dragged all share the default 0 and fall back to
// done-last/soonest-first ordering, so nothing looks broken before anyone has ever reordered.
function orderMilestones(list: MilestoneResult[]): MilestoneResult[] {
  return [...list].sort((a, b) => a.milestoneOrder - b.milestoneOrder || fallbackMilestoneSort(a, b));
}

export default function GanttPage() {
  const { activeProduct, tasks, patchMilestoneOrder } = useProduct();
  const { canWrite } = usePermission();
  const readOnly = !canWrite('gantt');
  const [ganttView, setGanttView] = useState<GanttView>('milestones');
  const [hoveredMilestone, setHoveredMilestone] = useState<string | null>(null);
  const [hoveredProduct, setHoveredProduct] = useState(false);
  const [hoveredSprint, setHoveredSprint] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [hideDone, setHideDone] = useState(true);

  const {
    vs,
    ve,
    setViewStart,
    setViewEnd,
    isDragging,
    isResizing,
    applyZoom,
    attachWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useGanttDragZoom({
    fullStart: new Date(activeProduct?.createdAt ?? Date.now()),
    fullEnd: new Date(activeProduct?.deadline ?? Date.now()),
    onResizing: ({ type, id, date }) => {
      if (type === 'milestone')
        setMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, deadline: date.toISOString() } : m)));
      else if (type === 'sprint')
        setSprints((prev) => prev.map((s) => (s.id === id ? { ...s, endDate: date.toISOString() } : s)));
      else if (type === 'sprint-start')
        setSprints((prev) => prev.map((s) => (s.id === id ? { ...s, startDate: date.toISOString() } : s)));
      else if (type === 'product') setProduct((p) => (p ? { ...p, deadline: date.toISOString() } : p));
    },
    onResized: ({ type, id }) => {
      if (!activeProduct) return;
      if (type === 'milestone') {
        const m = milestonesRef.current.find((m) => m.id === id);
        if (m) api.tasks.update(activeProduct.id, id, { deadline: m.deadline }).catch(() => {});
      } else if (type === 'sprint') {
        const s = sprintsRef.current.find((s) => s.id === id);
        if (s) api.sprints.update(activeProduct.id, id, { endDate: s.endDate }).catch(() => {});
      } else if (type === 'sprint-start') {
        const s = sprintsRef.current.find((s) => s.id === id);
        if (s) api.sprints.update(activeProduct.id, id, { startDate: s.startDate }).catch(() => {});
      } else if (type === 'product') {
        const p = productRef.current;
        if (p) api.products.update(activeProduct.id, { deadline: p.deadline }).catch(() => {});
      }
    },
  });

  const {
    milestones,
    sprints,
    product,
    loading,
    setMilestones,
    setSprints,
    setProduct,
    milestonesRef,
    sprintsRef,
    productRef,
  } = useGanttData(activeProduct, tasks, (start, end) => {
    setViewStart(start);
    setViewEnd(end);
  });

  // Restore per-product hide-done preference from localStorage; defaults to true (hide done)
  useEffect(() => {
    if (!activeProduct) return;
    try {
      const stored = localStorage.getItem(`planly-gantt-hideDone-${activeProduct.id}`);
      setHideDone(stored === null ? true : stored === 'true');
    } catch {}
  }, [activeProduct?.id]);

  // Persists a full reordering by assigning sequential milestoneOrder values and syncing to the
  // backend, so Gantt and Kanban (and every other milestone list) share one order regardless of
  // which page the drag happened on.
  function saveMilestoneOrder(ids: string[]) {
    const orderOf = new Map(ids.map((id, i) => [id, i]));
    setMilestones((prev) => prev.map((m) => (orderOf.has(m.id) ? { ...m, milestoneOrder: orderOf.get(m.id)! } : m)));
    if (!activeProduct) return;
    const updates = ids.map((id, i) => ({ taskId: id, order: i }));
    // Also patch the shared task cache (ProductContext) so Kanban and Backlog - which read
    // milestoneOrder from `tasks`, not from this page's own `milestones` state - update
    // immediately instead of staying stale until their next independent refetch.
    patchMilestoneOrder(updates);
    api.tasks.reorderMilestones(activeProduct.id, updates).catch(() => {});
  }

  const milestoneDragSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  // Width of the left name column, draggable via a handle between it and the timeline; persisted
  // per-product in localStorage. Kept in a ref too so the mouseup handler (registered once per
  // drag, at mousedown time) always persists the latest value rather than a stale closed-over one.
  const [sidebarWidth, setSidebarWidth] = useState(224);
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (!activeProduct) return;
    try {
      const stored = localStorage.getItem(`planly-gantt-sidebarWidth-${activeProduct.id}`);
      const parsed = stored ? parseInt(stored, 10) : NaN;
      setSidebarWidth(Number.isFinite(parsed) ? Math.min(420, Math.max(140, parsed)) : 224);
    } catch {
      setSidebarWidth(224);
    }
  }, [activeProduct?.id]);

  function handleSidebarResizeMove(e: MouseEvent) {
    if (!sidebarResizeRef.current) return;
    const delta = e.clientX - sidebarResizeRef.current.startX;
    setSidebarWidth(Math.min(420, Math.max(140, sidebarResizeRef.current.startWidth + delta)));
  }
  function handleSidebarResizeEnd() {
    sidebarResizeRef.current = null;
    document.removeEventListener('mousemove', handleSidebarResizeMove);
    document.removeEventListener('mouseup', handleSidebarResizeEnd);
    if (!activeProduct) return;
    try {
      localStorage.setItem(`planly-gantt-sidebarWidth-${activeProduct.id}`, String(sidebarWidthRef.current));
    } catch {}
  }
  function handleSidebarResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    sidebarResizeRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    document.addEventListener('mousemove', handleSidebarResizeMove);
    document.addEventListener('mouseup', handleSidebarResizeEnd);
  }

  if (!activeProduct) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ color: 'var(--text-3)' }}>
        <div className="text-5xl opacity-30">📅</div>
        <p className="text-sm">Create a product to get started</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div
          className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  if (milestones.length === 0) {
    const tasksWithoutDeadline = tasks.filter((t) => !t.deadline && t.status !== 'done').length;
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-6">
        <div className="flex flex-col items-center gap-3 max-w-sm text-center">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            📅
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              No milestones yet
            </p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-3)' }}>
              A milestone is any task with a deadline - it shows here as a progress bar against the timeline.
            </p>
          </div>
          {tasks.length === 0 ? (
            <div
              className="rounded-xl px-4 py-3 text-xs leading-relaxed w-full"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-3)' }}
            >
              Start by adding tasks in <strong style={{ color: 'var(--text-2)' }}>Execute</strong> or{' '}
              <strong style={{ color: 'var(--text-2)' }}>Tasks</strong>, then set a deadline to create a milestone.
            </div>
          ) : tasksWithoutDeadline > 0 ? (
            <div
              className="rounded-xl px-4 py-3 text-xs leading-relaxed w-full"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-3)' }}
            >
              You have{' '}
              <strong style={{ color: 'var(--text-2)' }}>
                {tasksWithoutDeadline} task{tasksWithoutDeadline !== 1 ? 's' : ''}
              </strong>{' '}
              without a deadline. Open any task and set a deadline to add it here.
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const fullStart = new Date(product?.createdAt ?? activeProduct.createdAt);
  const fullEnd = new Date(product?.deadline ?? activeProduct.deadline);
  const today = new Date();

  // Sorted per the user's manually-dragged order if one exists, else soonest-first with done pushed down
  const sortedMilestones = orderMilestones(milestones);
  const visibleMilestones = hideDone ? sortedMilestones.filter((m) => m.status !== 'done') : sortedMilestones;

  function handleMilestoneDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = visibleMilestones.map((m) => m.id);
    const oldIdx = ids.indexOf(active.id as string);
    const newIdx = ids.indexOf(over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;
    const reorderedVisible = arrayMove(ids, oldIdx, newIdx);
    const hiddenIds = hideDone ? sortedMilestones.filter((m) => m.status === 'done').map((m) => m.id) : [];
    saveMilestoneOrder([...reorderedVisible, ...hiddenIds]);
  }
  const doneCount = milestones.filter((m) => m.status === 'done').length;

  const todayPct = pct(today, vs, ve);
  const markers = getTimeMarkers(vs, ve);
  const isFullView = vs.getTime() <= fullStart.getTime() && ve.getTime() >= fullEnd.getTime();
  const ROW_H = 52;

  const allDone = doneCount === milestones.length;
  const progressPct = milestones.length > 0 ? Math.round((doneCount / milestones.length) * 100) : 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Mobile view - simple list */}
      <GanttMobileList
        ganttView={ganttView}
        setGanttView={setGanttView}
        visibleMilestones={visibleMilestones}
        milestones={milestones}
        hideDone={hideDone}
        doneCount={doneCount}
        sprints={sprints}
        tasks={tasks}
        setSelectedTask={setSelectedTask}
        setHideDone={setHideDone}
        onMilestoneDragEnd={handleMilestoneDragEnd}
      />

      {/* Desktop view */}
      <div className="hidden md:flex md:flex-col flex-1 overflow-hidden relative">
      {/* Sticky column header - stays visible when the milestone list scrolls */}
      <div
        className="flex flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}
      >
        {/* Left: view toggle + hide-done */}
        <div
          className="flex-shrink-0 px-3 flex flex-col justify-center gap-1"
          style={{ width: sidebarWidth, borderRight: '1px solid var(--border)', minHeight: 44 }}
        >
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: 'var(--surface-2)' }}>
              <Tooltip content="Tasks with deadlines plotted as progress markers" side="bottom">
                <button
                  onClick={() => setGanttView('milestones')}
                  className="px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all"
                  style={{
                    background: ganttView === 'milestones' ? 'var(--surface)' : 'transparent',
                    color: ganttView === 'milestones' ? 'var(--text)' : 'var(--text-3)',
                    boxShadow: ganttView === 'milestones' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  Milestones
                </button>
              </Tooltip>
              <Tooltip content="Sprint windows plotted as time bars" side="bottom">
                <button
                  onClick={() => setGanttView('sprints')}
                  className="px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all"
                  style={{
                    background: ganttView === 'sprints' ? 'var(--surface)' : 'transparent',
                    color: ganttView === 'sprints' ? 'var(--text)' : 'var(--text-3)',
                    boxShadow: ganttView === 'sprints' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  Sub-plans
                </button>
              </Tooltip>
            </div>
            {ganttView === 'milestones' && doneCount > 0 && (
              <Tooltip content={hideDone ? 'Show completed milestones' : 'Hide completed milestones'} side="bottom">
                <button
                  onClick={() =>
                    setHideDone((v) => {
                      const next = !v;
                      try {
                        if (activeProduct)
                          localStorage.setItem(`planly-gantt-hideDone-${activeProduct.id}`, String(next));
                      } catch {
                        /* ignore */
                      }
                      return next;
                    })
                  }
                  className="flex items-center gap-1 text-[10px] font-medium transition-all"
                  style={{ color: hideDone ? 'var(--text-3)' : '#10b981' }}
                >
                  <span>{hideDone ? '○' : '✓'}</span>
                  {hideDone ? `${doneCount} hidden` : `${doneCount} done`}
                </button>
              </Tooltip>
            )}
          </div>
        </div>
        {/* Right: Time axis + zoom controls */}
        <div className="flex-1 relative overflow-hidden" style={{ paddingLeft: 8, paddingRight: 110 }}>
          <div className="absolute top-0 right-0 h-full flex items-center gap-0.5 pr-2" style={{ zIndex: 3 }}>
            <Tooltip content="Zoom in" side="bottom">
              <button
                onClick={() => applyZoom(0.5)}
                className="w-6 h-6 rounded flex items-center justify-center text-sm font-semibold hover:opacity-80 transition-opacity"
                style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
              >
                +
              </button>
            </Tooltip>
            <Tooltip content="Zoom out" side="bottom">
              <button
                onClick={() => applyZoom(2)}
                disabled={isFullView}
                className="w-6 h-6 rounded flex items-center justify-center text-sm font-semibold hover:opacity-80 transition-opacity disabled:opacity-30"
                style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
              >
                −
              </button>
            </Tooltip>
            <Tooltip content="Fit full project timeline" side="bottom">
              <button
                onClick={() => {
                  setViewStart(fullStart);
                  setViewEnd(fullEnd);
                }}
                disabled={isFullView}
                className="h-6 px-1.5 rounded text-xs font-medium hover:opacity-80 transition-opacity disabled:opacity-30"
                style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
              >
                Fit
              </button>
            </Tooltip>
          </div>
          {markers.map((marker) => {
            const pos = pct(marker.date, vs, ve) * 100;
            if (pos < 0 || pos > 90) return null;
            return (
              <div
                key={marker.date.toISOString()}
                className="absolute top-0 h-full flex items-end pb-2"
                style={{ left: `${pos}%`, paddingLeft: 4, pointerEvents: 'none' }}
              >
                <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-3)' }}>
                  {marker.label}
                </span>
              </div>
            );
          })}
          {todayPct > 0 && todayPct < 1 && (
            <div
              className="absolute top-0 h-full flex items-end pb-1.5"
              style={{ left: `${todayPct * 100}%`, zIndex: 2, pointerEvents: 'none' }}
            >
              <span
                className="text-[10px] font-semibold px-1 rounded"
                style={{ background: 'var(--brand)', color: 'white' }}
              >
                Today
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable body (desktop only) */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex min-h-full">
          {/* Left: names (sticky left edge) */}
          <div
            className="flex-shrink-0 sticky left-0 z-10"
            style={{ width: sidebarWidth, borderRight: '1px solid var(--border)', background: 'var(--surface)' }}
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
                        {new Date(s.startDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })} –{' '}
                        {new Date(s.endDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
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
                  Create sprints in the <strong style={{ color: 'var(--text-2)' }}>Plan</strong> view to see them
                  plotted as windows on the timeline.
                </p>
              </div>
            )}
            {ganttView === 'milestones' && (
              <DndContext
                sensors={milestoneDragSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleMilestoneDragEnd}
              >
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

          {/* Right: timeline bars */}
          <div
            className="flex-1 overflow-hidden select-none"
            style={{
              paddingLeft: 8,
              paddingRight: 110,
              cursor: readOnly ? 'default' : isResizing ? 'ew-resize' : isDragging ? 'grabbing' : 'grab',
            }}
            ref={attachWheel}
            onPointerDown={readOnly ? undefined : handlePointerDown}
            onPointerMove={readOnly ? undefined : handlePointerMove}
            onPointerUp={readOnly ? undefined : handlePointerUp}
            onPointerCancel={readOnly ? undefined : handlePointerUp}
          >
            <div style={{ position: 'relative' }}>
              {/* Today line through all rows */}
              {todayPct > 0 && todayPct < 1 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${todayPct * 100}%`,
                    width: 1,
                    background: 'var(--brand)',
                    zIndex: 3,
                    opacity: 0.5,
                    pointerEvents: 'none',
                  }}
                />
              )}

              {/* Sprint bars - each sprint occupies one row.
                  The bar is rendered as an absolute-positioned track (background) with a
                  progress fill layered on top. Start/end resize handles use data-resize
                  attributes which the useGanttDragZoom hook picks up via closest('[data-resize]'). */}
              {ganttView === 'sprints' &&
                sprints.map((s) => {
                  const startPct = pct(new Date(s.startDate), vs, ve) * 100;
                  const endPct = pct(new Date(s.endDate), vs, ve) * 100;
                  const barWidth = Math.max(endPct - startPct, 0.5);
                  const sprintTasks = tasks.filter((t) => s.taskIds.includes(t.id));
                  const doneTasks = sprintTasks.filter((t) => t.status === 'done' || !!t.completedAt);
                  const progress = sprintTasks.length > 0 ? doneTasks.length / sprintTasks.length : 0;
                  return (
                    <div
                      key={s.id}
                      className="relative flex items-center"
                      style={{
                        height: ROW_H,
                        borderBottom: '1px solid var(--border)',
                        background: hoveredSprint === s.id ? 'var(--surface-2)' : 'transparent',
                      }}
                      onMouseEnter={() => setHoveredSprint(s.id)}
                      onMouseLeave={() => setHoveredSprint(null)}
                    >
                      {/* Bar track */}
                      <div
                        className="absolute rounded-full"
                        style={{
                          left: `${startPct}%`,
                          width: `${barWidth}%`,
                          height: 8,
                          top: '50%',
                          marginTop: -4,
                          background: `${s.color}22`,
                          border: `1px solid ${s.color}55`,
                        }}
                      />
                      {/* Progress fill */}
                      {progress > 0 && (
                        <div
                          className="absolute rounded-full"
                          style={{
                            left: `${startPct}%`,
                            width: `${barWidth * progress}%`,
                            height: 8,
                            top: '50%',
                            marginTop: -4,
                            background: s.color,
                            opacity: 0.7,
                          }}
                        />
                      )}
                      {/* Sprint start-date resize handle */}
                      {!readOnly && startPct >= 0 && startPct <= 100 && (
                        <div
                          data-resize={s.id}
                          data-resize-type="sprint-start"
                          title={`Drag to change start date · ${new Date(s.startDate).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                          style={{
                            position: 'absolute',
                            left: `${startPct}%`,
                            top: 0,
                            bottom: 0,
                            width: 16,
                            transform: 'translateX(-50%)',
                            zIndex: 6,
                            cursor: 'ew-resize',
                          }}
                        />
                      )}
                      {/* Sprint end-date resize handle */}
                      {!readOnly && endPct >= 0 && endPct <= 100 && (
                        <div
                          data-resize={s.id}
                          data-resize-type="sprint"
                          title={`Drag to change end date · ${new Date(s.endDate).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                          style={{
                            position: 'absolute',
                            left: `${endPct}%`,
                            top: 0,
                            bottom: 0,
                            width: 16,
                            transform: 'translateX(-50%)',
                            zIndex: 6,
                            cursor: 'ew-resize',
                          }}
                        />
                      )}
                      {/* Hover popover */}
                      {hoveredSprint === s.id && sprintTasks.length > 0 && (
                        <div
                          className="absolute z-30 rounded-xl shadow-xl p-3"
                          style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            top: '100%',
                            left: `${startPct}%`,
                            minWidth: 200,
                            maxWidth: 280,
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                            {doneTasks.length}/{sprintTasks.length} tasks complete
                          </p>
                          <div className="space-y-1 max-h-40 overflow-auto">
                            {sprintTasks.slice(0, 12).map((t) => {
                              const isDone = t.status === 'done' || !!t.completedAt;
                              return (
                                <button
                                  key={t.id}
                                  className="flex items-center gap-2 text-xs w-full text-left rounded px-0.5 hover:opacity-80 transition-opacity cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTask(t);
                                  }}
                                >
                                  <span
                                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                    style={{ background: STATUS_COLOR[t.status] ?? '#64748b' }}
                                  />
                                  <span
                                    className="flex-1 truncate"
                                    style={{
                                      color: 'var(--text)',
                                      opacity: isDone ? 0.45 : 1,
                                      textDecoration: isDone ? 'line-through' : 'none',
                                    }}
                                  >
                                    {t.name}
                                  </span>
                                </button>
                              );
                            })}
                            {sprintTasks.length > 12 && (
                              <p className="text-[10px] pt-1" style={{ color: 'var(--text-3)' }}>
                                +{sprintTasks.length - 12} more
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              {ganttView === 'sprints' && sprints.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                  >
                    🗓
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
                      No sub-plans on the timeline
                    </p>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-3)' }}>
                      Sub-plans (sprints) appear as time windows here once created. Go to{' '}
                      <strong style={{ color: 'var(--text-2)' }}>Execute</strong> and create a sprint to get started.
                    </p>
                  </div>
                </div>
              )}

              {/* Milestone bars */}
              {ganttView === 'milestones' &&
                visibleMilestones.map((m) => {
                  const deadlinePct = pct(new Date(m.deadline), vs, ve) * 100;
                  const fillWidth = m.progress * deadlinePct;
                  const color = progressColor(m);
                  const isOverdue = isBeforeToday(m.deadline) && m.status !== 'done';

                  // Sort: active tasks first, done tasks at bottom
                  const sortedDeps = [...m.dependencyList].sort((a, b) => {
                    if (a.status === 'done' && b.status !== 'done') return 1;
                    if (a.status !== 'done' && b.status === 'done') return -1;
                    return 0;
                  });

                  return (
                    <div
                      key={m.id}
                      className="relative flex items-center"
                      style={{
                        height: ROW_H,
                        borderBottom: '1px solid var(--border)',
                        background: hoveredMilestone === m.id ? 'var(--surface-2)' : 'transparent',
                      }}
                      onMouseEnter={() => setHoveredMilestone(m.id)}
                      onMouseLeave={() => setHoveredMilestone(null)}
                    >
                      {/* Bar track */}
                      <div
                        className="absolute rounded-full"
                        style={{
                          left: 0,
                          width: `${Math.max(deadlinePct, 1.5)}%`,
                          height: 8,
                          top: '50%',
                          marginTop: -4,
                          background: `${color}25`,
                          border: `1px solid ${color}40`,
                        }}
                      />
                      {/* Progress fill */}
                      {fillWidth > 0 && (
                        <div
                          className="absolute rounded-full"
                          style={{
                            left: 0,
                            width: `${fillWidth}%`,
                            height: 8,
                            top: '50%',
                            marginTop: -4,
                            background: color,
                            opacity: 0.8,
                          }}
                        />
                      )}
                      {/* Deadline marker - vertical line + diamond */}
                      {deadlinePct >= 0 && deadlinePct <= 100 && (
                        <div
                          style={{
                            position: 'absolute',
                            left: `${deadlinePct}%`,
                            top: 6,
                            bottom: 6,
                            width: 0,
                            zIndex: 2,
                            pointerEvents: 'none',
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              bottom: 0,
                              left: 0,
                              width: 2,
                              background: color,
                              opacity: 0.6,
                              transform: 'translateX(-50%)',
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              top: '50%',
                              left: 0,
                              width: 7,
                              height: 7,
                              background: isOverdue ? '#ef4444' : color,
                              transform: 'translate(-50%, -50%) rotate(45deg)',
                              borderRadius: 1,
                            }}
                          />
                        </div>
                      )}
                      {/* Resize handle - wide transparent hit target on the deadline */}
                      {!readOnly && deadlinePct >= 0 && deadlinePct <= 100 && (
                        <div
                          data-resize={m.id}
                          data-resize-type="milestone"
                          title={`Drag to change deadline · ${new Date(m.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                          style={{
                            position: 'absolute',
                            left: `${deadlinePct}%`,
                            top: 0,
                            bottom: 0,
                            width: 20,
                            transform: 'translateX(-50%)',
                            zIndex: 6,
                            cursor: 'ew-resize',
                          }}
                        />
                      )}

                      {/* Hover popover - flips above when near list bottom */}
                      {hoveredMilestone === m.id && m.dependencyList.length > 0 && (
                        <div
                          className="absolute z-30 rounded-xl shadow-xl p-3"
                          style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            top: '100%',
                            left: '2%',
                            minWidth: 220,
                            maxWidth: 300,
                          }}
                          onMouseEnter={() => setHoveredMilestone(m.id)}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                            {m.doneDependencies}/{m.totalDependencies} tasks done
                          </p>
                          <div className="space-y-1 max-h-48 overflow-auto">
                            {sortedDeps.map((d, i) => {
                              const isDone = d.status === 'done';
                              const isFirstDone = isDone && (i === 0 || sortedDeps[i - 1]?.status !== 'done');
                              return (
                                <div key={d.id}>
                                  {isFirstDone &&
                                    m.doneDependencies > 0 &&
                                    m.doneDependencies < m.totalDependencies && (
                                      <div
                                        className="text-[10px] uppercase tracking-wide pt-1 pb-0.5"
                                        style={{ color: 'var(--text-3)' }}
                                      >
                                        Completed
                                      </div>
                                    )}
                                  <button
                                    className="flex items-center gap-2 text-xs w-full text-left rounded px-0.5 hover:opacity-80 transition-opacity cursor-pointer"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const t = tasks.find((t) => t.id === d.id);
                                      if (t) setSelectedTask(t);
                                    }}
                                  >
                                    <span
                                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                      style={{ background: STATUS_COLOR[d.status] ?? '#64748b' }}
                                    />
                                    <span
                                      className="flex-1 truncate"
                                      style={{
                                        color: 'var(--text)',
                                        textDecoration: isDone ? 'line-through' : 'none',
                                        opacity: isDone ? 0.45 : 1,
                                      }}
                                    >
                                      {d.name}
                                    </span>
                                    {!d.ownerId && !isDone && (
                                      <span
                                        className="text-[10px] px-1 rounded flex-shrink-0"
                                        style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}
                                      >
                                        unassigned
                                      </span>
                                    )}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          {m.unassignedDeps > 0 && (
                            <p
                              className="text-[11px] mt-2 pt-2"
                              style={{ color: '#f59e0b', borderTop: '1px solid var(--border)' }}
                            >
                              ⚠ {m.unassignedDeps} unassigned blocking
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

              {/* Product deadline row - milestones view only */}
              {ganttView === 'milestones' && (
                <div
                  className="relative flex items-center"
                  style={{
                    height: ROW_H,
                    borderBottom: '1px solid var(--border)',
                    background: hoveredProduct ? 'var(--surface-2)' : 'transparent',
                  }}
                  onMouseEnter={() => setHoveredProduct(true)}
                  onMouseLeave={() => setHoveredProduct(false)}
                >
                  {/* Track */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      left: 0,
                      width: `${Math.max(pct(fullEnd, vs, ve) * 100, 1.5)}%`,
                      height: 8,
                      top: '50%',
                      marginTop: -4,
                      background: allDone ? 'rgba(16,185,129,0.15)' : 'rgba(124,58,237,0.15)',
                      border: `1px solid ${allDone ? 'rgba(16,185,129,0.3)' : 'rgba(124,58,237,0.3)'}`,
                    }}
                  />
                  {/* Progress fill */}
                  {progressPct > 0 && (
                    <div
                      className="absolute rounded-full"
                      style={{
                        left: 0,
                        width: `${Math.max(pct(fullEnd, vs, ve) * 100 * (progressPct / 100), 0)}%`,
                        height: 8,
                        top: '50%',
                        marginTop: -4,
                        background: allDone ? '#10b981' : 'var(--brand)',
                        opacity: 0.75,
                      }}
                    />
                  )}
                  {pct(fullEnd, vs, ve) >= 0 && pct(fullEnd, vs, ve) <= 1 && (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${pct(fullEnd, vs, ve) * 100}%`,
                        top: 6,
                        bottom: 6,
                        width: 0,
                        zIndex: 2,
                        pointerEvents: 'none',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: 0,
                          width: 2,
                          background: allDone ? '#10b981' : 'var(--brand)',
                          opacity: 0.6,
                          transform: 'translateX(-50%)',
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          top: '50%',
                          left: 0,
                          width: 7,
                          height: 7,
                          background: allDone ? '#10b981' : 'var(--brand)',
                          transform: 'translate(-50%, -50%) rotate(45deg)',
                          borderRadius: 1,
                        }}
                      />
                    </div>
                  )}
                  {!readOnly && pct(fullEnd, vs, ve) >= 0 && pct(fullEnd, vs, ve) <= 1 && (
                    <div
                      data-resize="product"
                      data-resize-type="product"
                      title={`Drag to change project deadline · ${new Date(product?.deadline ?? activeProduct.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                      style={{
                        position: 'absolute',
                        left: `${pct(fullEnd, vs, ve) * 100}%`,
                        top: 0,
                        bottom: 0,
                        width: 20,
                        transform: 'translateX(-50%)',
                        zIndex: 6,
                        cursor: 'ew-resize',
                      }}
                    />
                  )}

                  {/* Hover popover - milestone list (above the row) */}
                  {hoveredProduct && milestones.length > 0 && (
                    <div
                      className="absolute z-30 rounded-xl shadow-xl p-3"
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        top: '100%',
                        left: '2%',
                        minWidth: 220,
                        maxWidth: 320,
                      }}
                      onMouseEnter={() => setHoveredProduct(true)}
                    >
                      <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                        {doneCount}/{milestones.length} milestones complete
                      </p>
                      <div className="space-y-1 max-h-48 overflow-auto">
                        {orderMilestones(milestones)
                          .map((m, i, arr) => {
                            const isDone = m.status === 'done';
                            const isFirstDone = isDone && (i === 0 || arr[i - 1]?.status !== 'done');
                            return (
                              <div key={m.id}>
                                {isFirstDone && doneCount > 0 && doneCount < milestones.length && (
                                  <div
                                    className="text-[10px] uppercase tracking-wide pt-1 pb-0.5"
                                    style={{ color: 'var(--text-3)' }}
                                  >
                                    Completed
                                  </div>
                                )}
                                <button
                                  className="flex items-center gap-2 text-xs w-full text-left rounded px-0.5 hover:opacity-80 transition-opacity"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const t = tasks.find((t) => t.id === m.id);
                                    if (t) setSelectedTask(t);
                                  }}
                                >
                                  {isDone ? (
                                    <span
                                      className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                                      style={{ background: '#10b981', color: 'white' }}
                                    >
                                      ✓
                                    </span>
                                  ) : (
                                    <span
                                      className="w-3.5 h-3.5 rounded-full border-2 flex-shrink-0"
                                      style={{ borderColor: progressColor(m) }}
                                    />
                                  )}
                                  <span
                                    className="flex-1 truncate"
                                    style={{
                                      color: isDone ? 'var(--text-3)' : 'var(--text)',
                                      textDecoration: isDone ? 'line-through' : 'none',
                                      opacity: isDone ? 0.55 : 1,
                                    }}
                                  >
                                    {m.name}
                                  </span>
                                  <span className="flex-shrink-0 text-[10px]" style={{ color: 'var(--text-3)' }}>
                                    {new Date(m.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                                  </span>
                                </button>
                              </div>
                            );
                          })}
                      </div>
                      {milestones.some(
                        (m) =>
                          m.status !== 'done' && m.doneDependencies < m.totalDependencies && m.totalDependencies > 0,
                      ) && (
                        <p
                          className="text-[11px] mt-2 pt-2"
                          style={{ color: '#f59e0b', borderTop: '1px solid var(--border)' }}
                        >
                          ⚠ Some milestones have incomplete tasks
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Drag handle to resize the name column - spans the full header+body height */}
      <div
        onMouseDown={handleSidebarResizeStart}
        className="absolute top-0 bottom-0 cursor-col-resize z-20"
        style={{ left: sidebarWidth - 2, width: 5 }}
        title="Drag to resize"
      />
      </div>

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          readOnly={readOnly}
          onClose={() => setSelectedTask(null)}
          onUpdated={async () => {
            setSelectedTask(null);
            if (activeProduct) {
              const r = await api.milestones.list(activeProduct.id);
              setMilestones(r.milestones);
            }
          }}
          onDeleted={async () => {
            setSelectedTask(null);
            if (activeProduct) {
              const r = await api.milestones.list(activeProduct.id);
              setMilestones(r.milestones);
            }
          }}
        />
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
            {new Date(m.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      )}
    </div>
  );
}
