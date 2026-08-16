/**
 * Modal for managing two-factor authentication (TOTP) on the current user's account.
 * Steps through status -> setup (QR code + manual secret) -> confirm (6-digit code) -> backup
 * (one-time recovery codes shown once) when enabling, or status -> disable (code or backup code)
 * when turning it off. Fetches the current enabled/disabled status on mount.
 */
import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Modal from './Modal';

type Step = 'status' | 'setup' | 'confirm' | 'backup' | 'disable';

interface Props {
  onClose: () => void;
}

export default function TotpModal({ onClose }: Props) {
  const [step, setStep] = useState<Step>('status');
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [manualSecret, setManualSecret] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.auth
      .totpStatus()
      .then((s) => {
        setTotpEnabled(s.totpEnabled);
        setStep('status');
      })
      .catch(() => {});
  }, []);

  async function handleSetup() {
    setError('');
    setLoading(true);
    try {
      const res = await api.auth.totpSetup();
      setQrDataUrl(res.qrDataUrl);
      setManualSecret(res.secret);
      setStep('setup');
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
      setTotpEnabled(true);
      setStep('backup');
    } catch (err) {
      setError((err as Error).message);
      setConfirmCode('');
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable() {
    setError('');
    setLoading(true);
    try {
      await api.auth.totpDisable(disableCode);
      setTotpEnabled(false);
      setStep('status');
      setDisableCode('');
    } catch (err) {
      setError((err as Error).message);
      setDisableCode('');
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'input text-center text-2xl tracking-widest';

  return (
    <Modal title="Two-factor authentication" onClose={onClose} width="max-w-sm" mobileFullscreen>
      <div className="space-y-5">
        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Status */}
        {step === 'status' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--surface-2)' }}>
              <span className="text-2xl">{totpEnabled ? '🔒' : '🔓'}</span>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  {totpEnabled ? 'Enabled' : 'Not enabled'}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                  {totpEnabled
                    ? 'Your account is protected with an authenticator app.'
                    : 'Add a second layer of security to your account.'}
                </p>
              </div>
            </div>
            {totpEnabled ? (
              <button
                onClick={() => {
                  setStep('disable');
                  setError('');
                }}
                className="btn-danger w-full justify-center flex"
              >
                Disable two-factor auth
              </button>
            ) : (
              <button onClick={handleSetup} disabled={loading} className="btn-primary w-full justify-center flex">
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  'Set up two-factor auth'
                )}
              </button>
            )}
          </div>
        )}

        {/* QR code step */}
        {step === 'setup' && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.), then enter
              the 6-digit code below to confirm.
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
              <label className="label" htmlFor="totp-confirm-code">
                Confirmation code
              </label>
              <input
                id="totp-confirm-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className={inputCls}
                placeholder="000000"
                maxLength={6}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- only field on a freshly-shown step
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setStep('status');
                  setError('');
                }}
                className="btn-secondary flex-1 justify-center flex"
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading || confirmCode.length < 6}
                className="btn-primary flex-1 justify-center flex"
              >
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  'Activate'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Backup codes */}
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
                  style={{ background: 'var(--surface-2)', color: 'var(--text)' }}
                >
                  {c}
                </code>
              ))}
            </div>
            <button
              onClick={() => {
                const text = backupCodes.join('\n');
                navigator.clipboard?.writeText(text).catch(() => {});
              }}
              className="btn-secondary w-full justify-center flex text-sm"
            >
              Copy all codes
            </button>
            <button onClick={onClose} className="btn-primary w-full justify-center flex">
              Done
            </button>
          </div>
        )}

        {/* Disable step */}
        {step === 'disable' && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              Enter your current authenticator code (or a backup code) to disable two-factor authentication.
            </p>
            <div>
              <label className="label" htmlFor="totp-disable-code">
                Code
              </label>
              <input
                id="totp-disable-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, 10))}
                className={inputCls}
                placeholder="000000"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- only field on a freshly-shown step
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setStep('status');
                  setError('');
                }}
                className="btn-secondary flex-1 justify-center flex"
              >
                Cancel
              </button>
              <button
                onClick={handleDisable}
                disabled={loading || disableCode.length < 6}
                className="btn-danger flex-1 justify-center flex"
              >
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  'Disable'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
