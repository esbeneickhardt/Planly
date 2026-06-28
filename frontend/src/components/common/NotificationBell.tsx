import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Notification } from '../../api/client';

const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const { count } = await api.notifications.unreadCount();
      setUnread(count);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  async function handleOpen() {
    setOpen((v) => !v);
    if (!open) {
      setLoading(true);
      try {
        const { notifications: n } = await api.notifications.list();
        setNotifications(n);
        setUnread(0);
      } catch {}
      finally { setLoading(false); }
    }
  }

  async function markRead(id: string) {
    await api.notifications.markRead([id]).catch(() => {});
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  }

  async function markAllRead() {
    await api.notifications.markAllRead().catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  async function dismiss(id: string) {
    await api.notifications.delete(id).catch(() => {});
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  function handleNotificationClick(n: Notification) {
    if (!n.read) markRead(n.id);
    if (n.productId) {
      navigate('/kanban');
    }
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="w-9 h-9 rounded-full flex items-center justify-center transition-colors flex-shrink-0 relative"
        style={{
          color: open ? 'var(--brand)' : 'var(--text-3)',
          background: open ? 'var(--brand-subtle)' : 'var(--surface-2)',
          border: open ? '1px solid var(--brand)' : '1px solid transparent',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = open ? 'var(--brand)' : 'var(--text-3)')}
        title="Notifications"
      >
        <BellIcon />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white text-[9px] font-bold"
            style={{ background: '#ef4444', minWidth: 16, height: 16, padding: '0 3px' }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 rounded-2xl shadow-2xl overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', zIndex: 50 }}
        >
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Notifications</span>
            {notifications.some((n) => !n.read) && (
              <button
                onClick={markAllRead}
                className="text-xs transition-colors"
                style={{ color: 'var(--brand)' }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }} />
              </div>
            )}
            {!loading && notifications.length === 0 && (
              <div className="py-10 text-center text-sm" style={{ color: 'var(--text-3)' }}>
                No notifications
              </div>
            )}
            {!loading && notifications.map((n) => (
              <div
                key={n.id}
                className="group relative flex gap-3 px-4 py-3 cursor-pointer transition-colors"
                style={{ background: n.read ? 'transparent' : 'var(--brand-subtle)', borderBottom: '1px solid var(--border)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = n.read ? 'transparent' : 'var(--brand-subtle)')}
                onClick={() => handleNotificationClick(n)}
              >
                <div className="flex-shrink-0 mt-0.5">
                  <span className="text-base">{getIcon(n.type)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${n.read ? '' : 'font-medium'}`} style={{ color: 'var(--text)' }}>
                    {n.title}
                  </p>
                  {n.body && <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{n.body}</p>}
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>
                    {formatRelative(n.createdAt)}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
                  className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-xs transition-all"
                  style={{ color: 'var(--text-3)' }}
                  title="Dismiss"
                >✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getIcon(type: string) {
  switch (type) {
    case 'task_assigned': return '📋';
    case 'access_approved': return '✅';
    case 'access_rejected': return '❌';
    case 'invite_received': return '✉️';
    default: return '🔔';
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
