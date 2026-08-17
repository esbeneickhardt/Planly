/**
 * Account dropdown panel - rendered when the avatar button is clicked in the top bar.
 * The parent (TopBar) owns the isOpen state and the wrapping ref div.
 */
interface Props {
  user: { username: string; realName?: string | null; avatarEmoji?: string | null; avatarUrl?: string | null } | null;
  isDark: boolean;
  onClose: () => void;
  onShowProfile: () => void;
  onShowThemePicker: () => void;
  onShowMemberships: () => void;
  onShowIntegrations: () => void;
  onShowNotifPrefs: () => void;
  onShowPrivacy: () => void;
  onShowTotp: () => void;
  onShowChangePassword: () => void;
  onShowDeleteAccount: () => void;
  onLogout: () => void;
}

export default function TopBarAccountDropdown({
  user,
  isDark: _isDark,
  onClose,
  onShowProfile,
  onShowThemePicker,
  onShowMemberships,
  onShowIntegrations,
  onShowNotifPrefs,
  onShowPrivacy,
  onShowTotp,
  onShowChangePassword,
  onShowDeleteAccount,
  onLogout,
}: Props) {
  const menuItems = [
    {
      icon: '🎨',
      label: 'Appearance',
      action: () => {
        onShowThemePicker();
        onClose();
      },
    },
    {
      icon: '✏️',
      label: 'Edit profile',
      action: () => {
        onShowProfile();
        onClose();
      },
    },
    {
      icon: '🏠',
      label: 'Memberships',
      action: () => {
        onShowMemberships();
        onClose();
      },
    },
    {
      icon: '🔑',
      label: 'Integrations',
      action: () => {
        onShowIntegrations();
        onClose();
      },
    },
    {
      icon: '🔔',
      label: 'Notifications',
      action: () => {
        onShowNotifPrefs();
        onClose();
      },
    },
    {
      icon: '🔒',
      label: 'Privacy',
      action: () => {
        onShowPrivacy();
        onClose();
      },
    },
    {
      icon: '🛡️',
      label: 'Security (2FA)',
      action: () => {
        onShowTotp();
        onClose();
      },
    },
    {
      icon: '🔐',
      label: 'Change password',
      action: () => {
        onShowChangePassword();
        onClose();
      },
    },
  ];

  return (
    <div
      className="absolute right-0 top-full mt-2 w-56 rounded-2xl shadow-2xl overflow-y-auto py-1.5 animate-dropdown-in"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        zIndex: 50,
        maxHeight: 'calc(100vh - 72px)',
      }}
    >
      {/* User info header */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              onShowProfile();
              onClose();
            }}
            className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-2xl flex-shrink-0 relative group transition-opacity hover:opacity-80"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            title="Edit profile"
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} className="w-full h-full object-cover" alt="" />
            ) : (
              (user?.avatarEmoji ?? '👤')
            )}
            <div
              className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(0,0,0,0.35)', fontSize: 11, color: 'white', fontWeight: 600 }}
            >
              Edit
            </div>
          </button>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
              {user?.realName ?? user?.username}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>
              @{user?.username}
            </p>
          </div>
        </div>
      </div>

      {/* Menu items */}
      {menuItems.map(({ icon, label, action }) => (
        <button
          key={label}
          onClick={action}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
          style={{ color: 'var(--text-2)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span className="w-5 text-center flex-shrink-0">{icon}</span>
          {label}
        </button>
      ))}

      <div className="mx-4 my-1" style={{ height: 1, background: 'var(--border)' }} />

      <a
        href="/api/me/export"
        download
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
        style={{ color: 'var(--text-2)', textDecoration: 'none' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        onClick={onClose}
      >
        <span className="w-5 text-center flex-shrink-0">⬇</span>
        Download my data
      </a>
      <button
        onClick={() => {
          onClose();
          onShowDeleteAccount();
        }}
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
        onClick={onLogout}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
        style={{ color: '#ef4444' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <span className="w-5 text-center flex-shrink-0">⏻</span>
        Sign out
      </button>
    </div>
  );
}
