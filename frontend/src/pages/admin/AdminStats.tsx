/**
 * Admin Statistics panel showing server-wide counts (users, projects, tasks, messages) alongside
 * 30-day new-user and new-project growth figures.  Admin and unverified-user counts are derived
 * from the shared user list already loaded by the parent AdminPage to avoid a duplicate fetch.
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { StatCard } from './AdminComponents';
import type { Stats, AdminUser } from './types';

interface Props {
  users: AdminUser[];
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export default function AdminStats({ users, showToast }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);

  const load = useCallback(async () => {
    try {
      setStats(await api.admin.stats());
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  if (!stats)
    return (
      <p className="text-sm" style={{ color: 'var(--text-3)' }}>
        Loading…
      </p>
    );

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <StatCard label="Total users" value={stats.userCount} sub={`+${stats.newUsers} last 30 days`} />
      <StatCard label="Total projects" value={stats.projectCount} sub={`+${stats.newProjects} last 30 days`} />
      <StatCard label="Total tasks" value={stats.taskCount} />
      <StatCard label="Total messages" value={stats.messageCount} />
      <StatCard label="Admins" value={users.filter((u) => u.isAdmin).length} />
      <StatCard label="Unverified users" value={users.filter((u) => !u.emailVerified).length} />
    </div>
  );
}
