import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import type { TeamInvite } from '../../api/client';
import type { Product, Team, TeamMember, User } from '../../types';

type AccessRequestRow = {
  id: string;
  userId: string;
  status: string;
  note: string | null;
  createdAt: string;
  user: { id: string; username: string; avatarEmoji: string | null; realName: string | null };
};

function RoleBadge({ kind }: { kind: 'owner' | 'co_owner' }) {
  if (kind === 'owner') return (
    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}>Owner</span>
  );
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}>Co-owner</span>
  );
}

interface Props {
  team: Team;
  members: TeamMember[];
  activeProduct: Product;
  canManage: boolean;
  isOwner: boolean;
  currentUser: User | null;
  onMembersChanged: () => Promise<void>;
  showToast: (msg: string, type: 'success' | 'error') => void;
  confirm: (msg: string) => Promise<boolean>;
  refreshPerms: () => Promise<void>;
}

export default function SettingsTeam({
  team, members, activeProduct, canManage, isOwner, currentUser,
  onMembersChanged, showToast, confirm, refreshPerms,
}: Props) {
  const [addSearch, setAddSearch] = useState('');
  const [allUsers, setAllUsers] = useState<{ id: string; username: string; avatarEmoji?: string | null }[]>([]);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [togglingRole, setTogglingRole] = useState<string | null>(null);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [accessRequests, setAccessRequests] = useState<AccessRequestRow[]>([]);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    try { setInvites(await api.invites.list(team.id)); } catch {}
  }, [team.id]);

  const loadAccessRequests = useCallback(async () => {
    if (!canManage) return;
    try { setAccessRequests(await api.accessRequests.list(activeProduct.id)); } catch {}
  }, [activeProduct.id, canManage]);

  useEffect(() => {
    api.users.list().then(setAllUsers).catch(() => {});
  }, []);

  useEffect(() => { loadInvites(); }, [loadInvites]);
  useEffect(() => { loadAccessRequests(); }, [loadAccessRequests]);

  async function handleAddMember(userId: string, username: string) {
    setAddingUserId(userId);
    try {
      await api.teams.addMember(team.id, userId);
      showToast(`${username} added to project`, 'success');
      setAddSearch('');
      await onMembersChanged();
    } catch (err) { showToast((err as Error).message, 'error'); }
    finally { setAddingUserId(null); }
  }

  async function handleRemoveMember(userId: string, username: string) {
    if (!await confirm(`Remove ${username} from this project?`)) return;
    try {
      await api.teams.removeMember(team.id, userId);
      showToast(`${username} removed`, 'success');
      await onMembersChanged();
    } catch (err) { showToast((err as Error).message, 'error'); }
  }

  async function handleToggleCoOwner(userId: string, currentRole: string) {
    const newRole: 'member' | 'co_owner' = currentRole === 'co_owner' ? 'member' : 'co_owner';
    setTogglingRole(userId);
    try {
      await api.teams.setMemberRole(team.id, userId, newRole);
      showToast(newRole === 'co_owner' ? 'Co-owner added' : 'Co-owner removed', 'success');
      await onMembersChanged();
      await refreshPerms();
    } catch (err) { showToast((err as Error).message, 'error'); }
    finally { setTogglingRole(null); }
  }

  async function handleDecideRequest(requestId: string, action: 'approve' | 'reject') {
    setDecidingId(requestId);
    try {
      await api.accessRequests.decide(activeProduct.id, requestId, action);
      showToast(action === 'approve' ? 'Approved' : 'Rejected', 'success');
      await loadAccessRequests();
      if (action === 'approve') await onMembersChanged();
    } catch (err) { showToast((err as Error).message, 'error'); }
    finally { setDecidingId(null); }
  }

  const memberIds = new Set(members.map((m) => m.userId));
  const q = addSearch.toLowerCase().trim();
  const suggestions = q.length >= 1
    ? allUsers.filter((u) => !memberIds.has(u.id) && u.username.toLowerCase().includes(q)).slice(0, 6)
    : [];

  return (
    <div className="max-w-2xl space-y-8">
      {/* Add member */}
      <div>
        <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Add member</h2>
        <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>Search for a registered user and add them directly to the project.</p>
        <div className="relative">
          <input
            type="text"
            value={addSearch}
            onChange={(e) => setAddSearch(e.target.value)}
            placeholder="Search by username…"
            className="input text-sm w-full max-w-xs"
          />
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-72 rounded-xl overflow-hidden z-10 shadow-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {suggestions.map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-3 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="text-lg flex-shrink-0">{u.avatarEmoji ?? '👤'}</span>
                  <span className="flex-1 text-sm" style={{ color: 'var(--text)' }}>{u.username}</span>
                  <button
                    onClick={() => handleAddMember(u.id, u.username)}
                    disabled={addingUserId === u.id}
                    className="btn-primary text-xs px-3 py-1 flex-shrink-0"
                  >{addingUserId === u.id ? '…' : 'Add'}</button>
                </div>
              ))}
            </div>
          )}
          {q.length >= 1 && suggestions.length === 0 && (
            <p className="mt-2 text-xs" style={{ color: 'var(--text-3)' }}>No users found or all matching users are already members.</p>
          )}
        </div>
      </div>

      {/* Members list */}
      <div>
        <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Members</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>Co-owners can manage settings and approve access requests.</p>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {members.length === 0 && (
            <div className="px-4 py-6 text-sm text-center" style={{ color: 'var(--text-3)' }}>No members yet.</div>
          )}
          {members.map(({ userId, user, role }, idx) => {
            const isProductOwner = userId === activeProduct.ownerId;
            const isCoOwner = role === 'co_owner';
            return (
              <div
                key={userId}
                className="flex items-center gap-3 px-4 py-3"
                style={{
                  background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                  borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span className="text-xl flex-shrink-0">{user.avatarEmoji ?? '👤'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{user.username}</span>
                    {isProductOwner && <RoleBadge kind="owner" />}
                    {!isProductOwner && isCoOwner && <RoleBadge kind="co_owner" />}
                    {userId === currentUser?.id && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>You</span>
                    )}
                  </div>
                </div>
                {isOwner && !isProductOwner && userId !== currentUser?.id && (
                  <button
                    onClick={() => handleToggleCoOwner(userId, role ?? 'member')}
                    disabled={togglingRole === userId}
                    className="text-xs px-2.5 py-1 rounded-lg transition-colors flex-shrink-0"
                    style={{
                      background: isCoOwner ? 'rgba(139,92,246,0.1)' : 'var(--surface-2)',
                      color: isCoOwner ? '#8b5cf6' : 'var(--text-3)',
                      border: `1px solid ${isCoOwner ? 'rgba(139,92,246,0.3)' : 'var(--border)'}`,
                    }}
                  >
                    {togglingRole === userId ? '…' : isCoOwner ? 'Remove co-owner' : 'Make co-owner'}
                  </button>
                )}
                {canManage && !isProductOwner && userId !== currentUser?.id && (
                  <button
                    onClick={() => handleRemoveMember(userId, user.username)}
                    className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0 transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                    style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', background: 'transparent' }}
                  >Remove</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Invite links */}
      <div>
        <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Invite links</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
          Generate a link to share with teammates. Anyone with the link can join the team within 7 days.
          Optionally email it directly.
        </p>
        <div className="flex gap-3 mb-4 flex-wrap">
          <input
            type="email"
            value={newInviteEmail}
            onChange={(e) => setNewInviteEmail(e.target.value)}
            placeholder="Email (optional - leave blank for a link only)"
            className="input text-sm flex-1 min-w-48"
          />
          <button
            disabled={creatingInvite}
            className="btn-primary text-sm flex-shrink-0"
            onClick={async () => {
              setCreatingInvite(true);
              try {
                const inv = await api.invites.create(team.id, newInviteEmail || undefined);
                setNewInviteEmail('');
                await navigator.clipboard.writeText(inv.inviteUrl).catch(() => {});
                showToast('Invite link created and copied!', 'success');
                await loadInvites();
              } catch (err) { showToast((err as Error).message, 'error'); }
              finally { setCreatingInvite(false); }
            }}
          >
            {creatingInvite ? '…' : 'Create invite'}
          </button>
        </div>
        {invites.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {invites.map((inv, idx) => (
              <div
                key={inv.id}
                className="flex items-center gap-3 px-4 py-2.5"
                style={{ background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)', borderTop: idx > 0 ? '1px solid var(--border)' : 'none' }}
              >
                <span className="text-base flex-shrink-0">✉️</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate" style={{ color: 'var(--text)' }}>{inv.email ?? 'Open invite'}</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>Expires {new Date(inv.expiresAt).toLocaleDateString()}</p>
                </div>
                <button
                  className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0"
                  style={{ color: 'var(--brand)', border: '1px solid var(--brand)', background: 'transparent' }}
                  onClick={() => { navigator.clipboard.writeText(inv.inviteUrl).catch(() => {}); showToast('Copied!', 'success'); }}
                >Copy link</button>
                <button
                  className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0 ml-1"
                  style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', background: 'transparent' }}
                  onClick={async () => {
                    await api.invites.revoke(team.id, inv.id).catch(() => {});
                    await loadInvites();
                    showToast('Invite revoked', 'success');
                  }}
                >Revoke</button>
              </div>
            ))}
          </div>
        )}
        {invites.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>No active invite links.</p>
        )}
      </div>

      {/* Access requests */}
      <div>
        <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Access requests
          {accessRequests.length > 0 && (
            <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded-full" style={{ background: '#ef4444', color: 'white' }}>{accessRequests.length}</span>
          )}
        </h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>Users who have requested to join this project.</p>
        {accessRequests.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>No pending requests.</p>
        ) : (
          <div className="space-y-2">
            {accessRequests.map((req) => (
              <div key={req.id} className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <span className="text-xl flex-shrink-0">{req.user.avatarEmoji ?? '👤'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{req.user.username}</p>
                  {req.user.realName && <p className="text-xs" style={{ color: 'var(--text-3)' }}>{req.user.realName}</p>}
                  {req.note && <p className="text-xs mt-0.5 italic" style={{ color: 'var(--text-2)' }}>"{req.note}"</p>}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => handleDecideRequest(req.id, 'approve')} disabled={decidingId === req.id} className="btn-primary text-xs px-3 py-1">
                    {decidingId === req.id ? '…' : 'Approve'}
                  </button>
                  <button onClick={() => handleDecideRequest(req.id, 'reject')} disabled={decidingId === req.id} className="btn-secondary text-xs px-3 py-1" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
