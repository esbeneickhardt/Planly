/**
 * Top navigation bar with project picker, tab navigation, chat button, notification bell, and account dropdown.
 * Icons live in TopBarIcons.tsx; mobile menu, account dropdown, and project picker are each their own component.
 * `chatIsAdmin` drives visual state of the chat button; `onToggleAdmin` switches between product and admin mode.
 */
import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { NavLink, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import Tooltip from './Tooltip';
import EmojiPicker from './EmojiPicker';
import { useAuth } from '../../context/AuthContext';
import { useProduct } from '../../context/ProductContext';
import { usePermission } from '../../context/PermissionContext';
import { useTheme } from '../../context/ThemeContext';
import { useProfileModals } from '../../context/ProfileModalsContext';
import { api } from '../../api/client';
import Modal from './Modal';
import DiscoverProjectsModal from './DiscoverProjectsModal';
import MembershipsModal from './MembershipsModal';
import IntegrationsModal from './IntegrationsModal';
import NotificationBell from './NotificationBell';
import { MESSAGE_NOTIFICATION_TYPES } from '../../constants/notifications';
import NotificationPreferencesModal from './NotificationPreferencesModal';
import PrivacyModal from './PrivacyModal';
import ThemePickerModal from './ThemePickerModal';
import TotpModal from './TotpModal';
import ChangePasswordModal from './ChangePasswordModal';
import ProfileModal from './ProfileModal';
import DeleteAccountModal from './DeleteAccountModal';
import SeedDataModal from './SeedDataModal';
import { isBeforeToday } from '../../utils/dates';
import {
  SearchIcon,
  ChevronDown,
  PlanIcon,
  ExecuteIcon,
  ProgressIcon,
  TasksIcon,
  CategoriesIcon,
  ChatIcon,
  ShieldIcon,
  MegaphoneIcon,
  CrownIcon,
  UsersIcon,
  FolderGridIcon,
  MailIcon,
  ActivityIcon,
  BarChartIcon,
  AboutIcon,
} from './TopBarIcons';
import TopBarMobileMenu from './TopBarMobileMenu';
import TopBarAccountDropdown from './TopBarAccountDropdown';
import TopBarProjectPicker from './TopBarProjectPicker';
import type { MobileNavItem, AdminTab } from './TopBarMobileMenu';

// Lazy-loaded rather than a static import: TopBar is part of the always-mounted app shell, but its
// only use of MarkdownEditor is inside the "New project" modal's description field (gated behind
// `showNewProduct` below) - a static import here would pull MarkdownEditor's own `mermaid` dependency
// (via MermaidBlock.tsx) into the main bundle even though most sessions never open that modal.
const MarkdownEditor = lazy(() => import('./MarkdownEditor'));

// ── Admin tab definitions ──────────────────────────────────────────────────

export const ADMIN_TABS: AdminTab[] = [
  { key: 'ownership', label: 'Ownership', Icon: CrownIcon },
  { key: 'users', label: 'Users', Icon: UsersIcon },
  { key: 'projects', label: 'Projects', Icon: FolderGridIcon },
  { key: 'email', label: 'Email', Icon: MailIcon },
  { key: 'ip-rules', label: 'Networking', Icon: ShieldIcon },
  { key: 'logs', label: 'Audit Logs', Icon: ActivityIcon },
  { key: 'statistics', label: 'Stats', Icon: BarChartIcon },
];

// ── Nav config ─────────────────────────────────────────────────────────────

const NAV = [
  { to: '/canvas', label: 'Plan', Icon: PlanIcon, tab: 'canvas' },
  { to: '/kanban', label: 'Execute', Icon: ExecuteIcon, tab: 'kanban' },
  { to: '/gantt', label: 'Progress', Icon: ProgressIcon, tab: 'gantt' },
  { to: '/backlog', label: 'Tasks', Icon: TasksIcon, tab: 'backlog' },
  { to: '/analytics', label: 'Analytics', Icon: BarChartIcon, tab: 'analytics' },
  { to: '/about', label: 'About', Icon: AboutIcon, tab: 'about' },
];

interface NewProductForm {
  name: string;
  emoji: string;
  description: string;
  deadline: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TopBar({
  onOpenSearch,
  onOpenChat,
  onOpenVision,
  chatOpen,
  chatIsAdmin,
  onToggleAdmin,
  onExitAdmin,
}: {
  onOpenSearch: () => void;
  onOpenChat: () => void;
  onOpenVision: () => void;
  chatOpen?: boolean;
  chatIsAdmin?: boolean;
  onToggleAdmin?: () => void;
  onExitAdmin?: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdminPage = location.pathname === '/admin';
  const adminTab = searchParams.get('tab') ?? 'ownership';
  const { user, logout } = useAuth();
  const { products, activeProduct, setActiveProduct, tasks, createProduct, refreshProducts } = useProduct();
  const { canRead, canManage } = usePermission();
  const { isDark, mobileNavPosition } = useTheme();
  const {
    showThemePicker,
    setShowThemePicker,
    showMemberships,
    setShowMemberships,
    showIntegrations,
    setShowIntegrations,
    showNotifPrefs,
    setShowNotifPrefs,
    showPrivacy,
    setShowPrivacy,
    showTotp,
    setShowTotp,
    showChangePassword,
    setShowChangePassword,
  } = useProfileModals();

  // Modal + dropdown visibility state
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [showSeedData, setShowSeedData] = useState(false);
  const [showProjectDd, setShowProjectDd] = useState(false);
  const [showAccountDd, setShowAccountDd] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [productForm, setProductForm] = useState<NewProductForm>({
    name: '',
    emoji: '',
    description: '',
    deadline: '',
  });
  const [creating, setCreating] = useState(false);
  const [showProductEmojiPicker, setShowProductEmojiPicker] = useState(false);
  const [productError, setProductError] = useState('');

  const projectRef = useRef<HTMLDivElement>(null);
  // Separate ref for the mobile round picker button - only one of the two wrappers is ever
  // actually visible at a given viewport width, but both exist in the DOM, so the outside-click
  // check below needs to treat "inside either one" as "inside the picker".
  const projectRefMobile = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      const insideProjectPicker =
        (projectRef.current && projectRef.current.contains(target)) ||
        (projectRefMobile.current && projectRefMobile.current.contains(target));
      if (!insideProjectPicker) setShowProjectDd(false);
      if (accountRef.current && !accountRef.current.contains(target)) setShowAccountDd(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const overdueCount = tasks.filter((t) => t.deadline && t.status !== 'done' && isBeforeToday(t.deadline)).length;
  const unassignedCount = tasks.filter((t) => t.status !== 'done' && !t.ownerId).length;

  // Unread mentions/DMs/groups - shown as a badge on the Chat button instead of in the
  // notification bell (NotificationBell.tsx excludes these types), same 30s poll cadence the
  // bell itself uses. Sums the same two sources ChatPanel's own tab badges are built from -
  // conversations.unreadCount (DMs + groups) and unread-by-task (mentions, general + per-task) -
  // so this aggregate never drifts from what the panel shows once opened. Each sub-count clears
  // granularly as the user visits that specific tab/thread inside the panel, not all at once.
  const [chatUnread, setChatUnread] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        // Non-admin chat is always scoped to one project now, so there's nothing to count
        // without an active project (mirrors the mentions guard just below).
        const [convCount, mentions] = await Promise.all([
          chatIsAdmin || activeProduct?.id
            ? api.conversations
                .unreadCount(!!chatIsAdmin, chatIsAdmin ? undefined : activeProduct?.id)
                .then((r) => r.count)
                .catch(() => 0)
            : Promise.resolve(0),
          !chatIsAdmin && activeProduct?.id
            ? api.notifications.unreadByTask(activeProduct.id).catch(() => ({ general: 0, byTask: {} }))
            : Promise.resolve({ general: 0, byTask: {} as Record<string, number> }),
        ]);
        const mentionCount = mentions.general + Object.values(mentions.byTask).reduce((s, n) => s + n, 0);
        if (!cancelled) setChatUnread(convCount + mentionCount);
      } catch {}
    }
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeProduct?.id, chatIsAdmin]);

  // Per-project unread notification counts for the project picker (each project's own badge, plus
  // an aggregate `total` across all of them for the mobile picker button's own badge - desktop
  // already shows the active project's count via the bell right next to it, so it doesn't need a
  // second one). Same exclusion as the bell itself so the two stay consistent.
  const [notifByProduct, setNotifByProduct] = useState<Record<string, number>>({});
  const [notifTotal, setNotifTotal] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const { byProduct, total } = await api.notifications.unreadByProduct({
          excludeTypes: MESSAGE_NOTIFICATION_TYPES,
        });
        if (!cancelled) {
          setNotifByProduct(byProduct);
          setNotifTotal(total);
        }
      } catch {}
    }
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Pre-filter nav items so TopBarMobileMenu doesn't need to repeat the canRead/analyticsEnabled
  // logic. Canvas is dropped here (mobile only - desktop's own nav filter below is untouched):
  // dragging nodes and connecting dependency edges by touch on a small screen isn't a good enough
  // experience to advertise as a primary mobile destination, even though the route itself still
  // renders and works if reached directly.
  const filteredNav: MobileNavItem[] = NAV.filter(({ tab }) => {
    if (!activeProduct) return false;
    if (tab === 'canvas') return false;
    if (tab === 'analytics' && !activeProduct.analyticsEnabled) return false;
    return canRead(tab);
  });

  function setField(f: keyof NewProductForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setProductForm((prev) => ({ ...prev, [f]: e.target.value }));
  }

  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    setProductError('');
    setCreating(true);
    try {
      await createProduct({
        name: productForm.name,
        emoji: productForm.emoji || undefined,
        description: productForm.description || undefined,
        deadline: productForm.deadline,
      });
      setShowNewProduct(false);
      setShowProductEmojiPicker(false);
      setProductForm({ name: '', emoji: '', description: '', deadline: '' });
    } catch (err) {
      setProductError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <header
        className={`flex-shrink-0 flex items-center h-14 px-3 gap-2 border-[var(--border)] ${
          mobileNavPosition === 'bottom'
            ? 'fixed bottom-0 inset-x-0 border-t lg:static lg:inset-auto lg:border-t-0 lg:border-b'
            : 'border-b'
        }`}
        style={{ background: 'var(--surface)', zIndex: 40 }}
      >
        {/* ── LEFT: logo + search ── */}
        <div className="flex items-center gap-2.5 flex-shrink-0 lg:w-60">
          <button
            onClick={() => navigate('/kanban')}
            className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0 transition-opacity hover:opacity-80"
            title="Go to Kanban"
            aria-label="Planly — go to Kanban"
          >
            <img
              src="/icons/p.png"
              alt=""
              className="w-full h-full object-contain"
            />
          </button>
          <button
            onClick={onOpenSearch}
            className="hidden lg:flex items-center gap-2 flex-1 h-9 px-3 rounded-full text-sm transition-all"
            style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--brand)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <SearchIcon />
            <span className="flex-1 text-left text-xs">Search in Planly</span>
            <kbd
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-3)' }}
            >
              ⌘K
            </kbd>
          </button>
        </div>

        {/* ── CENTER: nav tabs (desktop only) ── */}
        <nav className="hidden lg:flex flex-1 items-stretch justify-center h-full">
          {chatIsAdmin ? (
            // Admin section tabs
            ADMIN_TABS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => {
                  if (isAdminPage) setSearchParams({ tab: key });
                  else navigate({ pathname: '/admin', search: `tab=${key}` });
                }}
                className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 min-w-[60px] max-w-24 text-[11px] font-medium tracking-wide transition-colors ${
                  adminTab === key && isAdminPage
                    ? 'text-[var(--brand)]'
                    : 'text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
                }`}
              >
                <Icon />
                <span>{label}</span>
                {adminTab === key && isAdminPage && (
                  <div
                    className="absolute bottom-0 left-6 right-6 h-[3px] rounded-t-full"
                    style={{ background: 'var(--brand)' }}
                  />
                )}
              </button>
            ))
          ) : (
            // Normal project tabs
            <>
              {NAV.filter(({ tab }) => {
                if (!activeProduct) return false;
                if (tab === 'analytics' && !activeProduct.analyticsEnabled) return false;
                return canRead(tab);
              }).map(({ to, label, Icon }) => {
                const badge = label === 'Tasks' ? unassignedCount : label === 'Progress' ? overdueCount : 0;
                return (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `relative flex flex-col items-center justify-center gap-0 flex-1 min-w-[60px] max-w-24 text-[11px] font-medium tracking-wide transition-colors rounded-none ${
                        isActive
                          ? 'text-[var(--brand)]'
                          : 'text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div className="relative">
                          <Icon />
                          {badge > 0 && (
                            <span
                              className="absolute -top-1.5 -right-2.5 text-white rounded-full text-[9px] font-bold leading-none flex items-center justify-center"
                              style={{ background: '#ef4444', minWidth: 14, height: 14, padding: '0 3px' }}
                            >
                              {badge > 99 ? '99+' : badge}
                            </span>
                          )}
                        </div>
                        <span className="leading-tight">{label}</span>
                        {isActive && (
                          <div
                            className="absolute bottom-0 left-6 right-6 h-[3px] rounded-t-full"
                            style={{ background: 'var(--brand)' }}
                          />
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}

              {/* Settings — only for owners/co-owners */}
              {activeProduct && canManage && (
                <NavLink
                  to="/settings"
                  className={({ isActive }) =>
                    `relative flex flex-col items-center justify-center gap-0.5 flex-1 min-w-[60px] max-w-24 text-[11px] font-medium tracking-wide transition-colors ${isActive ? 'text-[var(--text)]' : 'text-[var(--text-3)]'}`
                  }
                  style={({ isActive }) => ({ color: isActive ? 'var(--text)' : undefined })}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--text)';
                    e.currentTarget.style.background = 'var(--surface-2)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = '';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {({ isActive }) => (
                    <>
                      <CategoriesIcon />
                      <span>Settings</span>
                      {isActive && (
                        <div
                          className="absolute bottom-0 left-6 right-6 h-[3px] rounded-t-full"
                          style={{ background: 'var(--brand)' }}
                        />
                      )}
                    </>
                  )}
                </NavLink>
              )}
            </>
          )}
        </nav>

        {/* Spacer on mobile so right-side items stay right */}
        <div className="flex-1 lg:hidden" />

        {/* ── RIGHT: icons + project picker + account ── */}
        <div className="flex items-center gap-1.5 flex-shrink-0" style={{ justifyContent: 'flex-end' }}>
          {/* How Planly works (desktop only) */}
          <Tooltip content="How Planly works" side="bottom" className="hidden lg:inline-flex relative">
            <button
              onClick={onOpenVision}
              className="hidden lg:flex w-9 h-9 rounded-full items-center justify-center transition-colors flex-shrink-0 text-sm font-semibold"
              style={{
                color: chatIsAdmin ? 'var(--brand)' : 'var(--text-3)',
                background: chatIsAdmin ? 'var(--brand-subtle)' : 'var(--surface-2)',
                border: chatIsAdmin ? '1px solid var(--brand)' : '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--brand)';
                e.currentTarget.style.borderColor = 'var(--brand)';
                e.currentTarget.style.background = 'var(--brand-subtle)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = chatIsAdmin ? 'var(--brand)' : 'var(--text-3)';
                e.currentTarget.style.borderColor = chatIsAdmin ? 'var(--brand)' : 'transparent';
                e.currentTarget.style.background = chatIsAdmin ? 'var(--brand-subtle)' : 'var(--surface-2)';
              }}
              aria-label="How Planly works"
            >
              <span aria-hidden="true">?</span>
            </button>
          </Tooltip>

          {/* Announcements (desktop only) */}
          {user?.announcementsEnabled && (
            <Tooltip
              content={chatIsAdmin ? 'Announcements (admin mode)' : 'Announcements'}
              side="bottom"
              className="hidden lg:inline-flex relative"
            >
              <NavLink
                to="/announcements"
                className="hidden lg:flex w-9 h-9 rounded-full items-center justify-center transition-all flex-shrink-0"
                style={({ isActive }) => ({
                  color: chatIsAdmin || isActive ? 'var(--brand)' : 'var(--text-3)',
                  background: chatIsAdmin || isActive ? 'var(--brand-subtle)' : 'var(--surface-2)',
                  border: `1px solid ${chatIsAdmin || isActive ? 'var(--brand)' : 'transparent'}`,
                })}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = 'var(--brand)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand)';
                }}
                onMouseLeave={(e) => {
                  const active =
                    chatIsAdmin || (e.currentTarget as HTMLElement).getAttribute('aria-current') === 'page';
                  (e.currentTarget as HTMLElement).style.color = active ? 'var(--brand)' : 'var(--text-3)';
                  (e.currentTarget as HTMLElement).style.borderColor = active ? 'var(--brand)' : 'transparent';
                }}
              >
                <MegaphoneIcon size={18} />
              </NavLink>
            </Tooltip>
          )}

          {/* Notification bell */}
          <NotificationBell adminMode={!!chatIsAdmin} productId={chatIsAdmin ? undefined : activeProduct?.id} />

          {/* Admin panel toggle - shown at all sizes, unlike the desktop-only icons above; used
              frequently enough on mobile to earn a spot in the top bar rather than the hamburger. */}
          {user?.isAdmin && (
            <Tooltip
              content={chatIsAdmin ? 'Exit admin mode' : 'Admin panel'}
              side="bottom"
              className="inline-flex relative"
            >
              <button
                data-testid="admin-btn"
                aria-label={chatIsAdmin ? 'Exit admin mode' : 'Admin panel'}
                onClick={onToggleAdmin ?? (() => (chatIsAdmin ? navigate('/kanban') : navigate('/admin')))}
                className="flex w-9 h-9 rounded-full items-center justify-center transition-all flex-shrink-0"
                style={{
                  color: chatIsAdmin ? 'var(--brand)' : 'var(--text-3)',
                  background: chatIsAdmin ? 'var(--brand-subtle)' : 'var(--surface-2)',
                  border: `1px solid ${chatIsAdmin ? 'var(--brand)' : 'transparent'}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--brand)';
                  e.currentTarget.style.borderColor = 'var(--brand)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = chatIsAdmin ? 'var(--brand)' : 'var(--text-3)';
                  e.currentTarget.style.borderColor = chatIsAdmin ? 'var(--brand)' : 'transparent';
                }}
              >
                <ShieldIcon size={18} />
              </button>
            </Tooltip>
          )}

          {/* Chat - shown at all sizes; used frequently enough on mobile to earn a spot in the
              top bar rather than the hamburger. Badge shows unread mentions/DMs/groups - those no
              longer appear in the notification bell (NotificationBell.tsx), just here as a count.
              Clicking only opens the panel; clearing now happens granularly inside ChatPanel as
              the user actually visits each tab/thread, not all at once here. */}
          <Tooltip
            content={chatIsAdmin ? 'Admin chat' : 'Project chat'}
            side="bottom"
            className="inline-flex relative"
          >
            <button
              onClick={onOpenChat}
              title={chatIsAdmin ? 'Admin chat' : 'Project chat'}
              aria-label={chatIsAdmin ? 'Admin chat' : 'Project chat'}
              className="relative flex w-9 h-9 rounded-full items-center justify-center transition-all flex-shrink-0"
              style={{
                color: chatIsAdmin || chatOpen ? 'var(--brand)' : 'var(--text-3)',
                background: chatIsAdmin || chatOpen ? 'var(--brand-subtle)' : 'var(--surface-2)',
                border: `1px solid ${chatIsAdmin || chatOpen ? 'var(--brand)' : 'transparent'}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--brand)';
                e.currentTarget.style.borderColor = 'var(--brand)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = chatIsAdmin || chatOpen ? 'var(--brand)' : 'var(--text-3)';
                e.currentTarget.style.borderColor = chatIsAdmin || chatOpen ? 'var(--brand)' : 'transparent';
              }}
            >
              <ChatIcon />
              {chatUnread > 0 && (
                <span
                  className="absolute -top-1 -right-1 text-white rounded-full text-[9px] font-bold leading-none flex items-center justify-center"
                  style={{ background: '#ef4444', minWidth: 14, height: 14, padding: '0 3px' }}
                >
                  {chatUnread > 99 ? '99+' : chatUnread}
                </span>
              )}
            </button>
          </Tooltip>

          {/* Project picker (desktop only) */}
          <div ref={projectRef} className="hidden lg:block relative">
            <button
              onClick={() => {
                setShowProjectDd((v) => !v);
                setShowAccountDd(false);
              }}
              className="flex items-center gap-1.5 h-9 px-2.5 rounded-full transition-all text-sm flex-shrink-0"
              style={{
                background: 'var(--surface-2)',
                color: chatIsAdmin ? 'var(--brand)' : 'var(--text)',
                border: `1px solid ${chatIsAdmin ? 'var(--brand)' : 'var(--border)'}`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--brand)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = chatIsAdmin ? 'var(--brand)' : 'var(--border)')}
            >
              {chatIsAdmin ? (
                <>
                  <ShieldIcon size={15} />
                  <span className="text-xs font-medium">Admin</span>
                </>
              ) : (
                <>
                  <span className="text-lg leading-none">{activeProduct?.emoji ?? '🎯'}</span>
                  <span className="text-xs font-medium max-w-[72px] truncate">{activeProduct?.name ?? 'Project'}</span>
                </>
              )}
              <ChevronDown />
            </button>
            <TopBarProjectPicker
              products={products}
              activeProduct={activeProduct}
              setActiveProduct={setActiveProduct}
              chatIsAdmin={!!chatIsAdmin}
              isAdmin={!!user?.isAdmin}
              isOpen={showProjectDd}
              unreadByProduct={notifByProduct}
              mobileNavPosition={mobileNavPosition}
              onExitAdmin={() => onExitAdmin?.()}
              onShowNewProduct={() => setShowNewProduct(true)}
              onShowDiscover={() => setShowDiscover(true)}
              onShowSeedData={() => setShowSeedData(true)}
              onClose={() => setShowProjectDd(false)}
            />
          </div>

          {/* Project picker (mobile) - round, emoji-only button instead of the desktop pill so it
              matches the other icon buttons in this row; opens the same picker dropdown. Also
              carries the aggregate notification-total badge (mobile only - desktop already shows
              the active project's own count via the bell right next to this button). */}
          <div ref={projectRefMobile} className="lg:hidden relative">
            <button
              onClick={() => {
                setShowProjectDd((v) => !v);
                setShowAccountDd(false);
              }}
              className="flex w-9 h-9 rounded-full items-center justify-center transition-all flex-shrink-0 text-lg font-semibold relative"
              style={{
                color: chatIsAdmin ? 'var(--brand)' : 'var(--text)',
                background: chatIsAdmin ? 'var(--brand-subtle)' : 'var(--surface-2)',
                border: `1px solid ${chatIsAdmin ? 'var(--brand)' : 'transparent'}`,
              }}
              title={chatIsAdmin ? 'Admin' : (activeProduct?.name ?? 'Project')}
              aria-label={chatIsAdmin ? 'Admin mode' : `Switch project (current: ${activeProduct?.name ?? 'none selected'})`}
            >
              {chatIsAdmin ? (
                <span aria-hidden="true" style={{ fontSize: 14 }}>A</span>
              ) : (
                <span aria-hidden="true">{activeProduct?.emoji ?? '🎯'}</span>
              )}
              {notifTotal > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white text-[9px] font-bold"
                  style={{ background: '#ef4444', minWidth: 16, height: 16, padding: '0 3px' }}
                >
                  {notifTotal > 99 ? '99+' : notifTotal}
                </span>
              )}
            </button>
            <TopBarProjectPicker
              products={products}
              activeProduct={activeProduct}
              setActiveProduct={setActiveProduct}
              chatIsAdmin={!!chatIsAdmin}
              isAdmin={!!user?.isAdmin}
              isOpen={showProjectDd}
              unreadByProduct={notifByProduct}
              mobileNavPosition={mobileNavPosition}
              onExitAdmin={() => onExitAdmin?.()}
              onShowNewProduct={() => setShowNewProduct(true)}
              onShowDiscover={() => setShowDiscover(true)}
              onShowSeedData={() => setShowSeedData(true)}
              onClose={() => setShowProjectDd(false)}
            />
          </div>

          {/* Mobile: search icon */}
          <button
            onClick={onOpenSearch}
            className="flex lg:hidden w-9 h-9 rounded-full items-center justify-center transition-all flex-shrink-0"
            style={{
              color: chatIsAdmin ? 'var(--brand)' : 'var(--text-3)',
              background: chatIsAdmin ? 'var(--brand-subtle)' : 'var(--surface-2)',
              border: `1px solid ${chatIsAdmin ? 'var(--brand)' : 'transparent'}`,
            }}
            title="Search"
            aria-label="Search"
          >
            <SearchIcon />
          </button>

          {/* Mobile: hamburger - colored like the other admin-aware buttons in this row when in
              admin mode, so the collapsed menu still hints there's admin-only stuff inside. */}
          <button
            onClick={() => setShowMobileMenu((v) => !v)}
            className="flex lg:hidden w-9 h-9 rounded-full items-center justify-center transition-colors flex-shrink-0 text-lg"
            style={{
              background: showMobileMenu || chatIsAdmin ? 'var(--brand-subtle)' : 'var(--surface-2)',
              color: showMobileMenu || chatIsAdmin ? 'var(--brand)' : 'var(--text-3)',
              border: `1px solid ${showMobileMenu || chatIsAdmin ? 'var(--brand)' : 'transparent'}`,
            }}
            title="Menu"
            aria-label={showMobileMenu ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={showMobileMenu}
          >
            <span aria-hidden="true">{showMobileMenu ? '✕' : '☰'}</span>
          </button>

          {/* Account avatar (desktop only) */}
          <div ref={accountRef} className="hidden lg:block relative">
            <button
              onClick={() => {
                setShowAccountDd((v) => !v);
                setShowProjectDd(false);
              }}
              className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-base transition-all flex-shrink-0"
              style={{
                background: 'var(--surface-2)',
                border: `2px solid ${chatIsAdmin ? 'var(--brand)' : 'var(--border)'}`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--brand)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = chatIsAdmin ? 'var(--brand)' : 'var(--border)')}
              title={user?.realName ?? user?.username}
              aria-label={`Account menu for ${user?.realName ?? user?.username}`}
              aria-expanded={showAccountDd}
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} className="w-full h-full object-cover" alt="" />
              ) : (
                (user?.avatarEmoji ?? '👤')
              )}
            </button>
            {showAccountDd && (
              <TopBarAccountDropdown
                user={user}
                isDark={isDark}
                onClose={() => setShowAccountDd(false)}
                onShowProfile={() => setShowProfile(true)}
                onShowThemePicker={() => setShowThemePicker(true)}
                onShowMemberships={() => setShowMemberships(true)}
                onShowIntegrations={() => setShowIntegrations(true)}
                onShowNotifPrefs={() => setShowNotifPrefs(true)}
                onShowPrivacy={() => setShowPrivacy(true)}
                onShowTotp={() => setShowTotp(true)}
                onShowChangePassword={() => setShowChangePassword(true)}
                onShowDeleteAccount={() => setShowDeleteAccount(true)}
                onLogout={logout}
              />
            )}
          </div>
        </div>
      </header>

      {/* ── Mobile nav menu ── */}
      {showMobileMenu && (
        <TopBarMobileMenu
          user={user}
          activeProduct={activeProduct}
          filteredNav={filteredNav}
          adminTabs={ADMIN_TABS}
          isAdminPage={isAdminPage}
          chatIsAdmin={chatIsAdmin}
          currentAdminTab={adminTab}
          canManage={canManage}
          mobileNavPosition={mobileNavPosition}
          onClose={() => setShowMobileMenu(false)}
          onShowProfile={() => setShowProfile(true)}
          onShowThemePicker={() => setShowThemePicker(true)}
          onShowMemberships={() => setShowMemberships(true)}
          onShowIntegrations={() => setShowIntegrations(true)}
          onShowNotifPrefs={() => setShowNotifPrefs(true)}
          onShowPrivacy={() => setShowPrivacy(true)}
          onShowTotp={() => setShowTotp(true)}
          onShowChangePassword={() => setShowChangePassword(true)}
          onLogout={logout}
        />
      )}

      {/* ── Modals ── */}

      {showNewProduct && (
        <Modal
          title="New project"
          onClose={() => {
            setShowNewProduct(false);
            setShowProductEmojiPicker(false);
          }}
        >
          <form onSubmit={handleCreateProduct} className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <label className="label">Icon</label>
                <button
                  type="button"
                  onClick={() => setShowProductEmojiPicker((v) => !v)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-colors"
                  style={{
                    background: showProductEmojiPicker ? 'var(--brand-subtle)' : 'var(--surface-2)',
                    border: `1px solid ${showProductEmojiPicker ? 'var(--brand)' : 'var(--border)'}`,
                  }}
                >
                  {productForm.emoji || '🎯'}
                </button>
              </div>
              <div className="flex-1">
                <label className="label">Name</label>
                <input
                  type="text"
                  required
                  value={productForm.name}
                  onChange={setField('name')}
                  className="input"
                  placeholder="My Project"
                  autoFocus
                />
              </div>
            </div>

            {showProductEmojiPicker && (
              <div>
                <EmojiPicker
                  value={productForm.emoji}
                  onChange={(e) => {
                    setProductForm((f) => ({ ...f, emoji: e }));
                    setShowProductEmojiPicker(false);
                  }}
                />
                {productForm.emoji && (
                  <button
                    type="button"
                    onClick={() => {
                      setProductForm((f) => ({ ...f, emoji: '' }));
                      setShowProductEmojiPicker(false);
                    }}
                    className="mt-1 w-full text-xs py-1 rounded-lg"
                    style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}
                  >
                    Remove icon
                  </button>
                )}
              </div>
            )}
            <div>
              <label className="label">Description</label>
              <Suspense
                fallback={
                  <div
                    className="rounded-lg flex items-center justify-center"
                    style={{ height: 96, background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                  >
                    <div
                      className="w-4 h-4 border-2 rounded-full animate-spin"
                      style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }}
                    />
                  </div>
                }
              >
                <MarkdownEditor
                  value={productForm.description}
                  onChange={(v) => setProductForm((prev) => ({ ...prev, description: v }))}
                  rows={4}
                  placeholder="What's the vision?"
                />
              </Suspense>
            </div>
            <div>
              <label className="label">Target deadline</label>
              <input
                type="date"
                required
                value={productForm.deadline}
                onChange={setField('deadline')}
                className="input"
              />
            </div>
            {productError && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {productError}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={creating} className="btn-primary flex-1 flex justify-center">
                {creating ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  'Create project'
                )}
              </button>
              <button type="button" onClick={() => setShowNewProduct(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showDiscover && <DiscoverProjectsModal onClose={() => setShowDiscover(false)} />}
      {showMemberships && <MembershipsModal onClose={() => setShowMemberships(false)} />}
      {showIntegrations && <IntegrationsModal onClose={() => setShowIntegrations(false)} />}
      {showNotifPrefs && <NotificationPreferencesModal onClose={() => setShowNotifPrefs(false)} />}
      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
      {showThemePicker && <ThemePickerModal onClose={() => setShowThemePicker(false)} />}
      {showTotp && <TotpModal onClose={() => setShowTotp(false)} />}
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
      {showProfile && <ProfileModal user={user} onClose={() => setShowProfile(false)} />}
      {showDeleteAccount && (
        <DeleteAccountModal user={user} onClose={() => setShowDeleteAccount(false)} logout={logout} />
      )}
      {showSeedData && <SeedDataModal onClose={() => setShowSeedData(false)} onSuccess={refreshProducts} />}
    </>
  );
}
