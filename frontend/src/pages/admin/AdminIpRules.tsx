/**
 * Admin IP Rules panel — two independent scopes:
 *   User rules:  apply to all non-admin users.
 *   Admin rules: apply only to admins/server owners.
 *
 * Each scope has an allowlist and a blocklist that work together:
 *   - Empty allowlist = everyone allowed (no filtering).
 *   - Any allowlist entry = only those IPs are allowed.
 *   - Blocklist entries are always denied, even if on the allowlist.
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import type { IpRule } from './types';

interface IpRestrictions {
  allowlistRules: IpRule[];
  blocklistRules: IpRule[];
  yourIp: string;
}

interface Props {
  showToast: (msg: string, type: 'success' | 'error') => void;
}

function RuleList({
  label,
  description,
  rules,
  onAdd,
  onRemove,
  showToast,
  color,
}: {
  label: string;
  description: string;
  rules: IpRule[];
  onAdd: (cidr: string, desc: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  showToast: (msg: string, type: 'success' | 'error') => void;
  color: string;
}) {
  const [cidr, setCidr] = useState('');
  const [desc, setDesc] = useState('');
  const [adding, setAdding] = useState(false);

  async function add() {
    if (!cidr.trim() || adding) return;
    setAdding(true);
    try {
      await onAdd(cidr.trim(), desc.trim());
      setCidr('');
      setDesc('');
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold" style={{ color }}>
          {label}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
          {description}
        </p>
      </div>
      <div className="flex gap-2">
        <input
          className="input text-sm"
          style={{ width: 180 }}
          placeholder="1.2.3.4 or 10.0.0.0/8"
          value={cidr}
          onChange={(e) => setCidr(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
        />
        <input
          className="input text-sm flex-1"
          placeholder="Description (optional)"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <button disabled={!cidr.trim() || adding} className="btn-primary text-sm px-4 flex-shrink-0" onClick={add}>
          {adding ? '…' : 'Add'}
        </button>
      </div>
      {rules.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          No rules.
        </p>
      ) : (
        <div className="space-y-1">
          {rules.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              <span className="text-sm font-mono" style={{ color: 'var(--text)' }}>
                {r.cidr}
              </span>
              {r.description ? (
                <span className="text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--text-3)' }}>
                  {r.description}
                </span>
              ) : (
                <span className="flex-1" />
              )}
              <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>
                {new Date(r.createdAt).toLocaleDateString()}
              </span>
              <button
                onClick={() => onRemove(r.id).catch((e) => showToast((e as Error).message, 'error'))}
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
  );
}

function IpRulesPanel({
  title,
  description,
  data,
  onAddRule,
  onRemoveRule,
  showToast,
}: {
  title: string;
  description: string;
  data: IpRestrictions | null;
  onAddRule: (cidr: string, listType: 'allowlist' | 'blocklist', desc: string) => Promise<void>;
  onRemoveRule: (id: string) => Promise<void>;
  showToast: (msg: string, type: 'success' | 'error') => void;
}) {
  return (
    <div className="space-y-4">
      <div
        className="p-5 rounded-xl space-y-3"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {title}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
            {description}
          </p>
        </div>
        {data && (
          <div
            className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <span style={{ color: 'var(--text-3)' }}>Your current IP:</span>
            <code className="font-mono font-medium" style={{ color: 'var(--text)' }}>
              {data.yourIp}
            </code>
          </div>
        )}
      </div>

      {data ? (
        <div className="space-y-5">
          <RuleList
            label="Allowed IPs"
            description="Empty = everyone allowed. Add an IP to restrict access to only listed IPs."
            rules={data.allowlistRules}
            onAdd={(cidr, desc) => onAddRule(cidr, 'allowlist', desc)}
            onRemove={onRemoveRule}
            showToast={showToast}
            color="#10b981"
          />
          <RuleList
            label="Blocked IPs"
            description="Always denied — even if the IP is on the allowlist."
            rules={data.blocklistRules}
            onAdd={(cidr, desc) => onAddRule(cidr, 'blocklist', desc)}
            onRemove={onRemoveRule}
            showToast={showToast}
            color="#ef4444"
          />
        </div>
      ) : (
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>
          Loading…
        </p>
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
      setUserIp(u as IpRestrictions);
      setAdminIp(a as IpRestrictions);
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-10 max-w-xl">
      <div>
        <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text)' }}>
          User access
        </h3>
        <IpRulesPanel
          title="IP rules — all users"
          description="Applies to all non-admin users. Admins and server owners are unaffected."
          data={userIp}
          onAddRule={async (cidr, listType, desc) => {
            await api.admin.addIpRule(cidr, listType, desc || undefined);
            await load();
            showToast('Rule added', 'success');
          }}
          onRemoveRule={async (id) => {
            await api.admin.removeIpRule(id);
            await load();
            showToast('Rule removed', 'success');
          }}
          showToast={showToast}
        />
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
        <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text)' }}>
          Admin panel access
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
          Restricts admin and server owner access to{' '}
          <code style={{ background: 'var(--surface)' }} className="px-1 rounded">
            /api/admin/*
          </code>{' '}
          routes. Use this to limit admin actions to specific IPs — for example, your home network or a company IP
          range.
        </p>
        <IpRulesPanel
          title="IP rules — admins only"
          description="Regular users are unaffected by these rules."
          data={adminIp}
          onAddRule={async (cidr, listType, desc) => {
            await api.admin.addAdminIpRule(cidr, listType, desc || undefined);
            await load();
            showToast('Rule added', 'success');
          }}
          onRemoveRule={async (id) => {
            await api.admin.removeAdminIpRule(id);
            await load();
            showToast('Rule removed', 'success');
          }}
          showToast={showToast}
        />
      </div>
    </div>
  );
}
