import { useState } from 'react';
import Modal from './Modal';
import type { User } from '../../types';

interface Props {
  user: User | null;
  onClose: () => void;
  logout: () => void;
}

export default function DeleteAccountModal({ user, onClose, logout }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    if (!user) return;
    setDeleting(true);
    setError('');
    try {
      await fetch(`/api/users/${user.id}`, { method: 'DELETE', credentials: 'include' });
      logout();
    } catch {
      setError('Failed to delete account. Please try again or contact support.');
      setDeleting(false);
    }
  }

  return (
    <Modal title="Delete account" onClose={onClose} width="max-w-sm">
      <div className="space-y-4">
        <div className="p-4 rounded-xl" style={{ background: '#ef444412', border: '1px solid #ef444433' }}>
          <p className="text-sm font-semibold mb-1" style={{ color: '#ef4444' }}>
            This action cannot be undone
          </p>
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>
            Your account, profile, and all associated data will be permanently deleted. Other team members' tasks and
            messages you were part of will remain.
          </p>
        </div>
        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 py-2 rounded-xl text-sm font-semibold"
            style={{ background: '#ef4444', color: 'white' }}
          >
            {deleting ? 'Deleting…' : 'Delete my account'}
          </button>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
