/**
 * Bell icon button with dropdown that shows either user notifications (normal mode) or admin audit-log entries (admin mode).
 * Both modes poll every 30 seconds; admin mode tracks the "seen at" timestamp in `planly:admin_notif_seen_at` localStorage.
 * In normal mode, clicking a notification with a matching `taskId` and active product opens that task's chat directly.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Notification } from '../../api/client';
import { useChat } from '../../context/ChatContext';
import { useProduct } from '../../context/ProductContext';
import { useToast } from '../../context/ToastContext';

const SEEN_KEY = 'admin_notif_seen_at';
// Entries created before this timestamp are hidden until new ones arrive after "Clear all"
const CLEARED_KEY = 'admin_notif_cleared_at';

const BellIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

type AdminEntry = {
  id: string;
  action: string;
  actorName: string | null;
  targetName: string | null;
  metadata: unknown;
  createdAt: string;
};

const ADMIN_ACTION_LABELS: Record<string, string> = {
  USER_REGISTERED: 'New user registered',
  LOGIN_FAILED: 'Login failed',
  LOGIN_LOCKED: 'Account locked',
  LOGIN_UNLOCKED: 'Account unlocked',
  USER_PROMOTED: 'User promoted to admin',
  USER_DEMOTED: 'User demoted from admin',
  CROWN_TRANSFERRED: 'Ownership transferred',
  FOUNDING_ADMIN_REGISTERED: 'Founding admin registered',
  EMAIL_VERIFIED_BY_ADMIN: 'Email verified by admin',
  USER_DELETED: 'User deleted',
  SERVER_CONFIG_UPDATED: 'Server config updated',
  LOGS_PRUNED: 'Audit logs pruned',
};

const ADMIN_ACTION_ICON: Record<string, string> = {
  USER_REGISTERED: '👤',
  LOGIN_FAILED: '⚠️',
  LOGIN_LOCKED: '🔒',
  LOGIN_UNLOCKED: '🔓',
  USER_PROMOTED: '🛡️',
  USER_DEMOTED: '👤',
  CROWN_TRANSFERRED: '👑',
  FOUNDING_ADMIN_REGISTERED: '👑',
  EMAIL_VERIFIED_BY_ADMIN: '✅',
  USER_DELETED: '🗑️',
  SERVER_CONFIG_UPDATED: '⚙️',
  LOGS_PRUNED: '🧹',
};

export default function NotificationBell({ adminMode, productId }: { adminMode?: boolean; productId?: string }) {
  const navigate = useNavigate();
  const { openChat } = useChat();
  const { tasks, activeProduct, refreshProducts } = useProduct();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [inviteActing, setInviteActing] = useState<string | null>(null);

  // ── Normal mode state ──
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  // ── Admin mode state ──
  const [adminEntries, setAdminEntries] = useState<AdminEntry[]>([]);
  const [adminUnread, setAdminUnread] = useState(0);
  const [adminLoading, setAdminLoading] = useState(false);
  // Snapshot of the seen-at timestamp captured at open time, used to highlight new entries
  const [adminSeenAt, setAdminSeenAt] = useState<string | null>(null);
  const [hasNewAdmin, setHasNewAdmin] = useState(false);

  const ref = useRef<HTMLDivElement>(null);

  // ── Normal mode polling ──
  const refreshNormal = useCallback(async () => {
    try {
      const { count } = await api.notifications.unreadCount(productId);
      setUnread(count);
    } catch {}
  }, [productId]);

  // ── Admin mode polling ──
  const refreshAdmin = useCallback(async () => {
    try {
      let since = localStorage.getItem(SEEN_KEY);
      if (!since) {
        since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        localStorage.setItem(SEEN_KEY, since);
      }
      const { count } = await api.admin.adminNotificationCount(since);
      setAdminUnread(count);
    } catch {}
  }, []);

  useEffect(() => {
    // Reset count when project changes so stale badge doesn't linger
    setUnread(0);
    if (adminMode) {
      refreshAdmin();
      const interval = setInterval(refreshAdmin, 30_000);
      return () => clearInterval(interval);
    } else {
      refreshNormal();
      const interval = setInterval(refreshNormal, 30_000);
      return () => clearInterval(interval);
    }
  }, [adminMode, productId, refreshAdmin, refreshNormal]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // ── Open handlers ──
  async function handleOpen() {
    setOpen((v) => !v);
    if (open) return;

    if (adminMode) {
      setAdminLoading(true);
      try {
        // Capture seenAt BEFORE loading so new-entry highlighting and "Mark all read" are correct
        const seenAt = localStorage.getItem(SEEN_KEY) ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        setAdminSeenAt(seenAt);
        const clearedAt = localStorage.getItem(CLEARED_KEY);
        const { entries } = await api.admin.adminNotifications();
        const visible = clearedAt ? entries.filter((e) => new Date(e.createdAt) > new Date(clearedAt)) : entries;
        setAdminEntries(visible);
        setHasNewAdmin(visible.some((e) => new Date(e.createdAt) > new Date(seenAt)));
        setAdminUnread(0);
      } catch {
      } finally {
        setAdminLoading(false);
      }
    } else {
      setLoading(true);
      try {
        const { notifications: n } = await api.notifications.list(undefined, productId);
        setNotifications(n);
        setUnread(0);
      } catch {
      } finally {
        setLoading(false);
      }
    }
  }

  // ── Normal mode actions ──
  async function markRead(id: string) {
    await api.notifications.markRead([id]).catch(() => {});
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  async function markAllRead() {
    await api.notifications.markAllRead().catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  async function clearAll() {
    await api.notifications.clearAll().catch(() => {});
    setNotifications([]);
    setUnread(0);
    setOpen(false);
  }

  async function dismiss(id: string) {
    await api.notifications.delete(id).catch(() => {});
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  function handleNotificationClick(n: Notification) {
    if (n.type === 'invite_received' || n.type === 'access_requested') return; // handled by Accept/Reject buttons
    if (!n.read) markRead(n.id);
    setOpen(false);
    if (n.taskId && n.productId === activeProduct?.id) {
      const task = tasks.find((t) => t.id === n.taskId);
      openChat(n.taskId, task?.name ?? '');
      return;
    }
    if (n.productId) navigate('/kanban');
  }

  async function handleAcceptInvite(n: Notification) {
    const token = (n.metadata as { inviteToken?: string } | null)?.inviteToken;
    if (!token) return;
    setInviteActing(n.id);
    try {
      await api.invites.accept(token);
      await markRead(n.id);
      await refreshProducts();
      showToast('You have joined the project', 'success');
      setOpen(false);
      navigate('/kanban');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setInviteActing(null);
    }
  }

  async function handleDeclineInvite(n: Notification) {
    const token = (n.metadata as { inviteToken?: string } | null)?.inviteToken;
    if (!token) return;
    setInviteActing(n.id);
    try {
      await api.invites.decline(token);
      await dismiss(n.id);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setInviteActing(null);
    }
  }

  async function handleDecideAccessRequest(n: Notification, action: 'approve' | 'reject') {
    const requestId = (n.metadata as { requestId?: string } | null)?.requestId;
    if (!requestId || !n.productId) return;
    setInviteActing(n.id);
    try {
      await api.accessRequests.decide(n.productId, requestId, action);
      if (action === 'approve') {
        await markRead(n.id);
        showToast('Request approved', 'success');
      } else {
        await dismiss(n.id);
        showToast('Request rejected', 'success');
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setInviteActing(null);
    }
  }

  const displayUnread = adminMode ? adminUnread : unread;
  const isActive = adminMode || open;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="w-9 h-9 rounded-full flex items-center justify-center transition-colors flex-shrink-0 relative"
        style={{
          color: isActive ? 'var(--brand)' : 'var(--text-3)',
          background: isActive ? 'var(--brand-subtle)' : 'var(--surface-2)',
          border: isActive ? '1px solid var(--brand)' : '1px solid transparent',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--brand)';
          e.currentTarget.style.borderColor = 'var(--brand)';
          e.currentTarget.style.background = 'var(--brand-subtle)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = isActive ? 'var(--brand)' : 'var(--text-3)';
          e.currentTarget.style.borderColor = isActive ? 'var(--brand)' : 'transparent';
          e.currentTarget.style.background = isActive ? 'var(--brand-subtle)' : 'var(--surface-2)';
        }}
        title={adminMode ? 'Admin notifications' : 'Notifications'}
      >
        <BellIcon />
        {displayUnread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white text-[9px] font-bold"
            style={{ background: '#ef4444', minWidth: 16, height: 16, padding: '0 3px' }}
          >
            {displayUnread > 99 ? '99+' : displayUnread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 rounded-2xl shadow-2xl overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', zIndex: 50 }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {adminMode ? 'Admin notifications' : 'Notifications'}
            </span>
            {adminMode && adminEntries.length > 0 && (
              <div className="flex items-center gap-3">
                {hasNewAdmin && (
                  <button
                    onClick={() => {
                      const now = new Date().toISOString();
                      localStorage.setItem(SEEN_KEY, now);
                      setAdminSeenAt(now);
                      setHasNewAdmin(false);
                    }}
                    className="text-xs transition-opacity"
                    style={{ color: 'var(--brand)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => {
                    const now = new Date().toISOString();
                    localStorage.setItem(SEEN_KEY, now);
                    localStorage.setItem(CLEARED_KEY, now);
                    setAdminUnread(0);
                    setHasNewAdmin(false);
                    setAdminEntries([]);
                    setOpen(false);
                  }}
                  className="text-xs transition-opacity"
                  style={{ color: 'var(--text-3)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  Clear all
                </button>
              </div>
            )}
            {!adminMode && notifications.length > 0 && (
              <div className="flex items-center gap-3">
                {notifications.some((n) => !n.read) && (
                  <button
                    onClick={markAllRead}
                    className="text-xs transition-opacity"
                    style={{ color: 'var(--brand)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={clearAll}
                  className="text-xs transition-opacity"
                  style={{ color: 'var(--text-3)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {/* ── Admin mode ── */}
            {adminMode && (
              <>
                {adminLoading && (
                  <div className="flex justify-center py-8">
                    <div
                      className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                      style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }}
                    />
                  </div>
                )}
                {!adminLoading && adminEntries.length === 0 && (
                  <div className="py-10 text-center text-sm" style={{ color: 'var(--text-3)' }}>
                    No admin activity yet
                  </div>
                )}
                {!adminLoading &&
                  adminEntries.map((entry) => {
                    const isNew = adminSeenAt ? new Date(entry.createdAt) > new Date(adminSeenAt) : false;
                    const body = [entry.actorName, entry.targetName].filter(Boolean).join(' → ');
                    return (
                      <div
                        key={entry.id}
                        className="flex gap-3 px-4 py-3"
                        style={{
                          background: isNew ? 'var(--brand-subtle)' : 'transparent',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <div className="flex-shrink-0 mt-0.5 text-base">{ADMIN_ACTION_ICON[entry.action] ?? '🔔'}</div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm leading-snug ${isNew ? 'font-medium' : ''}`}
                            style={{ color: 'var(--text)' }}
                          >
                            {ADMIN_ACTION_LABELS[entry.action] ?? entry.action}
                          </p>
                          {body && (
                            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-3)' }}>
                              {body}
                            </p>
                          )}
                          <p className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>
                            {formatRelative(entry.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
              </>
            )}

            {/* ── Normal mode ── */}
            {!adminMode && (
              <>
                {loading && (
                  <div className="flex justify-center py-8">
                    <div
                      className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                      style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }}
                    />
                  </div>
                )}
                {!loading && notifications.length === 0 && (
                  <div className="py-10 text-center text-sm" style={{ color: 'var(--text-3)' }}>
                    No notifications
                  </div>
                )}
                {!loading &&
                  notifications.map((n) => {
                    const isInvite = n.type === 'invite_received';
                    const hasToken = !!(n.metadata as { inviteToken?: string } | null)?.inviteToken;
                    const isAccessRequest = n.type === 'access_requested';
                    const hasRequestId = !!(n.metadata as { requestId?: string } | null)?.requestId;
                    const isActionable = isInvite || isAccessRequest;
                    return (
                      <div
                        key={n.id}
                        className={`group relative flex gap-3 px-4 py-3 transition-colors ${isActionable ? '' : 'cursor-pointer'}`}
                        style={{
                          background: n.read ? 'transparent' : 'var(--brand-subtle)',
                          borderBottom: '1px solid var(--border)',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = n.read ? 'transparent' : 'var(--brand-subtle)')
                        }
                        onClick={() => handleNotificationClick(n)}
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          <span className="text-base">{getIcon(n.type)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm leading-snug ${n.read ? '' : 'font-medium'}`}
                            style={{ color: 'var(--text)' }}
                          >
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                              {n.body}
                            </p>
                          )}
                          <p className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>
                            {formatRelative(n.createdAt)}
                          </p>
                          {isInvite && hasToken && (
                            <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => handleAcceptInvite(n)}
                                disabled={inviteActing === n.id}
                                className="btn-primary text-xs px-3 py-1"
                              >
                                {inviteActing === n.id ? '…' : 'Accept'}
                              </button>
                              <button
                                onClick={() => handleDeclineInvite(n)}
                                disabled={inviteActing === n.id}
                                className="text-xs px-3 py-1 rounded-lg transition-colors"
                                style={{
                                  color: 'var(--text-3)',
                                  border: '1px solid var(--border)',
                                  background: 'transparent',
                                }}
                              >
                                Decline
                              </button>
                            </div>
                          )}
                          {isAccessRequest && hasRequestId && (
                            <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => handleDecideAccessRequest(n, 'approve')}
                                disabled={inviteActing === n.id}
                                className="btn-primary text-xs px-3 py-1"
                              >
                                {inviteActing === n.id ? '…' : 'Accept'}
                              </button>
                              <button
                                onClick={() => handleDecideAccessRequest(n, 'reject')}
                                disabled={inviteActing === n.id}
                                className="text-xs px-3 py-1 rounded-lg transition-colors"
                                style={{
                                  color: 'var(--text-3)',
                                  border: '1px solid var(--border)',
                                  background: 'transparent',
                                }}
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                        {!isActionable && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              dismiss(n.id);
                            }}
                            className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-xs transition-all"
                            style={{ color: 'var(--text-3)' }}
                            title="Dismiss"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getIcon(type: string) {
  switch (type) {
    case 'task_assigned':
      return '📋';
    case 'task_commented':
      return '💬';
    case 'mention':
      return '@';
    case 'access_approved':
      return '✅';
    case 'access_rejected':
      return '❌';
    case 'access_requested':
      return '🔑';
    case 'invite_received':
      return '✉️';
    case 'sprint_started':
      return '🚀';
    default:
      return '🔔';
  }
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
