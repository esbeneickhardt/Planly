/**
 * Top navigation bar with project picker, tab navigation, chat button, notification bell, and account dropdown.
 * All icon SVG components and the NAV / ADMIN_TABS config arrays are defined in this file to keep icon styles consistent.
 * `chatIsAdmin` drives visual state of the chat button; `onToggleAdmin` switches between product and admin mode.
 */
import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import Tooltip from './Tooltip';
import EmojiPicker from './EmojiPicker';
import { useAuth } from '../../context/AuthContext';
import { useProduct } from '../../context/ProductContext';
import { usePermission } from '../../context/PermissionContext';
import { useTheme } from '../../context/ThemeContext';
import Modal from './Modal';
import DiscoverProjectsModal from './DiscoverProjectsModal';
import MembershipsModal from './MembershipsModal';
import IntegrationsModal from './IntegrationsModal';
import NotificationBell from './NotificationBell';
import NotificationPreferencesModal from './NotificationPreferencesModal';
import PrivacyModal from './PrivacyModal';
import ThemePickerModal from './ThemePickerModal';
import TotpModal from './TotpModal';
import ChangePasswordModal from './ChangePasswordModal';
import ProfileModal from './ProfileModal';
import DeleteAccountModal from './DeleteAccountModal';
import SeedDataModal from './SeedDataModal';
import { isBeforeToday } from '../../utils/dates';

// ── Icons ──────────────────────────────────────────────────────────────────

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ChevronDown = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
);

const PlanIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" />
    <line x1="8.09" y1="13.51" x2="15.91" y2="17.49" /><line x1="15.91" y1="6.51" x2="8.09" y2="10.49" />
  </svg>
);

const ExecuteIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
    <rect x="3" y="3" width="5" height="18" rx="1" /><rect x="10" y="3" width="5" height="13" rx="1" /><rect x="17" y="3" width="5" height="16" rx="1" />
  </svg>
);

const ProgressIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="4" width="14" height="4" rx="2" opacity="0.9" /><rect x="3" y="10" width="9" height="4" rx="2" opacity="0.65" /><rect x="3" y="16" width="17" height="4" rx="2" opacity="0.4" />
    <rect x="3" y="16" width="11" height="4" rx="2" opacity="0.65" />
  </svg>
);

const TasksIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <line x1="9" y1="6" x2="21" y2="6" /><line x1="9" y1="12" x2="21" y2="12" /><line x1="9" y1="18" x2="21" y2="18" />
    <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

const CategoriesIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="2" y="2" width="9.5" height="9.5" rx="2" opacity="0.85" />
    <rect x="12.5" y="2" width="9.5" height="9.5" rx="2" opacity="0.55" />
    <rect x="2" y="12.5" width="9.5" height="9.5" rx="2" opacity="0.55" />
    <rect x="12.5" y="12.5" width="9.5" height="9.5" rx="2" opacity="0.3" />
  </svg>
);

const ChatIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
  </svg>
);

const ShieldIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

// ── Admin-section icons (same style as nav icons above) ────────────────────

const CrownIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 19h20" />
    <path d="M4 19L2 7l5.5 4.5L12 3l4.5 8.5L22 7l-2 12" />
    <circle cx="12" cy="3" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="2" cy="7" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="22" cy="7" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

const UsersIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const FolderGridIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7V5a1 1 0 0 1 1-1h4l2 2h9a1 1 0 0 1 1 1v1" />
    <rect x="2" y="7" width="9" height="14" rx="1" />
    <rect x="13" y="7" width="9" height="14" rx="1" />
  </svg>
);

const MailIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <polyline points="2,8 12,14 22,8" />
  </svg>
);

const ActivityIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
  </svg>
);

const BarChartIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
    <line x1="3" y1="20" x2="21" y2="20" />
  </svg>
);

const AboutIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="10" x2="12" y2="16" />
    <circle cx="12" cy="7.5" r="0.75" fill="currentColor" stroke="none" />
  </svg>
);

const MegaphoneIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 010 7.07" />
    <path d="M19.07 4.93a10 10 0 010 14.14" />
  </svg>
);

// ── Admin tab definitions ──────────────────────────────────────────────────

const ADMIN_TABS: { key: string; label: string; Icon: (p: { size?: number }) => JSX.Element }[] = [
  { key: 'ownership',  label: 'Ownership',  Icon: CrownIcon },
  { key: 'users',      label: 'Users',       Icon: UsersIcon },
  { key: 'projects',   label: 'Projects',    Icon: FolderGridIcon },
  { key: 'email',      label: 'Email',       Icon: MailIcon },
  { key: 'ip-rules',   label: 'Networking',  Icon: ShieldIcon },
  { key: 'logs',       label: 'Audit Logs',  Icon: ActivityIcon },
  { key: 'statistics', label: 'Stats',       Icon: BarChartIcon },
];

// ── Nav config ─────────────────────────────────────────────────────────────

const NAV = [
  { to: '/canvas',    label: 'Plan',      sub: 'Canvas',   Icon: PlanIcon,      tab: 'canvas' },
  { to: '/kanban',    label: 'Execute',   sub: 'Kanban',   Icon: ExecuteIcon,   tab: 'kanban' },
  { to: '/gantt',     label: 'Progress',  sub: 'Gantt',    Icon: ProgressIcon,  tab: 'gantt' },
  { to: '/backlog',   label: 'Tasks',     sub: 'Backlog',  Icon: TasksIcon,     tab: 'backlog' },
  { to: '/analytics', label: 'Analytics', sub: 'Charts',   Icon: BarChartIcon,  tab: 'analytics' },
  { to: '/about',     label: 'About',     sub: '',         Icon: AboutIcon,     tab: 'about' },
];

interface NewProductForm { name: string; emoji: string; description: string; deadline: string; }

// ── Component ──────────────────────────────────────────────────────────────

export default function TopBar({ onOpenSearch, onOpenChat, onOpenVision, chatOpen, chatIsAdmin, onToggleAdmin, onExitAdmin }: { onOpenSearch: () => void; onOpenChat: () => void; onOpenVision: () => void; chatOpen?: boolean; chatIsAdmin?: boolean; onToggleAdmin?: () => void; onExitAdmin?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdminPage = location.pathname === '/admin';
  const adminTab = searchParams.get('tab') ?? 'ownership';
  const { user, logout } = useAuth();
  const { products, activeProduct, setActiveProduct, tasks, createProduct, refreshProducts } = useProduct();
  const { canRead, canManage } = usePermission();
  const { isDark } = useTheme();

  // Modal + dropdown visibility state
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showMemberships, setShowMemberships] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [showNotifPrefs, setShowNotifPrefs] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTotp, setShowTotp] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [showSeedData, setShowSeedData] = useState(false);
  const [showProjectDd, setShowProjectDd] = useState(false);
  const [showAccountDd, setShowAccountDd] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [productForm, setProductForm] = useState<NewProductForm>({ name: '', emoji: '', description: '', deadline: '' });
  const [creating, setCreating] = useState(false);
  const [showProductEmojiPicker, setShowProductEmojiPicker] = useState(false);
  const [productError, setProductError] = useState('');

  const projectRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (projectRef.current && !projectRef.current.contains(e.target as Node)) setShowProjectDd(false);
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setShowAccountDd(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const overdueCount = tasks.filter((t) => t.deadline && t.status !== 'done' && isBeforeToday(t.deadline)).length;
  const unassignedCount = tasks.filter((t) => t.status !== 'done' && !t.ownerId).length;

  function setField(f: keyof NewProductForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setProductForm((prev) => ({ ...prev, [f]: e.target.value }));
  }

  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    setProductError('');
    setCreating(true);
    try {
      await createProduct({ name: productForm.name, emoji: productForm.emoji || undefined, description: productForm.description || undefined, deadline: productForm.deadline });
      setShowNewProduct(false);
      setShowProductEmojiPicker(false);
      setProductForm({ name: '', emoji: '', description: '', deadline: '' });
    } catch (err) { setProductError((err as Error).message); }
    finally { setCreating(false); }
  }


  return (
    <>
      <header
        className="flex-shrink-0 flex items-center h-14 px-3 gap-2"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', zIndex: 40 }}
      >
        {/* ── LEFT: logo + search ── */}
        <div className="flex items-center gap-2.5 flex-shrink-0 lg:w-60">
          <button
            onClick={() => navigate('/kanban')}
            className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0 transition-opacity hover:opacity-80"
            title="Go to Kanban"
          >
            <img src="/icons/icon.jpg" alt="Planly" className="w-full h-full object-cover" style={{ transform: 'scale(1.25)', transformOrigin: 'center' }} />
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
            <kbd className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>⌘K</kbd>
          </button>
        </div>

        {/* ── CENTER: nav tabs (desktop only) ── */}
        <nav className="hidden lg:flex flex-1 items-stretch justify-center h-full">
          {chatIsAdmin ? (
            // ── Admin section tabs - same style as project nav ──
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
                  <div className="absolute bottom-0 left-6 right-6 h-[3px] rounded-t-full" style={{ background: 'var(--brand)' }} />
                )}
              </button>
            ))
          ) : (
            // ── Normal project tabs ──
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
                          <div className="absolute bottom-0 left-6 right-6 h-[3px] rounded-t-full" style={{ background: 'var(--brand)' }} />
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}

              {/* Settings - only for owners/co-owners */}
              {activeProduct && canManage && (
                <NavLink
                  to="/settings"
                  className={({ isActive }) =>
                    `relative flex flex-col items-center justify-center gap-0.5 flex-1 min-w-[60px] max-w-24 text-[11px] font-medium tracking-wide transition-colors ${isActive ? 'text-[var(--text)]' : 'text-[var(--text-3)]'}`
                  }
                  style={({ isActive }) => ({ color: isActive ? 'var(--text)' : undefined })}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--surface-2)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = ''; e.currentTarget.style.background = 'transparent'; }}
                >
                  {({ isActive }) => (
                    <>
                      <CategoriesIcon />
                      <span>Settings</span>
                      {isActive && (
                        <div className="absolute bottom-0 left-6 right-6 h-[3px] rounded-t-full" style={{ background: 'var(--brand)' }} />
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
          <Tooltip content="How Planly works" side="bottom">
            <button
              onClick={onOpenVision}
              className="hidden lg:flex w-9 h-9 rounded-full items-center justify-center transition-colors flex-shrink-0 text-sm font-semibold"
              style={{
                color: chatIsAdmin ? 'var(--brand)' : 'var(--text-3)',
                background: chatIsAdmin ? 'var(--brand-subtle)' : 'var(--surface-2)',
                border: chatIsAdmin ? '1px solid var(--brand)' : '1px solid transparent',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--brand)'; e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.background = 'var(--brand-subtle)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = chatIsAdmin ? 'var(--brand)' : 'var(--text-3)'; e.currentTarget.style.borderColor = chatIsAdmin ? 'var(--brand)' : 'transparent'; e.currentTarget.style.background = chatIsAdmin ? 'var(--brand-subtle)' : 'var(--surface-2)'; }}
            >?</button>
          </Tooltip>

          {/* Announcements - desktop only */}
          {user?.announcementsEnabled && (
            <Tooltip content={chatIsAdmin ? 'Announcements (admin mode)' : 'Announcements'} side="bottom">
            <NavLink
              to="/announcements"
              className="hidden lg:flex w-9 h-9 rounded-full items-center justify-center transition-all flex-shrink-0"
              style={({ isActive }) => ({
                color: (chatIsAdmin || isActive) ? 'var(--brand)' : 'var(--text-3)',
                background: (chatIsAdmin || isActive) ? 'var(--brand-subtle)' : 'var(--surface-2)',
                border: `1px solid ${(chatIsAdmin || isActive) ? 'var(--brand)' : 'transparent'}`,
              })}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--brand)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand)'; }}
              onMouseLeave={(e) => {
                const active = chatIsAdmin || (e.currentTarget as HTMLElement).getAttribute('aria-current') === 'page';
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

          {/* Admin panel toggle - desktop only */}
          {user?.isAdmin && (
            <Tooltip content={chatIsAdmin ? 'Exit admin mode' : 'Admin panel'} side="bottom">
            <button
              data-testid="admin-btn"
              aria-label={chatIsAdmin ? 'Exit admin mode' : 'Admin panel'}
              onClick={onToggleAdmin ?? (() => chatIsAdmin ? navigate('/kanban') : navigate('/admin'))}
              className="hidden lg:flex w-9 h-9 rounded-full items-center justify-center transition-all flex-shrink-0"
              style={{
                color: chatIsAdmin ? 'var(--brand)' : 'var(--text-3)',
                background: chatIsAdmin ? 'var(--brand-subtle)' : 'var(--surface-2)',
                border: `1px solid ${chatIsAdmin ? 'var(--brand)' : 'transparent'}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--brand)'; e.currentTarget.style.borderColor = 'var(--brand)'; }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = chatIsAdmin ? 'var(--brand)' : 'var(--text-3)';
                e.currentTarget.style.borderColor = chatIsAdmin ? 'var(--brand)' : 'transparent';
              }}
            >
              <ShieldIcon size={18} />
            </button>
            </Tooltip>
          )}

          {/* Chat - desktop only */}
          <Tooltip content={chatIsAdmin ? 'Admin chat' : 'Project chat'} side="bottom">
          <button
            onClick={onOpenChat}
            title={chatIsAdmin ? 'Admin chat' : 'Project chat'}
            aria-label={chatIsAdmin ? 'Admin chat' : 'Project chat'}
            className="hidden lg:flex w-9 h-9 rounded-full items-center justify-center transition-all flex-shrink-0"
            style={{
              color: (chatIsAdmin || chatOpen) ? 'var(--brand)' : 'var(--text-3)',
              background: (chatIsAdmin || chatOpen) ? 'var(--brand-subtle)' : 'var(--surface-2)',
              border: `1px solid ${(chatIsAdmin || chatOpen) ? 'var(--brand)' : 'transparent'}`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--brand)'; e.currentTarget.style.borderColor = 'var(--brand)'; }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = (chatIsAdmin || chatOpen) ? 'var(--brand)' : 'var(--text-3)';
              e.currentTarget.style.borderColor = (chatIsAdmin || chatOpen) ? 'var(--brand)' : 'transparent';
            }}
          >
            <ChatIcon />
          </button>
          </Tooltip>

          {/* Project picker - desktop only */}
          <div ref={projectRef} className="hidden lg:block relative">
            <button
              onClick={() => { setShowProjectDd((v) => !v); setShowAccountDd(false); }}
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

            {showProjectDd && (
              <div
                className="absolute right-0 top-full mt-2 w-64 rounded-2xl shadow-2xl overflow-hidden py-1.5"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', zIndex: 50 }}
              >
                {chatIsAdmin && products.length > 0 && (
                  <p className="px-4 pt-2 pb-1 text-[10px]" style={{ color: 'var(--text-3)' }}>
                    Select a project to leave admin mode
                  </p>
                )}
                {products.length > 0 && (
                  <>
                    <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Projects</p>
                    {products.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setActiveProduct(p);
                          setShowProjectDd(false);
                          if (chatIsAdmin) {
                            onExitAdmin?.();
                            navigate('/kanban');
                          }
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left transition-colors"
                        style={{
                          background: !chatIsAdmin && activeProduct?.id === p.id ? 'var(--brand-subtle)' : 'transparent',
                          color: !chatIsAdmin && activeProduct?.id === p.id ? 'var(--brand)' : 'var(--text)',
                        }}
                        onMouseEnter={(e) => { if (chatIsAdmin || activeProduct?.id !== p.id) e.currentTarget.style.background = 'var(--surface-2)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = (!chatIsAdmin && activeProduct?.id === p.id) ? 'var(--brand-subtle)' : 'transparent'; }}
                      >
                        <span className="text-base">{p.emoji ?? '🎯'}</span>
                        <span className="flex-1 truncate font-medium">{p.name}</span>
                        {!chatIsAdmin && activeProduct?.id === p.id && <span className="text-xs font-bold" style={{ color: 'var(--brand)' }}>✓</span>}
                      </button>
                    ))}
                    <div className="mx-4 my-1.5" style={{ height: 1, background: 'var(--border)' }} />
                  </>
                )}
                <button
                  onClick={() => { setShowNewProduct(true); setShowProjectDd(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors"
                  style={{ color: 'var(--text-2)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: 'var(--brand)', color: 'white' }}>+</span>
                  New project
                </button>
                <button
                  onClick={() => { setShowDiscover(true); setShowProjectDd(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors"
                  style={{ color: 'var(--text-2)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="text-base leading-none">🔭</span>
                  Find projects
                </button>
                {products.length === 0 && (
                  <button
                    onClick={() => { setShowSeedData(true); setShowProjectDd(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors"
                    style={{ color: 'var(--text-2)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span>✦</span> Load examples
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Mobile: search icon */}
          <button
            onClick={onOpenSearch}
            className="flex lg:hidden w-9 h-9 rounded-full items-center justify-center transition-colors flex-shrink-0"
            style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
            title="Search"
          >
            <SearchIcon />
          </button>

          {/* Notification bell (visible on all screens) */}

          {/* Mobile: hamburger */}
          <button
            onClick={() => setShowMobileMenu((v) => !v)}
            className="flex lg:hidden w-9 h-9 rounded-full items-center justify-center transition-colors flex-shrink-0 text-lg"
            style={{ background: showMobileMenu ? 'var(--brand-subtle)' : 'var(--surface-2)', color: showMobileMenu ? 'var(--brand)' : 'var(--text-3)', border: `1px solid ${showMobileMenu ? 'var(--brand)' : 'transparent'}` }}
            title="Menu"
          >
            {showMobileMenu ? '✕' : '☰'}
          </button>

          {/* Account - desktop only */}
          <div ref={accountRef} className="hidden lg:block relative">
            <button
              onClick={() => { setShowAccountDd((v) => !v); setShowProjectDd(false); }}
              className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-base transition-all flex-shrink-0"
              style={{ background: 'var(--surface-2)', border: `2px solid ${chatIsAdmin ? 'var(--brand)' : 'var(--border)'}` }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--brand)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = chatIsAdmin ? 'var(--brand)' : 'var(--border)')}
              title={user?.realName ?? user?.username}
            >
              {user?.avatarUrl
                ? <img src={user.avatarUrl} className="w-full h-full object-cover" alt="" />
                : (user?.avatarEmoji ?? '👤')}
            </button>

            {showAccountDd && (
              <div
                className="absolute right-0 top-full mt-2 w-56 rounded-2xl shadow-2xl overflow-y-auto py-1.5"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', zIndex: 50, maxHeight: 'calc(100vh - 72px)' }}
              >
                {/* User info - click avatar to edit profile */}
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { setShowProfile(true); setShowAccountDd(false); }}
                      className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-2xl flex-shrink-0 relative group transition-opacity hover:opacity-80"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                      title="Edit profile"
                    >
                      {user?.avatarUrl
                        ? <img src={user.avatarUrl} className="w-full h-full object-cover" alt="" />
                        : (user?.avatarEmoji ?? '👤')}
                      <div className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.35)', fontSize: 11, color: 'white', fontWeight: 600 }}>Edit</div>
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{user?.realName ?? user?.username}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>@{user?.username}</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => { setShowThemePicker(true); setShowAccountDd(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                  style={{ color: 'var(--text-2)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="w-5 text-center flex-shrink-0">{isDark ? '🎨' : '🎨'}</span>
                  Appearance
                </button>
                <button
                  onClick={() => { setShowProfile(true); setShowAccountDd(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                  style={{ color: 'var(--text-2)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="w-5 text-center flex-shrink-0">✏️</span>
                  Edit profile
                </button>
                <button
                  onClick={() => { setShowMemberships(true); setShowAccountDd(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                  style={{ color: 'var(--text-2)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="w-5 text-center flex-shrink-0">🏠</span>
                  Memberships
                </button>
                <button
                  onClick={() => { setShowIntegrations(true); setShowAccountDd(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                  style={{ color: 'var(--text-2)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="w-5 text-center flex-shrink-0">🔑</span>
                  Integrations
                </button>
                <button
                  onClick={() => { setShowNotifPrefs(true); setShowAccountDd(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                  style={{ color: 'var(--text-2)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="w-5 text-center flex-shrink-0">🔔</span>
                  Notifications
                </button>
                <button
                  onClick={() => { setShowPrivacy(true); setShowAccountDd(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                  style={{ color: 'var(--text-2)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="w-5 text-center flex-shrink-0">🔒</span>
                  Privacy
                </button>
                <button
                  onClick={() => { setShowTotp(true); setShowAccountDd(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                  style={{ color: 'var(--text-2)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="w-5 text-center flex-shrink-0">🛡️</span>
                  Security (2FA)
                </button>
                <button
                  onClick={() => { setShowChangePassword(true); setShowAccountDd(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                  style={{ color: 'var(--text-2)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="w-5 text-center flex-shrink-0">🔑</span>
                  Change password
                </button>
                <div className="mx-4 my-1" style={{ height: 1, background: 'var(--border)' }} />
                <a
                  href="/api/me/export"
                  download
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                  style={{ color: 'var(--text-2)', textDecoration: 'none' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => setShowAccountDd(false)}
                >
                  <span className="w-5 text-center flex-shrink-0">⬇</span>
                  Download my data
                </a>
                <button
                  onClick={() => { setShowAccountDd(false); setShowDeleteAccount(true); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                  style={{ color: '#ef4444' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="w-5 text-center flex-shrink-0">🗑</span>
                  Delete my account
                </button>
                <div className="mx-4 my-1" style={{ height: 1, background: 'var(--border)' }} />
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                  style={{ color: '#ef4444' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="w-5 text-center flex-shrink-0">⏻</span>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Mobile nav menu ── */}
      {showMobileMenu && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex flex-col"
          style={{ top: 56 }}
          onClick={() => setShowMobileMenu(false)}
        >
          <div
            className="flex-1 overflow-y-auto py-2"
            style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', maxHeight: '80vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Project picker */}
            <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)' }}>Project</p>
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{activeProduct?.emoji ?? '🎯'}</span>
                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{activeProduct?.name ?? 'No project'}</span>
              </div>
              <div className="mt-2 space-y-0.5">
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setActiveProduct(p); setShowMobileMenu(false); navigate('/kanban'); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left"
                    style={{
                      background: activeProduct?.id === p.id ? 'var(--brand-subtle)' : 'transparent',
                      color: activeProduct?.id === p.id ? 'var(--brand)' : 'var(--text-2)',
                    }}
                  >
                    <span>{p.emoji ?? '🎯'}</span>
                    <span className="truncate">{p.name}</span>
                    {activeProduct?.id === p.id && <span className="ml-auto text-xs font-bold" style={{ color: 'var(--brand)' }}>✓</span>}
                  </button>
                ))}
                <button
                  onClick={() => { setShowNewProduct(true); setShowMobileMenu(false); }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left"
                  style={{ color: 'var(--text-3)' }}
                >
                  <span>+</span> New project
                </button>
              </div>
            </div>

            {/* Navigation */}
            <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)' }}>Navigate</p>
              <div className="space-y-0.5">
                {isAdminPage ? (
                  // Admin page: show only admin sub-tabs
                  ADMIN_TABS.map(({ key, label, Icon }) => (
                    <button
                      key={key}
                      onClick={() => { setSearchParams({ tab: key }); setShowMobileMenu(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left"
                      style={{
                        background: searchParams.get('tab') === key ? 'var(--brand-subtle)' : 'transparent',
                        color: searchParams.get('tab') === key ? 'var(--brand)' : 'var(--text-2)',
                      }}
                    >
                      <Icon size={18} />
                      {label}
                    </button>
                  ))
                ) : (
                  // Normal pages: show project nav items
                  <>
                    {activeProduct && NAV.filter(({ tab }) => {
                      if (tab === 'analytics' && !activeProduct.analyticsEnabled) return false;
                      return canRead(tab);
                    }).map(({ to, label, Icon }) => (
                      <NavLink
                        key={to}
                        to={to}
                        onClick={() => setShowMobileMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${isActive ? 'font-medium' : ''}`
                        }
                        style={({ isActive }) => ({
                          background: isActive ? 'var(--brand-subtle)' : 'transparent',
                          color: isActive ? 'var(--brand)' : 'var(--text-2)',
                        })}
                      >
                        <Icon size={18} />
                        {label}
                      </NavLink>
                    ))}
                    {activeProduct && canManage && (
                      <NavLink
                        to="/settings"
                        onClick={() => setShowMobileMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${isActive ? 'font-medium' : ''}`
                        }
                        style={({ isActive }) => ({
                          background: isActive ? 'var(--brand-subtle)' : 'transparent',
                          color: isActive ? 'var(--brand)' : 'var(--text-2)',
                        })}
                      >
                        <CategoriesIcon size={18} />
                        Settings
                      </NavLink>
                    )}
                    {user?.isAdmin && (
                      <button
                        onClick={() => { setShowMobileMenu(false); navigate('/admin'); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left"
                        style={{ color: 'var(--text-2)' }}
                      >
                        <ShieldIcon size={18} />
                        Admin
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Account */}
            <div className="px-4 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)' }}>Account</p>
              <div className="flex items-center gap-3 px-2 py-2 mb-1">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xl flex-shrink-0 overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  {user?.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover" alt="" /> : (user?.avatarEmoji ?? '👤')}
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{user?.realName ?? user?.username}</p>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>@{user?.username}</p>
                </div>
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => { setShowProfile(true); setShowMobileMenu(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left"
                  style={{ color: 'var(--text-2)' }}
                >
                  <span>✏️</span> Edit profile
                </button>
                <button
                  onClick={() => { setShowThemePicker(true); setShowMobileMenu(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left"
                  style={{ color: 'var(--text-2)' }}
                >
                  <span>🎨</span> Appearance
                </button>
                <button
                  onClick={() => { setShowNotifPrefs(true); setShowMobileMenu(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left"
                  style={{ color: 'var(--text-2)' }}
                >
                  <span>🔔</span> Notifications
                </button>
                <button
                  onClick={() => { setShowPrivacy(true); setShowMobileMenu(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left"
                  style={{ color: 'var(--text-2)' }}
                >
                  <span>🔒</span> Privacy
                </button>
                <button
                  onClick={() => { setShowTotp(true); setShowMobileMenu(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left"
                  style={{ color: 'var(--text-2)' }}
                >
                  <span>🛡️</span> Security (2FA)
                </button>
                <button
                  onClick={() => { setShowChangePassword(true); setShowMobileMenu(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left"
                  style={{ color: 'var(--text-2)' }}
                >
                  <span>🔑</span> Change password
                </button>
                <button
                  onClick={() => { setShowMobileMenu(false); onOpenChat(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left"
                  style={{ color: 'var(--text-2)' }}
                >
                  <ChatIcon size={18} /> Chat
                </button>
                <button
                  onClick={() => { setShowMobileMenu(false); logout(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left"
                  style={{ color: '#ef4444' }}
                >
                  <span>⏻</span> Sign out
                </button>
              </div>
            </div>
          </div>
          {/* Backdrop */}
          <div className="flex-1" style={{ background: 'rgba(0,0,0,0.5)' }} />
        </div>
      )}

      {/* ── Modals ── */}

      {showNewProduct && (
        <Modal title="New project" onClose={() => { setShowNewProduct(false); setShowProductEmojiPicker(false); }}>
          <form onSubmit={handleCreateProduct} className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <label className="label">Icon</label>
                <button
                  type="button"
                  onClick={() => setShowProductEmojiPicker((v) => !v)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-colors"
                  style={{ background: showProductEmojiPicker ? 'var(--brand-subtle)' : 'var(--surface-2)', border: `1px solid ${showProductEmojiPicker ? 'var(--brand)' : 'var(--border)'}` }}
                >
                  {productForm.emoji || '🎯'}
                </button>
              </div>
              <div className="flex-1">
                <label className="label">Name</label>
                <input type="text" required value={productForm.name} onChange={setField('name')} className="input" placeholder="My Project" autoFocus />
              </div>
            </div>

            {showProductEmojiPicker && (
              <div>
                <EmojiPicker
                  value={productForm.emoji}
                  onChange={(e) => { setProductForm((f) => ({ ...f, emoji: e })); setShowProductEmojiPicker(false); }}
                />
                {productForm.emoji && (
                  <button
                    type="button"
                    onClick={() => { setProductForm((f) => ({ ...f, emoji: '' })); setShowProductEmojiPicker(false); }}
                    className="mt-1 w-full text-xs py-1 rounded-lg"
                    style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}
                  >Remove icon</button>
                )}
              </div>
            )}
            <div>
              <label className="label">Description</label>
              <input type="text" value={productForm.description} onChange={setField('description')} className="input" placeholder="What's the vision?" />
            </div>
            <div>
              <label className="label">Target deadline</label>
              <input type="date" required value={productForm.deadline} onChange={setField('deadline')} className="input" />
            </div>
            {productError && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{productError}</div>}
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={creating} className="btn-primary flex-1 flex justify-center">
                {creating ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Create project'}
              </button>
              <button type="button" onClick={() => setShowNewProduct(false)} className="btn-secondary">Cancel</button>
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
      {showDeleteAccount && <DeleteAccountModal user={user} onClose={() => setShowDeleteAccount(false)} logout={logout} />}
      {showSeedData && <SeedDataModal onClose={() => setShowSeedData(false)} onSuccess={refreshProducts} />}
    </>
  );
}
