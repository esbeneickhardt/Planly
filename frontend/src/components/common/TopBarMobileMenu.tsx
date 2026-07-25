/**
 * Mobile navigation overlay — the hamburger menu shown on small screens.
 * TopBar passes pre-filtered nav items so canRead/analyticsEnabled logic stays in one place.
 */
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { CategoriesIcon } from './TopBarIcons';
import type { Product } from '../../types';

export type MobileNavItem = { to: string; label: string; Icon: (p: { size?: number }) => JSX.Element };
export type AdminTab = { key: string; label: string; Icon: (p: { size?: number }) => JSX.Element };

interface Props {
  user: {
    id: string;
    username: string;
    realName?: string | null;
    avatarEmoji?: string | null;
    avatarUrl?: string | null;
    isAdmin?: boolean;
  } | null;
  activeProduct: Product | null;
  filteredNav: MobileNavItem[];
  adminTabs: AdminTab[];
  isAdminPage: boolean;
  /** Broader "in admin mode" flag (survives on neutral pages like About/Settings, unlike
   * `isAdminPage` which only reflects the literal current route) - the authoritative signal for
   * whether Navigate should show admin tabs instead of the project nav. */
  chatIsAdmin?: boolean;
  currentAdminTab: string;
  canManage: boolean;
  onClose: () => void;
  onShowProfile: () => void;
  onShowThemePicker: () => void;
  onShowNotifPrefs: () => void;
  onShowPrivacy: () => void;
  onShowTotp: () => void;
  onShowChangePassword: () => void;
  onLogout: () => void;
}

export default function TopBarMobileMenu({
  user,
  activeProduct,
  filteredNav,
  adminTabs,
  isAdminPage,
  chatIsAdmin,
  currentAdminTab,
  canManage,
  onClose,
  onShowProfile,
  onShowThemePicker,
  onShowNotifPrefs,
  onShowPrivacy,
  onShowTotp,
  onShowChangePassword,
  onLogout,
}: Props) {
  const [, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const showAdminNav = isAdminPage || !!chatIsAdmin;

  return (
    <div className="lg:hidden fixed inset-0 z-50 flex flex-col" style={{ top: 56 }} onClick={onClose}>
      <div
        className="flex-1 overflow-y-auto py-2"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Navigation */}
        <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)' }}>
            Navigate
          </p>
          <div className="space-y-0.5">
            {showAdminNav ? (
              adminTabs.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => {
                    // Already on the admin page - just switch its tab; otherwise (in admin mode
                    // but on a "neutral" page like About/Settings) actually navigate there first.
                    if (isAdminPage) setSearchParams({ tab: key });
                    else navigate(`/admin?tab=${key}`);
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left"
                  style={{
                    background: currentAdminTab === key ? 'var(--brand-subtle)' : 'transparent',
                    color: currentAdminTab === key ? 'var(--brand)' : 'var(--text-2)',
                  }}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))
            ) : (
              <>
                {activeProduct &&
                  filteredNav.map(({ to, label, Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={onClose}
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
                    onClick={onClose}
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
              </>
            )}
          </div>
        </div>

        {/* Account */}
        <div className="px-4 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)' }}>
            Account
          </p>
          <div className="flex items-center gap-3 px-2 py-2 mb-1">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xl flex-shrink-0 overflow-hidden"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} className="w-full h-full object-cover" alt="" />
              ) : (
                (user?.avatarEmoji ?? '👤')
              )}
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                {user?.realName ?? user?.username}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                @{user?.username}
              </p>
            </div>
          </div>
          <div className="space-y-0.5">
            {[
              {
                label: 'Edit profile',
                icon: '✏️',
                action: () => {
                  onShowProfile();
                  onClose();
                },
              },
              {
                label: 'Appearance',
                icon: '🎨',
                action: () => {
                  onShowThemePicker();
                  onClose();
                },
              },
              {
                label: 'Notifications',
                icon: '🔔',
                action: () => {
                  onShowNotifPrefs();
                  onClose();
                },
              },
              {
                label: 'Privacy',
                icon: '🔒',
                action: () => {
                  onShowPrivacy();
                  onClose();
                },
              },
              {
                label: 'Security (2FA)',
                icon: '🛡️',
                action: () => {
                  onShowTotp();
                  onClose();
                },
              },
              {
                label: 'Change password',
                icon: '🔑',
                action: () => {
                  onShowChangePassword();
                  onClose();
                },
              },
            ].map(({ label, icon, action }) => (
              <button
                key={label}
                onClick={action}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left"
                style={{ color: 'var(--text-2)' }}
              >
                <span>{icon}</span> {label}
              </button>
            ))}
            <button
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left"
              style={{ color: '#ef4444' }}
            >
              <span>⏻</span> Sign out
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1" style={{ background: 'rgba(0,0,0,0.5)' }} />
    </div>
  );
}
