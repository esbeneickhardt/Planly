/**
 * Admin Ownership panel displaying the current server owner and all admins, with a crown-transfer
 * form visible only to the founding admin.  Transferring ownership demotes the current owner
 * to a regular admin while promoting the chosen target to the protected founding-admin seat.
 */
import { useState } from 'react';
import { api } from '../../api/client';
import AdminUserDetailModal from './AdminUserDetailModal';
import { CrownIcon, ShieldIcon } from '../../components/common/TopBarIcons';
import type { AdminUser } from './types';

interface Props {
  users: AdminUser[];
  isFoundingAdmin: boolean;
  currentUserId: string;
  onUsersChanged: () => Promise<void>;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export default function AdminOwnership({ users, isFoundingAdmin, currentUserId, onUsersChanged, showToast }: Props) {
  const [transferTarget, setTransferTarget] = useState('');
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  // Only other admins are valid transfer targets; non-admins must be promoted first
  const otherAdmins = users.filter((u) => u.isAdmin && u.id !== currentUserId);

  return (
    <div className="space-y-6 max-w-xl">
      <div
        className="p-5 rounded-xl space-y-3"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Server owner
        </p>
        {users
          .filter((u) => u.isFoundingAdmin)
          .map((u) => (
            <div key={u.id} className="flex items-center gap-3">
              <span style={{ color: '#f59e0b' }}>
                <CrownIcon size={20} />
              </span>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  {u.username}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                  {u.email}
                </p>
              </div>
            </div>
          ))}
        <p className="text-xs pt-1" style={{ color: 'var(--text-3)' }}>
          The server owner can demote other admins and transfer ownership. This seat cannot be demoted by anyone else.
        </p>
      </div>

      <div
        className="p-5 rounded-xl space-y-2"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Server admins
        </p>
        {users
          .filter((u) => u.isAdmin)
          .map((u) => (
            <button
              key={u.id}
              onClick={() => setDetailUser(u)}
              className="flex items-center gap-2 py-1.5 w-full text-left rounded-lg transition-colors hover:bg-[var(--surface)]"
            >
              <span className="flex-shrink-0" style={{ color: u.isFoundingAdmin ? '#f59e0b' : '#6366f1' }}>
                {u.isFoundingAdmin ? <CrownIcon size={16} /> : <ShieldIcon size={16} />}
              </span>
              <span className="text-sm flex-1 min-w-0 truncate font-medium" style={{ color: 'var(--text)' }}>
                {u.username}
              </span>
              <span
                className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium"
                style={{
                  background: u.isFoundingAdmin ? '#f59e0b22' : '#6366f122',
                  color: u.isFoundingAdmin ? '#f59e0b' : '#6366f1',
                }}
              >
                {u.isFoundingAdmin ? 'Owner' : 'Admin'}
              </span>
            </button>
          ))}
        {users.filter((u) => u.isAdmin).length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>
            No admins yet.
          </p>
        )}
      </div>

      {isFoundingAdmin && (
        <div
          className="p-5 rounded-xl space-y-3"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Transfer ownership
          </p>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            Pass the server owner role to another admin - e.g. when leaving the organisation. You keep your admin status
            but lose the protected seat.
          </p>
          <div className="flex gap-2">
            <select
              value={transferTarget}
              onChange={(e) => setTransferTarget(e.target.value)}
              className="input flex-1 text-sm"
            >
              <option value="">Select an admin…</option>
              {otherAdmins.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} ({u.email})
                </option>
              ))}
            </select>
            <button
              disabled={!transferTarget}
              onClick={async () => {
                if (!transferTarget) return;
                if (!confirm('Transfer server ownership? You will lose the protected founding-admin seat.')) return;
                try {
                  await api.admin.transferCrown(transferTarget);
                  setTransferTarget('');
                  await onUsersChanged();
                  showToast('Ownership transferred', 'success');
                } catch (e) {
                  showToast((e as Error).message, 'error');
                }
              }}
              className="btn-primary text-sm px-4"
            >
              Transfer
            </button>
          </div>
          {otherAdmins.length === 0 && (
            <p className="text-xs" style={{ color: '#f59e0b' }}>
              No other admins yet. Promote someone in the Users tab first.
            </p>
          )}
        </div>
      )}

      {detailUser && <AdminUserDetailModal user={detailUser} onClose={() => setDetailUser(null)} />}
    </div>
  );
}
