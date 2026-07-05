import { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Modal from './Modal';

const NOTIFICATION_TYPES: { type: string; label: string; description: string; defaultOn: boolean; group?: string }[] = [
  { type: 'task_assigned',   label: 'Task assigned',     description: 'When a task is assigned to you',        defaultOn: true  },
  { type: 'task_commented',  label: 'Task comment',      description: 'When someone comments on your task',    defaultOn: true  },
  { type: 'mention',         label: '@Mention',          description: 'When someone mentions you in a message', defaultOn: true  },
  { type: 'emailMentions',   label: 'Email for @mentions', description: 'Send an email when you are @mentioned (requires SMTP)', defaultOn: false, group: 'email' },
  { type: 'access_requested',label: 'Access requests',   description: 'When someone requests project access',  defaultOn: true  },
  { type: 'access_approved', label: 'Access approved',   description: 'When your access request is approved',  defaultOn: true  },
  { type: 'access_rejected', label: 'Access rejected',   description: 'When your access request is declined',  defaultOn: true  },
  { type: 'invite_received', label: 'Team invite',       description: 'When you are invited to a team',        defaultOn: true  },
  { type: 'sprint_started',  label: 'Sprint started',    description: 'When a sprint begins',                  defaultOn: false },
];

interface Props {
  onClose: () => void;
}

export default function NotificationPreferencesModal({ onClose }: Props) {
  const { user, refreshUser } = useAuth();

  const currentPrefs = (user?.notificationPreferences ?? {}) as Record<string, boolean>;

  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const { type, defaultOn } of NOTIFICATION_TYPES) {
      map[type] = type in currentPrefs ? currentPrefs[type] : defaultOn;
    }
    return map;
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggle(type: string) {
    setPrefs((p) => ({ ...p, [type]: !p[type] }));
    setSaved(false);
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      await api.users.updateNotificationPreferences(user.id, prefs);
      await refreshUser();
      setSaved(true);
    } catch {}
    finally { setSaving(false); }
  }

  return (
    <Modal title="Notification preferences" onClose={onClose} width="max-w-sm">
      <div className="space-y-1">
        {NOTIFICATION_TYPES.map(({ type, label, description, group }, i) => {
          const prevGroup = NOTIFICATION_TYPES[i - 1]?.group;
          const showDivider = group === 'email' && prevGroup !== 'email';
          return (
            <div key={type}>
              {showDivider && (
                <div className="pt-2 pb-1 px-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Email</p>
                </div>
              )}
              <button
                onClick={() => toggle(type)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
                style={{ background: 'transparent' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div
                  className="w-9 h-5 rounded-full flex-shrink-0 relative transition-colors"
                  style={{ background: prefs[type] ? 'var(--brand)' : 'var(--border)' }}
                >
                  <div
                    className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                    style={{ background: 'white', left: prefs[type] ? 'calc(100% - 18px)' : '2px' }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</p>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>{description}</p>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3 pt-4 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
        <button
          onClick={save}
          disabled={saving}
          className="btn-primary flex-1 flex justify-center"
        >
          {saving
            ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            : saved ? 'Saved' : 'Save preferences'}
        </button>
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
      </div>
    </Modal>
  );
}
