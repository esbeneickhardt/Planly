/**
 * Admin IP Rules panel — two independent IP restriction systems:
 *   User rules:  gate access to the entire server for all visitors.
 *   Admin rules: gate access to /api/admin/* routes only, regardless of user rules.
 * Both support disabled / allowlist / blocklist modes with CIDR-based rules.
 * Their respective management endpoints are always exempt so a misconfiguration can always be undone.
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import type { IpRule } from './types';

interface IpRestrictions {
  mode: string;
  rules: IpRule[];
  yourIp: string;
}

interface Props {
  showToast: (msg: string, type: 'success' | 'error') => void;
}

// Reusable panel for one set of IP restriction controls
function IpRulesPanel({
  title,
  description,
  data,
  onSetMode,
  onAddRule,
  onRemoveRule,
  showToast,
}: {
  title: string;
  description: string;
  data: IpRestrictions | null;
  onSetMode: (mode: string) => Promise<void>;
  onAddRule: (cidr: string, desc: string) => Promise<void>;
  onRemoveRule: (id: string) => Promise<void>;
  showToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const [newCidr, setNewCidr] = useState('');
  const [newCidrDesc, setNewCidrDesc] = useState('');
  const [adding, setAdding] = useState(false);

  async function act(fn: () => Promise<void>) {
    try { await fn(); }
    catch (e) { showToast((e as Error).message, 'error'); }
  }

  async function addRule() {
    if (!newCidr.trim() || adding) return;
    setAdding(true);
    try {
      await onAddRule(newCidr.trim(), newCidrDesc.trim());
      setNewCidr('');
      setNewCidrDesc('');
    } catch (e) { showToast((e as Error).message, 'error'); }
    finally { setAdding(false); }
  }

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="p-5 rounded-xl space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{description}</p>
        </div>
        {data ? (
          <>
            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-3)' }}>Your current IP:</span>
              <code className="font-mono font-medium" style={{ color: 'var(--text)' }}>{data.yourIp}</code>
            </div>
            <div className="flex gap-2">
              {[
                { value: 'disabled',  label: 'Disabled',  desc: 'No IP filtering' },
                { value: 'allowlist', label: 'Allowlist', desc: 'Block all except listed IPs' },
                { value: 'blocklist', label: 'Blocklist', desc: 'Block only listed IPs' },
              ].map(({ value, label, desc }) => {
                const active = data.mode === value;
                const color = value === 'allowlist' ? '#10b981' : value === 'blocklist' ? '#ef4444' : '#6366f1';
                return (
                  <button
                    key={value}
                    onClick={() => act(async () => { await onSetMode(value); })}
                    className="flex-1 px-3 py-3 rounded-xl text-left transition-colors"
                    style={{ background: active ? `${color}18` : 'var(--surface)', border: `1px solid ${active ? color : 'var(--border)'}` }}
                  >
                    <p className="text-sm font-medium" style={{ color: active ? color : 'var(--text)' }}>{label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{desc}</p>
                  </button>
                );
              })}
            </div>
            {data.mode === 'allowlist' && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg" style={{ background: '#f59e0b12', border: '1px solid #f59e0b33' }}>
                <span style={{ color: '#f59e0b', flexShrink: 0 }}>⚠️</span>
                <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                  <strong>Allowlist mode is active.</strong> Make sure your own IP is in the list before saving, or you will be locked out.
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>Loading…</p>
        )}
      </div>

      {/* Rules list + add form */}
      {data && (
        <div className="space-y-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Rules <span className="text-xs font-normal" style={{ color: 'var(--text-3)' }}>({data.rules.length})</span>
          </p>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            IPv4 CIDR (e.g. <code className="text-xs px-1 rounded" style={{ background: 'var(--surface)' }}>192.168.1.0/24</code>
            ), exact IPv4 (e.g. <code className="text-xs px-1 rounded" style={{ background: 'var(--surface)' }}>1.2.3.4</code>
            ), or an exact IPv6 address.
          </p>
          <div className="flex gap-2">
            <input className="input text-sm" style={{ width: 180 }} placeholder="192.168.0.0/24" value={newCidr}
              onChange={(e) => setNewCidr(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addRule(); }} />
            <input className="input text-sm flex-1" placeholder="Description (optional)" value={newCidrDesc}
              onChange={(e) => setNewCidrDesc(e.target.value)} />
            <button disabled={!newCidr.trim() || adding} className="btn-primary text-sm px-4 flex-shrink-0" onClick={addRule}>
              {adding ? '…' : 'Add'}
            </button>
          </div>
          {data.rules.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              No rules yet.
              {data.mode === 'allowlist' && ' All non-local requests are currently blocked.'}
              {data.mode === 'blocklist' && ' No IPs are currently blocked.'}
            </p>
          ) : (
            <div className="space-y-1">
              {data.rules.map((rule) => (
                <div key={rule.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <span className="text-sm font-mono" style={{ color: 'var(--text)' }}>{rule.cidr}</span>
                  {rule.description
                    ? <span className="text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--text-3)' }}>{rule.description}</span>
                    : <span className="flex-1" />}
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>{new Date(rule.createdAt).toLocaleDateString()}</span>
                  <button onClick={() => act(async () => { await onRemoveRule(rule.id); })}
                    className="text-xs opacity-50 hover:opacity-100 flex-shrink-0" style={{ color: '#ef4444' }}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminIpRules({ showToast }: Props) {
  const [userIp, setUserIp] = useState<IpRestrictions | null>(null);
  const [adminIp, setAdminIp] = useState<IpRestrictions | null>(null);

  const load = useCallback(async () => {
    try {
      const [u, a] = await Promise.all([api.admin.ipRestrictions(), api.admin.adminIpRestrictions()]);
      setUserIp(u);
      setAdminIp(a);
    } catch (e) { showToast((e as Error).message, 'error'); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-10 max-w-xl">

      <div>
        <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text)' }}>User access</h3>
        <IpRulesPanel
          title="IP restriction mode — all visitors"
          description="Controls who can reach the server at all. Applies to every request regardless of whether the visitor is logged in."
          data={userIp}
          onSetMode={async (mode) => { await api.admin.setIpMode(mode); setUserIp((r) => r ? { ...r, mode } : r); showToast(`User IP mode set to ${mode}`, 'success'); }}
          onAddRule={async (cidr, desc) => { await api.admin.addIpRule(cidr, desc || undefined); await load(); showToast('Rule added', 'success'); }}
          onRemoveRule={async (id) => { await api.admin.removeIpRule(id); await load(); showToast('Rule removed', 'success'); }}
          showToast={showToast}
        />
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
        <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text)' }}>Admin panel access</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
          Independent of the user rules above. Restricts who can reach <code style={{ background: 'var(--surface)' }} className="px-1 rounded">/api/admin/*</code> routes — useful for locking down the admin panel to an office IP even when the app is open to the public. The management endpoints for these rules are always accessible so you can never lock yourself out.
        </p>
        <IpRulesPanel
          title="IP restriction mode — admin panel"
          description="Controls which IPs can access admin-only routes. Regular users are unaffected."
          data={adminIp}
          onSetMode={async (mode) => { await api.admin.setAdminIpMode(mode); setAdminIp((r) => r ? { ...r, mode } : r); showToast(`Admin IP mode set to ${mode}`, 'success'); }}
          onAddRule={async (cidr, desc) => { await api.admin.addAdminIpRule(cidr, desc || undefined); await load(); showToast('Rule added', 'success'); }}
          onRemoveRule={async (id) => { await api.admin.removeAdminIpRule(id); await load(); showToast('Rule removed', 'success'); }}
          showToast={showToast}
        />
      </div>

    </div>
  );
}
