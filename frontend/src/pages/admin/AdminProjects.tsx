/**
 * Admin Projects table listing every active project with owner/member/task counts, plus a
 * status selector to mark a project completed or archived (both read-only lockdowns that
 * revoke scoped API tokens/app registrations, confirmed before applying) or revert it to
 * active. A collapsible "Deleted projects" section lists soft-deleted projects with a
 * one-click restore and a hard-delete flow gated behind typing the project's exact name.
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { isBeforeToday } from '../../utils/dates';
import { useConfirm } from '../../context/ConfirmContext';
import type { AdminProject } from './types';

const STATUS_STYLE: Record<AdminProject['status'], { label: string; icon: string; color: string }> = {
  active: { label: 'Active', icon: '●', color: '#3b82f6' },
  completed: { label: 'Completed', icon: '✓', color: '#10b981' },
  archived: { label: 'Archived', icon: '📦', color: '#64748b' },
};

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

interface Props {
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export default function AdminProjects({ showToast }: Props) {
  const { confirm } = useConfirm();
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [deleted, setDeleted] = useState<DeletedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [hardDeleting, setHardDeleting] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  // confirmId: id of the project awaiting hard-delete confirmation; confirmInput: typed name
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmInput, setConfirmInput] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [active, gone] = await Promise.all([api.admin.projects(), api.admin.deletedProjects()]);
      setProjects(active);
      setDeleted(gone);
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStatusChange(id: string, name: string, status: AdminProject['status']) {
    // Reverting to active only expands access, so no warning needed - completed/archived both
    // carry real consequences (read-only lockdown, permanent token revocation), same as the
    // per-project Danger Zone control this mirrors.
    if (status === 'completed') {
      if (
        !(await confirm(
          `Mark "${name}" as completed? Regular members (not owners or co-owners) will become read-only across ` +
            'every tab, and any API tokens or app registrations scoped to this project will be permanently ' +
            'revoked. This can be reverted later.',
        ))
      )
        return;
    } else if (status === 'archived') {
      if (
        !(await confirm(
          `Archive "${name}"? Everyone on the project - including its owner - will become read-only across every ` +
            'tab, and any API tokens or app registrations scoped to this project will be permanently revoked. ' +
            'This can be reverted later.',
        ))
      )
        return;
    }
    setUpdatingStatus(id);
    try {
      await api.admin.updateProjectStatus(id, status);
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setUpdatingStatus(null);
    }
  }

  async function handleRestore(id: string, name: string) {
    setRestoring(id);
    try {
      await api.admin.restoreProject(id);
      showToast(`"${name}" restored`, 'success');
      setDeleted((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setRestoring(null);
    }
  }

  async function handleHardDelete(id: string, name: string) {
    setHardDeleting(id);
    try {
      await api.admin.hardDeleteProject(id);
      showToast(`"${name}" permanently deleted`, 'success');
      setDeleted((prev) => prev.filter((p) => p.id !== id));
      setConfirmId(null);
      setConfirmInput('');
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setHardDeleting(null);
    }
  }

  if (loading)
    return (
      <p className="text-sm" style={{ color: 'var(--text-3)' }}>
        Loading…
      </p>
    );

  return (
    <div className="space-y-8">
      {/* Active projects */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse" style={{ minWidth: 640 }}>
          <thead>
            <tr
              style={{
                color: 'var(--text-3)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <th className="text-left py-2 font-medium">Project</th>
              <th className="text-left py-2 font-medium">Status</th>
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
                  <span className="font-medium whitespace-nowrap" style={{ color: 'var(--text)' }}>
                    {p.emoji && <span className="mr-1.5">{p.emoji}</span>}
                    {p.name}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  <select
                    value={p.status}
                    onChange={(e) => handleStatusChange(p.id, p.name, e.target.value as AdminProject['status'])}
                    disabled={updatingStatus === p.id}
                    className="text-xs rounded-full pl-2.5 pr-6 py-1 font-medium"
                    style={{
                      background: `${STATUS_STYLE[p.status].color}1f`,
                      color: STATUS_STYLE[p.status].color,
                      border: `1px solid ${STATUS_STYLE[p.status].color}`,
                    }}
                  >
                    {(Object.keys(STATUS_STYLE) as AdminProject['status'][]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_STYLE[s].icon} {STATUS_STYLE[s].label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2.5 pr-4 text-xs whitespace-nowrap" style={{ color: 'var(--text-3)' }}>
                  {p.ownerEmoji && <span className="mr-1">{p.ownerEmoji}</span>}
                  {p.ownerUsername ?? '-'}
                </td>
                <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>
                  {p.memberCount}
                </td>
                <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>
                  {p.taskCount}
                </td>
                <td
                  className="py-2.5 pr-4 text-xs"
                  style={{
                    color: p.deadline && isBeforeToday(p.deadline) ? '#ef4444' : 'var(--text-3)',
                  }}
                >
                  {p.deadline ? new Date(p.deadline).toLocaleDateString() : '-'}
                </td>
                <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-3)' }}>
                  {new Date(p.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>
                  No projects yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Deleted projects */}
      {deleted.length > 0 && (
        <div>
          <button
            onClick={() => setShowDeleted((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium mb-3"
            style={{ color: 'var(--text-2)' }}
          >
            <span>{showDeleted ? '▾' : '▸'}</span>
            Deleted projects
            <span
              className="text-xs px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
            >
              {deleted.length}
            </span>
          </button>

          {showDeleted && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse" style={{ minWidth: 640 }}>
                <thead>
                  <tr
                    style={{
                      color: 'var(--text-3)',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <th className="text-left py-2 font-medium">Project</th>
                    <th className="text-left py-2 font-medium">Owner</th>
                    <th className="text-left py-2 font-medium">Members</th>
                    <th className="text-left py-2 font-medium">Tasks</th>
                    <th className="text-left py-2 font-medium">Deleted</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {deleted.map((p) => (
                    <>
                      <tr
                        key={p.id}
                        style={{
                          borderBottom: confirmId === p.id ? 'none' : '1px solid var(--border)',
                          opacity: 0.8,
                        }}
                      >
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
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleRestore(p.id, p.name)}
                              disabled={!!restoring || !!hardDeleting}
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
                            <button
                              onClick={() => {
                                setConfirmId(confirmId === p.id ? null : p.id);
                                setConfirmInput('');
                              }}
                              disabled={!!restoring || !!hardDeleting}
                              className="text-xs px-3 py-1 rounded-full font-medium transition-colors"
                              style={{
                                background: 'rgba(239,68,68,0.08)',
                                color: '#ef4444',
                                border: '1px solid rgba(239,68,68,0.3)',
                              }}
                            >
                              Delete permanently
                            </button>
                          </div>
                        </td>
                      </tr>
                      {confirmId === p.id && (
                        <tr key={`${p.id}-confirm`} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td colSpan={6} className="pb-3 pt-1 pr-4">
                            <div
                              className="rounded-lg px-3 py-2.5 text-xs space-y-2"
                              style={{
                                background: 'rgba(239,68,68,0.06)',
                                border: '1px solid rgba(239,68,68,0.2)',
                              }}
                            >
                              <p style={{ color: '#ef4444' }}>
                                This permanently deletes all tasks, messages, and settings. Type{' '}
                                <strong>{p.name}</strong> to confirm.
                              </p>
                              <div className="flex gap-2">
                                <input
                                  // eslint-disable-next-line jsx-a11y/no-autofocus -- confirmation field just revealed by clicking "Delete permanently"
                                  autoFocus
                                  value={confirmInput}
                                  onChange={(e) => setConfirmInput(e.target.value)}
                                  placeholder={p.name}
                                  className="input text-xs flex-1"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') {
                                      setConfirmId(null);
                                      setConfirmInput('');
                                    }
                                  }}
                                />
                                <button
                                  onClick={() => handleHardDelete(p.id, p.name)}
                                  disabled={confirmInput !== p.name || hardDeleting === p.id}
                                  className="text-xs px-3 py-1 rounded-lg font-medium"
                                  style={{
                                    background: confirmInput === p.name ? '#ef4444' : 'var(--surface-2)',
                                    color: confirmInput === p.name ? 'white' : 'var(--text-3)',
                                    transition: 'background 0.15s',
                                  }}
                                >
                                  {hardDeleting === p.id ? 'Deleting…' : 'Confirm'}
                                </button>
                                <button
                                  onClick={() => {
                                    setConfirmId(null);
                                    setConfirmInput('');
                                  }}
                                  className="text-xs px-3 py-1 rounded-lg"
                                  style={{ color: 'var(--text-3)' }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
