import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useProduct } from '../context/ProductContext';

interface DayStat { date: string; count: number }
interface Contributor { userId: string; username: string; avatarEmoji: string | null; count: number }
interface AnalyticsData {
  tasksByDay: DayStat[];
  topContributors: Contributor[];
  cycleTimeAvgDays: number | null;
  totalCompleted: number;
  totalActive: number;
}
interface ActivityEvent {
  id: string; actorId: string; action: string; entityType: string;
  entityId: string | null; entityName: string | null; metadata: unknown; createdAt: string;
}

type Period = '7d' | '30d' | '90d';

const PERIOD_DAYS: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90 };

function actionLabel(action: string) {
  const map: Record<string, string> = {
    'task.created': 'created task',
    'task.updated': 'updated task',
    'task.status_changed': 'moved task',
    'task.deleted': 'deleted task',
    'milestone.created': 'created milestone',
    'sprint.created': 'created sprint',
    'sprint.updated': 'updated sprint',
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
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function AnalyticsPage() {
  const { activeProduct } = useProduct();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<Period>('30d');
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadAnalytics = useCallback(async (productId: string) => {
    setLoading(true);
    try {
      const d = await api.analytics.get(productId);
      setData(d);
    } catch {/* ignore */} finally { setLoading(false); }
  }, []);

  const loadActivity = useCallback(async (productId: string, cur?: string) => {
    try {
      const res = await api.analytics.activity(productId, cur);
      setEvents((prev) => cur ? [...prev, ...res.events] : res.events);
      setCursor(res.nextCursor);
    } catch {/* ignore */}
  }, []);

  useEffect(() => {
    if (!activeProduct) return;
    setData(null);
    setEvents([]);
    setCursor(null);
    loadAnalytics(activeProduct.id);
    loadActivity(activeProduct.id);
  }, [activeProduct, loadAnalytics, loadActivity]);

  if (!activeProduct) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ color: 'var(--text-3)' }}>
        <div className="text-5xl opacity-30">📊</div>
        <p className="text-sm">Select a product to view analytics</p>
      </div>
    );
  }

  const periodDays = PERIOD_DAYS[period];
  const filteredDays = data ? data.tasksByDay.slice(data.tasksByDay.length - periodDays) : [];
  // Aggregate into weekly buckets for 90d view
  const useBuckets = period === '90d';
  const chartData: { label: string; count: number }[] = [];
  if (useBuckets) {
    // Group into weeks
    for (let i = 0; i < filteredDays.length; i += 7) {
      const chunk = filteredDays.slice(i, i + 7);
      const total = chunk.reduce((s, d) => s + d.count, 0);
      const label = chunk[0]?.date ? new Date(chunk[0].date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
      chartData.push({ label, count: total });
    }
  } else {
    filteredDays.forEach((d) => {
      chartData.push({
        label: new Date(d.date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        count: d.count,
      });
    });
  }
  const chartMax = Math.max(1, ...chartData.map((d) => d.count));

  return (
    <div className="h-full overflow-auto" style={{ background: 'var(--bg)' }}>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: 'Active tasks', value: data.totalActive, icon: '⚡', color: 'var(--brand)' },
                { label: 'Completed', value: data.totalCompleted, icon: '✓', color: '#10b981' },
                { label: 'Avg cycle time', value: data.cycleTimeAvgDays !== null ? `${data.cycleTimeAvgDays}d` : '—', icon: '⏱', color: '#f59e0b' },
                { label: 'Total tasks', value: data.totalActive + data.totalCompleted, icon: '☰', color: 'var(--text-3)' },
              ].map(({ label, value, icon, color }) => (
                <div key={label} className="rounded-2xl p-4 flex flex-col gap-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <span className="text-xl">{icon}</span>
                  <span className="text-2xl font-bold" style={{ color }}>{value}</span>
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Tasks completed chart */}
            <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Tasks completed</h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                    {data.tasksByDay.slice(data.tasksByDay.length - periodDays).reduce((s, d) => s + d.count, 0)} tasks in the last {period === '7d' ? '7 days' : period === '30d' ? '30 days' : '90 days'}
                  </p>
                </div>
                <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--surface-2)' }}>
                  {(['7d', '30d', '90d'] as Period[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className="text-xs px-3 py-1.5 rounded-lg transition-all"
                      style={{
                        background: period === p ? 'var(--surface)' : 'transparent',
                        color: period === p ? 'var(--text)' : 'var(--text-3)',
                        fontWeight: period === p ? 600 : 400,
                        boxShadow: period === p ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >{p}</button>
                  ))}
                </div>
              </div>

              {/* Bar chart */}
              <div className="flex items-end gap-px" style={{ height: 120 }}>
                {chartData.map(({ label, count }, i) => {
                  const pct = chartMax > 0 ? (count / chartMax) : 0;
                  const showLabel = period === '7d' || (period === '30d' && i % 5 === 0) || useBuckets;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 group" style={{ height: '100%' }}>
                      <div className="relative w-full flex justify-center">
                        {count > 0 && (
                          <div
                            className="absolute -top-6 text-[10px] font-medium px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                            style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', zIndex: 10 }}
                          >{count} {count === 1 ? 'task' : 'tasks'}</div>
                        )}
                      </div>
                      <div
                        className="w-full rounded-t-sm transition-all"
                        style={{
                          height: `${Math.max(pct * 100, count > 0 ? 4 : 1)}%`,
                          background: count > 0 ? 'var(--brand)' : 'var(--border)',
                          opacity: count > 0 ? 0.85 + pct * 0.15 : 0.3,
                        }}
                      />
                      {showLabel && (
                        <span className="text-[9px] leading-none" style={{ color: 'var(--text-3)' }}>
                          {label.split(' ')[1] ?? label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top contributors */}
            {data.topContributors.length > 0 && (
              <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Top contributors</h2>
                <div className="space-y-3">
                  {data.topContributors.map((c, i) => {
                    const pct = (c.count / data.topContributors[0].count) * 100;
                    return (
                      <div key={c.userId} className="flex items-center gap-3">
                        <span className="text-xs w-4 text-right font-medium" style={{ color: 'var(--text-3)' }}>{i + 1}</span>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                          {c.avatarEmoji ?? '👤'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{c.username}</span>
                            <span className="text-xs ml-2 flex-shrink-0" style={{ color: 'var(--text-3)' }}>{c.count} tasks</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--brand)', opacity: 0.7 }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Activity feed */}
        <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Event log</h2>
          {events.length === 0 && !loading ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-3)' }}>No events yet</p>
          ) : (
            <div className="space-y-0">
              {events.map((ev) => (
                <div key={ev.id} className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5"
                    style={{ background: `${actionColor(ev.action)}20`, color: actionColor(ev.action) }}
                  >
                    {actionIcon(ev.action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text)' }}>
                      <span className="font-medium">{(ev.metadata as any)?.actorName ?? 'Unknown'}</span>
                      {' '}
                      <span style={{ color: 'var(--text-3)' }}>{actionLabel(ev.action)}</span>
                      {ev.entityName && (
                        <> <span className="font-medium">"{ev.entityName}"</span></>
                      )}
                    </p>
                  </div>
                  <span className="text-[10px] flex-shrink-0 mt-0.5" style={{ color: 'var(--text-3)' }}>{formatRelative(ev.createdAt)}</span>
                </div>
              ))}
              {cursor && (
                <button
                  onClick={async () => {
                    setLoadingMore(true);
                    await loadActivity(activeProduct.id, cursor);
                    setLoadingMore(false);
                  }}
                  disabled={loadingMore}
                  className="w-full text-xs py-3 transition-colors"
                  style={{ color: 'var(--brand)' }}
                >
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
