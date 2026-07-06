import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

// ── Shared components ──────────────────────────────────────────────────────────

function Toggle({ label, description, value, onChange }: {
  label: string; description: string; value: boolean; onChange: (v: boolean) => Promise<void> | void;
}) {
  const [checked, setChecked] = useState(value);
  const pendingRef = useRef(false);

  // Sync with parent when parent value changes externally
  useEffect(() => {
    if (!pendingRef.current) setChecked(value);
  }, [value]);

  async function handleClick() {
    if (pendingRef.current) return;
    const next = !checked;
    pendingRef.current = true;
    setChecked(next); // optimistic flip
    try {
      await onChange(next);
    } catch {
      setChecked(!next); // revert on failure
    } finally {
      pendingRef.current = false;
    }
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors w-full"
      style={{ background: 'var(--surface-2)', border: `1px solid ${checked ? '#6366f1' : 'var(--border)'}` }}
    >
      <div className="w-9 h-5 rounded-full flex-shrink-0 transition-colors relative" style={{ background: checked ? '#6366f1' : 'var(--border)' }}>
        <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm" style={{ left: checked ? '19px' : '2px' }} />
      </div>
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{description}</p>
      </div>
    </button>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="p-5 rounded-xl flex flex-col gap-1" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{value}</p>
      <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>{label}</p>
      {sub && <p className="text-xs" style={{ color: 'var(--text-3)' }}>{sub}</p>}
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type AdminTab = 'ownership' | 'users' | 'projects' | 'email' | 'logs' | 'statistics' | 'ip-rules';
type AdminUser = { id: string; username: string; email: string; isAdmin: boolean; isFoundingAdmin: boolean; emailVerified: boolean; createdAt: string; failedLoginAttempts: number; loginLockedUntil: string | null };
type AdminProject = { id: string; name: string; emoji: string | null; deadline: string; createdAt: string; ownerUsername: string | null; ownerEmoji: string | null; memberCount: number; taskCount: number };
type AdminLogEntry = { id: string; action: string; actorName: string | null; targetName: string | null; metadata: unknown; createdAt: string };
type ServerConfig = { adminEmail: string | null; requireEmailVerification: boolean; requireWhitelist: boolean; allowProjectCreation: boolean; announcementsEnabled: boolean; announcementPostRole: string };
type Stats = { userCount: number; projectCount: number; taskCount: number; messageCount: number; newUsers: number; newProjects: number };
type EmailStatus = { enabled: boolean; from: string | null; config: { host: string; port: number; secure: boolean; user: string; from: string } | null };
type IpRule = { id: string; cidr: string; description: string | null; createdAt: string };

export const ADMIN_TABS: { key: AdminTab; label: string; icon: string }[] = [
  { key: 'ownership',  label: 'Ownership',      icon: '👑' },
  { key: 'users',      label: 'Users',           icon: '👥' },
  { key: 'projects',   label: 'Projects',        icon: '📦' },
  { key: 'email',      label: 'Email Settings',  icon: '✉️' },
  { key: 'ip-rules',   label: 'Networking',      icon: '🛡️' },
  { key: 'logs',       label: 'Audit Logs',      icon: '📋' },
  { key: 'statistics', label: 'Statistics',      icon: '📊' },
];

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
  SERVER_CONFIG_UPDATED: 'Server config updated',
  LOGS_PRUNED: 'Logs pruned',
  LOGIN_LOCKED: 'Account locked',
  LOGIN_UNLOCKED: 'Account unlocked',
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user: me, loading: authLoading, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as AdminTab) ?? 'ownership';

  // Data
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [logs, setLogs] = useState<AdminLogEntry[]>([]);
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [whitelist, setWhitelist] = useState<{ id: string; pattern: string; createdAt: string }[]>([]);
  const [ipRestrictions, setIpRestrictions] = useState<{ mode: string; rules: IpRule[]; yourIp: string } | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [verifyEmailPrompt, setVerifyEmailPrompt] = useState(false);
  const [logCursor, setLogCursor] = useState<string | null>(null);
  const [hasMoreLogs, setHasMoreLogs] = useState(true);
  const [logAction, setLogAction] = useState('');
  const [logFrom, setLogFrom] = useState('');
  const [logTo, setLogTo] = useState('');
  const [pruning, setPruning] = useState(false);
  const [pruneDays, setPruneDays] = useState('90');
  const [pruneConfirm, setPruneConfirm] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [newPattern, setNewPattern] = useState('');
  const [newCidr, setNewCidr] = useState('');
  const [newCidrDesc, setNewCidrDesc] = useState('');
  const [addingIpRule, setAddingIpRule] = useState(false);

  // SMTP form
  const [smtpForm, setSmtpForm] = useState({ host: '', port: 587, secure: false, user: '', pass: '', from: '' });
  const [smtpDirty, setSmtpDirty] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [showSmtpForm, setShowSmtpForm] = useState(false);

  const loadUsers = useCallback(async () => {
    const [u, cfg] = await Promise.all([api.admin.users(), api.admin.serverConfig()]);
    setUsers(u);
    setServerConfig(cfg);
  }, []);

  const loadEmail = useCallback(async () => {
    const [status, cfg, wl] = await Promise.all([api.emailStatus.get(), api.emailConfig.get(), api.admin.whitelist()]);
    setEmailStatus(status);
    setWhitelist(wl);
    // cfg is the DB-saved config; fall back to status.config (env-var based) if no DB record
    const source = cfg ?? status.config;
    if (source) setSmtpForm({ host: source.host, port: source.port, secure: source.secure, user: source.user, pass: '', from: source.from });
    setShowSmtpForm(!status.enabled); // expand form if email not yet configured
  }, []);

  async function fetchLogs(opts?: { cursor?: string; action?: string; from?: string; to?: string; append?: boolean }) {
    const res = await api.admin.logs({ cursor: opts?.cursor, action: opts?.action, from: opts?.from, to: opts?.to });
    setLogs(opts?.append ? (prev) => [...prev, ...res.logs] : res.logs);
    setLogCursor(res.nextCursor);
    setHasMoreLogs(res.nextCursor !== null);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loadLogs = useCallback(() => fetchLogs(), []);

  const loadIpRules = useCallback(async () => {
    const data = await api.admin.ipRestrictions();
    setIpRestrictions(data);
  }, []);

  useEffect(() => {
    if (tab === 'ip-rules') loadIpRules().catch((e) => setActionError(e.message));
  }, [tab, loadIpRules]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      loadUsers(),
      api.admin.projects().then(setProjects),
      api.admin.stats().then(setStats),
      loadEmail(),
      loadLogs(),
    ]).catch((e) => setActionError(e.message)).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(fn: () => Promise<unknown>): Promise<void> {
    setActionError('');
    try { await fn(); }
    catch (e) { setActionError((e as Error).message); throw e; }
  }

  if (authLoading) return null;
  if (!me?.isAdmin) return <Navigate to="/kanban" replace />;

  const isFoundingAdmin = !!me?.isFoundingAdmin;
  const otherAdmins = users.filter((u) => u.isAdmin && u.id !== me?.id);

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>

      {actionError && (
        <div className="mx-8 mt-4 px-4 py-2 rounded-lg text-sm flex items-center justify-between flex-shrink-0" style={{ background: '#ef444422', color: '#ef4444' }}>
          {actionError}
          <button onClick={() => setActionError('')} className="ml-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading ? (
          <div className="text-sm" style={{ color: 'var(--text-3)' }}>Loading…</div>
        ) : (
          <>

            {/* ── Ownership ─────────────────────────────────────────────────────── */}
            {tab === 'ownership' && (
              <div className="space-y-6 max-w-xl">

                {/* 1 - Server Owner */}
                <div className="p-5 rounded-xl space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Server owner</p>
                  {users.filter((u) => u.isFoundingAdmin).map((u) => (
                    <div key={u.id} className="flex items-center gap-3">
                      <span className="text-xl">👑</span>
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{u.username}</p>
                        <p className="text-xs" style={{ color: 'var(--text-3)' }}>{u.email}</p>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs pt-1" style={{ color: 'var(--text-3)' }}>
                    The server owner can demote other admins and transfer ownership. This seat cannot be demoted by anyone else.
                  </p>
                </div>

                {/* 2 - Server Admins */}
                <div className="p-5 rounded-xl space-y-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Server admins</p>
                  {users.filter((u) => u.isAdmin).map((u) => (
                    <div key={u.id} className="flex items-center gap-2 py-1">
                      <span>{u.isFoundingAdmin ? '👑' : '🛡️'}</span>
                      <span className="text-sm" style={{ color: 'var(--text)' }}>{u.username}</span>
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>{u.email}</span>
                      {u.isFoundingAdmin && <span className="ml-auto text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: '#f59e0b22', color: '#f59e0b' }}>Owner</span>}
                    </div>
                  ))}
                  {users.filter((u) => u.isAdmin).length === 0 && (
                    <p className="text-sm" style={{ color: 'var(--text-3)' }}>No admins yet.</p>
                  )}
                </div>

                {/* 3 - Transfer Ownership (founding admin only) */}
                {isFoundingAdmin && (
                  <div className="p-5 rounded-xl space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Transfer ownership</p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      Pass the server owner role to another admin - e.g. when leaving the organisation. You keep your admin status but lose the protected seat.
                    </p>
                    <div className="flex gap-2">
                      <select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)} className="input flex-1 text-sm">
                        <option value="">Select an admin…</option>
                        {otherAdmins.map((u) => (
                          <option key={u.id} value={u.id}>{u.username} ({u.email})</option>
                        ))}
                      </select>
                      <button
                        disabled={!transferTarget}
                        onClick={() => {
                          if (!transferTarget) return;
                          if (!confirm('Transfer server ownership? You will lose the protected founding-admin seat.')) return;
                          act(async () => {
                            await api.admin.transferCrown(transferTarget);
                            setTransferTarget('');
                            await loadUsers();
                            showToast('Ownership transferred', 'success');
                          });
                        }}
                        className="btn-primary text-sm px-4"
                      >
                        Transfer
                      </button>
                    </div>
                    {otherAdmins.length === 0 && (
                      <p className="text-xs" style={{ color: '#f59e0b' }}>
                        No other admins yet. Promote someone in the Users tab first.
                      </p>
                    )}
                  </div>
                )}

              </div>
            )}

            {/* ── Users ─────────────────────────────────────────────────────────── */}
            {tab === 'users' && (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
                    <th className="text-left py-2 font-medium">User</th>
                    <th className="text-left py-2 font-medium">Email</th>
                    <th className="text-left py-2 font-medium">Verified</th>
                    <th className="text-left py-2 font-medium">Login</th>
                    <th className="text-left py-2 font-medium">Joined</th>
                    {isFoundingAdmin && <th className="py-2 text-right font-medium pr-1">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-1.5">
                          {u.isFoundingAdmin && <span title="Server owner">👑</span>}
                          {u.isAdmin && !u.isFoundingAdmin && <span title="Admin">🛡️</span>}
                          <span className="font-medium" style={{ color: 'var(--text)' }}>{u.username}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>{u.email}</td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: u.emailVerified ? '#10b98122' : '#f59e0b22', color: u.emailVerified ? '#10b981' : '#f59e0b' }}>
                            {u.emailVerified ? 'Yes' : 'No'}
                          </span>
                          {!u.emailVerified && (
                            <button onClick={() => act(async () => { await api.admin.verifyEmail(u.id); await loadUsers(); })}
                              className="text-xs underline opacity-60 hover:opacity-100" style={{ color: 'var(--text-3)' }}>
                              Force verify
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4">
                        {(() => {
                          const locked = u.loginLockedUntil && new Date(u.loginLockedUntil) > new Date();
                          if (locked) {
                            const mins = Math.ceil((new Date(u.loginLockedUntil!).getTime() - Date.now()) / 60000);
                            return (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#ef444422', color: '#ef4444' }}>
                                  Locked {mins}m
                                </span>
                                {me?.isAdmin && (
                                  <button onClick={() => act(async () => { await api.admin.unlock(u.id); await loadUsers(); })}
                                    className="text-xs underline opacity-60 hover:opacity-100" style={{ color: 'var(--text-3)' }}>
                                    Unlock
                                  </button>
                                )}
                              </div>
                            );
                          }
                          if (u.failedLoginAttempts > 0) {
                            return <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#f59e0b22', color: '#f59e0b' }}>{u.failedLoginAttempts} fail{u.failedLoginAttempts === 1 ? '' : 's'}</span>;
                          }
                          return <span className="text-xs" style={{ color: 'var(--text-3)' }}>-</span>;
                        })()}
                      </td>
                      <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                      {isFoundingAdmin && (
                        <td className="py-2.5">
                          <div className="flex items-center gap-2 justify-end">
                            {u.id === me?.id ? (
                              <span className="text-xs" style={{ color: 'var(--text-3)' }}>You</span>
                            ) : u.isFoundingAdmin ? (
                              <span className="text-xs" style={{ color: 'var(--text-3)' }}>Owner</span>
                            ) : u.isAdmin ? (
                              <button onClick={() => { if (!confirm(`Demote ${u.username}?`)) return; act(async () => { await api.admin.demote(u.id); await loadUsers(); }); }}
                                className="text-xs px-2 py-1 rounded" style={{ background: '#ef444422', color: '#ef4444' }}>
                                Demote
                              </button>
                            ) : (
                              <button onClick={() => act(async () => { await api.admin.promote(u.id); await loadUsers(); })}
                                className="text-xs px-2 py-1 rounded" style={{ background: '#6366f122', color: '#6366f1' }}>
                                Make admin
                              </button>
                            )}
                            {u.id !== me?.id && !u.isFoundingAdmin && (
                              <button
                                onClick={() => {
                                  if (!confirm(`Permanently delete ${u.username}? This cannot be undone.`)) return;
                                  act(async () => {
                                    await api.admin.deleteUser(u.id);
                                    await loadUsers();
                                    showToast(`${u.username} deleted`, 'success');
                                  });
                                }}
                                className="text-xs px-2 py-1 rounded opacity-60 hover:opacity-100"
                                style={{ background: '#ef444415', color: '#ef4444' }}
                                title="Delete user"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* ── Projects ──────────────────────────────────────────────────────── */}
            {tab === 'projects' && (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
                    <th className="text-left py-2 font-medium">Project</th>
                    <th className="text-left py-2 font-medium">Owner</th>
                    <th className="text-left py-2 font-medium">Members</th>
                    <th className="text-left py-2 font-medium">Tasks</th>
                    <th className="text-left py-2 font-medium">Deadline</th>
                    <th className="text-left py-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-2.5 pr-4">
                        <span className="font-medium" style={{ color: 'var(--text)' }}>
                          {p.emoji && <span className="mr-1.5">{p.emoji}</span>}{p.name}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>
                        {p.ownerEmoji && <span className="mr-1">{p.ownerEmoji}</span>}{p.ownerUsername ?? '-'}
                      </td>
                      <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>{p.memberCount}</td>
                      <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>{p.taskCount}</td>
                      <td className="py-2.5 pr-4 text-xs" style={{ color: new Date(p.deadline) < new Date() ? '#ef4444' : 'var(--text-3)' }}>
                        {new Date(p.deadline).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>{new Date(p.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {projects.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>No projects yet.</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {/* ── Email Settings ────────────────────────────────────────────────── */}
            {tab === 'email' && (
              <div className="space-y-6 max-w-xl">

                {/* Status banner */}
                <div className="p-4 rounded-xl flex items-center gap-3" style={{ background: emailStatus?.enabled ? 'rgba(16,185,129,0.08)' : 'var(--surface-2)', border: `1px solid ${emailStatus?.enabled ? 'rgba(16,185,129,0.3)' : 'var(--border)'}` }}>
                  <span className="text-xl">{emailStatus?.enabled ? '✅' : '⚠️'}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                      {emailStatus === null ? 'Checking…' : emailStatus.enabled ? 'Email is active' : 'Email not configured'}
                    </p>
                    {emailStatus?.from && <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Sending from: <code>{emailStatus.from}</code></p>}
                  </div>
                  {emailStatus?.enabled && (
                    <button
                      disabled={testingEmail}
                      onClick={() => { setTestingEmail(true); api.emailStatus.test().then(() => showToast('Test email sent - check your inbox', 'success')).catch((e) => showToast(e.message, 'error')).finally(() => setTestingEmail(false)); }}
                      className="btn-secondary text-sm px-3"
                    >
                      {testingEmail ? '…' : 'Send test'}
                    </button>
                  )}
                </div>

                {/* SMTP configuration - collapsed summary when active, expandable form */}
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between px-5 py-4" style={{ background: 'var(--surface-2)' }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>SMTP configuration</p>
                      {emailStatus?.enabled && !showSmtpForm && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                          {smtpForm.host}:{smtpForm.port} · {smtpForm.user}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => { setShowSmtpForm((v) => !v); setSmtpDirty(false); }}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
                    >
                      {showSmtpForm ? 'Cancel' : emailStatus?.enabled ? 'Reconfigure' : 'Configure'}
                    </button>
                  </div>

                  {showSmtpForm && (
                    <div className="px-5 pb-5 space-y-4" style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--border)' }}>
                      <p className="text-xs pt-4" style={{ color: 'var(--text-3)' }}>
                        Server-wide outgoing mail. For Gmail, use an{' '}
                        <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="underline">App Password</a>.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 sm:col-span-1">
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Host</label>
                          <input className="input w-full text-sm" placeholder="smtp.gmail.com" value={smtpForm.host}
                            onChange={(e) => { setSmtpForm((f) => ({ ...f, host: e.target.value })); setSmtpDirty(true); }} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Port</label>
                          <input className="input w-full text-sm" type="number" placeholder="587" value={smtpForm.port}
                            onChange={(e) => { setSmtpForm((f) => ({ ...f, port: parseInt(e.target.value) || 587 })); setSmtpDirty(true); }} />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Username</label>
                          <input className="input w-full text-sm" placeholder="you@gmail.com" value={smtpForm.user}
                            onChange={(e) => { setSmtpForm((f) => ({ ...f, user: e.target.value })); setSmtpDirty(true); }} />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>Password</label>
                          <input className="input w-full text-sm" type="password"
                            placeholder={emailStatus?.enabled ? '•••••••• (leave blank to keep current)' : 'App password'}
                            value={smtpForm.pass}
                            onChange={(e) => { setSmtpForm((f) => ({ ...f, pass: e.target.value })); setSmtpDirty(true); }} />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>From address</label>
                          <input className="input w-full text-sm" placeholder="Planly <you@gmail.com>" value={smtpForm.from}
                            onChange={(e) => { setSmtpForm((f) => ({ ...f, from: e.target.value })); setSmtpDirty(true); }} />
                        </div>
                        <div className="col-span-2 flex items-center gap-2">
                          <input id="ssl" type="checkbox" checked={smtpForm.secure}
                            onChange={(e) => { setSmtpForm((f) => ({ ...f, secure: e.target.checked })); setSmtpDirty(true); }} />
                          <label htmlFor="ssl" className="text-xs" style={{ color: 'var(--text-2)' }}>
                            Use SSL (port 465)
                          </label>
                          <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                            - leave off for port 587 (STARTTLS), which most providers including Gmail use
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          disabled={savingSmtp || !smtpDirty}
                          onClick={() => {
                            setSavingSmtp(true);
                            api.emailConfig.save({ ...smtpForm, ...(smtpForm.pass ? {} : { pass: undefined }) })
                              .then(() => api.emailStatus.get())
                              .then((s) => { setEmailStatus(s); setSmtpDirty(false); setShowSmtpForm(false); showToast('Email configuration saved', 'success'); })
                              .catch((e) => showToast(e.message, 'error'))
                              .finally(() => setSavingSmtp(false));
                          }}
                          className="btn-primary text-sm px-4"
                        >
                          {savingSmtp ? 'Saving…' : 'Save configuration'}
                        </button>
                        {emailStatus?.enabled && (
                          <button
                            onClick={() => { if (!confirm('Clear SMTP config? Env-var fallback will be used.')) return; api.emailConfig.clear().then(() => api.emailStatus.get()).then((s) => { setEmailStatus(s); setShowSmtpForm(true); }).catch((e) => showToast(e.message, 'error')); }}
                            className="btn-secondary text-sm px-4"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Access controls */}
                {serverConfig && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Access controls</p>

                    {/* Email verification - only available when email is configured */}
                    {emailStatus?.enabled ? (
                      <>
                        <Toggle
                          label="Require email verification"
                          description="New users must click a verification link before they can sign in."
                          value={serverConfig.requireEmailVerification}
                          onChange={(v) => act(async () => {
                            if (v) {
                              const res = await api.admin.updateServerConfig({ requireEmailVerification: true });
                              setServerConfig((c) => c ? { ...c, requireEmailVerification: true } : c);
                              await refreshUser();
                              const sent = res.verificationEmailsSent ?? 0;
                              const toastMsg = sent > 0
                                ? `Email verification enabled - sent ${sent} verification email${sent === 1 ? '' : 's'}`
                                : 'Email verification enabled - all existing users already verified';
                              showToast(toastMsg, 'success');
                              // Show prompt only if the admin's own email is unverified
                              setVerifyEmailPrompt(!me?.emailVerified);
                            } else {
                              await api.admin.updateServerConfig({ requireEmailVerification: false });
                              setServerConfig((c) => c ? { ...c, requireEmailVerification: false } : c);
                              showToast('Email verification disabled', 'success');
                              setVerifyEmailPrompt(false);
                            }
                          })}
                        />
                        {verifyEmailPrompt && (
                          <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: '#f59e0b15', border: '1px solid #f59e0b44' }}>
                            <span style={{ color: '#f59e0b' }}>⚠</span>
                            <div className="flex-1 text-sm" style={{ color: 'var(--text-2)' }}>
                              <span className="font-medium" style={{ color: 'var(--text)' }}>Verify your email first.</span>{' '}
                              We sent a verification link to <strong>{me?.email}</strong>. Click it, then come back and enable this setting.
                            </div>
                            <button onClick={() => setVerifyEmailPrompt(false)} className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>✕</button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
                        Email not configured - set up SMTP above to enable email verification.
                      </div>
                    )}

                    <Toggle
                      label="Enforce email whitelist"
                      description="Only addresses or domains on the allowlist below can register."
                      value={serverConfig.requireWhitelist}
                      onChange={(v) => act(async () => {
                        await api.admin.updateServerConfig({ requireWhitelist: v });
                        setServerConfig((c) => c ? { ...c, requireWhitelist: v } : c);
                        showToast(`Whitelist ${v ? 'enabled' : 'disabled'}`, 'success');
                      })}
                    />

                    <Toggle
                      label="Allow members to create projects"
                      description="When off, only admins can create new projects. Admins can always create projects."
                      value={serverConfig.allowProjectCreation}
                      onChange={(v) => act(async () => {
                        await api.admin.updateServerConfig({ allowProjectCreation: v });
                        setServerConfig((c) => c ? { ...c, allowProjectCreation: v } : c);
                        showToast(`Project creation ${v ? 'open to all members' : 'restricted to admins'}`, 'success');
                      })}
                    />
                  </div>
                )}

                {/* Announcements feature */}
                {serverConfig && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Announcements</p>
                    <Toggle
                      label="Enable announcement wall"
                      description="Show a server-wide announcement wall accessible to all members."
                      value={serverConfig.announcementsEnabled}
                      onChange={(v) => act(async () => {
                        await api.admin.updateServerConfig({ announcementsEnabled: v });
                        setServerConfig((c) => c ? { ...c, announcementsEnabled: v } : c);
                        showToast(`Announcement wall ${v ? 'enabled' : 'disabled'}`, 'success');
                      })}
                    />
                    {serverConfig.announcementsEnabled && (
                      <div className="px-4 py-3 rounded-xl space-y-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Who can post announcements?</p>
                        <div className="flex gap-2">
                          {[{ value: 'admin', label: 'Admins only' }, { value: 'admin_and_owners', label: 'Admins + Project owners' }, { value: 'all', label: 'All members' }].map(({ value, label }) => (
                            <button
                              key={value}
                              onClick={() => act(async () => {
                                await api.admin.updateServerConfig({ announcementPostRole: value });
                                setServerConfig((c) => c ? { ...c, announcementPostRole: value } : c);
                                showToast(`Posting restricted to ${label.toLowerCase()}`, 'success');
                              })}
                              className="px-3 py-1.5 rounded-lg text-sm transition-colors"
                              style={{
                                background: serverConfig.announcementPostRole === value ? '#6366f1' : 'var(--surface)',
                                color: serverConfig.announcementPostRole === value ? '#fff' : 'var(--text-2)',
                                border: `1px solid ${serverConfig.announcementPostRole === value ? '#6366f1' : 'var(--border)'}`,
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Whitelist - only shown when whitelist is enabled */}
                {serverConfig?.requireWhitelist && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Email allowlist</p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      Add exact addresses (<code className="text-xs px-1 rounded" style={{ background: 'var(--surface)' }}>user@co.com</code>) or domains (<code className="text-xs px-1 rounded" style={{ background: 'var(--surface)' }}>@co.com</code>).
                    </p>
                    <div className="flex gap-2">
                      <input className="input flex-1 text-sm" placeholder="@company.com or user@example.com"
                        value={newPattern} onChange={(e) => setNewPattern(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && newPattern.trim() && act(async () => { await api.admin.addWhitelist(newPattern); setNewPattern(''); setWhitelist(await api.admin.whitelist()); })} />
                      <button disabled={!newPattern.trim()} className="btn-primary text-sm px-4"
                        onClick={() => act(async () => { await api.admin.addWhitelist(newPattern); setNewPattern(''); setWhitelist(await api.admin.whitelist()); })}>
                        Add
                      </button>
                    </div>
                    {whitelist.length === 0 ? (
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>No entries yet - all registrations are blocked while this is empty.</p>
                    ) : (
                      <div className="space-y-1">
                        {whitelist.map((entry) => (
                          <div key={entry.id} className="flex items-center justify-between px-4 py-2 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                            <span className="text-sm font-mono" style={{ color: 'var(--text)' }}>{entry.pattern}</span>
                            <button onClick={() => act(async () => { await api.admin.removeWhitelist(entry.id); setWhitelist(await api.admin.whitelist()); })}
                              className="text-xs opacity-50 hover:opacity-100" style={{ color: '#ef4444' }}>Remove</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Audit Logs ────────────────────────────────────────────────────── */}
            {tab === 'logs' && (
              <div className="space-y-4">

                {/* Filter bar */}
                <div className="flex items-end gap-2 flex-wrap">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Action</label>
                    <select value={logAction} onChange={(e) => setLogAction(e.target.value)}
                      className="text-sm px-2.5 py-1.5 rounded-lg"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                      <option value="">All</option>
                      {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>From</label>
                    <input type="date" value={logFrom} onChange={(e) => setLogFrom(e.target.value)}
                      className="text-sm px-2.5 py-1.5 rounded-lg"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>To</label>
                    <input type="date" value={logTo} onChange={(e) => setLogTo(e.target.value)}
                      className="text-sm px-2.5 py-1.5 rounded-lg"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                  </div>
                  <button
                    onClick={() => act(() => fetchLogs({ action: logAction || undefined, from: logFrom || undefined, to: logTo || undefined }))}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium"
                    style={{ background: 'var(--brand)', color: 'white' }}>
                    Apply
                  </button>
                  <button
                    onClick={() => { setLogAction(''); setLogFrom(''); setLogTo(''); act(() => fetchLogs({})); }}
                    className="px-3 py-1.5 rounded-lg text-sm"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                    Reset
                  </button>
                  <div className="flex gap-2 ml-auto">
                    <button
                      onClick={() => act(() => api.admin.exportLogs({ format: 'csv', action: logAction || undefined, from: logFrom || undefined, to: logTo || undefined }))}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                      ↓ CSV
                    </button>
                    <button
                      onClick={() => act(() => api.admin.exportLogs({ format: 'jsonl', action: logAction || undefined, from: logFrom || undefined, to: logTo || undefined }))}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                      ↓ JSONL
                    </button>
                  </div>
                </div>

                {/* Log entries */}
                <div className="space-y-1">
                  {logs.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--text-3)' }}>No events found.</p>
                  ) : (
                    <>
                      {logs.map((log) => (
                        <div key={log.id} className="flex items-center gap-4 px-4 py-2.5 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                          <span className="text-xs px-2 py-0.5 rounded font-medium flex-shrink-0" style={{
                            background: (log.action.includes('FAIL') || log.action.includes('DELETE') || log.action.includes('PRUNE')) ? '#ef444422' : '#6366f122',
                            color: (log.action.includes('FAIL') || log.action.includes('DELETE') || log.action.includes('PRUNE')) ? '#ef4444' : '#6366f1',
                          }}>
                            {ACTION_LABELS[log.action] ?? log.action}
                          </span>
                          <span className="text-sm flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>
                            {log.actorName && <span className="font-medium">{log.actorName}</span>}
                            {log.actorName && log.targetName && <span style={{ color: 'var(--text-3)' }}> → </span>}
                            {log.targetName && <span style={{ color: 'var(--text-3)' }}>{log.targetName}</span>}
                          </span>
                          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>{new Date(log.createdAt).toLocaleString()}</span>
                        </div>
                      ))}
                      {hasMoreLogs && (
                        <button
                          onClick={() => act(() => fetchLogs({ cursor: logCursor ?? undefined, action: logAction || undefined, from: logFrom || undefined, to: logTo || undefined, append: true }))}
                          className="w-full py-2 text-sm text-center rounded-lg"
                          style={{ color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                          Load more
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Prune - founding admin only */}
                {me?.isFoundingAdmin && (
                  <div className="mt-4 p-4 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid #ef444433' }}>
                    <p className="text-sm font-semibold mb-1" style={{ color: '#ef4444' }}>Prune old logs</p>
                    <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>
                      Permanently delete log entries older than N days. The prune itself is recorded as a new log entry.
                    </p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <input type="number" min="1" value={pruneDays} onChange={(e) => setPruneDays(e.target.value)}
                        className="w-20 text-sm px-2.5 py-1.5 rounded-lg"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                      <span className="text-sm" style={{ color: 'var(--text-2)' }}>days old</span>
                      {!pruneConfirm ? (
                        <button onClick={() => setPruneConfirm(true)}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium"
                          style={{ background: '#ef444422', color: '#ef4444', border: '1px solid #ef444433' }}>
                          Prune
                        </button>
                      ) : (
                        <>
                          <button
                            disabled={pruning}
                            onClick={() => act(async () => {
                              setPruning(true);
                              try {
                                const res = await api.admin.pruneLogs(parseInt(pruneDays));
                                showToast(`Deleted ${res.deletedCount} log entries`, 'success');
                                setPruneConfirm(false);
                                await fetchLogs({ action: logAction || undefined, from: logFrom || undefined, to: logTo || undefined });
                              } finally {
                                setPruning(false);
                              }
                            })}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium"
                            style={{ background: '#ef4444', color: 'white' }}>
                            {pruning ? 'Pruning…' : 'Confirm delete'}
                          </button>
                          <button onClick={() => setPruneConfirm(false)}
                            className="px-3 py-1.5 text-sm"
                            style={{ color: 'var(--text-3)' }}>
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* ── IP Rules ──────────────────────────────────────────────────────── */}
            {tab === 'ip-rules' && (
              <div className="space-y-6 max-w-xl">

                {/* Mode selector */}
                <div className="p-5 rounded-xl space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>IP restriction mode</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                      Controls who can access this server based on IP address. The admin IP settings endpoint is always accessible regardless of mode, so you can always recover from a misconfiguration.
                    </p>
                  </div>
                  {ipRestrictions ? (
                    <>
                      <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-3)' }}>Your current IP:</span>
                        <code className="font-mono font-medium" style={{ color: 'var(--text)' }}>{ipRestrictions.yourIp}</code>
                      </div>
                      <div className="flex gap-2">
                        {[
                          { value: 'disabled',  label: 'Disabled',   desc: 'No IP filtering' },
                          { value: 'allowlist', label: 'Allowlist',  desc: 'Block all except listed IPs' },
                          { value: 'blocklist', label: 'Blocklist',  desc: 'Block only listed IPs' },
                        ].map(({ value, label, desc }) => {
                          const active = ipRestrictions.mode === value;
                          const color = value === 'allowlist' ? '#10b981' : value === 'blocklist' ? '#ef4444' : '#6366f1';
                          return (
                            <button
                              key={value}
                              onClick={() => act(async () => {
                                await api.admin.setIpMode(value);
                                setIpRestrictions((r) => r ? { ...r, mode: value } : r);
                                showToast(`IP mode set to ${label.toLowerCase()}`, 'success');
                              })}
                              className="flex-1 px-3 py-3 rounded-xl text-left transition-colors"
                              style={{
                                background: active ? `${color}18` : 'var(--surface)',
                                border: `1px solid ${active ? color : 'var(--border)'}`,
                              }}
                            >
                              <p className="text-sm font-medium" style={{ color: active ? color : 'var(--text)' }}>{label}</p>
                              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{desc}</p>
                            </button>
                          );
                        })}
                      </div>
                      {ipRestrictions.mode === 'allowlist' && (
                        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg" style={{ background: '#f59e0b12', border: '1px solid #f59e0b33' }}>
                          <span style={{ color: '#f59e0b', flexShrink: 0 }}>⚠️</span>
                          <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                            <strong>Allowlist mode is active.</strong> Only IPs matching a rule below can reach the server. Make sure your own IP is in the list.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm" style={{ color: 'var(--text-3)' }}>Loading…</p>
                  )}
                </div>

                {/* Rules */}
                {ipRestrictions && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                      Rules{' '}
                      <span className="text-xs font-normal" style={{ color: 'var(--text-3)' }}>({ipRestrictions.rules.length})</span>
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      IPv4 CIDR (e.g.{' '}
                      <code className="text-xs px-1 rounded" style={{ background: 'var(--surface)' }}>192.168.1.0/24</code>
                      ), exact IPv4 (e.g.{' '}
                      <code className="text-xs px-1 rounded" style={{ background: 'var(--surface)' }}>1.2.3.4</code>
                      ), or an exact IPv6 address.
                    </p>

                    {/* Add rule */}
                    <div className="flex gap-2">
                      <input
                        className="input text-sm"
                        style={{ width: 180 }}
                        placeholder="192.168.0.0/24"
                        value={newCidr}
                        onChange={(e) => setNewCidr(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newCidr.trim() && !addingIpRule) {
                            setAddingIpRule(true);
                            act(async () => {
                              try {
                                await api.admin.addIpRule(newCidr.trim(), newCidrDesc.trim() || undefined);
                                setNewCidr(''); setNewCidrDesc('');
                                await loadIpRules();
                                showToast('Rule added', 'success');
                              } finally { setAddingIpRule(false); }
                            });
                          }
                        }}
                      />
                      <input
                        className="input text-sm flex-1"
                        placeholder="Description (optional)"
                        value={newCidrDesc}
                        onChange={(e) => setNewCidrDesc(e.target.value)}
                      />
                      <button
                        disabled={!newCidr.trim() || addingIpRule}
                        className="btn-primary text-sm px-4 flex-shrink-0"
                        onClick={() => {
                          if (!newCidr.trim() || addingIpRule) return;
                          setAddingIpRule(true);
                          act(async () => {
                            try {
                              await api.admin.addIpRule(newCidr.trim(), newCidrDesc.trim() || undefined);
                              setNewCidr(''); setNewCidrDesc('');
                              await loadIpRules();
                              showToast('Rule added', 'success');
                            } finally { setAddingIpRule(false); }
                          });
                        }}
                      >
                        {addingIpRule ? '…' : 'Add'}
                      </button>
                    </div>

                    {/* Rules list */}
                    {ipRestrictions.rules.length === 0 ? (
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                        No rules yet.
                        {ipRestrictions.mode === 'allowlist' && ' All non-local requests are currently blocked.'}
                        {ipRestrictions.mode === 'blocklist' && ' No IPs are currently blocked.'}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {ipRestrictions.rules.map((rule) => (
                          <div key={rule.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                            <span className="text-sm font-mono" style={{ color: 'var(--text)' }}>{rule.cidr}</span>
                            {rule.description && (
                              <span className="text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--text-3)' }}>{rule.description}</span>
                            )}
                            {!rule.description && <span className="flex-1" />}
                            <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>
                              {new Date(rule.createdAt).toLocaleDateString()}
                            </span>
                            <button
                              onClick={() => act(async () => {
                                await api.admin.removeIpRule(rule.id);
                                await loadIpRules();
                                showToast('Rule removed', 'success');
                              })}
                              className="text-xs opacity-50 hover:opacity-100 flex-shrink-0"
                              style={{ color: '#ef4444' }}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}

            {/* ── Statistics ────────────────────────────────────────────────────── */}
            {tab === 'statistics' && stats && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <StatCard label="Total users" value={stats.userCount} sub={`+${stats.newUsers} last 30 days`} />
                <StatCard label="Total projects" value={stats.projectCount} sub={`+${stats.newProjects} last 30 days`} />
                <StatCard label="Total tasks" value={stats.taskCount} />
                <StatCard label="Total messages" value={stats.messageCount} />
                <StatCard label="Admins" value={users.filter((u) => u.isAdmin).length} />
                <StatCard label="Unverified users" value={users.filter((u) => !u.emailVerified).length} />
              </div>
            )}

          </>
        )}
      </div>

    </div>
  );
}
