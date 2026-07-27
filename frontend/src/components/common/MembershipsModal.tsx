import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useProduct } from '../../context/ProductContext';
import { useConfirm } from '../../context/ConfirmContext';
import { api, displayName as dn } from '../../api/client';
import type { PendingInvite } from '../../api/client';
import Modal from './Modal';
import type { Product } from '../../types';

interface Props {
  onClose: () => void;
}

type OwnerAction = {
  productId: string;
  members: { id: string; username: string; avatarEmoji?: string | null }[];
  transferTo: string;
};

export default function MembershipsModal({ onClose }: Props) {
  const { user } = useAuth();
  const { products, activeProduct, setActiveProduct, refreshProducts } = useProduct();

  const { confirm } = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  // When an owner clicks Leave, we expand the row with an owner action panel
  const [ownerAction, setOwnerAction] = useState<OwnerAction | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);

  useEffect(() => {
    api.invites
      .pending()
      .then(setPendingInvites)
      .catch(() => {});
  }, []);

  async function handleAcceptInvite(inv: PendingInvite) {
    setInviteActionId(inv.id);
    try {
      await api.invites.accept(inv.token);
      setPendingInvites((prev) => prev.filter((i) => i.id !== inv.id));
      await refreshProducts();
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setInviteActionId(null);
    }
  }

  async function handleDeclineInvite(inv: PendingInvite) {
    setInviteActionId(inv.id);
    try {
      await api.invites.decline(inv.token);
      setPendingInvites((prev) => prev.filter((i) => i.id !== inv.id));
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setInviteActionId(null);
    }
  }

  function switchAway(p: Product) {
    if (activeProduct?.id === p.id) {
      const next = products.find((x) => x.id !== p.id);
      if (next) setActiveProduct(next);
      // If no other product, refreshProducts() will clear activeProduct
    }
  }

  async function handleLeaveClick(p: Product) {
    if (!user) return;
    if (p.ownerId !== user.id) {
      // Non-owner: simple leave
      if (!(await confirm(`Leave "${p.name}"? You will lose access until re-invited.`))) return;
      setBusy(p.id);
      try {
        await api.teams.removeMember(p.teamId, user.id);
        switchAway(p);
        await refreshProducts();
      } catch (err) {
        setErrorMsg((err as Error).message);
      } finally {
        setBusy(null);
      }
      return;
    }

    // Owner: load other team members and show action panel
    if (ownerAction?.productId === p.id) {
      setOwnerAction(null);
      return;
    }
    setLoadingMembers(true);
    try {
      const team = await api.teams.get(p.teamId);
      const others = team.members.map((m) => m.user).filter((u) => u.id !== user.id);
      setOwnerAction({ productId: p.id, members: others, transferTo: others[0]?.id ?? '' });
    } catch {
      setErrorMsg('Could not load team members.');
    } finally {
      setLoadingMembers(false);
    }
  }

  async function handleTransferAndLeave(p: Product) {
    if (!ownerAction || !user) return;
    if (!ownerAction.transferTo) {
      setErrorMsg('Select a member to transfer to.');
      return;
    }
    if (!(await confirm(`Transfer ownership of "${p.name}" to the selected member and leave?`))) return;
    setBusy(p.id);
    try {
      await api.products.update(p.id, { ownerId: ownerAction.transferTo });
      await api.teams.removeMember(p.teamId, user.id);
      switchAway(p);
      await refreshProducts();
      setOwnerAction(null);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(p: Product) {
    if (!(await confirm(`Permanently delete "${p.name}" and all its tasks?`))) return;
    setBusy(p.id);
    try {
      await api.products.delete(p.id);
      switchAway(p);
      await refreshProducts();
      setOwnerAction(null);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal title="Memberships" onClose={onClose} width="max-w-md" mobileFullscreen>
      {/* Pending invitations */}
      {pendingInvites.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)' }}>
            Pending invitations
          </p>
          <div className="space-y-2">
            {pendingInvites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: 'var(--surface-2)', border: '1px solid rgba(234,179,8,0.3)' }}
              >
                <span className="text-xl flex-shrink-0">{inv.projectEmoji ?? '🎯'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                    {inv.projectName}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                    Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleAcceptInvite(inv)}
                    disabled={inviteActionId === inv.id}
                    className="btn-primary text-xs px-3 py-1"
                  >
                    {inviteActionId === inv.id ? '…' : 'Accept'}
                  </button>
                  <button
                    onClick={() => handleDeclineInvite(inv)}
                    disabled={inviteActionId === inv.id}
                    className="text-xs px-3 py-1 rounded-lg transition-colors"
                    style={{ color: 'var(--text-3)', border: '1px solid var(--border)', background: 'transparent' }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
        Projects you belong to. Click "Leave" to exit a project — owners can transfer ownership or delete.
      </p>

      {errorMsg && (
        <div
          className="mb-3 text-sm px-3 py-2 rounded-lg"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          {errorMsg}
        </div>
      )}

      {products.length === 0 ? (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--text-3)' }}>
          You are not a member of any projects yet.
        </div>
      ) : (
        <div className="space-y-2">
          {products.map((p) => {
            const isOwner = p.ownerId === user?.id;
            const loading = busy === p.id || (loadingMembers && ownerAction === null);
            const expanded = ownerAction?.productId === p.id;

            return (
              <div
                key={p.id}
                className="rounded-xl overflow-hidden"
                style={{
                  border: `1px solid ${expanded ? 'var(--brand)' : 'var(--border)'}`,
                  background: 'var(--surface-2)',
                }}
              >
                {/* Main row */}
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="text-xl flex-shrink-0">{p.emoji ?? '🎯'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                        {p.name}
                      </p>
                      {isOwner && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0"
                          style={{
                            background: 'var(--brand-subtle)',
                            color: 'var(--brand)',
                            border: '1px solid var(--brand)',
                          }}
                        >
                          Owner
                        </span>
                      )}
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      Due{' '}
                      {new Date(p.deadline).toLocaleDateString('en', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() => handleLeaveClick(p)}
                    disabled={!!busy || (loadingMembers && !expanded)}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex-shrink-0"
                    style={{
                      background: expanded ? 'var(--brand-subtle)' : 'var(--surface)',
                      color: expanded ? 'var(--brand)' : 'var(--text-2)',
                      border: `1px solid ${expanded ? 'var(--brand)' : 'var(--border)'}`,
                    }}
                  >
                    {loading && !expanded ? '…' : expanded ? 'Cancel' : 'Leave'}
                  </button>
                </div>

                {/* Owner action panel */}
                {expanded && ownerAction && (
                  <div className="px-3 pb-3 pt-1 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
                    <p className="text-xs font-medium pt-1" style={{ color: 'var(--text-2)' }}>
                      You own this project. Choose how to leave:
                    </p>

                    {/* Transfer ownership */}
                    {ownerAction.members.length > 0 ? (
                      <div
                        className="rounded-lg p-3 space-y-2"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                      >
                        <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                          Transfer ownership &amp; leave
                        </p>
                        <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                          A team member becomes the new owner. You leave the project.
                        </p>
                        <select
                          value={ownerAction.transferTo}
                          onChange={(e) =>
                            setOwnerAction((prev) => (prev ? { ...prev, transferTo: e.target.value } : prev))
                          }
                          className="input text-sm w-full"
                        >
                          {ownerAction.members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.avatarEmoji ?? '👤'} {dn(m)}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleTransferAndLeave(p)}
                          disabled={!!busy}
                          className="btn-primary w-full"
                        >
                          {busy === p.id ? '…' : 'Transfer & leave'}
                        </button>
                      </div>
                    ) : (
                      <p
                        className="text-xs rounded-lg px-3 py-2"
                        style={{
                          background: 'var(--surface)',
                          color: 'var(--text-3)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        No other members to transfer to.
                      </p>
                    )}

                    {/* Delete */}
                    <div
                      className="rounded-lg p-3 space-y-2"
                      style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}
                    >
                      <p className="text-xs font-semibold" style={{ color: '#ef4444' }}>
                        Delete project
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                        Permanently removes the project and all its tasks. This cannot be undone.
                      </p>
                      <button
                        onClick={() => handleDelete(p)}
                        disabled={!!busy}
                        className="w-full text-sm py-1.5 rounded-lg font-medium transition-colors"
                        style={{
                          background: 'rgba(239,68,68,0.1)',
                          color: '#ef4444',
                          border: '1px solid rgba(239,68,68,0.25)',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.18)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                      >
                        {busy === p.id ? '…' : 'Delete project'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
