import { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Modal from './Modal';
import ToggleSwitch from './ToggleSwitch';

interface Props {
  onClose: () => void;
}

export default function PrivacyModal({ onClose }: Props) {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [acceptsInvites, setAcceptsInvites] = useState(user?.acceptsInvites ?? true);

  // Saves immediately on toggle (optimistic, reverted on failure) - no separate Save step.
  async function toggleAcceptsInvites() {
    if (!user) return;
    const next = !acceptsInvites;
    setAcceptsInvites(next);
    try {
      await api.users.update(user.id, { acceptsInvites: next });
      await refreshUser();
    } catch (err) {
      setAcceptsInvites(!next);
      showToast((err as Error).message ?? 'Failed to save', 'error');
    }
  }

  return (
    <Modal title="Privacy" onClose={onClose} width="max-w-sm" mobileFullscreen>
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-1" style={{ color: 'var(--text-3)' }}>
          Invitations
        </p>
        <button
          onClick={toggleAcceptsInvites}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
          style={{ background: 'transparent' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <ToggleSwitch checked={acceptsInvites} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              Allow project invitations
            </p>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Others can invite you to join their projects
            </p>
          </div>
        </button>
      </div>
    </Modal>
  );
}
