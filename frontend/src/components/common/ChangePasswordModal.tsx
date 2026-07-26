/**
 * Modal for voluntarily changing password while logged in.
 * Requires current password unless mustChangePassword is set.
 * On success the backend re-issues the session cookie with the new tokenVersion
 * so the current tab stays logged in while other sessions are invalidated.
 */
import { useState } from 'react';
import { api } from '../../api/client';
import Modal from './Modal';

interface Props {
  onClose: () => void;
}

export default function ChangePasswordModal({ onClose }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (next !== confirm) {
      setError('New passwords do not match');
      return;
    }
    if (next.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await api.auth.changePassword({ currentPassword: current, newPassword: next });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Change password" onClose={onClose} width="max-w-sm" mobileFullscreen>
      <div className="space-y-5">
        {done ? (
          <div className="space-y-4 text-center py-2">
            <div className="text-3xl">✓</div>
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              Password updated
            </p>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              Other active sessions have been signed out.
            </p>
            <button onClick={onClose} className="btn-primary w-full justify-center flex">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Current password</label>
              <input
                type="password"
                required
                autoFocus
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="input w-full"
                placeholder="Your current password"
              />
            </div>
            <div>
              <label className="label">New password</label>
              <input
                type="password"
                required
                minLength={8}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className="input w-full"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="label">Confirm new password</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input w-full"
                placeholder="Repeat new password"
              />
            </div>
            {error && (
              <div
                className="text-sm px-3 py-2 rounded-lg"
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  color: '#ef4444',
                  border: '1px solid rgba(239,68,68,0.2)',
                }}
              >
                {error}
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center flex">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center flex">
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  'Update password'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
