/**
 * Admin panel shell that fetches the full user list and renders the active sub-panel based on the
 * `?tab=` search param.  Non-admins are immediately redirected to /kanban.  The user list is
 * fetched once here and passed down so each sub-panel can share it without duplicate API calls.
 */
import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import AdminOwnership from './admin/AdminOwnership';
import AdminUsers from './admin/AdminUsers';
import AdminProjects from './admin/AdminProjects';
import AdminEmail from './admin/AdminEmail';
import AdminIpRules from './admin/AdminIpRules';
import AdminLogs from './admin/AdminLogs';
import AdminStats from './admin/AdminStats';
import type { AdminUser } from './admin/types';

export type AdminTab = 'ownership' | 'users' | 'projects' | 'email' | 'logs' | 'statistics' | 'ip-rules';

export const ADMIN_TABS: { key: AdminTab; label: string; icon: string }[] = [
  { key: 'ownership',  label: 'Ownership',      icon: '👑' },
  { key: 'users',      label: 'Users',           icon: '👥' },
  { key: 'projects',   label: 'Projects',        icon: '📦' },
  { key: 'email',      label: 'Email Settings',  icon: '✉️' },
  { key: 'ip-rules',   label: 'Networking',      icon: '🛡️' },
  { key: 'logs',       label: 'Audit Logs',      icon: '📋' },
  { key: 'statistics', label: 'Statistics',      icon: '📊' },
];

export default function AdminPage() {
  const { user: me, loading: authLoading, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as AdminTab) ?? 'ownership';

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Shared user-list loader; sub-panels call onUsersChanged to trigger a refresh
  const loadUsers = useCallback(async () => {
    try {
      setUsers(await api.admin.users());
    } catch (e) { showToast((e as Error).message, 'error'); }
  }, [showToast]);

  useEffect(() => {
    setLoading(true);
    loadUsers().finally(() => setLoading(false));
  }, [loadUsers]);

  if (authLoading) return null;
  if (!me?.isAdmin) return <Navigate to="/kanban" replace />;

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading ? (
          <div className="text-sm" style={{ color: 'var(--text-3)' }}>Loading…</div>
        ) : (
          <>
            {tab === 'ownership' && (
              <AdminOwnership
                users={users}
                isFoundingAdmin={!!me.isFoundingAdmin}
                currentUserId={me.id}
                onUsersChanged={loadUsers}
                showToast={showToast}
              />
            )}
            {tab === 'users' && (
              <AdminUsers
                users={users}
                isFoundingAdmin={!!me.isFoundingAdmin}
                currentUserId={me.id}
                onUsersChanged={loadUsers}
                showToast={showToast}
              />
            )}
            {tab === 'projects' && (
              <AdminProjects showToast={showToast} />
            )}
            {tab === 'email' && (
              <AdminEmail
                currentUser={me}
                refreshUser={refreshUser}
                onUsersChanged={loadUsers}
                showToast={showToast}
              />
            )}
            {tab === 'ip-rules' && (
              <AdminIpRules showToast={showToast} />
            )}
            {tab === 'logs' && (
              <AdminLogs
                isFoundingAdmin={!!me.isFoundingAdmin}
                showToast={showToast}
              />
            )}
            {tab === 'statistics' && (
              <AdminStats users={users} showToast={showToast} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
