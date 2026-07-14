/**
 * Admin IP Rules panel for configuring server-level IP access control in one of three modes:
 * disabled, allowlist (block all except listed CIDRs), or blocklist (block only listed CIDRs).
 * The admin IP-settings endpoint is always accessible so a misconfiguration can always be undone.
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

export default function AdminIpRules({ showToast }: Props) {
  const [ipRestrictions, setIpRestrictions] = useState<IpRestrictions | null>(null);
  const [newCidr, setNewCidr] = useState('');
  const [newCidrDesc, setNewCidrDesc] = useState('');
  const [addingIpRule, setAddingIpRule] = useState(false);

  const load = useCallback(async () => {
    try { setIpRestrictions(await api.admin.ipRestrictions()); }
    catch (e) { showToast((e as Error).message, 'error'); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  // Shared error-boundary for mode-switch and remove mutations
  async function act(fn: () => Promise<void>) {
    try { await fn(); }
    catch (e) { showToast((e as Error).message, 'error'); }
  }

  // Add a new CIDR rule; guards against double-submission with addingIpRule flag
  async function addRule() {
    if (!newCidr.trim() || addingIpRule) return;
    setAddingIpRule(true);
    try {
      await api.admin.addIpRule(newCidr.trim(), newCidrDesc.trim() || undefined);
      setNewCidr('');
      setNewCidrDesc('');
      await load();
      showToast('Rule added', 'success');
    } catch (e) { showToast((e as Error).message, 'error'); }
    finally { setAddingIpRule(false); }
  }

  return (
    <div className="space-y-6 max-w-xl">

      {/* Mode selector */}
      <div className="p-5 rounded-xl space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>IP restriction mode</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
            Controls who can access this server based on IP address. The admin IP settings endpoint is always accessible regardless of mode, so you can always recover from a misconfiguration.
          </p>
        </div>
        {ipRestrictions ? (
          <>
            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-3)' }}>Your current IP:</span>
              <code className="font-mono font-medium" style={{ color: 'var(--text)' }}>{ipRestrictions.yourIp}</code>
            </div>
            <div className="flex gap-2">
              {[
                { value: 'disabled',  label: 'Disabled',   desc: 'No IP filtering' },
                { value: 'allowlist', label: 'Allowlist',  desc: 'Block all except listed IPs' },
                { value: 'blocklist', label: 'Blocklist',  desc: 'Block only listed IPs' },
              ].map(({ value, label, desc }) => {
                const active = ipRestrictions.mode === value;
                const color = value === 'allowlist' ? '#10b981' : value === 'blocklist' ? '#ef4444' : '#6366f1';
                return (
                  <button
                    key={value}
                    onClick={() => act(async () => {
                      await api.admin.setIpMode(value);
                      setIpRestrictions((r) => r ? { ...r, mode: value } : r);
                      showToast(`IP mode set to ${label.toLowerCase()}`, 'success');
                    })}
                    className="flex-1 px-3 py-3 rounded-xl text-left transition-colors"
                    style={{
                      background: active ? `${color}18` : 'var(--surface)',
                      border: `1px solid ${active ? color : 'var(--border)'}`,
                    }}
                  >
                    <p className="text-sm font-medium" style={{ color: active ? color : 'var(--text)' }}>{label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{desc}</p>
                  </button>
                );
              })}
            </div>
            {ipRestrictions.mode === 'allowlist' && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg" style={{ background: '#f59e0b12', border: '1px solid #f59e0b33' }}>
                <span style={{ color: '#f59e0b', flexShrink: 0 }}>⚠️</span>
                <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                  <strong>Allowlist mode is active.</strong> Only IPs matching a rule below can reach the server. Make sure your own IP is in the list.
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>Loading…</p>
        )}
      </div>

      {/* Rules */}
      {ipRestrictions && (
        <div className="space-y-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Rules{' '}
            <span className="text-xs font-normal" style={{ color: 'var(--text-3)' }}>({ipRestrictions.rules.length})</span>
          </p>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            IPv4 CIDR (e.g.{' '}
            <code className="text-xs px-1 rounded" style={{ background: 'var(--surface)' }}>192.168.1.0/24</code>
            ), exact IPv4 (e.g.{' '}
            <code className="text-xs px-1 rounded" style={{ background: 'var(--surface)' }}>1.2.3.4</code>
            ), or an exact IPv6 address.
          </p>

          <div className="flex gap-2">
            <input
              className="input text-sm"
              style={{ width: 180 }}
              placeholder="192.168.0.0/24"
              value={newCidr}
              onChange={(e) => setNewCidr(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addRule(); }}
            />
            <input
              className="input text-sm flex-1"
              placeholder="Description (optional)"
              value={newCidrDesc}
              onChange={(e) => setNewCidrDesc(e.target.value)}
            />
            <button
              disabled={!newCidr.trim() || addingIpRule}
              className="btn-primary text-sm px-4 flex-shrink-0"
              onClick={addRule}
            >
              {addingIpRule ? '…' : 'Add'}
            </button>
          </div>

          {ipRestrictions.rules.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              No rules yet.
              {ipRestrictions.mode === 'allowlist' && ' All non-local requests are currently blocked.'}
              {ipRestrictions.mode === 'blocklist' && ' No IPs are currently blocked.'}
            </p>
          ) : (
            <div className="space-y-1">
              {ipRestrictions.rules.map((rule) => (
                <div key={rule.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <span className="text-sm font-mono" style={{ color: 'var(--text)' }}>{rule.cidr}</span>
                  {rule.description && (
                    <span className="text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--text-3)' }}>{rule.description}</span>
                  )}
                  {!rule.description && <span className="flex-1" />}
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>
                    {new Date(rule.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => act(async () => {
                      await api.admin.removeIpRule(rule.id);
                      await load();
                      showToast('Rule removed', 'success');
                    })}
                    className="text-xs opacity-50 hover:opacity-100 flex-shrink-0"
                    style={{ color: '#ef4444' }}
                  >
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
