/**
 * Settings Permissions tab showing a per-member, per-tab access matrix (write / read / none).
 * Owners and co-owners always have write access and cannot be downgraded via this matrix.
 * Changes autosave: each edit schedules a single debounced PUT of the whole matrix (still one
 * request, avoiding partial-save states) instead of requiring an explicit "Save" click.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { api, displayName } from '../../api/client';
import type { Product, TeamMember } from '../../types';
import StatusPill from '../../components/common/StatusPill';
import RoleBadge from '../../components/common/RoleBadge';
import SaveStatus from '../../components/common/SaveStatus';

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

interface Props {
  activeProduct: Product;
  members: TeamMember[];
  refreshPerms: () => Promise<void>;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export default function SettingsPermissions({ activeProduct, members, refreshPerms, showToast }: Props) {
  const [matrix, setMatrix] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedIndicatorRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Clear pending timers on unmount so a stray save/indicator doesn't fire after navigating away
  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savedIndicatorRef.current) clearTimeout(savedIndicatorRef.current);
    },
    [],
  );

  async function savePermissions(m: Record<string, Record<string, string>>) {
    setSaving(true);
    const updates: { userId: string; tab: string; level: string }[] = [];
    Object.entries(m).forEach(([userId, tabs]) => {
      Object.entries(tabs).forEach(([tab, level]) => updates.push({ userId, tab, level }));
    });
    try {
      await api.permissions.put(activeProduct.id, updates);
      await refreshPerms();
      setJustSaved(true);
      if (savedIndicatorRef.current) clearTimeout(savedIndicatorRef.current);
      savedIndicatorRef.current = setTimeout(() => setJustSaved(false), 2000);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // Only ever called from a user edit below (never on initial load), so debouncing here can't
  // race the seed-from-server matrix set in initMatrix.
  function setLevel(userId: string, tab: string, level: string) {
    setMatrix((prev) => {
      const next = { ...prev, [userId]: { ...prev[userId], [tab]: level } };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => savePermissions(next), 800);
      return next;
    });
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
                      <StatusPill tone="success">Write</StatusPill>
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
                  <StatusPill tone="success">Write 🔒</StatusPill>
                ) : (
                  <StatusPill tone="danger">No access 🔒</StatusPill>
                )}
              </div>
            </div>
          );
        })}
        </div>
        </div>
      </div>
      <div className="mt-4">
        <SaveStatus saving={saving} saved={justSaved} />
      </div>
    </div>
  );
}
