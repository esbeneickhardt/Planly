/**
 * Admin Users table showing every registered user with their verification status, login-lock state,
 * and admin role.  Only the founding admin sees the Actions column; promoting/demoting/deleting
 * calls onUsersChanged so the parent AdminPage refreshes the shared user list.
 */
import { useState } from 'react';
import { api } from '../../api/client';
import StatusPill from '../../components/common/StatusPill';
import { CrownIcon, ShieldIcon } from '../../components/common/TopBarIcons';
import type { AdminUser } from './types';

interface Props {
  users: AdminUser[];
  isFoundingAdmin: boolean;
  currentUserId: string;
  onUsersChanged: () => Promise<void>;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export default function AdminUsers({ users, isFoundingAdmin, currentUserId, onUsersChanged, showToast }: Props) {
  // Stores a temporary password to display once after an admin reset
  const [tempPassDisplay, setTempPassDisplay] = useState<{
    userId: string;
    password: string;
  } | null>(null);

  // Shared error-boundary for mutations so each row button doesn't need try/catch
  async function act(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse" style={{ minWidth: 640 }}>
        <thead>
          <tr
            style={{
              color: 'var(--text-3)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <th className="text-left py-2 font-medium">User</th>
            <th className="text-left py-2 font-medium">Email</th>
            <th className="text-left py-2 font-medium">Verified</th>
            <th className="text-left py-2 font-medium">Activity</th>
            <th className="text-left py-2 font-medium">Joined</th>
            {isFoundingAdmin && <th className="py-2 text-right font-medium pr-1">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td className="py-2.5 pr-4">
                <div className="flex items-center gap-1.5">
                  {u.isFoundingAdmin && (
                    <span title="Server owner" style={{ color: '#f59e0b' }}>
                      <CrownIcon size={14} />
                    </span>
                  )}
                  {u.isAdmin && !u.isFoundingAdmin && (
                    <span title="Admin" style={{ color: '#6366f1' }}>
                      <ShieldIcon size={14} />
                    </span>
                  )}
                  <span className="font-medium whitespace-nowrap" style={{ color: 'var(--text)' }}>
                    {u.username}
                  </span>
                </div>
              </td>
              <td className="py-2.5 pr-4 text-xs whitespace-nowrap" style={{ color: 'var(--text-3)' }}>
                {u.email}
              </td>
              <td className="py-2.5 pr-4">
                <div className="flex items-center gap-1.5">
                  <StatusPill tone={u.emailVerified ? 'success' : 'warning'} size="sm">
                    {u.emailVerified ? 'Yes' : 'No'}
                  </StatusPill>
                  {!u.emailVerified && (
                    <button
                      onClick={() =>
                        act(async () => {
                          await api.admin.verifyEmail(u.id);
                          await onUsersChanged();
                        })
                      }
                      className="text-xs underline opacity-60 hover:opacity-100"
                      style={{ color: 'var(--text-3)' }}
                    >
                      Force verify
                    </button>
                  )}
                </div>
              </td>
              <td className="py-2.5 pr-4">
                {(() => {
                  const locked = u.loginLockedUntil && new Date(u.loginLockedUntil) > new Date();
                  if (locked) {
                    const mins = Math.ceil((new Date(u.loginLockedUntil!).getTime() - Date.now()) / 60000);
                    return (
                      <div className="flex items-center gap-1.5">
                        <StatusPill tone="danger" size="sm" className="whitespace-nowrap">
                          Locked {mins}m
                        </StatusPill>
                        <button
                          onClick={() =>
                            act(async () => {
                              await api.admin.unlock(u.id);
                              await onUsersChanged();
                            })
                          }
                          className="text-xs underline opacity-60 hover:opacity-100"
                          style={{ color: 'var(--text-3)' }}
                        >
                          Unlock
                        </button>
                      </div>
                    );
                  }
                  if (u.failedLoginAttempts > 0) {
                    return (
                      <StatusPill tone="warning" size="sm" className="whitespace-nowrap">
                        {u.failedLoginAttempts} fail
                        {u.failedLoginAttempts === 1 ? '' : 's'}
                      </StatusPill>
                    );
                  }
                  if (u.lastActiveAt) {
                    const ms = Date.now() - new Date(u.lastActiveAt).getTime();
                    const days = Math.floor(ms / 86400000);
                    const hours = Math.floor(ms / 3600000);
                    const mins2 = Math.floor(ms / 60000);
                    // Last activity (not just last login) is tracked on every authenticated
                    // request, so a genuinely stale user is a much more reliable "days" cutoff
                    // than the old session-length heuristic.
                    const active = days < 7;
                    const label = mins2 < 60 ? `${mins2}m ago` : hours < 24 ? `${hours}h ago` : `${days}d ago`;
                    return (
                      <StatusPill
                        tone={active ? 'success' : 'neutral'}
                        size="sm"
                        className="whitespace-nowrap"
                        title={new Date(u.lastActiveAt).toLocaleString()}
                      >
                        {label}
                      </StatusPill>
                    );
                  }
                  return (
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                      Never
                    </span>
                  );
                })()}
              </td>
              <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>
                {new Date(u.createdAt).toLocaleDateString()}
              </td>
              {isFoundingAdmin && (
                <td className="py-2.5">
                  <div className="flex items-center gap-2 justify-end">
                    {u.id === currentUserId ? (
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                        You
                      </span>
                    ) : u.isFoundingAdmin ? (
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                        Owner
                      </span>
                    ) : u.isAdmin ? (
                      <button
                        onClick={() => {
                          if (!confirm(`Demote ${u.username}?`)) return;
                          act(async () => {
                            await api.admin.demote(u.id);
                            await onUsersChanged();
                          });
                        }}
                        className="text-xs px-2 py-1 rounded"
                        style={{ background: '#ef444422', color: '#ef4444' }}
                      >
                        Demote
                      </button>
                    ) : (
                      <button
                        onClick={() =>
                          act(async () => {
                            await api.admin.promote(u.id);
                            await onUsersChanged();
                          })
                        }
                        className="text-xs px-2 py-1 rounded"
                        style={{ background: '#6366f122', color: '#6366f1' }}
                      >
                        Make admin
                      </button>
                    )}
                    {u.id !== currentUserId && (
                      <button
                        onClick={() =>
                          act(async () => {
                            await api.admin.forceLogout(u.id);
                            showToast(`${u.username} logged out`, 'success');
                          })
                        }
                        className="text-xs px-2 py-1 rounded opacity-60 hover:opacity-100"
                        style={{ background: '#f59e0b15', color: '#f59e0b' }}
                        title="Immediately invalidate all active sessions"
                      >
                        Force logout
                      </button>
                    )}
                    {u.id !== currentUserId && !u.isFoundingAdmin && (
                      <button
                        onClick={() =>
                          act(async () => {
                            const res = await api.admin.resetPassword(u.id);
                            try {
                              await navigator.clipboard.writeText(res.tempPassword);
                            } catch {
                              /* ignore */
                            }
                            setTempPassDisplay({
                              userId: u.id,
                              password: res.tempPassword,
                            });
                          })
                        }
                        className="text-xs px-2 py-1 rounded opacity-60 hover:opacity-100 whitespace-nowrap"
                        style={{ background: '#10b98115', color: '#10b981' }}
                        title="Generate a temporary password and copy it to clipboard"
                      >
                        Reset pw
                      </button>
                    )}
                    {tempPassDisplay?.userId === u.id && (
                      <button
                        className="text-xs px-2 py-1 rounded font-mono"
                        style={{ background: '#10b98122', color: '#10b981' }}
                        title="Click to copy again"
                        onClick={() => {
                          navigator.clipboard.writeText(tempPassDisplay.password).catch(() => {});
                          showToast('Password copied', 'success');
                        }}
                      >
                        {tempPassDisplay.password}
                      </button>
                    )}
                    {u.id !== currentUserId && !u.isFoundingAdmin && (
                      <button
                        onClick={() => {
                          if (!confirm(`Permanently delete ${u.username}? This cannot be undone.`)) return;
                          act(async () => {
                            await api.admin.deleteUser(u.id);
                            await onUsersChanged();
                            showToast(`${u.username} deleted`, 'success');
                          });
                        }}
                        className="text-xs px-2 py-1 rounded opacity-60 hover:opacity-100"
                        style={{ background: '#ef444415', color: '#ef4444' }}
                        title="Delete user"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
