import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useConfirm } from '../../context/ConfirmContext';
import type { ApiToken } from '../../api/client';
import Modal from './Modal';

type PermissionRow = Awaited<ReturnType<typeof api.me.permissions>>[number];

interface Props {
  onClose: () => void;
}

export default function IntegrationsModal({ onClose }: Props) {
  const { confirm } = useConfirm();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newExpiry, setNewExpiry] = useState('');
  const [newReadOnly, setNewReadOnly] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'tokens' | 'permissions'>('tokens');
  const [perms, setPerms] = useState<PermissionRow[]>([]);
  const [permsLoading, setPermsLoading] = useState(false);

  useEffect(() => {
    api.apiTokens
      .list()
      .then(setTokens)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== 'permissions' || perms.length > 0) return;
    setPermsLoading(true);
    api.me
      .permissions()
      .then(setPerms)
      .catch(() => {})
      .finally(() => setPermsLoading(false));
  }, [tab]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    setCreating(true);
    try {
      const token = await api.apiTokens.create({
        name: newName.trim(),
        expiresAt: newExpiry || undefined,
        readOnly: newReadOnly,
      });
      setRevealed(token.token ?? null);
      setCopied(false);
      setTokens((prev) => [token, ...prev]);
      setNewName('');
      setNewExpiry('');
      setNewReadOnly(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!(await confirm('Revoke this token? Any integrations using it will stop working.'))) return;
    setRevoking(id);
    try {
      await api.apiTokens.delete(id);
      setTokens((prev) => prev.filter((t) => t.id !== id));
      if (revealed && tokens.find((t) => t.id === id)?.token === revealed) setRevealed(null);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setRevoking(null);
    }
  }

  function copyToken() {
    if (!revealed) return;
    navigator.clipboard.writeText(revealed).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const TABS = [
    { id: 'tokens', label: 'Access Tokens' },
    { id: 'permissions', label: 'My Permissions' },
  ] as const;

  return (
    <Modal title="Integrations" onClose={onClose} width="max-w-lg" mobileFullscreen>
      {/* Header row: tabs + API docs link - items-stretch plus nowrap on every child keeps them
          the same height even if the row gets tight on a narrow phone. */}
      <div className="flex items-stretch gap-3 mb-5">
        <div className="flex gap-1 flex-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap flex-shrink-0"
              style={{
                background: tab === t.id ? 'var(--brand)' : 'var(--surface-2)',
                color: tab === t.id ? 'white' : 'var(--text-3)',
                border: `1px solid ${tab === t.id ? 'var(--brand)' : 'var(--border)'}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <a
          href="/api/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg font-medium flex-shrink-0 whitespace-nowrap transition-colors"
          style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--brand)';
            e.currentTarget.style.borderColor = 'var(--brand)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-2)';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
        >
          API docs ↗
        </a>
      </div>

      {tab === 'permissions' && (
        <div className="space-y-2 mb-2">
          <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>
            Your access level for each project. Owners and co-owners can manage permissions in Settings.
          </p>
          {permsLoading ? (
            <div className="flex justify-center py-6">
              <div
                className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }}
              />
            </div>
          ) : perms.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: 'var(--text-3)' }}>
              No projects found.
            </p>
          ) : (
            perms.map((p) => (
              <div
                key={p.productId}
                className="rounded-xl px-3 py-2.5"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-base">{p.productEmoji ?? '🎯'}</span>
                  <span className="text-sm font-medium flex-1 truncate" style={{ color: 'var(--text)' }}>
                    {p.productName}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold capitalize"
                    style={{
                      background: p.role === 'owner' ? 'var(--brand-subtle)' : 'var(--surface)',
                      color: p.role === 'owner' ? 'var(--brand)' : 'var(--text-3)',
                      border: `1px solid ${p.role === 'owner' ? 'var(--brand)' : 'var(--border)'}`,
                    }}
                  >
                    {p.role.replace('_', ' ')}
                  </span>
                </div>
                {Object.keys(p.permissions).length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(p.permissions).map(([permTab, level]) => (
                      <span
                        key={permTab}
                        className="text-[11px] px-2 py-0.5 rounded-full"
                        style={{
                          background: level === 'write' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                          color: level === 'write' ? '#10b981' : '#f59e0b',
                          border: `1px solid ${level === 'write' ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`,
                        }}
                      >
                        {permTab}: {level}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                    Full access (no restrictions set)
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'tokens' && (
        <>
          <p className="text-xs mb-5" style={{ color: 'var(--text-3)' }}>
            Personal Access Tokens let you authenticate with the Planly API from scripts, CI pipelines, or third-party
            tools. Tokens are only shown once - copy and store them safely.
          </p>

          {/* Revealed token banner */}
          {revealed && (
            <div
              className="mb-5 rounded-xl p-3 space-y-2"
              style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}
            >
              <p className="text-xs font-semibold" style={{ color: '#10b981' }}>
                Token created - copy it now, it won't be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 text-xs font-mono px-2 py-1.5 rounded-lg break-all"
                  style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                >
                  {revealed}
                </code>
                <button
                  onClick={copyToken}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium flex-shrink-0 transition-colors"
                  style={{
                    background: copied ? 'rgba(16,185,129,0.15)' : 'var(--brand)',
                    color: copied ? '#10b981' : 'white',
                  }}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <button onClick={() => setRevealed(null)} className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                Dismiss
              </button>
            </div>
          )}

          {/* Create form */}
          <form onSubmit={handleCreate} className="mb-5 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
              New token
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Token name (e.g. CI pipeline)"
                className="input text-sm flex-1"
                required
              />
              <input
                type="date"
                value={newExpiry}
                onChange={(e) => setNewExpiry(e.target.value)}
                className="input text-sm w-36"
                title="Expiry date (optional)"
              />
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="btn-primary text-sm px-4 flex-shrink-0 flex items-center gap-1"
              >
                {creating ? (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : null}
                Generate
              </button>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
              <input
                type="checkbox"
                checked={newReadOnly}
                onChange={(e) => setNewReadOnly(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                Read-only (GET requests only — cannot create, update, or delete)
              </span>
            </label>
            {error && (
              <p className="text-xs" style={{ color: '#ef4444' }}>
                {error}
              </p>
            )}
          </form>

          {/* Token list */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
              Active tokens {tokens.length > 0 && `(${tokens.length})`}
            </p>
            {loading ? (
              <div className="flex justify-center py-6">
                <div
                  className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }}
                />
              </div>
            ) : tokens.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: 'var(--text-3)' }}>
                No tokens yet.
              </p>
            ) : (
              tokens.map((t) => {
                const expired = t.expiresAt && new Date(t.expiresAt) < new Date();
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                    style={{
                      background: 'var(--surface-2)',
                      border: `1px solid ${expired ? 'rgba(239,68,68,0.25)' : 'var(--border)'}`,
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                          {t.name}
                        </p>
                        {t.readOnly && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{
                              background: 'rgba(99,102,241,0.1)',
                              color: '#818cf8',
                              border: '1px solid rgba(99,102,241,0.2)',
                            }}
                          >
                            Read-only
                          </span>
                        )}
                        {expired && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{
                              background: 'rgba(239,68,68,0.1)',
                              color: '#ef4444',
                              border: '1px solid rgba(239,68,68,0.2)',
                            }}
                          >
                            Expired
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                        Created{' '}
                        {new Date(t.createdAt).toLocaleDateString('en', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                        {t.lastUsedAt &&
                          ` · Last used ${new Date(t.lastUsedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`}
                        {t.expiresAt &&
                          ` · Expires ${new Date(t.expiresAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRevoke(t.id)}
                      disabled={revoking === t.id}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium flex-shrink-0 transition-colors"
                      style={{
                        background: 'var(--surface)',
                        color: 'var(--text-3)',
                        border: '1px solid var(--border)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                    >
                      {revoking === t.id ? '…' : 'Revoke'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
