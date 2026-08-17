/**
 * Forgot-password page that sends a reset link to the user's email address.
 * On load it probes whether SMTP is configured; if email is not enabled it renders a
 * static "contact your admin" message instead of the form to avoid misleading the user.
 */
import { useState, useEffect, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [smtpEnabled, setSmtpEnabled] = useState<boolean | null>(null);

  // Check if SMTP is live before showing the form; fall back to false on fetch error
  useEffect(() => {
    api.auth
      .emailEnabled()
      .then((r) => setSmtpEnabled(r.enabled))
      .catch(() => setSmtpEnabled(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.auth.forgotPassword(email.trim());
      setSent(true);
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
            <img src="/icons/p.png" alt="Planly" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
            Reset your password
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-3)' }}>
            {smtpEnabled === false
              ? 'Contact your administrator to reset your password'
              : "Enter your email and we'll send you a reset link"}
          </p>
        </div>

        {smtpEnabled === false ? (
          <div
            className="rounded-2xl p-6 text-center space-y-4"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="text-3xl">🔧</div>
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              Email not configured
            </p>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              This Planly instance doesn't have email set up yet. Ask your administrator to configure SMTP, or have them
              reset your password directly.
            </p>
            <Link to="/login" className="block text-sm" style={{ color: 'var(--brand)' }}>
              Back to sign in
            </Link>
          </div>
        ) : sent ? (
          <div
            className="rounded-2xl p-6 text-center space-y-4"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="text-3xl">📬</div>
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              Check your email
            </p>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              If <strong>{email}</strong> has an account, you'll receive a reset link shortly.
            </p>
            <Link to="/login" className="block text-sm" style={{ color: 'var(--brand)' }}>
              Back to sign in
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl p-6 space-y-4"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <div>
              <label className="label" htmlFor="forgot-pw-email">
                Email address
              </label>
              <input
                id="forgot-pw-email"
                type="email"
                required
                // eslint-disable-next-line jsx-a11y/no-autofocus -- first field on a freshly-loaded auth page
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@example.com"
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
            <button
              type="submit"
              disabled={loading || smtpEnabled === null}
              className="btn-primary w-full flex justify-center"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                'Send reset link'
              )}
            </button>
            <p className="text-center text-sm" style={{ color: 'var(--text-3)' }}>
              Remember it?{' '}
              <Link to="/login" style={{ color: 'var(--brand)' }}>
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
