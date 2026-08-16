/**
 * Password-reset page reached via the emailed link containing a `?token=` query param.
 * Validates client-side that passwords match and meet minimum length, then calls the API.
 * On success it shows a confirmation state and auto-redirects to /login after 3 seconds.
 */
import { useState, FormEvent, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // Surface a clear error immediately if the token is missing from the URL
  useEffect(() => {
    if (!token) setError('Invalid reset link. Please request a new one.');
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.auth.resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl overflow-hidden mx-auto mb-4">
            <img
              src="/icons/p.png"
              alt="Planly"
              className="w-full h-full object-contain"
             
            />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
            Set new password
          </h1>
        </div>

        {done ? (
          <div
            className="rounded-2xl p-6 text-center space-y-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="text-3xl">✅</div>
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              Password updated!
            </p>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              Redirecting you to sign in…
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div>
              <label className="label" htmlFor="reset-pw-new">
                New password
              </label>
              <input
                id="reset-pw-new"
                type="password"
                required
                // eslint-disable-next-line jsx-a11y/no-autofocus -- first field on a freshly-loaded auth page
                autoFocus
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="label" htmlFor="reset-pw-confirm">
                Confirm password
              </label>
              <input
                id="reset-pw-confirm"
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input"
                placeholder="Repeat password"
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
            <button type="submit" disabled={loading || !token} className="btn-primary w-full flex justify-center">
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                'Reset password'
              )}
            </button>
            <p className="text-center text-sm" style={{ color: 'var(--text-3)' }}>
              <Link to="/login" style={{ color: 'var(--brand)' }}>
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
