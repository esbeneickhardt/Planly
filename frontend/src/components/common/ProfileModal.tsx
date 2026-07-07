import { useState } from 'react';
import Modal from './Modal';
import AvatarPicker from './AvatarPicker';
import { api } from '../../api/client';
import type { User } from '../../types';

interface Props {
  user: User | null;
  onClose: () => void;
}

export default function ProfileModal({ user, onClose }: Props) {
  const [profileForm, setProfileForm] = useState({
    realName: user?.realName ?? '',
    avatarEmoji: user?.avatarEmoji ?? '',
    avatarUrl: user?.avatarUrl ?? null as string | null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      await api.users.update(user.id, {
        realName: profileForm.realName || undefined,
        avatarEmoji: profileForm.avatarUrl ? undefined : (profileForm.avatarEmoji || undefined),
        avatarUrl: profileForm.avatarUrl ?? undefined,
      });
      window.location.reload();
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="Edit profile" onClose={onClose} width="max-w-sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col items-center gap-1 pb-1">
          <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-4xl flex-shrink-0" style={{ background: 'var(--surface-2)', border: '2px solid var(--border)' }}>
            {profileForm.avatarUrl
              ? <img src={profileForm.avatarUrl} className="w-full h-full object-cover" alt="" />
              : (profileForm.avatarEmoji || '👤')}
          </div>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>Pick an avatar below</p>
        </div>

        <AvatarPicker
          current={{ avatarEmoji: profileForm.avatarEmoji, avatarUrl: profileForm.avatarUrl }}
          onChange={(v) => setProfileForm((p) => ({
            ...p,
            avatarEmoji: v.avatarEmoji ?? (v.avatarUrl ? '' : p.avatarEmoji),
            avatarUrl: v.avatarUrl ?? null,
          }))}
        />

        <div>
          <label className="label">Full name</label>
          <input type="text" value={profileForm.realName}
            onChange={(e) => setProfileForm((p) => ({ ...p, realName: e.target.value }))}
            className="input" placeholder="Your name" />
        </div>
        <div>
          <label className="label">Username</label>
          <input type="text" className="input opacity-50" value={user?.username ?? ''} disabled />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" className="input opacity-50" value={user?.email ?? ''} disabled />
        </div>
        {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary flex-1 flex justify-center">
            {saving ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Save changes'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
