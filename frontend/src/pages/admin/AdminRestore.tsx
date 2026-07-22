import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';

interface Props {
  showToast: (msg: string, type: 'success' | 'error') => void;
}

interface DeletedProject {
  id: string;
  name: string;
  emoji: string | null;
  deletedAt: string;
  createdAt: string;
  ownerUsername: string | null;
  ownerEmoji: string | null;
  memberCount: number;
  taskCount: number;
}

export default function AdminRestore({ showToast }: Props) {
  const [projects, setProjects] = useState<DeletedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await api.admin.deletedProjects());
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRestore(id: string, name: string) {
    setRestoring(id);
    try {
      await api.admin.restoreProject(id);
      showToast(`"${name}" restored`, 'success');
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setRestoring(null);
    }
  }

  if (loading)
    return (
      <p className="text-sm" style={{ color: 'var(--text-3)' }}>
        Loading…
      </p>
    );

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: 'var(--text-3)' }}>
        <span className="text-4xl opacity-30">🗑️</span>
        <p className="text-sm">No deleted projects.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm mb-4" style={{ color: 'var(--text-3)' }}>
        These projects were soft-deleted and can be restored. Their tasks, members, and settings are intact.
      </p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
            <th className="text-left py-2 font-medium">Project</th>
            <th className="text-left py-2 font-medium">Owner</th>
            <th className="text-left py-2 font-medium">Members</th>
            <th className="text-left py-2 font-medium">Tasks</th>
            <th className="text-left py-2 font-medium">Deleted</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td className="py-2.5 pr-4">
                <span className="font-medium" style={{ color: 'var(--text)' }}>
                  {p.emoji && <span className="mr-1.5">{p.emoji}</span>}
                  {p.name}
                </span>
              </td>
              <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>
                {p.ownerEmoji && <span className="mr-1">{p.ownerEmoji}</span>}
                {p.ownerUsername ?? '-'}
              </td>
              <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>
                {p.memberCount}
              </td>
              <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>
                {p.taskCount}
              </td>
              <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>
                {new Date(p.deletedAt).toLocaleDateString()}
              </td>
              <td className="py-2.5 text-right">
                <button
                  onClick={() => handleRestore(p.id, p.name)}
                  disabled={restoring === p.id}
                  className="text-xs px-3 py-1 rounded-full font-medium transition-colors"
                  style={{
                    background: 'var(--brand-subtle)',
                    color: 'var(--brand)',
                    border: '1px solid var(--brand)',
                    opacity: restoring === p.id ? 0.6 : 1,
                  }}
                >
                  {restoring === p.id ? 'Restoring…' : 'Restore'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
