import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

type AdminUser = { id: string; username: string; email: string; isAdmin: boolean; isFoundingAdmin: boolean; emailVerified: boolean; createdAt: string };
type WhitelistEntry = { id: string; pattern: string; createdAt: string };
type AdminLogEntry = { id: string; action: string; actorName: string | null; targetName: string | null; metadata: unknown; createdAt: string };
type ServerConfig = { adminEmail: string | null; requireEmailVerification: boolean; requireWhitelist: boolean };

type Tab = 'users' | 'whitelist' | 'logs';

const ACTION_LABELS: Record<string, string> = {
  USER_REGISTERED: 'Registered',
  LOGIN: 'Logged in',
  LOGIN_FAILED: 'Login failed',
  USER_PROMOTED: 'Promoted to admin',
  USER_DEMOTED: 'Demoted from admin',
  CROWN_TRANSFERRED: 'Crown transferred',
  FOUNDING_ADMIN_REGISTERED: 'Founding admin registered',
  EMAIL_VERIFIED_BY_ADMIN: 'Email verified by admin',
  USER_DELETED: 'User deleted',
};

export default function AdminPage() {
  const { user: me } = useAuth();
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [logs, setLogs] = useState<AdminLogEntry[]>([]);
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [newPattern, setNewPattern] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [logOffset, setLogOffset] = useState(0);
  const [hasMoreLogs, setHasMoreLogs] = useState(true);

  // Crown transfer state
  const [transferTarget, setTransferTarget] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);

  const loadUsers = useCallback(async () => {
    const [u, cfg] = await Promise.all([api.admin.users(), api.admin.config()]);
    setUsers(u);
    setServerConfig(cfg);
  }, []);

  const loadWhitelist = useCallback(async () => {
    setWhitelist(await api.admin.whitelist());
  }, []);

  const loadLogs = useCallback(async (reset = false) => {
    const offset = reset ? 0 : logOffset;
    const newLogs = await api.admin.logs(offset);
    setLogs(reset ? newLogs : (prev) => [...prev, ...newLogs]);
    setLogOffset(offset + newLogs.length);
    setHasMoreLogs(newLogs.length === 50);
  }, [logOffset]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadUsers(), loadWhitelist(), loadLogs(true)])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(fn: () => Promise<unknown>) {
    setActionError('');
    try {
      await fn();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  if (!me?.isAdmin) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-3)' }}>
        Access denied — admin only.
      </div>
    );
  }

  const isFoundingAdmin = me?.isFoundingAdmin;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="px-8 pt-7 pb-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xl">🛡️</span>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Server Admin</h1>
          {isFoundingAdmin && (
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#f59e0b22', color: '#f59e0b' }}>
              👑 Server owner
            </span>
          )}
        </div>
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>
          Global server administration — user management, access control, and audit logs.
        </p>

        {serverConfig && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface-2)', color: serverConfig.requireEmailVerification ? '#10b981' : 'var(--text-3)', border: '1px solid var(--border)' }}>
              Email verification: {serverConfig.requireEmailVerification ? 'Required' : 'Off'}
            </span>
            <span className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface-2)', color: serverConfig.requireWhitelist ? '#10b981' : 'var(--text-3)', border: '1px solid var(--border)' }}>
              Whitelist: {serverConfig.requireWhitelist ? 'Enforced' : 'Off'}
            </span>
            {serverConfig.adminEmail && (
              <span className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                Admin email: {serverConfig.adminEmail}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-8 pt-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        {(['users', 'whitelist', 'logs'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 text-sm font-medium capitalize rounded-t-lg transition-colors"
            style={{
              color: tab === t ? 'var(--brand)' : 'var(--text-3)',
              borderBottom: tab === t ? '2px solid var(--brand)' : '2px solid transparent',
            }}
          >
            {t === 'users' ? `Users (${users.length})` : t === 'whitelist' ? 'Email Whitelist' : 'Audit Log'}
          </button>
        ))}
      </div>

      {actionError && (
        <div className="mx-8 mt-3 px-4 py-2 rounded-lg text-sm" style={{ background: '#ef444422', color: '#ef4444' }}>
          {actionError}
          <button onClick={() => setActionError('')} className="ml-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-8 py-4">
        {loading ? (
          <div className="text-sm" style={{ color: 'var(--text-3)' }}>Loading…</div>
        ) : error ? (
          <div className="text-sm" style={{ color: '#ef4444' }}>{error}</div>
        ) : (
          <>
            {/* ── Users tab ──────────────────────────────────────────────── */}
            {tab === 'users' && (
              <div className="space-y-2">
                {isFoundingAdmin && (
                  <div className="flex justify-end mb-3">
                    <button
                      onClick={() => setShowTransfer(!showTransfer)}
                      className="btn-secondary text-sm px-4"
                    >
                      👑 Transfer server ownership
                    </button>
                  </div>
                )}

                {showTransfer && (
                  <div className="p-4 rounded-xl mb-4" style={{ background: 'var(--surface-2)', border: '1px solid #f59e0b44' }}>
                    <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Transfer server ownership</p>
                    <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>
                      The new owner must already be an admin. Your founding-admin status will transfer to them permanently.
                    </p>
                    <div className="flex gap-2">
                      <select
                        value={transferTarget}
                        onChange={(e) => setTransferTarget(e.target.value)}
                        className="input flex-1 text-sm"
                      >
                        <option value="">Select admin to receive crown…</option>
                        {users.filter((u) => u.isAdmin && u.id !== me?.id).map((u) => (
                          <option key={u.id} value={u.id}>{u.username} ({u.email})</option>
                        ))}
                      </select>
                      <button
                        disabled={!transferTarget}
                        onClick={() => {
                          if (!transferTarget) return;
                          if (!confirm('Transfer server ownership? You will lose founding-admin status.')) return;
                          act(async () => {
                            await api.admin.transferCrown(transferTarget);
                            setShowTransfer(false);
                            setTransferTarget('');
                            await loadUsers();
                          });
                        }}
                        className="btn-primary text-sm px-4"
                      >
                        Transfer
                      </button>
                    </div>
                  </div>
                )}

                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
                      <th className="text-left py-2 font-medium">User</th>
                      <th className="text-left py-2 font-medium">Email</th>
                      <th className="text-left py-2 font-medium">Status</th>
                      <th className="text-left py-2 font-medium">Joined</th>
                      {isFoundingAdmin && <th className="py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium" style={{ color: 'var(--text)' }}>{u.username}</span>
                            {u.isFoundingAdmin && <span title="Server owner" className="text-sm">👑</span>}
                            {u.isAdmin && !u.isFoundingAdmin && <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: '#6366f122', color: '#6366f1' }}>Admin</span>}
                          </div>
                        </td>
                        <td className="py-2.5 pr-4" style={{ color: 'var(--text-3)' }}>{u.email}</td>
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{
                                background: u.emailVerified ? '#10b98122' : '#f59e0b22',
                                color: u.emailVerified ? '#10b981' : '#f59e0b',
                              }}
                            >
                              {u.emailVerified ? 'Verified' : 'Unverified'}
                            </span>
                            {!u.emailVerified && isFoundingAdmin && (
                              <button
                                onClick={() => act(async () => { await api.admin.verifyEmail(u.id); await loadUsers(); })}
                                className="text-xs underline opacity-60 hover:opacity-100"
                                style={{ color: 'var(--text-3)' }}
                              >
                                Force verify
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        {isFoundingAdmin && (
                          <td className="py-2.5">
                            <div className="flex items-center gap-2 justify-end">
                              {u.id === me?.id ? (
                                <span className="text-xs" style={{ color: 'var(--text-3)' }}>You</span>
                              ) : u.isFoundingAdmin ? (
                                <span className="text-xs" style={{ color: 'var(--text-3)' }}>Server owner</span>
                              ) : u.isAdmin ? (
                                <button
                                  onClick={() => {
                                    if (!confirm(`Demote ${u.username} from admin?`)) return;
                                    act(async () => { await api.admin.demote(u.id); await loadUsers(); });
                                  }}
                                  className="text-xs px-2 py-1 rounded hover:opacity-80"
                                  style={{ background: '#ef444422', color: '#ef4444' }}
                                >
                                  Demote
                                </button>
                              ) : (
                                <button
                                  onClick={() => act(async () => { await api.admin.promote(u.id); await loadUsers(); })}
                                  className="text-xs px-2 py-1 rounded hover:opacity-80"
                                  style={{ background: '#6366f122', color: '#6366f1' }}
                                >
                                  Make admin
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Whitelist tab ───────────────────────────────────────────── */}
            {tab === 'whitelist' && (
              <div className="space-y-4 max-w-xl">
                <div className="p-4 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Email allowlist</p>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>
                    Only checked when <code className="text-xs px-1 rounded" style={{ background: 'var(--surface)' }}>REQUIRE_WHITELIST=true</code>.
                    Add exact addresses (<code className="text-xs">user@company.com</code>) or domain patterns (<code className="text-xs">@company.com</code>).
                  </p>
                  <div className="flex gap-2">
                    <input
                      className="input flex-1 text-sm"
                      placeholder="@company.com or user@example.com"
                      value={newPattern}
                      onChange={(e) => setNewPattern(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && newPattern && act(async () => { await api.admin.addWhitelist(newPattern); setNewPattern(''); await loadWhitelist(); })}
                    />
                    <button
                      disabled={!newPattern.trim()}
                      onClick={() => act(async () => { await api.admin.addWhitelist(newPattern); setNewPattern(''); await loadWhitelist(); })}
                      className="btn-primary text-sm px-4"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {whitelist.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--text-3)' }}>No patterns yet. Add one above.</p>
                ) : (
                  <div className="space-y-1">
                    {whitelist.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between px-4 py-2.5 rounded-lg"
                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                      >
                        <span className="text-sm font-mono" style={{ color: 'var(--text)' }}>{entry.pattern}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                            {new Date(entry.createdAt).toLocaleDateString()}
                          </span>
                          <button
                            onClick={() => act(async () => { await api.admin.removeWhitelist(entry.id); await loadWhitelist(); })}
                            className="text-xs opacity-50 hover:opacity-100 transition-opacity"
                            style={{ color: '#ef4444' }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Logs tab ────────────────────────────────────────────────── */}
            {tab === 'logs' && (
              <div className="space-y-1">
                {logs.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--text-3)' }}>No events yet.</p>
                ) : (
                  <>
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center gap-4 px-4 py-2.5 rounded-lg"
                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                      >
                        <span
                          className="text-xs px-2 py-0.5 rounded font-mono font-semibold flex-shrink-0"
                          style={{
                            background: log.action.includes('FAIL') || log.action.includes('DELETE') ? '#ef444422' : '#6366f122',
                            color: log.action.includes('FAIL') || log.action.includes('DELETE') ? '#ef4444' : '#6366f1',
                          }}
                        >
                          {ACTION_LABELS[log.action] ?? log.action}
                        </span>
                        <span className="text-sm flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>
                          {log.actorName && <span className="font-medium">{log.actorName}</span>}
                          {log.actorName && log.targetName && <span style={{ color: 'var(--text-3)' }}> → </span>}
                          {log.targetName && <span style={{ color: 'var(--text-3)' }}>{log.targetName}</span>}
                        </span>
                        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>
                          {new Date(log.createdAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                    {hasMoreLogs && (
                      <button
                        onClick={() => act(async () => { await loadLogs(false); })}
                        className="w-full py-2 text-sm text-center rounded-lg hover:opacity-80 transition-opacity"
                        style={{ color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                      >
                        Load more
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
