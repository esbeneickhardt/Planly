import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import type { ApiToken, AppRegistration } from '../../api/client';
import type { Product } from '../../types';

interface Props {
  activeProduct: Product;
  showToast: (msg: string, type: 'success' | 'error') => void;
  confirm: (msg: string) => Promise<boolean>;
}

export default function SettingsApps({ activeProduct, showToast, confirm }: Props) {
  const [apps, setApps] = useState<AppRegistration[]>([]);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [newAppName, setNewAppName] = useState('');
  const [creatingApp, setCreatingApp] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [appTokens, setAppTokens] = useState<ApiToken[]>([]);
  const [newAppTokenName, setNewAppTokenName] = useState('');
  const [calendarUrl, setCalendarUrl] = useState<string | null>(
    () => localStorage.getItem(`planly-calendar-url-${activeProduct.id}`) ?? null
  );
  const [generatingCalendar, setGeneratingCalendar] = useState(false);

  const loadApps = useCallback(async () => {
    try { setApps(await api.appRegistrations.list()); } catch {}
  }, []);

  useEffect(() => { loadApps(); }, [loadApps]);

  useEffect(() => {
    if (!selectedAppId) { setAppTokens([]); return; }
    api.appRegistrations.listTokens(selectedAppId).then(setAppTokens).catch(() => {});
  }, [selectedAppId]);

  return (
    <div className="max-w-2xl space-y-10">

      {/* ── App registrations ── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>App registrations</h2>
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg font-medium flex-shrink-0 transition-colors text-[var(--text-2)] border-[var(--border)] hover:text-[var(--brand)] hover:border-[var(--brand)]"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            API docs ↗
          </a>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
          Create named apps (bots, integrations, CI pipelines) and issue tokens for each.
          App tokens act with your permissions. Useful for separating automation from personal access.
        </p>

        {/* Create app form */}
        <div className="flex gap-3 mb-4">
          <input
            type="text"
            value={newAppName}
            onChange={(e) => setNewAppName(e.target.value)}
            placeholder="App name (e.g. Slack bot)"
            className="input text-sm flex-1"
          />
          <button
            disabled={!newAppName.trim() || creatingApp}
            className="btn-primary text-sm flex-shrink-0"
            onClick={async () => {
              setCreatingApp(true);
              try {
                await api.appRegistrations.create({ name: newAppName.trim() });
                setNewAppName(''); await loadApps();
              } catch (err) { showToast((err as Error).message, 'error'); }
              finally { setCreatingApp(false); }
            }}
          >
            {creatingApp ? '…' : 'Create app'}
          </button>
        </div>

        {/* One-time reveal */}
        {revealedToken && (
          <div className="p-4 rounded-xl mb-4" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)' }}>
            <p className="text-xs font-semibold mb-2" style={{ color: '#10b981' }}>Copy this token now - it will not be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs break-all px-3 py-2 rounded-lg" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                {revealedToken}
              </code>
              <button className="btn-secondary text-xs flex-shrink-0" onClick={() => { navigator.clipboard.writeText(revealedToken); showToast('Copied!', 'success'); }}>Copy</button>
              <button className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }} onClick={() => setRevealedToken(null)}>Dismiss</button>
            </div>
          </div>
        )}

        {/* App list */}
        {apps.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>No apps registered yet.</p>
        ) : (
          <div className="space-y-3">
            {apps.map((app) => (
              <div key={app.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  style={{ background: selectedAppId === app.id ? 'var(--brand-subtle)' : 'var(--surface-2)' }}
                  onClick={() => setSelectedAppId(selectedAppId === app.id ? null : app.id)}
                >
                  <span className="text-lg flex-shrink-0">🤖</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{app.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>Created {new Date(app.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>{selectedAppId === app.id ? '▲' : '▼'}</span>
                  <button
                    className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0"
                    style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!await confirm(`Delete app "${app.name}" and all its tokens?`)) return;
                      try { await api.appRegistrations.delete(app.id); await loadApps(); showToast('App deleted', 'success'); }
                      catch (err) { showToast((err as Error).message, 'error'); }
                    }}
                  >Delete</button>
                </div>

                {selectedAppId === app.id && (
                  <div className="px-4 pb-4 pt-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                    <div className="flex gap-3 mb-3">
                      <input
                        type="text"
                        value={newAppTokenName}
                        onChange={(e) => setNewAppTokenName(e.target.value)}
                        placeholder="Token name"
                        className="input text-sm flex-1"
                      />
                      <button
                        disabled={!newAppTokenName.trim()}
                        className="btn-primary text-sm flex-shrink-0"
                        onClick={async () => {
                          try {
                            const t = await api.appRegistrations.createToken(app.id, { name: newAppTokenName.trim() });
                            setRevealedToken(t.token ?? null);
                            setNewAppTokenName('');
                            setAppTokens(await api.appRegistrations.listTokens(app.id));
                          } catch (err) { showToast((err as Error).message, 'error'); }
                        }}
                      >Issue token</button>
                    </div>
                    {appTokens.length === 0 ? (
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>No tokens yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {appTokens.map((t) => (
                          <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                            <span className="text-sm flex-shrink-0">🔑</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{t.name}</p>
                              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                                {t.lastUsedAt ? `Last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : 'Never used'}
                                {t.expiresAt && ` · Expires ${new Date(t.expiresAt).toLocaleDateString()}`}
                              </p>
                            </div>
                            <button
                              className="text-[10px] px-2 py-0.5 rounded flex-shrink-0"
                              style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
                              onClick={async () => {
                                if (!await confirm(`Revoke "${t.name}"?`)) return;
                                try {
                                  await api.appRegistrations.deleteToken(app.id, t.id);
                                  setAppTokens((prev) => prev.filter((x) => x.id !== t.id));
                                  showToast('Token revoked', 'success');
                                } catch (err) { showToast((err as Error).message, 'error'); }
                              }}
                            >Revoke</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 p-4 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-2)' }}>Using app tokens</p>
          <p className="text-xs mb-2" style={{ color: 'var(--text-3)' }}>Pass the token in the Authorization header. For personal access tokens, use the <strong>Integrations</strong> option in the account menu.</p>
          <code className="block text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            Authorization: Bearer planly_…
          </code>
        </div>
      </div>

      {/* ── Calendar Feed ── */}
      <div>
        <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Calendar feed (iCal)</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
          Subscribe to project deadlines, milestones, and sprints in any calendar app — Google Calendar, Apple Calendar, Outlook, etc.
          The URL contains a private token; keep it secret and regenerate if compromised.
        </p>

        {calendarUrl ? (
          <div className="p-4 rounded-xl space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Your calendar URL</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] break-all px-3 py-2 rounded-lg" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                {calendarUrl}
              </code>
              <button
                className="btn-secondary text-xs flex-shrink-0"
                onClick={() => { navigator.clipboard.writeText(calendarUrl); showToast('Copied!', 'success'); }}
              >Copy</button>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
              Paste this URL as a "Calendar subscription" in your calendar app. It will auto-refresh with the latest milestones and sprints.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                disabled={generatingCalendar}
                className="text-xs px-3 py-1.5 rounded-lg transition-colors text-[var(--text-3)] border-[var(--border)] hover:text-[var(--brand)] hover:border-[var(--brand)]"
                style={{ border: '1px solid var(--border)' }}
                onClick={async () => {
                  if (!await confirm('Regenerating will invalidate the current URL. Continue?')) return;
                  setGeneratingCalendar(true);
                  try {
                    const { token } = await api.calendar.generateToken(activeProduct.id);
                    const url = api.calendar.feedUrl(activeProduct.id, token);
                    localStorage.setItem(`planly-calendar-url-${activeProduct.id}`, url);
                    setCalendarUrl(url);
                    showToast('Calendar URL regenerated', 'success');
                  } catch (err) { showToast((err as Error).message, 'error'); }
                  finally { setGeneratingCalendar(false); }
                }}
              >Regenerate</button>
              <button
                className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
                onClick={async () => {
                  if (!await confirm('Revoke calendar URL? Your calendar app will stop syncing.')) return;
                  try {
                    await api.calendar.revokeToken(activeProduct.id);
                    localStorage.removeItem(`planly-calendar-url-${activeProduct.id}`);
                    setCalendarUrl(null);
                    showToast('Calendar URL revoked', 'success');
                  } catch (err) { showToast((err as Error).message, 'error'); }
                }}
              >Revoke</button>
            </div>
          </div>
        ) : (
          <button
            disabled={generatingCalendar}
            className="btn-secondary text-sm flex items-center gap-2"
            onClick={async () => {
              setGeneratingCalendar(true);
              try {
                const { token } = await api.calendar.generateToken(activeProduct.id);
                const url = api.calendar.feedUrl(activeProduct.id, token);
                localStorage.setItem(`planly-calendar-url-${activeProduct.id}`, url);
                setCalendarUrl(url);
                showToast('Calendar URL generated — copy it now!', 'success');
              } catch (err) { showToast((err as Error).message, 'error'); }
              finally { setGeneratingCalendar(false); }
            }}
          >
            {generatingCalendar ? <span className="inline-block w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin" /> : '📅'}
            Generate calendar URL
          </button>
        )}
      </div>

    </div>
  );
}
