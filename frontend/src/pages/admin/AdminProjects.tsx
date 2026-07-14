/**
 * Admin Projects panel showing a read-only table of every project on the server, including owner,
 * member count, task count, and deadline.  Overdue deadlines are highlighted in red.
 * This panel is intentionally read-only — project deletion lives in each project's own Danger Zone settings.
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import type { AdminProject } from './types';

interface Props {
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export default function AdminProjects({ showToast }: Props) {
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setProjects(await api.admin.projects()); }
    catch (e) { showToast((e as Error).message, 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-sm" style={{ color: 'var(--text-3)' }}>Loading…</p>;

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
          <th className="text-left py-2 font-medium">Project</th>
          <th className="text-left py-2 font-medium">Owner</th>
          <th className="text-left py-2 font-medium">Members</th>
          <th className="text-left py-2 font-medium">Tasks</th>
          <th className="text-left py-2 font-medium">Deadline</th>
          <th className="text-left py-2 font-medium">Created</th>
        </tr>
      </thead>
      <tbody>
        {projects.map((p) => (
          <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
            <td className="py-2.5 pr-4">
              <span className="font-medium" style={{ color: 'var(--text)' }}>
                {p.emoji && <span className="mr-1.5">{p.emoji}</span>}{p.name}
              </span>
            </td>
            <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>
              {p.ownerEmoji && <span className="mr-1">{p.ownerEmoji}</span>}{p.ownerUsername ?? '-'}
            </td>
            <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>{p.memberCount}</td>
            <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>{p.taskCount}</td>
            <td className="py-2.5 pr-4 text-xs" style={{ color: new Date(p.deadline) < new Date() ? '#ef4444' : 'var(--text-3)' }}>
              {new Date(p.deadline).toLocaleDateString()}
            </td>
            <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>{new Date(p.createdAt).toLocaleDateString()}</td>
          </tr>
        ))}
        {projects.length === 0 && (
          <tr><td colSpan={6} className="py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>No projects yet.</td></tr>
        )}
      </tbody>
    </table>
  );
}
