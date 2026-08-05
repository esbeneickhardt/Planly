/**
 * Read-only detail modal for a single admin/owner, opened by clicking a row in AdminOwnership's
 * admin list — that list only shows icon/name/role inline to avoid overflowing on narrow screens,
 * so the rest of the account info (email, verification, login activity) lives here instead.
 */
import { ReactNode } from 'react';
import Modal from '../../components/common/Modal';
import type { AdminUser } from './types';

interface Props {
  user: AdminUser;
  onClose: () => void;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>
        {label}
      </span>
      <span className="text-sm text-right" style={{ color: 'var(--text)' }}>
        {children}
      </span>
    </div>
  );
}

export default function AdminUserDetailModal({ user, onClose }: Props) {
  const locked = !!user.loginLockedUntil && new Date(user.loginLockedUntil) > new Date();

  return (
    <Modal title={user.username} onClose={onClose} width="max-w-sm">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-4xl leading-none flex-shrink-0">
            {user.isFoundingAdmin ? '👑' : user.isAdmin ? '🛡️' : '👤'}
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold truncate" style={{ color: 'var(--text)' }}>
              {user.username}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>
              {user.email}
            </p>
          </div>
        </div>
        <div>
          <Row label="Role">{user.isFoundingAdmin ? 'Server owner' : user.isAdmin ? 'Admin' : 'Member'}</Row>
          <Row label="Email verified">{user.emailVerified ? 'Yes' : 'No'}</Row>
          <Row label="Login status">
            {locked
              ? 'Locked'
              : user.failedLoginAttempts > 0
                ? `${user.failedLoginAttempts} failed attempt${user.failedLoginAttempts === 1 ? '' : 's'}`
                : 'OK'}
          </Row>
          <Row label="Last login">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</Row>
          <Row label="Last activity">{user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleString() : 'Never'}</Row>
          <Row label="Joined">{new Date(user.createdAt).toLocaleDateString()}</Row>
        </div>
      </div>
    </Modal>
  );
}
