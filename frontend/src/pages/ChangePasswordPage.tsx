/**
 * Forced password-change screen shown to users whose account has mustChangePassword set (e.g. admin-created accounts).
 * If the flag is not set the component immediately redirects to /kanban, making it safe to render
 * without a guard in the router as long as RequireAuth wraps the outer route.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function ChangePasswordPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Redirect away if the flag has been cleared (e.g. after an earlier save refreshed the session)
  if (!user?.mustChangePassword) {
    navigate('/kanban', { replace: true });
    return null;
  }

  // Save new password then refresh the session so mustChangePassword clears before navigation
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      await api.auth.changePassword({ newPassword });
      await refreshUser();
      navigate('/kanban', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div
        className="w-full max-w-sm p-8 rounded-2xl shadow-lg"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0">
            <img src="/icons/icon.jpg" alt="Planly" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-base font-bold" style={{ color: 'var(--text)' }}>
              Set your password
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Choose a password to secure your account
            </p>
          </div>
        </div>

        <div
          className="mb-5 p-3 rounded-lg text-xs"
          style={{ background: '#f59e0b18', border: '1px solid #f59e0b44', color: '#f59e0b' }}
        >
          Your account was created with a temporary password. Please set a new one before continuing.
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>
              New password
            </label>
            <input
              type="password"
              className="input w-full"
              placeholder="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>
              Confirm password
            </label>
            <input
              type="password"
              className="input w-full"
              placeholder="Repeat your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && (
            <p className="text-xs" style={{ color: '#ef4444' }}>
              {error}
            </p>
          )}
          <button type="submit" disabled={saving} className="btn-primary w-full py-2 text-sm">
            {saving ? 'Saving…' : 'Set password and continue →'}
          </button>
        </form>
      </div>
    </div>
  );
}
