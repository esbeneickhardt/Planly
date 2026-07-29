import { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Modal from './Modal';
import ToggleSwitch from './ToggleSwitch';

const NOTIFICATION_TYPES: { type: string; label: string; description: string; defaultOn: boolean; group?: string }[] = [
  { type: 'task_assigned', label: 'Task assigned', description: 'When a task is assigned to you', defaultOn: true },
  { type: 'task_commented', label: 'Task comment', description: 'When someone comments on your task', defaultOn: true },
  { type: 'mention', label: '@Mention', description: 'When someone mentions you in a message', defaultOn: true },
  { type: 'reaction', label: 'Reactions', description: 'When someone reacts to your message', defaultOn: true },
  {
    type: 'emailMentions',
    label: 'Email for @mentions',
    description: 'Send an email when you are @mentioned (requires SMTP)',
    defaultOn: false,
    group: 'email',
  },
  {
    type: 'emailDirectMessages',
    label: 'Email for messages',
    description: 'Send an email when you receive a direct or group message (requires SMTP)',
    defaultOn: false,
    group: 'email',
  },
  {
    type: 'access_requested',
    label: 'Access requests',
    description: 'When someone requests project access',
    defaultOn: true,
  },
  {
    type: 'access_approved',
    label: 'Access approved',
    description: 'When your access request is approved',
    defaultOn: true,
  },
  {
    type: 'access_rejected',
    label: 'Access rejected',
    description: 'When your access request is declined',
    defaultOn: true,
  },
  {
    type: 'invite_received',
    label: 'Team invite',
    description: 'Get a notification when you are invited to a project',
    defaultOn: true,
  },
  { type: 'role_changed', label: 'Role change', description: 'When your role in a project changes', defaultOn: true },
  { type: 'sprint_started', label: 'Sprint started', description: 'When a sprint begins', defaultOn: false },
];

interface Props {
  onClose: () => void;
}

export default function NotificationPreferencesModal({ onClose }: Props) {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();

  const currentPrefs = (user?.notificationPreferences ?? {}) as Record<string, boolean>;

  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const { type, defaultOn } of NOTIFICATION_TYPES) {
      map[type] = currentPrefs[type] ?? defaultOn;
    }
    return map;
  });

  // Saves immediately on toggle (optimistic, reverted on failure) - no separate Save step.
  async function toggle(type: string) {
    if (!user) return;
    const next = { ...prefs, [type]: !prefs[type] };
    setPrefs(next);
    try {
      await api.users.updateNotificationPreferences(user.id, next);
      await refreshUser();
    } catch (err) {
      setPrefs((p) => ({ ...p, [type]: !next[type]! }));
      showToast((err as Error).message ?? 'Failed to save', 'error');
    }
  }

  return (
    <Modal title="Notification preferences" onClose={onClose} width="max-w-sm" mobileFullscreen>
      <div className="space-y-1">
        {NOTIFICATION_TYPES.map(({ type, label, description, group }, i) => {
          const prevGroup = NOTIFICATION_TYPES[i - 1]?.group;
          const showDivider = group === 'email' && prevGroup !== 'email';
          return (
            <div key={type}>
              {showDivider && (
                <div className="pt-2 pb-1 px-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                    Email
                  </p>
                </div>
              )}
              <button
                onClick={() => toggle(type)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
                style={{ background: 'transparent' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <ToggleSwitch checked={prefs[type] ?? false} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                    {label}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                    {description}
                  </p>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
