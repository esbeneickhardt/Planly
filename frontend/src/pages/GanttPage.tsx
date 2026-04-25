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
  const overdue = deadline < now;
  if (overdue) return m.progress >= 0.5 ? '#f59e0b' : '#ef4444';
  return m.progress >= 0.75 ? '#10b981' : m.progress >= 0.4 ? '#f59e0b' : '#ef4444';
}

function monthsBetween(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

function pct(date: Date, start: Date, end: Date): number {
  const total = end.getTime() - start.getTime();
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, (date.getTime() - start.getTime()) / total));
}

export default function GanttPage() {
  const { activeProduct, tasks } = useProduct();
  const [milestones, setMilestones] = useState<MilestoneResult[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoveredMilestone, setHoveredMilestone] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeProduct) return;
    setLoading(true);
    api.milestones.list(activeProduct.id)
      .then(({ milestones: ms, product: p }) => { setMilestones(ms); setProduct(p); })
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
    return <div className="h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }} /></div>;
  }

  if (milestones.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ color: 'var(--text-3)' }}>
        <div className="text-5xl opacity-30">📅</div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>No milestones yet</p>
        <p className="text-xs text-center max-w-xs">Set a deadline on any task to make it a milestone. Milestones appear here with automatic progress tracking.</p>
      </div>
    );
  }

  const start = new Date(product?.createdAt ?? activeProduct.createdAt);
  const end = new Date(product?.deadline ?? activeProduct.deadline);
  const today = new Date();
  const todayPct = pct(today, start, end);
  const months = monthsBetween(start, end);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-3">
          {activeProduct.emoji && <span className="text-xl">{activeProduct.emoji}</span>}
          <div>
            <h1 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{activeProduct.name} — Gantt</h1>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              {milestones.length} milestone{milestones.length !== 1 ? 's' : ''} · Deadline {new Date(activeProduct.deadline).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Gantt body */}
      <div className="flex-1 overflow-auto">
        <div className="flex min-h-full" style={{ minWidth: 700 }}>
          {/* Left: names */}
          <div className="flex-shrink-0 w-56" style={{ borderRight: '1px solid var(--border)' }}>
            {/* Header spacer */}
            <div className="h-10 px-4 flex items-end pb-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Milestone</span>
            </div>
            {/* Milestone name rows */}
            {milestones.map((m) => (
              <div
                key={m.id}
                className="h-16 px-4 flex items-center gap-2 cursor-pointer transition-colors"
                style={{ borderBottom: '1px solid var(--border)', background: hoveredMilestone === m.id ? 'var(--surface-2)' : 'transparent' }}
                onMouseEnter={() => setHoveredMilestone(m.id)}
                onMouseLeave={() => setHoveredMilestone(null)}
                onClick={() => {
                  const task = tasks.find((t) => t.id === m.id);
                  if (task) setSelectedTask(task);
                }}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: progressColor(m) }} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{m.name}</p>
                  {m.owner && (
                    <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>
                      {m.owner.avatarEmoji ?? '👤'} {m.owner.username}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {/* Product row */}
            <div className="h-16 px-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--brand)' }} />
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{activeProduct.name}</p>
            </div>
          </div>

          {/* Right: timeline */}
          <div className="flex-1 overflow-x-auto" ref={timelineRef}>
            <div style={{ minWidth: 500, position: 'relative' }}>
              {/* Month axis */}
              <div className="h-10 relative" style={{ borderBottom: '1px solid var(--border)' }}>
                {months.map((month) => {
                  const pos = pct(month, start, end) * 100;
                  return (
                    <div
                      key={month.toISOString()}
                      className="absolute top-0 h-full flex items-end pb-1.5"
                      style={{ left: `${pos}%`, paddingLeft: 4 }}
                    >
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                        {month.toLocaleDateString('en', { month: 'short', year: '2-digit' })}
                      </span>
                    </div>
                  );
                })}
                {/* Today marker (top axis) */}
                {todayPct >= 0 && todayPct <= 1 && (
                  <div className="absolute top-0 h-full flex items-end pb-1.5" style={{ left: `${todayPct * 100}%`, zIndex: 2 }}>
                    <span className="text-xs font-semibold px-1 rounded" style={{ background: 'var(--brand)', color: 'white', fontSize: 10 }}>Today</span>
                  </div>
                )}
              </div>

              {/* Milestone rows */}
              <div style={{ position: 'relative' }}>
                {/* Today line */}
                {todayPct >= 0 && todayPct <= 1 && (
                  <div
                    style={{
                      position: 'absolute', top: 0, bottom: 0, left: `${todayPct * 100}%`,
                      width: 2, background: 'var(--brand)', zIndex: 3, opacity: 0.7,
                    }}
                  />
                )}

                {milestones.map((m) => {
                  const deadlinePct = pct(new Date(m.deadline), start, end) * 100;
                  const fillWidth = m.progress * deadlinePct;
                  const color = progressColor(m);
                  const isOverdue = new Date(m.deadline) < today && m.status !== 'done';

                  return (
                    <div
                      key={m.id}
                      className="h-16 relative flex items-center px-4"
                      style={{ borderBottom: '1px solid var(--border)', background: hoveredMilestone === m.id ? 'var(--surface-2)' : 'transparent' }}
                      onMouseEnter={() => setHoveredMilestone(m.id)}
                      onMouseLeave={() => setHoveredMilestone(null)}
                    >
                      {/* Bar track */}
                      <div
                        className="absolute rounded-full"
                        style={{
                          left: '1%',
                          width: `${Math.max(deadlinePct - 1, 2)}%`,
                          height: 12,
                          background: `${color}22`,
                          border: `1px solid ${color}44`,
                        }}
                      />
                      {/* Progress fill */}
                      {fillWidth > 1 && (
                        <div
                          className="absolute rounded-full"
                          style={{
                            left: '1%',
                            width: `${fillWidth - 1}%`,
                            height: 12,
                            background: color,
                            opacity: 0.85,
                          }}
                        />
                      )}
                      {/* Deadline flag */}
                      <div
                        className="absolute flex items-center gap-1"
                        style={{ left: `${deadlinePct}%`, top: '50%', transform: 'translate(-50%, -50%)', zIndex: 2 }}
                      >
                        <span style={{ fontSize: 16 }}>{isOverdue ? '⚠️' : '⚑'}</span>
                      </div>
                      {/* Label */}
                      <div
                        className="absolute"
                        style={{ left: `${Math.min(deadlinePct + 2, 85)}%`, top: '50%', transform: 'translateY(-50%)' }}
                      >
                        <span className="text-xs font-medium whitespace-nowrap" style={{ color }}>
                          {m.doneDependencies}/{m.totalDependencies || '—'} done
                        </span>
                      </div>

                      {/* Hover popover */}
                      {hoveredMilestone === m.id && m.dependencyList.length > 0 && (
                        <div
                          className="absolute z-20 rounded-xl shadow-xl p-4"
                          style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            top: '100%',
                            left: '2%',
                            minWidth: 240,
                            maxWidth: 320,
                          }}
                        >
                          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                            Dependencies ({m.doneDependencies}/{m.totalDependencies} done)
                          </p>
                          <div className="space-y-1 max-h-40 overflow-auto">
                            {m.dependencyList.map((d) => (
                              <div key={d.id} className="flex items-center gap-2 text-xs">
                                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[d.status] ?? '#64748b' }} />
                                <span className="flex-1 truncate" style={{ color: 'var(--text)', textDecoration: d.status === 'done' ? 'line-through' : 'none', opacity: d.status === 'done' ? 0.5 : 1 }}>{d.name}</span>
                                {!d.ownerId && d.status !== 'done' && <span className="text-[10px] px-1 rounded" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>unassigned</span>}
                              </div>
                            ))}
                          </div>
                          {m.unassignedDeps > 0 && (
                            <p className="text-xs mt-2 pt-2" style={{ color: '#f59e0b', borderTop: '1px solid var(--border)' }}>
                              ⚠ {m.unassignedDeps} unassigned task{m.unassignedDeps !== 1 ? 's' : ''} blocking this milestone
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Product row */}
                <div className="h-16 relative flex items-center px-4" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div
                    className="absolute rounded-full"
                    style={{
                      left: '1%',
                      width: `${Math.max(pct(end, start, end) * 100 - 1, 2)}%`,
                      height: 12,
                      background: 'rgba(124,58,237,0.15)',
                      border: '1px solid rgba(124,58,237,0.3)',
                    }}
                  />
                  <div
                    className="absolute flex items-center"
                    style={{ right: '2%', top: '50%', transform: 'translateY(-50%)' }}
                  >
                    <span className="text-xs font-semibold" style={{ color: 'var(--brand)' }}>
                      {new Date(activeProduct.deadline).toLocaleDateString()}
                    </span>
                  </div>
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
          onUpdated={async () => { setSelectedTask(null); if (activeProduct) { const r = await api.milestones.list(activeProduct.id); setMilestones(r.milestones); } }}
        />
      )}
    </div>
  );
}
