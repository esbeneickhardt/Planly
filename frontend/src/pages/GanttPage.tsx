/**
 * Gantt chart page that plots tasks-with-deadlines as milestone bars and sprints as time-window bars
 * against a zoomable, pannable timeline.  View state (zoom, pan, hide-done) is managed by
 * useGanttDragZoom and persisted to localStorage; drag-resize handles write deadline/date changes back to the API on pointer-up.
 * Desktop rendering is split across GanttToolbar (view toggle/hide-done/zoom controls),
 * GanttSidebarList (the left name column) and GanttTimelineBars (the bars + resize handles
 * themselves) - this page owns the data fetch/state glue and coordinates them.
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { DragEndEvent, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { api } from '../api/client';
import { useProduct } from '../context/ProductContext';
import { usePermission } from '../context/PermissionContext';
import TaskDetailPanel from '../components/common/TaskDetailPanel';
import EmptyState from '../components/common/EmptyState';
import type { Task } from '../types';
import GanttMobileList from '../components/gantt/GanttMobileList';
import GanttToolbar from '../components/gantt/GanttToolbar';
import GanttSidebarList from '../components/gantt/GanttSidebarList';
import GanttTimelineBars from '../components/gantt/GanttTimelineBars';
import { useGanttDragZoom } from '../hooks/useGanttDragZoom';
import { useGanttData } from '../hooks/useGanttData';
import { getTimeMarkers, orderMilestones, pct } from '../utils/gantt';

type GanttView = 'milestones' | 'sprints';

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
    // activeProduct: only `.id` drives this effect; object identity changes on every context
    // re-render regardless of which product is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProduct?.id]);

  // Sorted per the user's manually-dragged order if one exists, else soonest-first with done pushed
  // down. Memoized (split from the hideDone filter below into its own memo so toggling "hide done"
  // alone doesn't force a re-sort) since useGanttDragZoom's pan/zoom updates viewStart/viewEnd on
  // every pointermove/wheel tick, re-rendering this page far more often than `milestones` changes.
  const sortedMilestones = useMemo(() => orderMilestones(milestones), [milestones]);
  const visibleMilestones = useMemo(
    () => (hideDone ? sortedMilestones.filter((m) => m.status !== 'done') : sortedMilestones),
    [sortedMilestones, hideDone],
  );

  // Adaptive time-axis markers, recomputed only when the visible window's actual timestamps change.
  // Keyed on primitive ms timestamps, not the vs/ve Date objects themselves - vs/ve fall back to a
  // `fullStart`/`fullEnd` that useGanttDragZoom receives as a *new* Date instance on every render
  // (see the `new Date(activeProduct?.createdAt ...)` passed into that hook above), so keying on the
  // objects directly would recompute on every render even when nothing about the visible range
  // actually changed - defeating the memo for exactly the case (unzoomed, pointer-tick-driven
  // re-renders) this fix is for. The memo rebuilds fresh Date objects from those primitives (rather
  // than closing over vs/ve directly) so its dependency array can list exactly what it reads.
  const vsTime = vs.getTime();
  const veTime = ve.getTime();
  const markers = useMemo(() => getTimeMarkers(new Date(vsTime), new Date(veTime)), [vsTime, veTime]);

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
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  // Width of the left name column, draggable via a handle between it and the timeline; persisted
  // per-product in localStorage. Kept in a ref too so the mouseup handler (registered once per
  // drag, at mousedown time) always persists the latest value rather than a stale closed-over one.
  const [sidebarWidth, setSidebarWidth] = useState(224);
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;
  const sidebarResizeRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    if (!activeProduct) return;
    try {
      const stored = localStorage.getItem(`planly-gantt-sidebarWidth-${activeProduct.id}`);
      const parsed = stored ? parseInt(stored, 10) : NaN;
      setSidebarWidth(Number.isFinite(parsed) ? Math.min(420, Math.max(140, parsed)) : 224);
    } catch {
      setSidebarWidth(224);
    }
    // activeProduct: only `.id` drives this effect; object identity changes on every context
    // re-render regardless of which product is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    return <EmptyState icon="📅" size="lg" description="Create a product to get started" className="h-full" />;
  }

  // Only the very first load shows the full-page spinner. `tasks` changing (e.g. a task marked
  // done) re-triggers this same fetch so milestone progress stays current, but that's a quiet
  // background refresh - gating on `loading` alone would unmount/remount the whole page (including
  // GanttMobileList's local "which card is unfolded" state) every time, discarding it mid-session.
  // `product` only starts null and never resets, so it's a reliable "have we loaded at least once" flag.
  if (loading && !product) {
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
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
            }}
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
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--text-3)',
              }}
            >
              Start by adding tasks in <strong style={{ color: 'var(--text-2)' }}>Execute</strong> or{' '}
              <strong style={{ color: 'var(--text-2)' }}>Tasks</strong>, then set a deadline to create a milestone.
            </div>
          ) : tasksWithoutDeadline > 0 ? (
            <div
              className="rounded-xl px-4 py-3 text-xs leading-relaxed w-full"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--text-3)',
              }}
            >
              You have{' '}
              <strong style={{ color: 'var(--text-2)' }}>
                {tasksWithoutDeadline} task
                {tasksWithoutDeadline !== 1 ? 's' : ''}
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
  const isFullView = vs.getTime() <= fullStart.getTime() && ve.getTime() >= fullEnd.getTime();
  const ROW_H = 52;

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
        <GanttToolbar
          sidebarWidth={sidebarWidth}
          ganttView={ganttView}
          setGanttView={setGanttView}
          doneCount={doneCount}
          hideDone={hideDone}
          onToggleHideDone={() =>
            setHideDone((v) => {
              const next = !v;
              try {
                if (activeProduct) localStorage.setItem(`planly-gantt-hideDone-${activeProduct.id}`, String(next));
              } catch {
                /* ignore */
              }
              return next;
            })
          }
          vs={vs}
          ve={ve}
          markers={markers}
          todayPct={todayPct}
          isFullView={isFullView}
          applyZoom={applyZoom}
          onFit={() => {
            setViewStart(fullStart);
            setViewEnd(fullEnd);
          }}
        />

        {/* Scrollable body (desktop only) */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="flex min-h-full">
            {/* Left: names (sticky left edge) */}
            <GanttSidebarList
              ganttView={ganttView}
              sidebarWidth={sidebarWidth}
              activeProduct={activeProduct}
              sprints={sprints}
              tasks={tasks}
              visibleMilestones={visibleMilestones}
              milestoneDragSensors={milestoneDragSensors}
              onMilestoneDragEnd={handleMilestoneDragEnd}
              hoveredSprint={hoveredSprint}
              setHoveredSprint={setHoveredSprint}
              hoveredMilestone={hoveredMilestone}
              setHoveredMilestone={setHoveredMilestone}
              hoveredProduct={hoveredProduct}
              setHoveredProduct={setHoveredProduct}
              setSelectedTask={setSelectedTask}
              rowHeight={ROW_H}
            />

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
              <GanttTimelineBars
                ganttView={ganttView}
                vs={vs}
                ve={ve}
                sprints={sprints}
                tasks={tasks}
                visibleMilestones={visibleMilestones}
                milestones={milestones}
                readOnly={readOnly}
                rowHeight={ROW_H}
                todayPct={todayPct}
                fullEnd={fullEnd}
                doneCount={doneCount}
                hoveredSprint={hoveredSprint}
                setHoveredSprint={setHoveredSprint}
                hoveredMilestone={hoveredMilestone}
                setHoveredMilestone={setHoveredMilestone}
                hoveredProduct={hoveredProduct}
                setHoveredProduct={setHoveredProduct}
                setSelectedTask={setSelectedTask}
              />
            </div>
          </div>
        </div>

        {/* Drag handle to resize the name column - spans the full header+body height */}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- mouse-only drag-to-resize handle; there's no discrete click action to give a keyboard equivalent for */}
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
