/**
 * Team invite landing page that validates the token from the URL path and lets the user accept.
 * Unauthenticated users are shown sign-in/sign-up links that preserve the token in the `next` param;
 * on acceptance the page auto-redirects to /kanban after a short success delay.
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, InviteInfo } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Validate the invite token on mount; surface an error immediately if the URL has no token
  useEffect(() => {
    if (!token) {
      setError('Invalid invite link');
      setLoading(false);
      return;
    }
    api.invites
      .getInfo(token)
      .then(setInfo)
      .catch(() => setError('This invite link is invalid or has expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  // Accept the invite and auto-redirect after a 2-second success display
  async function handleAccept() {
    if (!token) return;
    setAccepting(true);
    try {
      const result = await api.invites.accept(token);
      setDone(true);
      setTimeout(() => navigate('/kanban'), 2000);
      void result;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div
          className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl overflow-hidden mx-auto mb-4">
            <img
              src="/icons/p.png"
              alt="Planly"
              className="w-full h-full object-contain"
             
            />
          </div>
        </div>

        <div
          className="rounded-2xl p-6 space-y-4 text-center"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {done ? (
            <>
              <div className="text-3xl">🎉</div>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>
                You joined {info?.teamName}!
              </p>
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                Redirecting to your workspace…
              </p>
            </>
          ) : error ? (
            <>
              <div className="text-3xl">❌</div>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>
                Invite unavailable
              </p>
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                {error}
              </p>
              <Link to="/" style={{ color: 'var(--brand)', fontSize: 14 }}>
                Go to Planly
              </Link>
            </>
          ) : (
            <>
              <div className="text-3xl">✉️</div>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>
                You've been invited to join <em>{info?.teamName}</em>
              </p>
              {!user ? (
                <>
                  <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                    Sign in or create an account to accept this invite.
                  </p>
                  <div className="flex gap-3 pt-2">
                    <Link to={`/login?next=/invite/${token}`} className="btn-primary flex-1 text-center no-underline">
                      Sign in
                    </Link>
                    <Link
                      to={`/register?next=/invite/${token}`}
                      className="btn-secondary flex-1 text-center no-underline"
                    >
                      Sign up
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                    Accepting as <strong>{user.username}</strong>
                  </p>
                  <button
                    onClick={handleAccept}
                    disabled={accepting}
                    className="btn-primary w-full flex justify-center"
                  >
                    {accepting ? (
                      <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      'Accept invite'
                    )}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
