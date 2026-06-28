import { useState, useEffect, useRef } from 'react';
import { api, MilestoneResult } from '../api/client';
import { useProduct } from '../context/ProductContext';
import type { Product } from '../types';
import TaskDetailPanel from '../components/common/TaskDetailPanel';
import type { Task } from '../types';

const STATUS_COLOR: Record<string, string> = {
  backlog: '#64748b', todo: '#3b82f6', in_progress: '#f59e0b', done: '#10b981', blocked: '#ef4444',
};

function progressColor(m: MilestoneResult): string {
  if (m.status === 'done') return '#10b981';
  const now = new Date();
  const deadline = new Date(m.deadline);
  if (deadline < now) return m.progress >= 0.5 ? '#f59e0b' : '#ef4444';
  return m.progress >= 0.75 ? '#10b981' : m.progress >= 0.4 ? '#f59e0b' : '#ef4444';
}

function pct(date: Date, start: Date, end: Date): number {
  const total = end.getTime() - start.getTime();
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, (date.getTime() - start.getTime()) / total));
}

// Adaptive time markers — max ~15 labels regardless of zoom level
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
        label: monthStep >= 12
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

export default function GanttPage() {
  const { activeProduct, tasks } = useProduct();
  const [milestones, setMilestones] = useState<MilestoneResult[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoveredMilestone, setHoveredMilestone] = useState<string | null>(null);
  const [hoveredProduct, setHoveredProduct] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [viewStart, setViewStart] = useState<Date | null>(null);
  const [viewEnd, setViewEnd] = useState<Date | null>(null);
  const [hideDone, setHideDone] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef({ vs: new Date(), ve: new Date(), fullStart: new Date(), fullEnd: new Date() });
  const dragState = useRef<{ startX: number; vs: Date; ve: Date } | null>(null);

  useEffect(() => {
    if (!activeProduct) return;
    setLoading(true);
    api.milestones.list(activeProduct.id)
      .then(({ milestones: ms, product: p }) => {
        setMilestones(ms);
        setProduct(p);
        const s = new Date(p?.createdAt ?? activeProduct.createdAt);
        const e = new Date(p?.deadline ?? activeProduct.deadline);
        setViewStart(s);
        setViewEnd(e);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeProduct, tasks]);

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
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (milestones.length === 0) {
    const tasksWithoutDeadline = tasks.filter((t) => !t.deadline && t.status !== 'done').length;
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3" style={{ color: 'var(--text-3)' }}>
        <div className="text-5xl opacity-30">📅</div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>No milestones yet</p>
        <p className="text-xs text-center max-w-xs" style={{ color: 'var(--text-3)' }}>
          In Planly, a milestone is any task with a deadline. Open a task and set its deadline to make it appear here with progress tracking.
        </p>
        {tasksWithoutDeadline > 0 && (
          <p className="text-xs text-center" style={{ color: 'var(--text-3)' }}>
            You have <strong style={{ color: 'var(--text-2)' }}>{tasksWithoutDeadline}</strong> task{tasksWithoutDeadline !== 1 ? 's' : ''} without a deadline — set one to create a milestone.
          </p>
        )}
        {tasks.length === 0 && (
          <p className="text-xs text-center" style={{ color: 'var(--text-3)' }}>
            This project has no tasks yet. Add tasks in the Execute or Tasks view first.
          </p>
        )}
      </div>
    );
  }

  const fullStart = new Date(product?.createdAt ?? activeProduct.createdAt);
  const fullEnd = new Date(product?.deadline ?? activeProduct.deadline);
  const today = new Date();

  // Sort: active milestones first (soonest deadline first), done milestones last
  const sortedMilestones = [...milestones].sort((a, b) => {
    const aDone = a.status === 'done';
    const bDone = b.status === 'done';
    if (aDone !== bDone) return aDone ? 1 : -1;
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });
  const visibleMilestones = hideDone ? sortedMilestones.filter((m) => m.status !== 'done') : sortedMilestones;
  const doneCount = milestones.filter((m) => m.status === 'done').length;

  const vs = viewStart ?? fullStart;
  const ve = viewEnd ?? fullEnd;

  viewRef.current = { vs, ve, fullStart, fullEnd };

  const todayPct = pct(today, vs, ve);
  const markers = getTimeMarkers(vs, ve);

  function applyZoom(factor: number, anchorRatio = 0.5) {
    const span = ve.getTime() - vs.getTime();
    const newSpan = span * factor;
    const minSpan = 3 * 86_400_000;
    if (newSpan < minSpan) return;
    const anchor = vs.getTime() + anchorRatio * span;
    let newStart = anchor - anchorRatio * newSpan;
    const newEnd = anchor + (1 - anchorRatio) * newSpan;
    if (newStart < fullStart.getTime()) newStart = fullStart.getTime();
    setViewStart(new Date(newStart));
    setViewEnd(new Date(newEnd));
  }

  const attachWheel = (el: HTMLDivElement | null) => {
    (timelineRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (!el) return;
    if ((el as HTMLDivElement & { _wheelAttached?: boolean })._wheelAttached) return;
    (el as HTMLDivElement & { _wheelAttached?: boolean })._wheelAttached = true;
    el.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const { vs, ve, fullStart } = viewRef.current;
      const rect = el.getBoundingClientRect();
      const span = ve.getTime() - vs.getTime();

      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // Horizontal scroll → pan
        const deltaMs = (e.deltaX / rect.width) * span * 1.5;
        let newStart = vs.getTime() + deltaMs;
        const newEnd = ve.getTime() + deltaMs;
        if (newStart < fullStart.getTime()) newStart = fullStart.getTime();
        viewRef.current.vs = new Date(newStart);
        viewRef.current.ve = new Date(newEnd);
        setViewStart(new Date(newStart));
        setViewEnd(new Date(newEnd));
        return;
      }

      // Vertical scroll → zoom
      const mouseRatio = (e.clientX - rect.left) / rect.width;
      const factor = e.deltaY > 0 ? 1.25 : 0.8;
      const newSpan = span * factor;
      const minSpan = 3 * 86_400_000;
      if (newSpan < minSpan) return;
      const anchor = vs.getTime() + mouseRatio * span;
      let newStart = anchor - mouseRatio * newSpan;
      const newEnd = anchor + (1 - mouseRatio) * newSpan;
      if (newStart < fullStart.getTime()) newStart = fullStart.getTime();
      viewRef.current.vs = new Date(newStart);
      viewRef.current.ve = new Date(newEnd);
      setViewStart(new Date(newStart));
      setViewEnd(new Date(newEnd));
    }, { passive: false });
  };

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    dragState.current = { startX: e.clientX, vs, ve };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const rect = e.currentTarget.getBoundingClientRect();
    const span = dragState.current.ve.getTime() - dragState.current.vs.getTime();
    const deltaMs = -(dx / rect.width) * span;
    let newStart = dragState.current.vs.getTime() + deltaMs;
    const newEnd = dragState.current.ve.getTime() + deltaMs;
    if (newStart < fullStart.getTime()) newStart = fullStart.getTime();
    setViewStart(new Date(newStart));
    setViewEnd(new Date(newEnd));
  }

  function handlePointerUp() { dragState.current = null; setIsDragging(false); }

  const isFullView = vs.getTime() <= fullStart.getTime() && ve.getTime() >= fullEnd.getTime();
  const ROW_H = 52;

  const allDone = doneCount === milestones.length;
  const progressPct = milestones.length > 0 ? Math.round((doneCount / milestones.length) * 100) : 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Summary bar */}
      <div className="flex-shrink-0 px-4 py-2 flex items-center gap-4" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {/* Progress */}
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            {doneCount}/{milestones.length} milestone{milestones.length !== 1 ? 's' : ''} complete
          </span>
          <div className="flex-1 max-w-48 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%`, background: allDone ? '#10b981' : 'var(--brand)' }} />
          </div>
          <span className="text-xs font-medium" style={{ color: allDone ? '#10b981' : 'var(--text-3)' }}>{progressPct}%</span>
        </div>

        {/* Hide done toggle */}
        {doneCount > 0 && (
          <button
            onClick={() => setHideDone((v) => !v)}
            className="flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-medium transition-all flex-shrink-0"
            style={{
              background: hideDone ? 'var(--surface-2)' : 'rgba(16,185,129,0.12)',
              color: hideDone ? 'var(--text-3)' : '#10b981',
              border: `1px solid ${hideDone ? 'var(--border)' : 'rgba(16,185,129,0.3)'}`,
            }}
          >
            <span style={{ fontSize: 10 }}>{hideDone ? '○' : '✓'}</span>
            {hideDone ? `Show ${doneCount} done` : `${doneCount} done`}
          </button>
        )}

        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>
          Due {new Date(activeProduct.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex min-h-full">

          {/* Left: names (sticky) */}
          <div className="flex-shrink-0 w-52 sticky left-0 z-10" style={{ borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
            {/* Header with zoom controls */}
            <div className="h-10 px-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Milestone</span>
              <div className="flex items-center gap-0.5">
                <button onClick={() => applyZoom(0.5)} className="w-6 h-6 rounded flex items-center justify-center text-sm font-semibold hover:opacity-80 transition-opacity" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }} title="Zoom in">+</button>
                <button onClick={() => applyZoom(2)} disabled={isFullView} className="w-6 h-6 rounded flex items-center justify-center text-sm font-semibold hover:opacity-80 transition-opacity disabled:opacity-30" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }} title="Zoom out">−</button>
                <button onClick={() => { setViewStart(fullStart); setViewEnd(fullEnd); }} disabled={isFullView} className="h-6 px-1.5 rounded text-xs font-medium hover:opacity-80 transition-opacity disabled:opacity-30" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>Fit</button>
              </div>
            </div>

            {visibleMilestones.map((m) => {
              const color = progressColor(m);
              const isDone = m.status === 'done';
              return (
                <div
                  key={m.id}
                  className="px-3 flex flex-col justify-center cursor-pointer transition-colors"
                  style={{ height: ROW_H, borderBottom: '1px solid var(--border)', background: hoveredMilestone === m.id ? 'var(--surface-2)' : 'transparent' }}
                  onMouseEnter={() => setHoveredMilestone(m.id)}
                  onMouseLeave={() => setHoveredMilestone(null)}
                  onClick={() => { const t = tasks.find((t) => t.id === m.id); if (t) setSelectedTask(t); }}
                >
                  <div className="flex items-center gap-1.5">
                    {isDone && (
                      <span className="flex-shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ background: '#10b981', color: 'white' }}>✓</span>
                    )}
                    <p className="text-xs font-medium leading-tight min-w-0" title={m.name} style={{ color: isDone ? 'var(--text-3)' : 'var(--text)', textDecoration: isDone ? 'line-through' : 'none', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.name}</p>
                  </div>
                  {!isDone && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                        {m.doneDependencies}/{m.totalDependencies || 0} done
                      </span>
                      {m.owner && (
                        <span className="text-[11px] truncate" style={{ color: 'var(--text-3)' }}>· {m.owner.avatarEmoji ?? '👤'} {m.owner.username}</span>
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
            })}

            {/* Product / Final Delivery row */}
            <div
              className="px-3 flex flex-col justify-center gap-1 cursor-default"
              style={{ height: ROW_H, borderBottom: '1px solid var(--border)', background: hoveredProduct ? 'var(--surface-2)' : 'transparent' }}
            >
              <p className="text-xs font-semibold leading-tight" title={`${activeProduct.emoji ?? ''} ${activeProduct.name}`} style={{ color: 'var(--text)', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{activeProduct.emoji} {activeProduct.name}</p>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: allDone ? '#10b981' : 'var(--brand)' }} />
                </div>
                <span className="text-[11px] flex-shrink-0" style={{ color: allDone ? '#10b981' : 'var(--text-3)' }}>
                  {doneCount}/{milestones.length}
                </span>
              </div>
            </div>
          </div>

          {/* Right: timeline */}
          <div
            className="flex-1 overflow-hidden select-none"
            style={{ paddingRight: 24, cursor: isDragging ? 'grabbing' : 'grab' }}
            ref={attachWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <div style={{ position: 'relative', height: '100%' }}>

              {/* Time axis */}
              <div className="h-10 relative overflow-hidden" style={{ borderBottom: '1px solid var(--border)' }}>
                {markers.map((marker) => {
                  const pos = pct(marker.date, vs, ve) * 100;
                  if (pos < 0 || pos > 97) return null;
                  return (
                    <div
                      key={marker.date.toISOString()}
                      className="absolute top-0 h-full flex items-end pb-2"
                      style={{ left: `${pos}%`, paddingLeft: 4, pointerEvents: 'none' }}
                    >
                      <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-3)' }}>{marker.label}</span>
                    </div>
                  );
                })}
                {todayPct > 0 && todayPct < 1 && (
                  <div className="absolute top-0 h-full flex items-end pb-1.5" style={{ left: `${todayPct * 100}%`, zIndex: 2, pointerEvents: 'none' }}>
                    <span className="text-[10px] font-semibold px-1 rounded" style={{ background: 'var(--brand)', color: 'white' }}>Today</span>
                  </div>
                )}
              </div>

              {/* Rows */}
              <div style={{ position: 'relative' }}>
                {/* Today line */}
                {todayPct > 0 && todayPct < 1 && (
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${todayPct * 100}%`, width: 1, background: 'var(--brand)', zIndex: 3, opacity: 0.5, pointerEvents: 'none' }} />
                )}

                {visibleMilestones.map((m) => {
                  const deadlinePct = pct(new Date(m.deadline), vs, ve) * 100;
                  const fillWidth = m.progress * deadlinePct;
                  const color = progressColor(m);
                  const isOverdue = new Date(m.deadline) < today && m.status !== 'done';

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
                      style={{ height: ROW_H, borderBottom: '1px solid var(--border)', background: hoveredMilestone === m.id ? 'var(--surface-2)' : 'transparent' }}
                      onMouseEnter={() => setHoveredMilestone(m.id)}
                      onMouseLeave={() => setHoveredMilestone(null)}
                    >
                      {/* Bar track */}
                      <div
                        className="absolute rounded-full"
                        style={{ left: '0.5%', width: `${Math.max(deadlinePct - 0.5, 1.5)}%`, height: 8, top: '50%', marginTop: -4, background: `${color}25`, border: `1px solid ${color}40` }}
                      />
                      {/* Progress fill */}
                      {fillWidth > 0.5 && (
                        <div className="absolute rounded-full" style={{ left: '0.5%', width: `${Math.max(fillWidth - 0.5, 0)}%`, height: 8, top: '50%', marginTop: -4, background: color, opacity: 0.8 }} />
                      )}
                      {/* Deadline marker — vertical line + diamond */}
                      {deadlinePct >= 0 && deadlinePct <= 100 && (
                        <div style={{ position: 'absolute', left: `${deadlinePct}%`, top: 6, bottom: 6, width: 0, zIndex: 2, pointerEvents: 'none' }}>
                          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 2, background: color, opacity: 0.6, transform: 'translateX(-50%)' }} />
                          <div style={{ position: 'absolute', top: '50%', left: 0, width: 7, height: 7, background: isOverdue ? '#ef4444' : color, transform: 'translate(-50%, -50%) rotate(45deg)', borderRadius: 1 }} />
                        </div>
                      )}

                      {/* Hover popover */}
                      {hoveredMilestone === m.id && m.dependencyList.length > 0 && (
                        <div
                          className="absolute z-20 rounded-xl shadow-xl p-3"
                          style={{ background: 'var(--surface)', border: '1px solid var(--border)', top: '100%', left: '2%', minWidth: 220, maxWidth: 300 }}
                          onMouseEnter={() => setHoveredMilestone(m.id)}
                        >
                          <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                            {m.doneDependencies}/{m.totalDependencies} tasks done
                          </p>
                          <div className="space-y-1 max-h-48 overflow-auto">
                            {sortedDeps.map((d, i) => {
                              const isDone = d.status === 'done';
                              const isFirstDone = isDone && (i === 0 || sortedDeps[i - 1].status !== 'done');
                              return (
                                <div key={d.id}>
                                  {isFirstDone && m.doneDependencies > 0 && m.doneDependencies < m.totalDependencies && (
                                    <div className="text-[10px] uppercase tracking-wide pt-1 pb-0.5" style={{ color: 'var(--text-3)' }}>Completed</div>
                                  )}
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[d.status] ?? '#64748b' }} />
                                    <span className="flex-1 truncate" style={{ color: 'var(--text)', textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.45 : 1 }}>{d.name}</span>
                                    {!d.ownerId && !isDone && <span className="text-[10px] px-1 rounded flex-shrink-0" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>unassigned</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {m.unassignedDeps > 0 && (
                            <p className="text-[11px] mt-2 pt-2" style={{ color: '#f59e0b', borderTop: '1px solid var(--border)' }}>
                              ⚠ {m.unassignedDeps} unassigned blocking
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Product deadline row */}
                <div
                  className="relative flex items-center"
                  style={{ height: ROW_H, borderBottom: '1px solid var(--border)', background: hoveredProduct ? 'var(--surface-2)' : 'transparent' }}
                  onMouseEnter={() => setHoveredProduct(true)}
                  onMouseLeave={() => setHoveredProduct(false)}
                >
                  {/* Track */}
                  <div className="absolute rounded-full" style={{ left: '0.5%', width: `${Math.max(pct(fullEnd, vs, ve) * 100 - 0.5, 1.5)}%`, height: 8, top: '50%', marginTop: -4, background: allDone ? 'rgba(16,185,129,0.15)' : 'rgba(124,58,237,0.15)', border: `1px solid ${allDone ? 'rgba(16,185,129,0.3)' : 'rgba(124,58,237,0.3)'}` }} />
                  {/* Progress fill */}
                  {progressPct > 0 && (
                    <div className="absolute rounded-full" style={{ left: '0.5%', width: `${Math.max(pct(fullEnd, vs, ve) * 100 * (progressPct / 100) - 0.5, 0)}%`, height: 8, top: '50%', marginTop: -4, background: allDone ? '#10b981' : 'var(--brand)', opacity: 0.75 }} />
                  )}
                  {pct(fullEnd, vs, ve) >= 0 && pct(fullEnd, vs, ve) <= 1 && (
                    <div style={{ position: 'absolute', left: `${pct(fullEnd, vs, ve) * 100}%`, top: 6, bottom: 6, width: 0, zIndex: 2, pointerEvents: 'none' }}>
                      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 2, background: allDone ? '#10b981' : 'var(--brand)', opacity: 0.6, transform: 'translateX(-50%)' }} />
                      <div style={{ position: 'absolute', top: '50%', left: 0, width: 7, height: 7, background: allDone ? '#10b981' : 'var(--brand)', transform: 'translate(-50%, -50%) rotate(45deg)', borderRadius: 1 }} />
                    </div>
                  )}

                  {/* Hover popover — milestone list (above the row, no gap) */}
                  {hoveredProduct && milestones.length > 0 && (
                    <div
                      className="absolute z-20 rounded-xl shadow-xl p-3"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', bottom: '100%', left: '2%', minWidth: 220, maxWidth: 320 }}
                      onMouseEnter={() => setHoveredProduct(true)}
                    >
                      <p className="text-[11px] font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                        {doneCount}/{milestones.length} milestones complete
                      </p>
                      <div className="space-y-1 max-h-48 overflow-auto">
                        {[...milestones]
                          .sort((a, b) => {
                            if (a.status === 'done' && b.status !== 'done') return 1;
                            if (a.status !== 'done' && b.status === 'done') return -1;
                            return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
                          })
                          .map((m, i, arr) => {
                            const isDone = m.status === 'done';
                            const isFirstDone = isDone && (i === 0 || arr[i - 1].status !== 'done');
                            return (
                              <div key={m.id}>
                                {isFirstDone && doneCount > 0 && doneCount < milestones.length && (
                                  <div className="text-[10px] uppercase tracking-wide pt-1 pb-0.5" style={{ color: 'var(--text-3)' }}>Completed</div>
                                )}
                                <div className="flex items-center gap-2 text-xs">
                                  {isDone
                                    ? <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0" style={{ background: '#10b981', color: 'white' }}>✓</span>
                                    : <span className="w-3.5 h-3.5 rounded-full border-2 flex-shrink-0" style={{ borderColor: progressColor(m) }} />
                                  }
                                  <span className="flex-1 truncate" style={{ color: isDone ? 'var(--text-3)' : 'var(--text)', textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.55 : 1 }}>{m.name}</span>
                                  <span className="flex-shrink-0 text-[10px]" style={{ color: 'var(--text-3)' }}>
                                    {new Date(m.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                      {milestones.some((m) => m.status !== 'done' && m.doneDependencies < m.totalDependencies && m.totalDependencies > 0) && (
                        <p className="text-[11px] mt-2 pt-2" style={{ color: '#f59e0b', borderTop: '1px solid var(--border)' }}>
                          ⚠ Some milestones have incomplete tasks
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdated={async () => {
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
