import { useState, useEffect, FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') ?? '/kanban';
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sso, setSso] = useState<{ enabled: boolean; providerName: string } | null>(null);
  const [showResend, setShowResend] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    api.auth.ssoConfig().then(setSso).catch(() => {});
    // Show SSO error from callback redirect
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err) setError(err === 'sso_state_mismatch' ? 'SSO session expired - please try again.' : 'SSO sign-in failed. Try again or use email/password.');
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(identifier, password);
      navigate(next, { replace: true });
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      setShowResend(msg.toLowerCase().includes('verify your email'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="block mx-auto w-12 h-12 rounded-2xl mb-4 overflow-hidden flex-shrink-0">
            <img src="/icons/icon.jpg" alt="Planly" className="w-full h-full object-cover" style={{ transform: 'scale(1.25)', transformOrigin: 'center' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Welcome back</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>Sign in to your workspace</p>
        </div>

        {sso?.enabled && (
          <div className="mb-4">
            <a
              href="/api/auth/sso/authorize"
              className="btn-primary w-full justify-center flex items-center gap-2 no-underline"
              style={{ textDecoration: 'none' }}
            >
              <span>🔐</span> Sign in with {sso.providerName}
            </a>
            <div className="flex items-center gap-3 mt-4 mb-1">
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>or</span>
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="label">Email or username</label>
            <input
              type="text"
              required
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="input"
              placeholder="you@example.com or username"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Password</label>
              <Link to="/forgot-password" className="text-xs" style={{ color: 'var(--brand)' }}>Forgot password?</Link>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <div className="space-y-2">
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
              {showResend && (
                resendSent ? (
                  <p className="text-xs text-center" style={{ color: 'var(--text-3)' }}>Verification email sent - check your inbox.</p>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      const email = identifier.includes('@') ? identifier : '';
                      if (!email) { setError('Enter your email address above to resend the verification link.'); return; }
                      await api.auth.resendVerification(email).catch(() => {});
                      setResendSent(true);
                    }}
                    className="w-full text-sm text-center py-1"
                    style={{ color: 'var(--brand)' }}
                  >
                    Resend verification email
                  </button>
                )
              )}
            </div>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center flex">
            {loading ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-sm mt-4" style={{ color: 'var(--text-2)' }}>
          No account?{' '}
          <Link to="/register" className="font-medium" style={{ color: 'var(--brand)' }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
