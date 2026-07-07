import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api/client';
import { useProduct } from '../context/ProductContext';
import { usePermission } from '../context/PermissionContext';
import { useAuth } from '../context/AuthContext';

interface DayStat { date: string; count: number }
interface StatusStat { status: string; count: number }
interface SprintVelocity { sprintId: string; name: string; startDate: string; endDate: string; color: string; completed: number }
interface AnalyticsData {
  tasksByDay: DayStat[];
  cycleTimeAvgDays: number | null;
  totalCompleted: number;
  totalActive: number;
  statusBreakdown: StatusStat[];
  sprintVelocity: SprintVelocity[];
}
interface WorkloadData {
  statusBreakdown: StatusStat[];
  totalActive: number;
  totalCompleted: number;
  completionsByDay: DayStat[];
}
interface ActivityEvent {
  id: string; actorId: string; action: string; entityType: string;
  entityId: string | null; entityName: string | null; metadata: unknown; createdAt: string;
}

type Period = '7d' | '30d' | '90d' | 'all';
const PERIOD_DAYS: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90, 'all': 0 };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Not started', todo: 'To Do', in_progress: 'In Progress', blocked: 'Blocked', done: 'Done',
};
const STATUS_COLOR: Record<string, string> = {
  backlog: '#64748b', todo: '#3b82f6', in_progress: '#f59e0b', blocked: '#ef4444', done: '#10b981',
};

function actionLabel(action: string) {
  const map: Record<string, string> = {
    'task.created': 'created task', 'task.updated': 'updated task',
    'task.status_changed': 'moved task', 'task.deleted': 'deleted task',
    'cycle.created': 'created sprint', 'cycle.updated': 'updated sprint',
  };
  return map[action] ?? action.replace('.', ' ');
}
function actionIcon(action: string) {
  if (action.includes('created')) return '✦';
  if (action.includes('deleted')) return '✕';
  if (action.includes('status')) return '→';
  return '✎';
}
function actionColor(action: string) {
  if (action.includes('created')) return 'var(--brand)';
  if (action.includes('deleted')) return '#ef4444';
  if (action.includes('status')) return '#f59e0b';
  return 'var(--text-3)';
}
function formatRelative(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Bar chart where each bar column always has the same total height (bar area + label area),
// so bars align at the baseline regardless of whether labels are shown.
function BarChart({
  data, height = 100, labelHeight = 14, color = 'var(--brand)',
}: { data: { label: string; count: number }[]; height?: number; labelHeight?: number; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-px" style={{ height: height + labelHeight }}>
      {data.map(({ label, count }, i) => (
        <div key={i} className="flex-1 flex flex-col group" style={{ height: '100%' }}>
          {/* Bar area */}
          <div className="relative flex-1 flex flex-col justify-end">
            {count > 0 && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-medium px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none"
                style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                {count}
              </div>
            )}
            <div className="w-full rounded-t-sm transition-all"
              style={{
                height: `${Math.max((count / max) * 100, count > 0 ? 4 : 1)}%`,
                background: count > 0 ? color : 'var(--border)',
                opacity: count > 0 ? 0.7 + (count / max) * 0.3 : 0.25,
              }} />
          </div>
          {/* Label area - always rendered, fixed height */}
          <div style={{ height: labelHeight, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 1 }}>
            {label && <span className="text-[9px] leading-none" style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{label}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function LineChart({
  data, height = 100, labelHeight = 14, color = '#10b981',
}: { data: { label: string; count: number }[]; height?: number; labelHeight?: number; color?: string }) {
  if (data.length < 2) return <div style={{ height: height + labelHeight }} />;
  const max = Math.max(1, ...data.map((d) => d.count));
  const w = 1000; // SVG coordinate space width
  const h = height;
  const pad = { l: 4, r: 4, t: 10, b: 4 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const pts = data.map((d, i) => ({
    x: pad.l + (i / (data.length - 1)) * innerW,
    y: pad.t + (1 - d.count / max) * innerH,
    ...d,
  }));

  // Build SVG path
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  // Area fill path
  const areaPath = `${linePath} L${pts[pts.length - 1]!.x.toFixed(1)},${(pad.t + innerH).toFixed(1)} L${pts[0]!.x.toFixed(1)},${(pad.t + innerH).toFixed(1)} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height, display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#cumGrad)" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="10" fill="transparent">
              <title>{p.count} tasks{p.label ? ` · ${p.label}` : ''}</title>
            </circle>
            <circle cx={p.x} cy={p.y} r="3" fill={color} stroke="var(--surface)" strokeWidth="1.5" />
          </g>
        ))}
      </svg>
      {/* x-axis labels */}
      <div className="flex" style={{ marginTop: 4, height: labelHeight }}>
        {data.map(({ label }, i) => (
          <div key={i} className="flex-1 flex justify-center">
            {label && <span className="text-[9px] leading-none" style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{label}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { activeProduct } = useProduct();
  const { canManage } = usePermission();
  const { user } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workload, setWorkload] = useState<WorkloadData | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Restore saved preferences per product, fall back to defaults
  const prefKey = activeProduct ? `planly_analytics_pref_${activeProduct.id}` : null;
  const savedPrefs = prefKey ? (() => { try { return JSON.parse(localStorage.getItem(prefKey) ?? '{}'); } catch { return {}; } })() : {};
  const VALID_PERIODS: Period[] = ['7d', '30d', '90d', 'all'];
  const validPeriod = (v: unknown): v is Period => VALID_PERIODS.includes(v as Period);

  const [period, setPeriod] = useState<Period>(validPeriod(savedPrefs.period) ? savedPrefs.period : '30d');
  const [cumulativePeriod, setCumulativePeriod] = useState<Period>(validPeriod(savedPrefs.cumulativePeriod) ? savedPrefs.cumulativePeriod : 'all');
  const [weekdayPeriod, setWeekdayPeriod] = useState<Period>(validPeriod(savedPrefs.weekdayPeriod) ? savedPrefs.weekdayPeriod : '30d');

  // Persist preferences whenever they change
  useEffect(() => {
    if (!prefKey) return;
    localStorage.setItem(prefKey, JSON.stringify({ period, cumulativePeriod, weekdayPeriod }));
  }, [prefKey, period, cumulativePeriod, weekdayPeriod]);

  const loadAnalytics = useCallback(async (productId: string) => {
    setLoading(true);
    setError(null);
    try { setData(await api.analytics.get(productId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load analytics'); }
    finally { setLoading(false); }
  }, []);

  const loadWorkload = useCallback(async (productId: string) => {
    try { setWorkload(await api.analytics.workload(productId)); }
    catch {/* non-critical workload data */}
  }, []);

  const loadActivity = useCallback(async (productId: string, cur?: string) => {
    try {
      const res = await api.analytics.activity(productId, cur);
      setEvents((prev) => cur ? [...prev, ...res.events] : res.events);
      setCursor(res.nextCursor);
    } catch {/* non-critical activity feed */}
  }, []);

  useEffect(() => {
    if (!activeProduct) return;
    setData(null); setWorkload(null); setEvents([]); setCursor(null);
    loadAnalytics(activeProduct.id);
    loadWorkload(activeProduct.id);
    loadActivity(activeProduct.id);
  }, [activeProduct?.id, loadAnalytics, loadWorkload, loadActivity]);

  if (!activeProduct) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ color: 'var(--text-3)' }}>
        <div className="text-5xl opacity-30">📊</div>
        <p className="text-sm">Select a project to view analytics</p>
      </div>
    );
  }

  if (!activeProduct.analyticsEnabled && !canManage) {
    return <Navigate to="/kanban" replace />;
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ color: 'var(--text-3)' }}>
        <p className="text-sm">{error}</p>
        <button
          onClick={() => loadAnalytics(activeProduct.id)}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'var(--brand)', color: 'white' }}
        >Retry</button>
      </div>
    );
  }

  // Throughput chart - bucket by week for 90d, label every 5th day for 30d, every day for 7d
  const allDays = data?.tasksByDay ?? [];
  const periodDays = PERIOD_DAYS[period];
  const filteredDays = period === 'all' ? allDays : allDays.slice(allDays.length - periodDays);
  const useBuckets = period === '90d' || (period === 'all' && allDays.length > 60);
  const throughputData: { label: string; count: number }[] = [];
  if (useBuckets) {
    for (let i = 0; i < filteredDays.length; i += 7) {
      const chunk = filteredDays.slice(i, i + 7);
      const label = chunk[0]?.date ? new Date(chunk[0].date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
      throughputData.push({ label, count: chunk.reduce((s, d) => s + d.count, 0) });
    }
  } else {
    filteredDays.forEach((d, i) => {
      const show = period === '7d' || i % 5 === 0;
      throughputData.push({
        label: show ? new Date(d.date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '',
        count: d.count,
      });
    });
  }

  // Cumulative completions - independent period
  const cumulativeDays = cumulativePeriod === 'all' ? allDays : allDays.slice(allDays.length - PERIOD_DAYS[cumulativePeriod]);
  const cumUseBuckets = cumulativePeriod === '90d' || (cumulativePeriod === 'all' && allDays.length > 60);
  const cumulativeData: { label: string; count: number }[] = [];
  let running = 0;
  if (cumUseBuckets) {
    for (let i = 0; i < cumulativeDays.length; i += 7) {
      const chunk = cumulativeDays.slice(i, i + 7);
      const label = chunk[0]?.date ? new Date(chunk[0].date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
      running += chunk.reduce((s, d) => s + d.count, 0);
      cumulativeData.push({ label, count: running });
    }
  } else {
    cumulativeDays.forEach((d, i) => {
      const show = cumulativePeriod === '7d' || i % 5 === 0;
      running += d.count;
      cumulativeData.push({ label: show ? new Date(d.date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '', count: running });
    });
  }

  // Weekday distribution
  const wdDays = weekdayPeriod === 'all' ? allDays : allDays.slice(allDays.length - PERIOD_DAYS[weekdayPeriod]);
  const wdCounts = [0, 0, 0, 0, 0, 0, 0];
  wdDays.forEach((d) => { const day = new Date(d.date).getDay(); wdCounts[day] = (wdCounts[day] ?? 0) + d.count; });
  const weekdayData = WEEKDAYS.map((label, i) => ({ label, count: wdCounts[i] ?? 0 }));

  return (
    <div className="h-full overflow-auto" style={{ background: 'var(--bg)' }}>
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>Analytics</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
            {activeProduct.emoji && <span className="mr-1">{activeProduct.emoji}</span>}
            {activeProduct.name}
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }} />
          </div>
        )}

        {data && !loading && (
          <>
            {/* Summary cards */}
            {(() => {
              const backlogCount = data.statusBreakdown.find(s => s.status === 'backlog')?.count ?? 0;
              const activeCount = data.totalActive - backlogCount;
              const total = data.totalActive + data.totalCompleted;
              const tiles = [
                { label: 'Not started', value: backlogCount,   icon: '□', color: '#64748b' },
                { label: 'Active',     value: activeCount,            icon: '⚡', color: 'var(--brand)' },
                { label: 'Completed',  value: data.totalCompleted,    icon: '✓', color: '#10b981' },
                { label: 'Total',      value: total,                  icon: '☰', color: 'var(--text-3)' },
              ];
              return (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {tiles.map(({ label, value, icon, color }) => (
                    <div key={label} className="rounded-2xl p-4 flex flex-col gap-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <span className="text-xl">{icon}</span>
                      <span className="text-2xl font-bold" style={{ color }}>{value}</span>
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>{label}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Throughput + Status breakdown */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="sm:col-span-2 rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Tasks completed</h2>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                      {filteredDays.reduce((s, d) => s + d.count, 0)} tasks
                    </p>
                  </div>
                  <PeriodToggle value={period} onChange={setPeriod} />
                </div>
                <BarChart data={throughputData} height={100} />
              </div>

              {(() => {
                const today = new Date().toISOString().slice(0, 10);
                const activeSprint = data.sprintVelocity.find(s => s.startDate.slice(0, 10) <= today && s.endDate.slice(0, 10) >= today);
                const statusTotal = data.statusBreakdown.reduce((s, x) => s + x.count, 0);
                return (
                  <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="mb-4">
                      <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Status breakdown</h2>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                        All non-completed tasks
                        {activeSprint && (
                          <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium"
                            style={{ background: `${activeSprint.color ?? 'var(--brand)'}22`, color: activeSprint.color ?? 'var(--brand)', border: `1px solid ${activeSprint.color ?? 'var(--brand)'}44` }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: activeSprint.color ?? 'var(--brand)', display: 'inline-block' }} />
                            {activeSprint.name} active
                          </span>
                        )}
                      </p>
                    </div>
                    {data.statusBreakdown.length === 0 ? (
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>No active tasks</p>
                    ) : (
                      <div className="space-y-2.5">
                        {[...data.statusBreakdown].sort((a, b) => b.count - a.count).map(({ status, count }) => (
                          <div key={status}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[status] ?? '#64748b' }} />
                                <span className="text-xs" style={{ color: 'var(--text-2)' }}>{STATUS_LABEL[status] ?? status}</span>
                              </div>
                              <span className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>{count}</span>
                            </div>
                            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                              <div className="h-full rounded-full" style={{ width: `${(count / statusTotal) * 100}%`, background: STATUS_COLOR[status] ?? '#64748b', opacity: 0.7 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Cumulative completions */}
            {data.totalCompleted > 0 && (
              <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Cumulative completions</h2>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Running total of tasks finished over time</p>
                  </div>
                  <PeriodToggle value={cumulativePeriod} onChange={setCumulativePeriod} />
                </div>
                <LineChart data={cumulativeData} height={100} />
              </div>
            )}

            {/* Weekday distribution */}
            {data.totalCompleted > 0 && (
              <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Completions by weekday</h2>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Which days the team tends to ship</p>
                  </div>
                  <PeriodToggle value={weekdayPeriod} onChange={setWeekdayPeriod} />
                </div>
                <BarChart data={weekdayData} height={80} color="#f59e0b" />
              </div>
            )}

            {/* Cycle velocity */}
            {data.sprintVelocity.length > 0 && (
              <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Tasks completed per sub-plan</h2>
                <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>How many tasks were finished within each sub-plan's dates</p>
                <SprintVelocityChart sprints={data.sprintVelocity} />
              </div>
            )}
          </>
        )}

        {/* My workload */}
        {workload && (
          <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>My workload</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                  {user?.realName ?? user?.username} · {workload.totalActive} active · {workload.totalCompleted} completed
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Status breakdown */}
              <div>
                <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-3)' }}>Active tasks by status</p>
                {workload.statusBreakdown.length === 0 ? (
                  <p className="text-xs py-3" style={{ color: 'var(--text-3)' }}>No active tasks assigned to you</p>
                ) : (
                  <div className="space-y-2.5">
                    {[...workload.statusBreakdown].sort((a, b) => b.count - a.count).map(({ status, count }) => (
                      <div key={status}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[status] ?? '#64748b' }} />
                            <span className="text-xs" style={{ color: 'var(--text-2)' }}>{STATUS_LABEL[status] ?? status}</span>
                          </div>
                          <span className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>{count}</span>
                        </div>
                        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                          <div className="h-full rounded-full" style={{ width: `${(count / workload.totalActive) * 100}%`, background: STATUS_COLOR[status] ?? '#64748b', opacity: 0.7 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* 30-day completion trend */}
              <div>
                <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-3)' }}>Completions (last 30 days)</p>
                {workload.completionsByDay.every(d => d.count === 0) ? (
                  <p className="text-xs py-3" style={{ color: 'var(--text-3)' }}>No completions in the last 30 days</p>
                ) : (
                  <BarChart
                    data={workload.completionsByDay.map((d, i) => ({
                      count: d.count,
                      label: i % 7 === 0 ? new Date(d.date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '',
                    }))}
                    height={80}
                    color="#10b981"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Activity feed */}
        <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Recent activity</h2>
          {events.length === 0 && !loading ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-3)' }}>No events yet</p>
          ) : (
            <div>
              {events.map((ev) => (
                <div key={ev.id} className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5"
                    style={{ background: `${actionColor(ev.action)}20`, color: actionColor(ev.action) }}>
                    {actionIcon(ev.action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text)' }}>
                      <span className="font-medium">{(ev.metadata as { actorName?: string })?.actorName ?? 'Unknown'}</span>
                      {' '}<span style={{ color: 'var(--text-3)' }}>{actionLabel(ev.action)}</span>
                      {ev.entityName && <> <span className="font-medium">"{ev.entityName}"</span></>}
                    </p>
                  </div>
                  <span className="text-[10px] flex-shrink-0 mt-0.5" style={{ color: 'var(--text-3)' }}>{formatRelative(ev.createdAt)}</span>
                </div>
              ))}
              {cursor && (
                <button onClick={async () => { setLoadingMore(true); await loadActivity(activeProduct.id, cursor); setLoadingMore(false); }}
                  disabled={loadingMore} className="w-full text-xs py-3 transition-colors" style={{ color: 'var(--brand)' }}>
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function SprintVelocityChart({ sprints }: { sprints: SprintVelocity[] }) {
  const max = Math.max(1, ...sprints.map(s => s.completed));
  const fmt = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  return (
    <div style={{ maxHeight: 340, overflowY: 'auto', overflowX: 'hidden' }} className="space-y-2 pr-1">
      {sprints.map(s => (
        <div key={s.sprintId} className="flex items-center gap-3 group">
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.color || 'var(--brand)', flexShrink: 0 }} />
          <div style={{ width: 148, flexShrink: 0 }}>
            <div className="text-xs truncate" style={{ color: 'var(--text-2)' }}>{s.name}</div>
            <div className="text-[10px] leading-snug" style={{ color: 'var(--text-3)' }}>{fmt(s.startDate)} – {fmt(s.endDate)}</div>
          </div>
          <div className="flex-1 relative h-5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${(s.completed / max) * 100}%`, background: s.color || 'var(--brand)', opacity: 0.65, minWidth: s.completed > 0 ? 6 : 0 }} />
          </div>
          <div className="text-xs font-medium flex-shrink-0 w-7 text-right" style={{ color: 'var(--text-3)' }}>{s.completed}</div>
        </div>
      ))}
    </div>
  );
}

function PeriodToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--surface-2)' }}>
      {(['7d', '30d', '90d', 'all'] as Period[]).map((p) => (
        <button key={p} onClick={() => onChange(p)}
          className="text-xs px-2.5 py-1 rounded-lg transition-all"
          style={{ background: value === p ? 'var(--surface)' : 'transparent', color: value === p ? 'var(--text)' : 'var(--text-3)', fontWeight: value === p ? 600 : 400, boxShadow: value === p ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
        >{p}</button>
      ))}
    </div>
  );
}
