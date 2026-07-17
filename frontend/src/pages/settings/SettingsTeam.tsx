/**
 * Settings Team tab managing project membership, co-owner roles, invite links, and access requests.
 * The "Add member" search now sends an invitation the target user must accept, rather than adding
 * directly. Pending user-targeted invites appear inline in the Members list with an "Uninvite" button.
 * Users who have turned off invites are shown greyed-out in the autocomplete with a note.
 */
import { useState, useEffect, useCallback } from 'react';
import { api, displayName } from '../../api/client';
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

type ListUser = { id: string; username: string; realName: string | null; avatarEmoji: string | null; acceptsInvites: boolean };

function RoleBadge({ kind }: { kind: 'owner' | 'co_owner' }) {
  if (kind === 'owner') return (
    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}>Owner</span>
  );
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}>Co-owner</span>
  );
}

function PendingBadge() {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(234,179,8,0.15)', color: '#ca8a04', border: '1px solid rgba(234,179,8,0.3)' }}>Pending</span>
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
  const [allUsers, setAllUsers] = useState<ListUser[]>([]);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [togglingRole, setTogglingRole] = useState<string | null>(null);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [accessRequests, setAccessRequests] = useState<AccessRequestRow[]>([]);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [uninvitingId, setUninvitingId] = useState<string | null>(null);

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

  async function handleInviteUser(userId: string, username: string) {
    setAddingUserId(userId);
    try {
      await api.teams.addMember(team.id, userId);
      showToast(`Invitation sent to ${username}`, 'success');
      setAddSearch('');
      await loadInvites();
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

  async function handleUninvite(inviteId: string, username: string) {
    setUninvitingId(inviteId);
    try {
      await api.invites.revoke(team.id, inviteId);
      showToast(`Invitation to ${username} revoked`, 'success');
      await loadInvites();
    } catch (err) { showToast((err as Error).message, 'error'); }
    finally { setUninvitingId(null); }
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

  // Pending user-targeted invites (from the invite list)
  const pendingInvites = invites.filter((i) => i.toUser !== null);
  const pendingInviteUserIds = new Set(pendingInvites.map((i) => i.toUser!.id));

  // Filter autocomplete: exclude current members and users with pending invites; cap at 6
  const memberIds = new Set(members.map((m) => m.userId));
  const q = addSearch.toLowerCase().trim();
  const suggestions = q.length >= 1
    ? allUsers
        .filter((u) => !memberIds.has(u.id) && !pendingInviteUserIds.has(u.id) && u.username.toLowerCase().includes(q))
        .slice(0, 6)
    : [];

  // Combined list: active members + pending invites
  const totalRows = members.length + pendingInvites.length;

  return (
    <div className="max-w-2xl space-y-8">
      {/* Invite member */}
      <div>
        <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Invite member</h2>
        <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>
          Search for a registered user and send them an invitation. They will see it in their notifications and can accept or decline.
        </p>
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
                  <span className="text-lg flex-shrink-0" style={{ opacity: u.acceptsInvites ? 1 : 0.4 }}>{u.avatarEmoji ?? '👤'}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm" style={{ color: u.acceptsInvites ? 'var(--text)' : 'var(--text-3)' }}>{displayName(u)}</span>
                    {u.realName?.trim() && <span className="text-xs" style={{ color: 'var(--text-3)' }}>@{u.username}</span>}
                    {!u.acceptsInvites && (
                      <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>Not accepting invitations</p>
                    )}
                  </div>
                  <button
                    onClick={() => u.acceptsInvites && handleInviteUser(u.id, u.username)}
                    disabled={!u.acceptsInvites || addingUserId === u.id}
                    className="btn-primary text-xs px-3 py-1 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                  >{addingUserId === u.id ? '…' : 'Invite'}</button>
                </div>
              ))}
            </div>
          )}
          {q.length >= 1 && suggestions.length === 0 && (
            <p className="mt-2 text-xs" style={{ color: 'var(--text-3)' }}>No users found or all matching users are already members or invited.</p>
          )}
        </div>
      </div>

      {/* Members list (includes pending invites) */}
      <div>
        <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Members</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
          Co-owners can manage settings and approve access requests. Pending rows show users who haven't accepted yet.
        </p>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {totalRows === 0 && (
            <div className="px-4 py-6 text-sm text-center" style={{ color: 'var(--text-3)' }}>No members yet.</div>
          )}

          {/* Active members */}
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
                    <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{displayName(user)}</span>
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

          {/* Pending invites */}
          {pendingInvites.map((inv, idx) => {
            const rowIdx = members.length + idx;
            return (
              <div
                key={inv.id}
                className="flex items-center gap-3 px-4 py-3"
                style={{
                  background: rowIdx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                  borderTop: rowIdx > 0 ? '1px solid var(--border)' : 'none',
                  opacity: 0.85,
                }}
              >
                <span className="text-xl flex-shrink-0" style={{ opacity: 0.6 }}>{inv.toUser!.avatarEmoji ?? '👤'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>{displayName(inv.toUser!)}</span>
                    <PendingBadge />
                  </div>
                  <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                    Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                {canManage && (
                  <button
                    onClick={() => handleUninvite(inv.id, inv.toUser!.username)}
                    disabled={uninvitingId === inv.id}
                    className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0 transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                    style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', background: 'transparent' }}
                  >{uninvitingId === inv.id ? '…' : 'Uninvite'}</button>
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
          Generate a shareable link anyone can use to join within 7 days. Optionally email it directly.
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
        {/* Only show non-user-targeted invites here (user-targeted appear in the Members section above) */}
        {invites.filter((i) => !i.toUser).length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {invites.filter((i) => !i.toUser).map((inv, idx) => (
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
        {invites.filter((i) => !i.toUser).length === 0 && (
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
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{displayName(req.user)}</p>
                  {req.user.realName?.trim() && <p className="text-xs" style={{ color: 'var(--text-3)' }}>@{req.user.username}</p>}
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
