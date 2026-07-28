/**
 * Admin Audit Logs panel displaying a cursor-paginated, filterable list of server audit events.
 * Supports filtering by action type and date range, cursor-based "load more" pagination,
 * CSV/JSONL export, and a prune tool (founding admin only) that permanently deletes old entries.
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { ACTION_LABELS, type AdminLogEntry } from './types';

interface Props {
  isFoundingAdmin: boolean;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export default function AdminLogs({ isFoundingAdmin, showToast }: Props) {
  const [logs, setLogs] = useState<AdminLogEntry[]>([]);
  const [logCursor, setLogCursor] = useState<string | null>(null);
  const [hasMoreLogs, setHasMoreLogs] = useState(true);
  const [logAction, setLogAction] = useState('');
  const [logFrom, setLogFrom] = useState('');
  const [logTo, setLogTo] = useState('');
  const [pruning, setPruning] = useState(false);
  const [pruneDays, setPruneDays] = useState('90');
  const [pruneConfirm, setPruneConfirm] = useState(false);

  // append=true is used by "Load more" to concatenate pages; false (default) replaces the list
  async function fetchLogs(opts?: { cursor?: string; action?: string; from?: string; to?: string; append?: boolean }) {
    try {
      const res = await api.admin.logs({ cursor: opts?.cursor, action: opts?.action, from: opts?.from, to: opts?.to });
      setLogs(opts?.append ? (prev) => [...prev, ...res.logs] : res.logs);
      setLogCursor(res.nextCursor);
      setHasMoreLogs(res.nextCursor !== null);
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  }

  const load = useCallback(() => fetchLogs(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
            Action
          </label>
          <select
            value={logAction}
            onChange={(e) => setLogAction(e.target.value)}
            className="text-sm px-2.5 py-1.5 rounded-lg"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            <option value="">All</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
            From
          </label>
          <input
            type="date"
            value={logFrom}
            onChange={(e) => setLogFrom(e.target.value)}
            className="text-sm px-2.5 py-1.5 rounded-lg"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
            To
          </label>
          <input
            type="date"
            value={logTo}
            onChange={(e) => setLogTo(e.target.value)}
            className="text-sm px-2.5 py-1.5 rounded-lg"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>
        <button
          onClick={() =>
            fetchLogs({ action: logAction || undefined, from: logFrom || undefined, to: logTo || undefined })
          }
          className="px-3 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--brand)', color: 'white' }}
        >
          Apply
        </button>
        <button
          onClick={() => {
            setLogAction('');
            setLogFrom('');
            setLogTo('');
            fetchLogs({});
          }}
          className="px-3 py-1.5 rounded-lg text-sm"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
        >
          Reset
        </button>
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() =>
              api.admin
                .exportLogs({
                  format: 'csv',
                  action: logAction || undefined,
                  from: logFrom || undefined,
                  to: logTo || undefined,
                })
                .catch((e) => showToast((e as Error).message, 'error'))
            }
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
          >
            ↓ CSV
          </button>
          <button
            onClick={() =>
              api.admin
                .exportLogs({
                  format: 'jsonl',
                  action: logAction || undefined,
                  from: logFrom || undefined,
                  to: logTo || undefined,
                })
                .catch((e) => showToast((e as Error).message, 'error'))
            }
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
          >
            ↓ JSONL
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div className="space-y-1">
        {logs.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>
            No events found.
          </p>
        ) : (
          <>
            {logs.map((log) => (
              <div
                key={log.id}
                data-testid="log-entry"
                className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-4 py-2.5 rounded-lg"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between gap-2 sm:contents">
                  <span
                    className="text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 whitespace-nowrap"
                    style={{
                      background:
                        log.action.includes('FAIL') || log.action.includes('DELETE') || log.action.includes('PRUNE')
                          ? '#ef444422'
                          : '#6366f122',
                      color:
                        log.action.includes('FAIL') || log.action.includes('DELETE') || log.action.includes('PRUNE')
                          ? '#ef4444'
                          : '#6366f1',
                    }}
                  >
                    {ACTION_LABELS[log.action] ?? log.action}
                  </span>
                  <span className="text-xs flex-shrink-0 whitespace-nowrap sm:order-3" style={{ color: 'var(--text-3)' }}>
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
                <span className="text-sm flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>
                  {log.actorName && <span className="font-medium">{log.actorName}</span>}
                  {log.actorName && log.targetName && <span style={{ color: 'var(--text-3)' }}> → </span>}
                  {log.targetName && <span style={{ color: 'var(--text-3)' }}>{log.targetName}</span>}
                </span>
              </div>
            ))}
            {hasMoreLogs && (
              <button
                onClick={() =>
                  fetchLogs({
                    cursor: logCursor ?? undefined,
                    action: logAction || undefined,
                    from: logFrom || undefined,
                    to: logTo || undefined,
                    append: true,
                  })
                }
                className="w-full py-2 text-sm text-center rounded-lg"
                style={{ color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                Load more
              </button>
            )}
          </>
        )}
      </div>

      {/* Prune - founding admin only */}
      {isFoundingAdmin && (
        <div className="mt-4 p-4 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid #ef444433' }}>
          <p className="text-sm font-semibold mb-1" style={{ color: '#ef4444' }}>
            Prune old logs
          </p>
          <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>
            Permanently delete log entries older than N days. The prune itself is recorded as a new log entry.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="number"
              min="1"
              value={pruneDays}
              onChange={(e) => setPruneDays(e.target.value)}
              className="w-20 text-sm px-2.5 py-1.5 rounded-lg"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <span className="text-sm" style={{ color: 'var(--text-2)' }}>
              days old
            </span>
            {!pruneConfirm ? (
              <button
                onClick={() => setPruneConfirm(true)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{ background: '#ef444422', color: '#ef4444', border: '1px solid #ef444433' }}
              >
                Prune
              </button>
            ) : (
              <>
                <button
                  disabled={pruning}
                  onClick={async () => {
                    setPruning(true);
                    try {
                      const res = await api.admin.pruneLogs(parseInt(pruneDays));
                      showToast(`Deleted ${res.deletedCount} log entries`, 'success');
                      setPruneConfirm(false);
                      await fetchLogs({
                        action: logAction || undefined,
                        from: logFrom || undefined,
                        to: logTo || undefined,
                      });
                    } catch (e) {
                      showToast((e as Error).message, 'error');
                    } finally {
                      setPruning(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium"
                  style={{ background: '#ef4444', color: 'white' }}
                >
                  {pruning ? 'Pruning…' : 'Confirm delete'}
                </button>
                <button
                  onClick={() => setPruneConfirm(false)}
                  className="px-3 py-1.5 text-sm"
                  style={{ color: 'var(--text-3)' }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
