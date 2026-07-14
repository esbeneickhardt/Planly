/**
 * Admin Users table showing every registered user with their verification status, login-lock state,
 * and admin role.  Only the founding admin sees the Actions column; promoting/demoting/deleting
 * calls onUsersChanged so the parent AdminPage refreshes the shared user list.
 */
import { api } from '../../api/client';
import type { AdminUser } from './types';

interface Props {
  users: AdminUser[];
  isFoundingAdmin: boolean;
  currentUserId: string;
  onUsersChanged: () => Promise<void>;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export default function AdminUsers({
  users, isFoundingAdmin, currentUserId, onUsersChanged, showToast,
}: Props) {
  // Shared error-boundary for mutations so each row button doesn't need try/catch
  async function act(fn: () => Promise<void>) {
    try { await fn(); }
    catch (e) { showToast((e as Error).message, 'error'); }
  }

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
          <th className="text-left py-2 font-medium">User</th>
          <th className="text-left py-2 font-medium">Email</th>
          <th className="text-left py-2 font-medium">Verified</th>
          <th className="text-left py-2 font-medium">Login</th>
          <th className="text-left py-2 font-medium">Joined</th>
          {isFoundingAdmin && <th className="py-2 text-right font-medium pr-1">Actions</th>}
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
            <td className="py-2.5 pr-4">
              <div className="flex items-center gap-1.5">
                {u.isFoundingAdmin && <span title="Server owner">👑</span>}
                {u.isAdmin && !u.isFoundingAdmin && <span title="Admin">🛡️</span>}
                <span className="font-medium" style={{ color: 'var(--text)' }}>{u.username}</span>
              </div>
            </td>
            <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>{u.email}</td>
            <td className="py-2.5 pr-4">
              <div className="flex items-center gap-1.5">
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: u.emailVerified ? '#10b98122' : '#f59e0b22', color: u.emailVerified ? '#10b981' : '#f59e0b' }}>
                  {u.emailVerified ? 'Yes' : 'No'}
                </span>
                {!u.emailVerified && (
                  <button onClick={() => act(async () => { await api.admin.verifyEmail(u.id); await onUsersChanged(); })}
                    className="text-xs underline opacity-60 hover:opacity-100" style={{ color: 'var(--text-3)' }}>
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
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#ef444422', color: '#ef4444' }}>
                        Locked {mins}m
                      </span>
                      <button onClick={() => act(async () => { await api.admin.unlock(u.id); await onUsersChanged(); })}
                        className="text-xs underline opacity-60 hover:opacity-100" style={{ color: 'var(--text-3)' }}>
                        Unlock
                      </button>
                    </div>
                  );
                }
                if (u.failedLoginAttempts > 0) {
                  return <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#f59e0b22', color: '#f59e0b' }}>{u.failedLoginAttempts} fail{u.failedLoginAttempts === 1 ? '' : 's'}</span>;
                }
                return <span className="text-xs" style={{ color: 'var(--text-3)' }}>-</span>;
              })()}
            </td>
            <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
            {isFoundingAdmin && (
              <td className="py-2.5">
                <div className="flex items-center gap-2 justify-end">
                  {u.id === currentUserId ? (
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>You</span>
                  ) : u.isFoundingAdmin ? (
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>Owner</span>
                  ) : u.isAdmin ? (
                    <button onClick={() => { if (!confirm(`Demote ${u.username}?`)) return; act(async () => { await api.admin.demote(u.id); await onUsersChanged(); }); }}
                      className="text-xs px-2 py-1 rounded" style={{ background: '#ef444422', color: '#ef4444' }}>
                      Demote
                    </button>
                  ) : (
                    <button onClick={() => act(async () => { await api.admin.promote(u.id); await onUsersChanged(); })}
                      className="text-xs px-2 py-1 rounded" style={{ background: '#6366f122', color: '#6366f1' }}>
                      Make admin
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
  );
}
