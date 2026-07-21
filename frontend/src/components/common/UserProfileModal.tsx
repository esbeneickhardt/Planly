/**
 * Modal showing a user's public profile — display name, avatar, and all their project memberships with role badges.
 */
import { useState, useEffect } from 'react';
import { api, displayName } from '../../api/client';
import Modal from './Modal';

type Profile = Awaited<ReturnType<typeof api.users.getProfile>>;

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', co_owner: 'Co-owner', member: 'Member' };
const ROLE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  owner:    { bg: 'var(--brand-subtle)',        color: 'var(--brand)',  border: 'var(--brand)' },
  co_owner: { bg: 'rgba(139,92,246,0.1)',       color: '#8b5cf6',      border: 'rgba(139,92,246,0.3)' },
  member:   { bg: 'var(--surface)',             color: 'var(--text-3)', border: 'var(--border)' },
};

interface Props {
  userId: string;
  onClose: () => void;
}

export default function UserProfileModal({ userId, onClose }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.users.getProfile(userId)
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const name = profile ? displayName(profile) : '…';

  return (
    <Modal title={name} onClose={onClose} width="max-w-sm">
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }} />
        </div>
      ) : profile ? (
        <div className="space-y-5">
          {/* Avatar + name */}
          <div className="flex items-center gap-4">
            <span className="text-5xl leading-none flex-shrink-0">{profile.avatarEmoji ?? '👤'}</span>
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-tight" style={{ color: 'var(--text)' }}>{displayName(profile)}</p>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>@{profile.username}</p>
            </div>
          </div>

          {/* Projects */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-3)' }}>Projects</p>
            {profile.projects.length > 0 ? (
              <div className="space-y-1.5">
                {profile.projects.map((p) => {
                  const style = ROLE_STYLE[p.role] ?? ROLE_STYLE['member']!;
                  return (
                    <div key={p.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <span className="text-base flex-shrink-0">{p.emoji ?? '🎯'}</span>
                      <span className="text-sm flex-1 min-w-0 truncate font-medium" style={{ color: 'var(--text)' }}>{p.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium" style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}>
                        {ROLE_LABEL[p.role] ?? p.role}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>No projects yet.</p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-center py-6" style={{ color: 'var(--text-3)' }}>Could not load profile.</p>
      )}
    </Modal>
  );
}
