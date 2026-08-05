/**
 * Settings Danger Zone tab: marking the project's lifecycle status (completed/archived), plus two
 * mutually exclusive destructive actions - non-owners can leave the project (removes them from the
 * team), while the owner can permanently delete it. The destructive actions require a confirm
 * dialog; all three call refreshProducts so the sidebar reflects the change.
 */
import { useState } from 'react';
import { api } from '../../api/client';
import type { Product, ProductStatus, TeamMember, User } from '../../types';

const STATUS_STYLE: Record<ProductStatus, { label: string; icon: string; color: string }> = {
  active: { label: 'Active', icon: '●', color: '#3b82f6' },
  completed: { label: 'Completed', icon: '✓', color: '#10b981' },
  archived: { label: 'Archived', icon: '📦', color: '#64748b' },
};

interface Props {
  activeProduct: Product;
  isOwner: boolean;
  canManage: boolean;
  currentUser: User | null;
  members: TeamMember[];
  showToast: (msg: string, type: 'success' | 'error') => void;
  confirm: (msg: string) => Promise<boolean>;
  refreshProducts: () => Promise<void>;
}

export default function SettingsDanger({
  activeProduct,
  isOwner,
  canManage,
  currentUser,
  showToast,
  confirm,
  refreshProducts,
}: Props) {
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function updateStatus(status: ProductStatus) {
    if (status === activeProduct.status) return;
    // Reverting to active only expands access, so it doesn't need a warning - completed/archived
    // both come with real consequences (read-only lockdown, permanent token revocation) worth
    // confirming first.
    if (status === 'completed') {
      if (
        !(await confirm(
          `Mark "${activeProduct.name}" as completed? Regular members (not owners or co-owners) will become ` +
            'read-only across every tab, and any API tokens or app registrations scoped to this project will be ' +
            'permanently revoked. This can be reverted later.',
        ))
      )
        return;
    } else if (status === 'archived') {
      if (
        !(await confirm(
          `Archive "${activeProduct.name}"? Everyone - including you - will become read-only across every tab, ` +
            'and any API tokens or app registrations scoped to this project will be permanently revoked. This can ' +
            'be reverted later.',
        ))
      )
        return;
    }
    setUpdatingStatus(true);
    try {
      await api.products.update(activeProduct.id, { status });
      await refreshProducts();
      showToast(`Marked as ${STATUS_STYLE[status].label.toLowerCase()}`, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <div
        className="p-4 rounded-xl"
        style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}
      >
        <p className="text-xs" style={{ color: '#ef4444' }}>
          Actions here are permanent and cannot be undone. Proceed with caution.
        </p>
      </div>

      {canManage && (
        <div className="p-4 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
            Project status
          </h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>
            Mark this project as completed or archived once it's no longer active work. Completed makes it read-only
            for regular members (owners/co-owners keep full access); archived makes it read-only for everyone,
            including you. Both revoke any API tokens or app registrations scoped to this project - reverting to
            active restores everyone's access.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {(Object.keys(STATUS_STYLE) as ProductStatus[]).map((s) => {
              const active = activeProduct.status === s;
              const style = STATUS_STYLE[s];
              return (
                <button
                  key={s}
                  onClick={() => updateStatus(s)}
                  disabled={updatingStatus || active}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: active ? `${style.color}1f` : 'var(--surface)',
                    color: active ? style.color : 'var(--text-3)',
                    border: `1px solid ${active ? style.color : 'var(--border)'}`,
                  }}
                >
                  <span>{style.icon}</span>
                  {style.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!isOwner && (
        <div className="p-4 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
            Leave project
          </h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>
            You will lose access to this project and all its tasks. You can only rejoin if re-invited.
          </p>
          <button
            onClick={async () => {
              if (!currentUser) return;
              if (!(await confirm(`Leave "${activeProduct.name}"? You will lose access until re-invited.`))) return;
              try {
                await api.teams.removeMember(activeProduct.teamId, currentUser.id);
                await refreshProducts();
              } catch (err) {
                showToast((err as Error).message, 'error');
              }
            }}
            className="text-sm px-4 py-2 rounded-lg transition-colors bg-[rgba(245,158,11,0.06)] hover:bg-[rgba(245,158,11,0.12)]"
            style={{ color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
          >
            Leave project
          </button>
        </div>
      )}

      {isOwner && (
        <div
          className="p-4 rounded-xl"
          style={{ background: 'var(--surface-2)', border: '1px solid rgba(239,68,68,0.15)' }}
        >
          <h3 className="text-sm font-semibold mb-1" style={{ color: '#ef4444' }}>
            Delete project
          </h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>
            Permanently deletes <strong>{activeProduct.name}</strong> and all its tasks, milestones, sprints, messages,
            and settings. This action cannot be undone.
          </p>
          <button
            onClick={async () => {
              if (
                !(await confirm(
                  `Delete "${activeProduct.name}"? All tasks will be permanently deleted. This cannot be undone.`,
                ))
              )
                return;
              try {
                await api.products.delete(activeProduct.id);
                await refreshProducts();
              } catch (err) {
                showToast((err as Error).message, 'error');
              }
            }}
            className="text-sm px-4 py-2 rounded-lg transition-colors bg-[rgba(239,68,68,0.06)] hover:bg-[rgba(239,68,68,0.12)]"
            style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            Delete project
          </button>
        </div>
      )}
    </div>
  );
}
