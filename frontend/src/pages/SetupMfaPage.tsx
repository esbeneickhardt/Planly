/**
 * Forced MFA setup screen shown when the server requires MFA and the user hasn't set it up.
 * No dismiss button - the user must complete setup or log out to leave this screen.
 * Adapts the same setup flow as TotpModal but as a full-page experience.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

type Step = 'start' | 'scan' | 'backup' | 'done';

export default function SetupMfaPage() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('start');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [manualSecret, setManualSecret] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect away if MFA is no longer required (e.g. admin turned it off, or user already set it up)
  useEffect(() => {
    if (user && !user.mustSetupMfa) navigate('/kanban', { replace: true });
  }, [user, navigate]);

  async function handleStart() {
    setError('');
    setLoading(true);
    try {
      const res = await api.auth.totpSetup();
      setQrDataUrl(res.qrDataUrl);
      setManualSecret(res.secret);
      setStep('scan');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setError('');
    setLoading(true);
    try {
      const res = await api.auth.totpConfirm(confirmCode);
      setBackupCodes(res.backupCodes);
      setStep('backup');
    } catch (err) {
      setError((err as Error).message);
      setConfirmCode('');
    } finally {
      setLoading(false);
    }
  }

  async function handleDone() {
    await refreshUser();
    navigate('/kanban', { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
      <div
        className="w-full max-w-sm p-8 rounded-2xl shadow-lg"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0">
            <img src="/icons/p.png" alt="Planly" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-base font-bold" style={{ color: 'var(--text)' }}>
              Set up two-factor authentication
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Required by your administrator
            </p>
          </div>
        </div>

        {error && (
          <div
            className="mb-4 text-sm p-3 rounded-lg"
            style={{
              background: '#ef444418',
              border: '1px solid #ef444444',
              color: '#ef4444',
            }}
          >
            {error}
          </div>
        )}

        {step === 'start' && (
          <div className="space-y-4">
            <div
              className="p-3 rounded-lg text-xs"
              style={{
                background: '#6366f118',
                border: '1px solid #6366f144',
                color: 'var(--text-2)',
              }}
            >
              This server requires all users to protect their account with an authenticator app (Google Authenticator,
              Authy, 1Password, etc.). You'll need your app before you can continue.
            </div>
            <button onClick={handleStart} disabled={loading} className="btn-primary w-full justify-center flex">
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                'Begin setup →'
              )}
            </button>
            <button onClick={() => logout()} className="w-full text-xs text-center" style={{ color: 'var(--text-3)' }}>
              Log out instead
            </button>
          </div>
        )}

        {step === 'scan' && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              Scan this QR code with your authenticator app, then enter the 6-digit code to confirm setup.
            </p>
            {qrDataUrl && (
              <div className="flex justify-center">
                <img
                  src={qrDataUrl}
                  alt="TOTP QR code"
                  className="w-48 h-48 rounded-xl"
                  style={{ background: 'white', padding: 8 }}
                />
              </div>
            )}
            <details className="text-xs" style={{ color: 'var(--text-3)' }}>
              <summary className="cursor-pointer select-none">Can't scan? Enter manually</summary>
              <code
                className="block mt-2 p-2 rounded-lg break-all font-mono"
                style={{ background: 'var(--surface-2)', color: 'var(--text)' }}
              >
                {manualSecret}
              </code>
            </details>
            <div>
              <label className="label" htmlFor="setup-mfa-confirm-code">
                Confirmation code
              </label>
              <input
                id="setup-mfa-confirm-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="input text-center text-2xl tracking-widest w-full"
                placeholder="000000"
                maxLength={6}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- first field on a freshly-loaded setup page
                autoFocus
              />
            </div>
            <button
              onClick={handleConfirm}
              disabled={loading || confirmCode.length < 6}
              className="btn-primary w-full justify-center flex"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                'Activate →'
              )}
            </button>
          </div>
        )}

        {step === 'backup' && (
          <div className="space-y-4">
            <div
              className="text-sm p-3 rounded-xl"
              style={{
                background: 'rgba(234,179,8,0.1)',
                border: '1px solid rgba(234,179,8,0.3)',
                color: 'var(--text)',
              }}
            >
              Save these backup codes somewhere safe. Each can be used once if you lose access to your authenticator
              app. They will not be shown again.
            </div>
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((c) => (
                <code
                  key={c}
                  className="text-sm font-mono px-3 py-2 rounded-lg text-center"
                  style={{
                    background: 'var(--surface-2)',
                    color: 'var(--text)',
                  }}
                >
                  {c}
                </code>
              ))}
            </div>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(backupCodes.join('\n')).catch(() => {});
              }}
              className="btn-secondary w-full justify-center flex text-sm"
            >
              Copy all codes
            </button>
            <button onClick={handleDone} className="btn-primary w-full justify-center flex">
              I've saved my codes - continue →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
