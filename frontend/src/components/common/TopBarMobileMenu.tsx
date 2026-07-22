/**
 * Mobile navigation overlay — the hamburger menu shown on small screens.
 * TopBar passes pre-filtered nav items so canRead/analyticsEnabled logic stays in one place.
 */
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldIcon, CategoriesIcon, ChatIcon } from './TopBarIcons';
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
  products: Product[];
  activeProduct: Product | null;
  setActiveProduct: (p: Product) => void;
  filteredNav: MobileNavItem[];
  adminTabs: AdminTab[];
  isAdminPage: boolean;
  currentAdminTab: string;
  canManage: boolean;
  onClose: () => void;
  onOpenChat: () => void;
  onShowNewProduct: () => void;
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
  products,
  activeProduct,
  setActiveProduct,
  filteredNav,
  adminTabs,
  isAdminPage,
  currentAdminTab,
  canManage,
  onClose,
  onOpenChat,
  onShowNewProduct,
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

  return (
    <div className="lg:hidden fixed inset-0 z-50 flex flex-col" style={{ top: 56 }} onClick={onClose}>
      <div
        className="flex-1 overflow-y-auto py-2"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Project picker */}
        <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)' }}>
            Project
          </p>
          <div className="flex items-center gap-2.5">
            <span className="text-xl">{activeProduct?.emoji ?? '🎯'}</span>
            <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              {activeProduct?.name ?? 'No project'}
            </span>
          </div>
          <div className="mt-2 space-y-0.5">
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setActiveProduct(p);
                  onClose();
                  navigate('/kanban');
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left"
                style={{
                  background: activeProduct?.id === p.id ? 'var(--brand-subtle)' : 'transparent',
                  color: activeProduct?.id === p.id ? 'var(--brand)' : 'var(--text-2)',
                }}
              >
                <span>{p.emoji ?? '🎯'}</span>
                <span className="truncate">{p.name}</span>
                {activeProduct?.id === p.id && (
                  <span className="ml-auto text-xs font-bold" style={{ color: 'var(--brand)' }}>
                    ✓
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={() => {
                onShowNewProduct();
                onClose();
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left"
              style={{ color: 'var(--text-3)' }}
            >
              <span>+</span> New project
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)' }}>
            Navigate
          </p>
          <div className="space-y-0.5">
            {isAdminPage ? (
              adminTabs.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => {
                    setSearchParams({ tab: key });
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
                {user?.isAdmin && (
                  <button
                    onClick={() => {
                      onClose();
                      navigate('/admin');
                    }}
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
                onOpenChat();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left"
              style={{ color: 'var(--text-2)' }}
            >
              <ChatIcon size={18} /> Chat
            </button>
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
