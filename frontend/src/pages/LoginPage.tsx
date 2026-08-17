/**
 * Login page handling both password-based and SSO sign-in, with a two-step TOTP challenge
 * when MFA is enabled on the account.  On load it fetches the SSO config and checks the URL
 * for OAuth error params; if login returns requiresTOTP the form switches to the code-entry step.
 */
import { useState, useEffect, useRef, FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

export default function LoginPage() {
  const { login, totpChallenge } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') ?? '/kanban';
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sso, setSso] = useState<{
    enabled: boolean;
    providerName: string;
  } | null>(null);
  const [showResend, setShowResend] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  // TOTP challenge state
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const totpInputRef = useRef<HTMLInputElement>(null);

  // Probe SSO availability and surface any OAuth error codes from query params
  useEffect(() => {
    api.auth
      .ssoConfig()
      .then(setSso)
      .catch(() => {});
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err)
      setError(
        err === 'sso_state_mismatch'
          ? 'SSO session expired - please try again.'
          : 'SSO sign-in failed. Try again or use email/password.',
      );
  }, []);

  // Focus TOTP input when the challenge step appears
  useEffect(() => {
    if (mfaToken) totpInputRef.current?.focus();
  }, [mfaToken]);

  // Handle credential submission; pivot to TOTP step if the API signals requiresTOTP
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(identifier, password);
      if (result?.requiresTOTP) {
        setMfaToken(result.mfaToken);
        return;
      }
      navigate(next, { replace: true });
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      setShowResend(msg.toLowerCase().includes('verify your email'));
    } finally {
      setLoading(false);
    }
  }

  // Submit the 6-digit TOTP code using the short-lived mfaToken from the first step
  async function handleTotpSubmit(e: FormEvent) {
    e.preventDefault();
    if (!mfaToken) return;
    setError('');
    setLoading(true);
    try {
      await totpChallenge(mfaToken, totpCode);
      navigate(next, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setTotpCode('');
      totpInputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  // ── TOTP challenge step ──────────────────────────────────────────────────────
  if (mfaToken) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="block mx-auto w-12 h-12 rounded-2xl mb-4 overflow-hidden flex-shrink-0">
              <img src="/icons/p.png" alt="Planly" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
              Two-factor authentication
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
              Enter the 6-digit code from your authenticator app
            </p>
          </div>
          <form onSubmit={handleTotpSubmit} className="card p-6 space-y-4">
            <div>
              <label className="label" htmlFor="login-totp-code">
                Authenticator code
              </label>
              <input
                id="login-totp-code"
                ref={totpInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="input text-center text-2xl tracking-widest"
                placeholder="000000"
                maxLength={6}
              />
            </div>
            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading || totpCode.length < 6}
              className="btn-primary w-full justify-center flex"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                'Verify'
              )}
            </button>
            <p className="text-xs text-center" style={{ color: 'var(--text-3)' }}>
              Lost access to your app? Enter a backup code instead.
            </p>
          </form>
          <button
            onClick={() => {
              setMfaToken(null);
              setError('');
            }}
            className="w-full text-sm text-center mt-4"
            style={{ color: 'var(--text-3)' }}
          >
            ← Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="block mx-auto w-12 h-12 rounded-2xl mb-4 overflow-hidden flex-shrink-0">
            <img src="/icons/p.png" alt="Planly" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
            Welcome back
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
            Sign in to your workspace
          </p>
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
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                or
              </span>
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label htmlFor="login-identifier" className="label">
              Email or username
            </label>
            <input
              id="login-identifier"
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
              <label htmlFor="login-password" className="label mb-0">
                Password
              </label>
              <Link to="/forgot-password" className="text-xs" style={{ color: 'var(--brand)' }}>
                Forgot password?
              </Link>
            </div>
            <input
              id="login-password"
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
              <div
                role="alert"
                className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
              >
                {error}
              </div>
              {showResend &&
                (resendSent ? (
                  <p className="text-xs text-center" style={{ color: 'var(--text-3)' }}>
                    Verification email sent - check your inbox.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      const email = identifier.includes('@') ? identifier : '';
                      if (!email) {
                        setError('Enter your email address above to resend the verification link.');
                        return;
                      }
                      await api.auth.resendVerification(email).catch(() => {});
                      setResendSent(true);
                    }}
                    className="w-full text-sm text-center py-1"
                    style={{ color: 'var(--brand)' }}
                  >
                    Resend verification email
                  </button>
                ))}
            </div>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center flex">
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              'Sign in'
            )}
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
