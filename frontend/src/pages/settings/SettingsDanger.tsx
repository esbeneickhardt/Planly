import { api } from '../../api/client';
import type { Product, TeamMember, User } from '../../types';

interface Props {
  activeProduct: Product;
  isOwner: boolean;
  currentUser: User | null;
  members: TeamMember[];
  showToast: (msg: string, type: 'success' | 'error') => void;
  confirm: (msg: string) => Promise<boolean>;
  refreshProducts: () => Promise<void>;
}

export default function SettingsDanger({
  activeProduct, isOwner, currentUser, showToast, confirm, refreshProducts,
}: Props) {
  return (
    <div className="max-w-lg space-y-4">
      <div className="p-4 rounded-xl" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
        <p className="text-xs" style={{ color: '#ef4444' }}>
          Actions here are permanent and cannot be undone. Proceed with caution.
        </p>
      </div>

      {!isOwner && (
        <div className="p-4 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Leave project</h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>
            You will lose access to this project and all its tasks. You can only rejoin if re-invited.
          </p>
          <button
            onClick={async () => {
              if (!currentUser) return;
              if (!await confirm(`Leave "${activeProduct.name}"? You will lose access until re-invited.`)) return;
              try {
                await api.teams.removeMember(activeProduct.teamId, currentUser.id);
                await refreshProducts();
              } catch (err) { showToast((err as Error).message, 'error'); }
            }}
            className="text-sm px-4 py-2 rounded-lg transition-colors bg-[rgba(245,158,11,0.06)] hover:bg-[rgba(245,158,11,0.12)]"
            style={{ color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
          >Leave project</button>
        </div>
      )}

      {isOwner && (
        <div className="p-4 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: '#ef4444' }}>Delete project</h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>
            Permanently deletes <strong>{activeProduct.name}</strong> and all its tasks, milestones, sprints, messages, and settings. This action cannot be undone.
          </p>
          <button
            onClick={async () => {
              if (!await confirm(`Delete "${activeProduct.name}"? All tasks will be permanently deleted. This cannot be undone.`)) return;
              try {
                await api.products.delete(activeProduct.id);
                await refreshProducts();
              } catch (err) { showToast((err as Error).message, 'error'); }
            }}
            className="text-sm px-4 py-2 rounded-lg transition-colors bg-[rgba(239,68,68,0.06)] hover:bg-[rgba(239,68,68,0.12)]"
            style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
          >Delete project</button>
        </div>
      )}
    </div>
  );
}
