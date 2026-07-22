/**
 * Admin Email panel combining SMTP configuration, access controls (email verification, whitelist,
 * project-creation policy), and announcement settings in one view.
 * On load it fetches email status, the existing config, whitelist entries, and server config in
 * parallel; SMTP credentials are never re-hydrated into the password field after initial save.
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { Toggle } from './AdminComponents';
import type { ServerConfig, EmailStatus } from './types';

interface Props {
  currentUser: { email: string; emailVerified?: boolean } | null;
  refreshUser: () => Promise<void>;
  onUsersChanged: () => Promise<void>;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export default function AdminEmail({ currentUser, refreshUser, onUsersChanged, showToast }: Props) {
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [whitelist, setWhitelist] = useState<{ id: string; pattern: string; type: string; createdAt: string }[]>([]);
  const [smtpForm, setSmtpForm] = useState({ host: '', port: 587, secure: false, user: '', pass: '', from: '' });
  const [smtpDirty, setSmtpDirty] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [showSmtpForm, setShowSmtpForm] = useState(false);
  const [verifyEmailPrompt, setVerifyEmailPrompt] = useState(false);
  const [newPattern, setNewPattern] = useState('');
  const [newDenyPattern, setNewDenyPattern] = useState('');
  const [wlExpanded, setWlExpanded] = useState(false);
  const [blExpanded, setBlExpanded] = useState(false);

  // Load all email-related data in parallel; auto-expand SMTP form when email is not yet configured
  const load = useCallback(async () => {
    try {
      const [status, cfg, wl, scfg] = await Promise.all([
        api.emailStatus.get(),
        api.emailConfig.get(),
        api.admin.whitelist(),
        api.admin.serverConfig(),
      ]);
      setEmailStatus(status);
      setWhitelist(wl);
      setServerConfig(scfg);
      const source = cfg ?? status.config;
      if (source)
        setSmtpForm({
          host: source.host,
          port: source.port,
          secure: source.secure,
          user: source.user,
          pass: '',
          from: source.from,
        });
      setShowSmtpForm(!status.enabled);
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  // Shared error-boundary for toggle mutations
  async function act(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      {/* Status banner */}
      <div
        className="p-4 rounded-xl flex items-center gap-3"
        style={{
          background: emailStatus?.enabled ? 'rgba(16,185,129,0.08)' : 'var(--surface-2)',
          border: `1px solid ${emailStatus?.enabled ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
        }}
      >
        <span className="text-xl">{emailStatus?.enabled ? '✅' : '⚠️'}</span>
        <div className="flex-1">
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            {emailStatus === null ? 'Checking…' : emailStatus.enabled ? 'Email is active' : 'Email not configured'}
          </p>
          {emailStatus?.from && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
              Sending from: <code>{emailStatus.from}</code>
            </p>
          )}
        </div>
        {emailStatus?.enabled && (
          <button
            disabled={testingEmail}
            onClick={() => {
              setTestingEmail(true);
              api.emailStatus
                .test()
                .then(() => showToast('Test email sent - check your inbox', 'success'))
                .catch((e) => showToast((e as Error).message, 'error'))
                .finally(() => setTestingEmail(false));
            }}
            className="btn-secondary text-sm px-3"
          >
            {testingEmail ? '…' : 'Send test'}
          </button>
        )}
      </div>

      {/* SMTP configuration */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ background: 'var(--surface-2)' }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              SMTP configuration
            </p>
            {emailStatus?.enabled && !showSmtpForm && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                {smtpForm.host}:{smtpForm.port} · {smtpForm.user}
              </p>
            )}
          </div>
          <button
            onClick={() => {
              setShowSmtpForm((v) => !v);
              setSmtpDirty(false);
            }}
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
          >
            {showSmtpForm ? 'Cancel' : emailStatus?.enabled ? 'Reconfigure' : 'Configure'}
          </button>
        </div>

        {showSmtpForm && (
          <div
            className="px-5 pb-5 space-y-4"
            style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--border)' }}
          >
            <p className="text-xs pt-4" style={{ color: 'var(--text-3)' }}>
              Server-wide outgoing mail. For Gmail, use an{' '}
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                App Password
              </a>
              .
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>
                  Host
                </label>
                <input
                  className="input w-full text-sm"
                  placeholder="smtp.gmail.com"
                  value={smtpForm.host}
                  onChange={(e) => {
                    setSmtpForm((f) => ({ ...f, host: e.target.value }));
                    setSmtpDirty(true);
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>
                  Port
                </label>
                <input
                  className="input w-full text-sm"
                  type="number"
                  placeholder="587"
                  value={smtpForm.port}
                  onChange={(e) => {
                    setSmtpForm((f) => ({ ...f, port: parseInt(e.target.value) || 587 }));
                    setSmtpDirty(true);
                  }}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>
                  Username
                </label>
                <input
                  className="input w-full text-sm"
                  placeholder="you@gmail.com"
                  value={smtpForm.user}
                  onChange={(e) => {
                    setSmtpForm((f) => ({ ...f, user: e.target.value }));
                    setSmtpDirty(true);
                  }}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>
                  Password
                </label>
                <input
                  className="input w-full text-sm"
                  type="password"
                  placeholder={emailStatus?.enabled ? '•••••••• (leave blank to keep current)' : 'App password'}
                  value={smtpForm.pass}
                  onChange={(e) => {
                    setSmtpForm((f) => ({ ...f, pass: e.target.value }));
                    setSmtpDirty(true);
                  }}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>
                  From address
                </label>
                <input
                  className="input w-full text-sm"
                  placeholder="Planly <you@gmail.com>"
                  value={smtpForm.from}
                  onChange={(e) => {
                    setSmtpForm((f) => ({ ...f, from: e.target.value }));
                    setSmtpDirty(true);
                  }}
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input
                  id="ssl"
                  type="checkbox"
                  checked={smtpForm.secure}
                  onChange={(e) => {
                    setSmtpForm((f) => ({ ...f, secure: e.target.checked }));
                    setSmtpDirty(true);
                  }}
                />
                <label htmlFor="ssl" className="text-xs" style={{ color: 'var(--text-2)' }}>
                  Use SSL (port 465)
                </label>
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                  - leave off for port 587 (STARTTLS), which most providers including Gmail use
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                disabled={savingSmtp || !smtpDirty}
                onClick={() => {
                  setSavingSmtp(true);
                  api.emailConfig
                    .save({ ...smtpForm, ...(smtpForm.pass ? {} : { pass: undefined }) })
                    .then(() => api.emailStatus.get())
                    .then((s) => {
                      setEmailStatus(s);
                      setSmtpDirty(false);
                      setShowSmtpForm(false);
                      showToast('Email configuration saved', 'success');
                    })
                    .catch((e) => showToast((e as Error).message, 'error'))
                    .finally(() => setSavingSmtp(false));
                }}
                className="btn-primary text-sm px-4"
              >
                {savingSmtp ? 'Saving…' : 'Save configuration'}
              </button>
              {emailStatus?.enabled && (
                <button
                  onClick={() => {
                    if (!confirm('Clear SMTP config? Env-var fallback will be used.')) return;
                    api.emailConfig
                      .clear()
                      .then(() => api.emailStatus.get())
                      .then((s) => {
                        setEmailStatus(s);
                        setShowSmtpForm(true);
                      })
                      .catch((e) => showToast((e as Error).message, 'error'));
                  }}
                  className="btn-secondary text-sm px-4"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Access controls */}
      {serverConfig && (
        <div className="space-y-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Access controls
          </p>

          {emailStatus?.enabled ? (
            <>
              <Toggle
                label="Require email verification"
                description="New users must click a verification link before they can sign in."
                value={serverConfig.requireEmailVerification}
                onChange={(v) =>
                  act(async () => {
                    if (v) {
                      const res = await api.admin.updateServerConfig({ requireEmailVerification: true });
                      setServerConfig((c) => (c ? { ...c, requireEmailVerification: true } : c));
                      await refreshUser();
                      await onUsersChanged();
                      const sent = res.verificationEmailsSent ?? 0;
                      showToast(
                        sent > 0
                          ? `Email verification enabled - sent ${sent} verification email${sent === 1 ? '' : 's'}`
                          : 'Email verification enabled - all existing users already verified',
                        'success',
                      );
                      setVerifyEmailPrompt(!currentUser?.emailVerified);
                    } else {
                      await api.admin.updateServerConfig({ requireEmailVerification: false });
                      setServerConfig((c) => (c ? { ...c, requireEmailVerification: false } : c));
                      showToast('Email verification disabled', 'success');
                      setVerifyEmailPrompt(false);
                    }
                  })
                }
              />
              {verifyEmailPrompt && (
                <div
                  className="flex items-start gap-3 px-4 py-3 rounded-xl"
                  style={{ background: '#f59e0b15', border: '1px solid #f59e0b44' }}
                >
                  <span style={{ color: '#f59e0b' }}>⚠</span>
                  <div className="flex-1 text-sm" style={{ color: 'var(--text-2)' }}>
                    <span className="font-medium" style={{ color: 'var(--text)' }}>
                      Verify your email first.
                    </span>{' '}
                    We sent a verification link to <strong>{currentUser?.email}</strong>. Click it, then come back and
                    enable this setting.
                  </div>
                  <button
                    onClick={() => setVerifyEmailPrompt(false)}
                    className="text-xs flex-shrink-0"
                    style={{ color: 'var(--text-3)' }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </>
          ) : (
            <div
              className="px-4 py-3 rounded-xl text-sm"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-3)' }}
            >
              Email not configured - set up SMTP above to enable email verification.
            </div>
          )}

          <Toggle
            label="Enforce email whitelist"
            description="Only addresses or domains on the allowlist can register."
            value={serverConfig.requireWhitelist}
            onChange={(v) =>
              act(async () => {
                await api.admin.updateServerConfig({ requireWhitelist: v });
                setServerConfig((c) => (c ? { ...c, requireWhitelist: v } : c));
                showToast(`Whitelist ${v ? 'enabled' : 'disabled'}`, 'success');
              })
            }
          />
          {serverConfig.requireWhitelist &&
            (() => {
              const entries = whitelist.filter((e) => e.type === 'allow');
              const LIMIT = 5;
              const shown = wlExpanded ? entries : entries.slice(0, LIMIT);
              return (
                <div className="ml-2 pl-3 space-y-2" style={{ borderLeft: '2px solid var(--border)' }}>
                  <div className="flex gap-2">
                    <input
                      className="input flex-1 text-sm"
                      placeholder="@company.com or user@example.com"
                      value={newPattern}
                      onChange={(e) => setNewPattern(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newPattern.trim())
                          act(async () => {
                            await api.admin.addWhitelist(newPattern, 'allow');
                            setNewPattern('');
                            setWhitelist(await api.admin.whitelist());
                          });
                      }}
                    />
                    <button
                      disabled={!newPattern.trim()}
                      className="btn-primary text-sm px-4"
                      onClick={() =>
                        act(async () => {
                          await api.admin.addWhitelist(newPattern, 'allow');
                          setNewPattern('');
                          setWhitelist(await api.admin.whitelist());
                        })
                      }
                    >
                      Add
                    </button>
                  </div>
                  {entries.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      No entries yet — all registrations are blocked while this is empty.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-1">
                        {shown.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between px-3 py-1.5 rounded-lg"
                            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                          >
                            <span className="text-sm font-mono" style={{ color: 'var(--text)' }}>
                              {entry.pattern}
                            </span>
                            <button
                              onClick={() =>
                                act(async () => {
                                  await api.admin.removeWhitelist(entry.id);
                                  setWhitelist(await api.admin.whitelist());
                                })
                              }
                              className="text-xs opacity-50 hover:opacity-100"
                              style={{ color: '#ef4444' }}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                      {entries.length > LIMIT && (
                        <button
                          className="text-xs"
                          style={{ color: 'var(--text-3)' }}
                          onClick={() => setWlExpanded((x) => !x)}
                        >
                          {wlExpanded ? 'Show less' : `Show ${entries.length - LIMIT} more`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

          <Toggle
            label="Enforce email blocklist"
            description="Addresses and domains on the blocklist cannot register."
            value={serverConfig.requireBlocklist}
            onChange={(v) =>
              act(async () => {
                await api.admin.updateServerConfig({ requireBlocklist: v });
                setServerConfig((c) => (c ? { ...c, requireBlocklist: v } : c));
                showToast(`Blocklist ${v ? 'enabled' : 'disabled'}`, 'success');
              })
            }
          />
          {serverConfig.requireBlocklist &&
            (() => {
              const entries = whitelist.filter((e) => e.type === 'deny');
              const LIMIT = 5;
              const shown = blExpanded ? entries : entries.slice(0, LIMIT);
              return (
                <div className="ml-2 pl-3 space-y-2" style={{ borderLeft: '2px solid var(--border)' }}>
                  <div className="flex gap-2">
                    <input
                      className="input flex-1 text-sm"
                      placeholder="@badactor.com or spam@example.com"
                      value={newDenyPattern}
                      onChange={(e) => setNewDenyPattern(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newDenyPattern.trim())
                          act(async () => {
                            await api.admin.addWhitelist(newDenyPattern, 'deny');
                            setNewDenyPattern('');
                            setWhitelist(await api.admin.whitelist());
                          });
                      }}
                    />
                    <button
                      disabled={!newDenyPattern.trim()}
                      className="text-sm px-4 rounded-lg font-medium"
                      style={{
                        background: '#ef444420',
                        color: '#ef4444',
                        border: '1px solid #ef444440',
                        opacity: newDenyPattern.trim() ? 1 : 0.5,
                      }}
                      onClick={() =>
                        act(async () => {
                          await api.admin.addWhitelist(newDenyPattern, 'deny');
                          setNewDenyPattern('');
                          setWhitelist(await api.admin.whitelist());
                        })
                      }
                    >
                      Block
                    </button>
                  </div>
                  {entries.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      No blocked entries yet.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-1">
                        {shown.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between px-3 py-1.5 rounded-lg"
                            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                          >
                            <span className="text-sm font-mono" style={{ color: 'var(--text)' }}>
                              {entry.pattern}
                            </span>
                            <button
                              onClick={() =>
                                act(async () => {
                                  await api.admin.removeWhitelist(entry.id);
                                  setWhitelist(await api.admin.whitelist());
                                })
                              }
                              className="text-xs opacity-50 hover:opacity-100"
                              style={{ color: '#ef4444' }}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                      {entries.length > LIMIT && (
                        <button
                          className="text-xs"
                          style={{ color: 'var(--text-3)' }}
                          onClick={() => setBlExpanded((x) => !x)}
                        >
                          {blExpanded ? 'Show less' : `Show ${entries.length - LIMIT} more`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

          <Toggle
            label="Allow members to create projects"
            description="When off, only admins can create new projects. Admins can always create projects."
            value={serverConfig.allowProjectCreation}
            onChange={(v) =>
              act(async () => {
                await api.admin.updateServerConfig({ allowProjectCreation: v });
                setServerConfig((c) => (c ? { ...c, allowProjectCreation: v } : c));
                showToast(`Project creation ${v ? 'open to all members' : 'restricted to admins'}`, 'success');
              })
            }
          />
        </div>
      )}

      {/* Security */}
      {serverConfig && (
        <div className="space-y-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Security
          </p>
          <Toggle
            label="Require multi-factor authentication"
            description="All users must set up TOTP (authenticator app) before they can access the app. Users without MFA are redirected to the setup page on next login."
            value={serverConfig.requireMfa}
            onChange={(v) =>
              act(async () => {
                await api.admin.updateServerConfig({ requireMfa: v });
                setServerConfig((c) => (c ? { ...c, requireMfa: v } : c));
                showToast(`MFA requirement ${v ? 'enabled' : 'disabled'}`, 'success');
              })
            }
          />
        </div>
      )}

      {/* Announcements */}
      {serverConfig && (
        <div className="space-y-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Announcements
          </p>
          <Toggle
            label="Enable announcement wall"
            description="Show a server-wide announcement wall accessible to all members."
            value={serverConfig.announcementsEnabled}
            onChange={(v) =>
              act(async () => {
                await api.admin.updateServerConfig({ announcementsEnabled: v });
                setServerConfig((c) => (c ? { ...c, announcementsEnabled: v } : c));
                await refreshUser();
                showToast(`Announcement wall ${v ? 'enabled' : 'disabled'}`, 'success');
              })
            }
          />
          {serverConfig.announcementsEnabled && (
            <div
              className="px-4 py-3 rounded-xl space-y-2"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                Who can post announcements?
              </p>
              <div className="flex gap-2">
                {[
                  { value: 'admin', label: 'Admins only' },
                  { value: 'admin_and_owners', label: 'Admins + Project owners' },
                  { value: 'all', label: 'All members' },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() =>
                      act(async () => {
                        await api.admin.updateServerConfig({ announcementPostRole: value });
                        setServerConfig((c) => (c ? { ...c, announcementPostRole: value } : c));
                        showToast(`Posting restricted to ${label.toLowerCase()}`, 'success');
                      })
                    }
                    className="px-3 py-1.5 rounded-lg text-sm transition-colors"
                    style={{
                      background: serverConfig.announcementPostRole === value ? '#6366f1' : 'var(--surface)',
                      color: serverConfig.announcementPostRole === value ? '#fff' : 'var(--text-2)',
                      border: `1px solid ${serverConfig.announcementPostRole === value ? '#6366f1' : 'var(--border)'}`,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
