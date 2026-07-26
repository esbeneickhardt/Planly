/**
 * Settings Permissions tab showing a per-member, per-tab access matrix (write / read / none).
 * Owners and co-owners always have write access and cannot be downgraded via this matrix.
 * Three preset buttons apply a bulk level to all regular members; changes are sent as a single
 * PUT to avoid partial-save states.
 */
import { useState, useEffect, useCallback } from 'react';
import { api, displayName } from '../../api/client';
import type { Product, TeamMember } from '../../types';

const FEATURE_TABS = [
  { key: 'kanban', label: 'Kanban' },
  { key: 'backlog', label: 'Tasks' },
  { key: 'canvas', label: 'Plan' },
  { key: 'gantt', label: 'Gantt' },
];

const LEVELS = [
  { value: 'write', label: 'Write', color: '#10b981' },
  { value: 'read', label: 'Read', color: '#f59e0b' },
  { value: 'none', label: 'None', color: '#ef4444' },
];

function RoleBadge({ kind }: { kind: 'owner' | 'co_owner' }) {
  if (kind === 'owner')
    return (
      <span
        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
        style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}
      >
        Owner
      </span>
    );
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
      style={{ background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}
    >
      Co-owner
    </span>
  );
}

interface Props {
  activeProduct: Product;
  members: TeamMember[];
  refreshPerms: () => Promise<void>;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export default function SettingsPermissions({ activeProduct, members, refreshPerms, showToast }: Props) {
  const [matrix, setMatrix] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);

  // Seed the matrix with "write" defaults for all member+tab combos, then overwrite with saved rows
  const initMatrix = useCallback(async () => {
    const rows = await api.permissions.list(activeProduct.id);
    const m: Record<string, Record<string, string>> = {};
    members.forEach(({ userId }) => {
      m[userId] = {};
      FEATURE_TABS.forEach(({ key }) => {
        m[userId]![key] = 'write';
      });
    });
    rows.forEach((r) => {
      const row = m[r.userId];
      if (row) row[r.tab] = r.level;
    });
    setMatrix(m);
  }, [activeProduct.id, members]);

  useEffect(() => {
    initMatrix();
  }, [initMatrix]);

  function setLevel(userId: string, tab: string, level: string) {
    setMatrix((prev) => ({ ...prev, [userId]: { ...prev[userId], [tab]: level } }));
  }

  // Apply a preset to all non-privileged members only; owners/co-owners are always left at write
  function applyPreset(preset: 'open' | 'standard' | 'locked') {
    const levelMap: Record<string, Record<string, string>> = {
      open: { kanban: 'write', backlog: 'write', canvas: 'write', gantt: 'write' },
      standard: { kanban: 'write', backlog: 'write', canvas: 'read', gantt: 'read' },
      locked: { kanban: 'read', backlog: 'read', canvas: 'read', gantt: 'read' },
    };
    const levels = levelMap[preset];
    setMatrix((prev) => {
      const next = { ...prev };
      members.forEach(({ userId, role }) => {
        const isPrivileged = userId === activeProduct.ownerId || role === 'co_owner';
        if (isPrivileged) return;
        next[userId] = { ...next[userId], ...levels };
      });
      return next;
    });
  }

  async function savePermissions() {
    setSaving(true);
    const updates: { userId: string; tab: string; level: string }[] = [];
    Object.entries(matrix).forEach(([userId, tabs]) => {
      Object.entries(tabs).forEach(([tab, level]) => updates.push({ userId, tab, level }));
    });
    try {
      await api.permissions.put(activeProduct.id, updates);
      await refreshPerms();
      showToast('Permissions saved', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
        Tab access
      </h2>
      <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
        Control which tabs each member can view or edit. Settings access is determined by role (owner / co-owner) - it
        cannot be granted via this matrix.
      </p>

      {/* Preset cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {(
          [
            {
              key: 'open',
              label: 'Full Write',
              icon: '🌐',
              desc: 'Write access on every tab',
              detail: 'Kanban · Tasks · Plan · Gantt → Write',
            },
            {
              key: 'standard',
              label: 'Write + Read',
              icon: '🛡️',
              desc: 'Write on Kanban and Tasks, Read on Plan and Gantt',
              detail: 'Kanban · Tasks → Write · Plan · Gantt → Read',
            },
            {
              key: 'locked',
              label: 'Read Only',
              icon: '🔒',
              desc: 'Read access on every tab',
              detail: 'All tabs → Read',
            },
          ] as { key: 'open' | 'standard' | 'locked'; label: string; icon: string; desc: string; detail: string }[]
        ).map(({ key, label, icon, desc, detail }) => (
          <button
            key={key}
            onClick={() => applyPreset(key)}
            className="flex flex-col items-start gap-1.5 p-3.5 rounded-xl text-left transition-all hover:border-[var(--brand)] hover:bg-[var(--brand-subtle)]"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{icon}</span>
              <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {label}
              </span>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              {desc}
            </p>
            <p className="text-[10px] font-mono" style={{ color: 'var(--text-3)', opacity: 0.7 }}>
              {detail}
            </p>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4 mb-4 flex-wrap">
        {LEVELS.map(({ value, label, color }) => (
          <div key={value} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>
              {label}
              {value === 'none' ? ' - hidden' : value === 'read' ? ' - view only' : ' - full access'}
            </span>
          </div>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="overflow-x-auto">
        <div style={{ minWidth: 720 }}>
        <div
          className="flex items-center px-4 py-2.5"
          style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}
        >
          <div
            className="w-44 flex-shrink-0 text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-3)' }}
          >
            Member
          </div>
          {FEATURE_TABS.map(({ key, label }) => (
            <div
              key={key}
              className="flex-1 text-center text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-3)' }}
            >
              {label}
            </div>
          ))}
          <div
            className="flex-1 text-center text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-3)' }}
          >
            Settings
          </div>
        </div>
        {members.length === 0 && (
          <div className="px-4 py-6 text-sm text-center" style={{ color: 'var(--text-3)' }}>
            No members yet.
          </div>
        )}
        {members.map(({ userId, user, role }, idx) => {
          const isProductOwner = userId === activeProduct.ownerId;
          const isPrivileged = isProductOwner || role === 'co_owner';
          return (
            <div
              key={userId}
              className="flex items-center px-4 py-3"
              style={{
                background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div className="w-44 flex-shrink-0 flex items-center gap-2 min-w-0">
                <span className="text-base flex-shrink-0">{user.avatarEmoji ?? '👤'}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm truncate" style={{ color: 'var(--text)' }}>
                      {displayName(user)}
                    </span>
                    {isProductOwner && <RoleBadge kind="owner" />}
                    {!isProductOwner && role === 'co_owner' && <RoleBadge kind="co_owner" />}
                  </div>
                </div>
              </div>
              {FEATURE_TABS.map(({ key }) => {
                const level = matrix[userId]?.[key] ?? 'write';
                return (
                  <div key={key} className="flex-1 flex justify-center">
                    {isPrivileged ? (
                      <span
                        className="text-xs px-2 py-1 rounded-lg font-medium"
                        style={{
                          background: 'rgba(16,185,129,0.12)',
                          color: '#10b981',
                          border: '1px solid rgba(16,185,129,0.3)',
                        }}
                      >
                        Write
                      </span>
                    ) : (
                      <select
                        value={level}
                        onChange={(e) => setLevel(userId, key, e.target.value)}
                        className="text-xs rounded-lg px-2 py-1 font-medium"
                        style={{
                          background:
                            level === 'write'
                              ? 'rgba(16,185,129,0.12)'
                              : level === 'read'
                                ? 'rgba(245,158,11,0.12)'
                                : 'rgba(239,68,68,0.12)',
                          color: level === 'write' ? '#10b981' : level === 'read' ? '#f59e0b' : '#ef4444',
                          border: `1px solid ${level === 'write' ? 'rgba(16,185,129,0.3)' : level === 'read' ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
                          outline: 'none',
                        }}
                      >
                        {LEVELS.map(({ value, label }) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
              <div
                className="flex-1 flex justify-center"
                title={isPrivileged ? 'Access granted by role' : 'Requires co-owner role'}
              >
                {isPrivileged ? (
                  <span
                    className="text-xs px-2 py-1 rounded-lg font-medium"
                    style={{
                      background: 'rgba(16,185,129,0.12)',
                      color: '#10b981',
                      border: '1px solid rgba(16,185,129,0.3)',
                    }}
                  >
                    Write 🔒
                  </span>
                ) : (
                  <span
                    className="text-xs px-2 py-1 rounded-lg font-medium"
                    style={{
                      background: 'rgba(239,68,68,0.08)',
                      color: '#ef4444',
                      border: '1px solid rgba(239,68,68,0.2)',
                    }}
                  >
                    No access 🔒
                  </span>
                )}
              </div>
            </div>
          );
        })}
        </div>
        </div>
      </div>
      <div className="mt-4">
        <button
          onClick={savePermissions}
          disabled={saving}
          className="btn-primary flex justify-center"
          style={{ minWidth: 140 }}
        >
          {saving ? (
            <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            'Save permissions'
          )}
        </button>
      </div>
    </div>
  );
}
