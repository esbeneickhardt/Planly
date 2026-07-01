import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../api/client';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<'pending' | 'ok' | 'error'>('pending');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('No token found in URL.'); return; }
    api.auth.verifyEmail(token)
      .then(() => setStatus('ok'))
      .catch((e) => { setStatus('error'); setMessage((e as Error).message); });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-md text-center p-8 rounded-2xl shadow-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {status === 'pending' && (
          <>
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }} />
            <p style={{ color: 'var(--text-3)' }}>Verifying your email…</p>
          </>
        )}
        {status === 'ok' && (
          <>
            <div className="text-4xl mb-4">✓</div>
            <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text)' }}>Email verified!</h1>
            <p className="text-sm mb-6" style={{ color: 'var(--text-3)' }}>Your email address has been confirmed. You can now sign in.</p>
            <Link to="/login" className="btn-primary px-6 py-2 text-sm inline-block">Go to sign in →</Link>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-4xl mb-4">✕</div>
            <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text)' }}>Verification failed</h1>
            <p className="text-sm mb-6" style={{ color: '#ef4444' }}>{message || 'This link is invalid or has expired.'}</p>
            <Link to="/login" className="btn-secondary px-6 py-2 text-sm inline-block">Back to sign in</Link>
          </>
        )}
      </div>
    </div>
  );
}
