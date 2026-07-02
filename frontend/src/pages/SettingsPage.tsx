import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { ApiToken, AppRegistration, Webhook, TeamInvite } from '../api/client';
import { useProduct } from '../context/ProductContext';
import { usePermission } from '../context/PermissionContext';
import { useColorLegend } from '../hooks/useColorLegend';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { Team } from '../types';

type AccessRequestRow = {
  id: string;
  userId: string;
  status: string;
  note: string | null;
  createdAt: string;
  user: { id: string; username: string; avatarEmoji: string | null; realName: string | null };
};

type SettingsTab = 'team' | 'permissions' | 'colors' | 'ownership' | 'apps' | 'webhooks' | 'danger';

const PAGE_TABS: { key: SettingsTab; label: string; ownerOnly?: boolean; danger?: boolean }[] = [
  { key: 'team',        label: 'Team' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'colors',      label: 'Color labels' },
  { key: 'ownership',   label: 'Ownership', ownerOnly: true },
  { key: 'apps',        label: 'Apps' },
  { key: 'webhooks',    label: 'Webhooks' },
  { key: 'danger',      label: 'Danger zone', danger: true },
];

const WEBHOOK_EVENTS = [
  { value: 'task.created',       label: 'Task created' },
  { value: 'task.updated',       label: 'Task updated' },
  { value: 'task.deleted',       label: 'Task deleted' },
  { value: 'task.status_changed',label: 'Task status changed' },
  { value: 'task.assigned',      label: 'Task assigned' },
  { value: 'sprint.created',     label: 'Sprint created' },
  { value: 'sprint.updated',     label: 'Sprint updated' },
  { value: 'sprint.deleted',     label: 'Sprint deleted' },
  { value: 'message.created',    label: 'Message created' },
];

const FEATURE_TABS = [
  { key: 'kanban',     label: 'Kanban' },
  { key: 'backlog',    label: 'Backlog' },
  { key: 'canvas',     label: 'Plan' },
  { key: 'gantt',      label: 'Gantt' },
  { key: 'categories', label: 'Settings' },
];

const LEVELS = [
  { value: 'write', label: 'Write', color: '#10b981' },
  { value: 'read',  label: 'Read',  color: '#f59e0b' },
  { value: 'none',  label: 'None',  color: '#ef4444' },
];

const COLORS = ['#7c3aed','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#f97316'];

function RoleBadge({ role }: { role: 'owner' | 'co_owner' }) {
  if (role === 'owner') return (
    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}>Owner</span>
  );
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}>Co-owner</span>
  );
}

export default function SettingsPage() {
  const { activeProduct, refreshProducts } = useProduct();
  const { user: currentUser } = useAuth();
  const { refresh: refreshPerms, canManage, isOwner } = usePermission();
  const { showToast } = useToast();
  const { legend, update: updateLegend, toggleEnabled, enabledColors } = useColorLegend(activeProduct?.id ?? '');

  const [activeTab, setActiveTab] = useState<SettingsTab>('team');
  const [team, setTeam] = useState<Team | null>(null);
  const [matrix, setMatrix] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [accessRequests, setAccessRequests] = useState<AccessRequestRow[]>([]);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [togglingRole, setTogglingRole] = useState<string | null>(null);
  const [addSearch, setAddSearch] = useState('');
  const [allUsers, setAllUsers] = useState<{ id: string; username: string; avatarEmoji?: string | null }[]>([]);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);

  // App registrations state
  const [apps, setApps] = useState<AppRegistration[]>([]);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [newAppName, setNewAppName] = useState('');
  const [creatingApp, setCreatingApp] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [appTokens, setAppTokens] = useState<ApiToken[]>([]);
  const [newAppTokenName, setNewAppTokenName] = useState('');

  // Webhooks state
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>([]);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  // Invites state
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);

  // Email status state

  const load = useCallback(async () => {
    if (!activeProduct) return;
    const [t, rows] = await Promise.all([
      api.teams.get(activeProduct.teamId),
      api.permissions.list(activeProduct.id),
    ]);
    setTeam(t);
    const m: Record<string, Record<string, string>> = {};
    t.members.forEach(({ userId }) => { m[userId] = {}; FEATURE_TABS.forEach(({ key }) => { m[userId][key] = 'write'; }); });
    rows.forEach((r) => { if (m[r.userId]) m[r.userId][r.tab] = r.level; });
    setMatrix(m);
  }, [activeProduct?.id]);

  const loadAccessRequests = useCallback(async () => {
    if (!activeProduct || !canManage) return;
    try { setAccessRequests(await api.accessRequests.list(activeProduct.id)); } catch {}
  }, [activeProduct?.id, canManage]);

  const loadTokens = useCallback(async () => {
    try {
      setApps(await api.appRegistrations.list());
    } catch {}
  }, []);

  const loadWebhooks = useCallback(async () => {
    if (!activeProduct) return;
    try { setWebhooks(await api.webhooks.list(activeProduct.id)); } catch {}
  }, [activeProduct?.id]);

  const loadInvites = useCallback(async () => {
    if (!team) return;
    try { setInvites(await api.invites.list(team.id)); } catch {}
  }, [team?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadAccessRequests(); }, [loadAccessRequests]);
  useEffect(() => { loadTokens(); }, [loadTokens]);
  useEffect(() => { loadWebhooks(); }, [loadWebhooks]);
  useEffect(() => { loadInvites(); }, [loadInvites]);
  useEffect(() => {
    api.users.list().then(setAllUsers).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedAppId) { setAppTokens([]); return; }
    api.appRegistrations.listTokens(selectedAppId).then(setAppTokens).catch(() => {});
  }, [selectedAppId]);

  function setLevel(userId: string, tab: string, level: string) {
    setMatrix((prev) => ({ ...prev, [userId]: { ...prev[userId], [tab]: level } }));
  }

  async function savePermissions() {
    if (!activeProduct) return;
    setSaving(true);
    const updates: { userId: string; tab: string; level: string }[] = [];
    Object.entries(matrix).forEach(([userId, tabs]) => {
      Object.entries(tabs).forEach(([tab, level]) => updates.push({ userId, tab, level }));
    });
    try {
      await api.permissions.put(activeProduct.id, updates);
      await refreshPerms();
      showToast('Permissions saved', 'success');
    } catch (err) { showToast((err as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  async function handleAddMember(userId: string, username: string) {
    if (!team) return;
    setAddingUserId(userId);
    try {
      await api.teams.addMember(team.id, userId);
      showToast(`${username} added to project`, 'success');
      setAddSearch('');
      await load();
    } catch (err) { showToast((err as Error).message, 'error'); }
    finally { setAddingUserId(null); }
  }

  async function handleRemoveMember(userId: string, username: string) {
    if (!activeProduct || !team) return;
    if (!confirm(`Remove ${username} from this project?`)) return;
    try {
      await api.teams.removeMember(team.id, userId);
      showToast(`${username} removed`, 'success');
      await load();
    } catch (err) { showToast((err as Error).message, 'error'); }
  }

  async function handleToggleCoOwner(userId: string, currentRole: string) {
    if (!team) return;
    const newRole: 'member' | 'co_owner' = currentRole === 'co_owner' ? 'member' : 'co_owner';
    setTogglingRole(userId);
    try {
      await api.teams.setMemberRole(team.id, userId, newRole);
      showToast(newRole === 'co_owner' ? 'Co-owner added' : 'Co-owner removed', 'success');
      await load();
      await refreshPerms();
    } catch (err) { showToast((err as Error).message, 'error'); }
    finally { setTogglingRole(null); }
  }

  async function handleDecideRequest(requestId: string, action: 'approve' | 'reject') {
    if (!activeProduct) return;
    setDecidingId(requestId);
    try {
      await api.accessRequests.decide(activeProduct.id, requestId, action);
      showToast(action === 'approve' ? 'Approved' : 'Rejected', 'success');
      await loadAccessRequests();
      if (action === 'approve') await load();
    } catch (err) { showToast((err as Error).message, 'error'); }
    finally { setDecidingId(null); }
  }

  async function transferOwnership() {
    if (!activeProduct || !transferTo) return;
    if (!confirm(`Transfer ownership of "${activeProduct.name}"? You will become a regular member.`)) return;
    setTransferring(true);
    try {
      await api.products.update(activeProduct.id, { ownerId: transferTo });
      await refreshProducts();
      await refreshPerms();
      showToast('Ownership transferred', 'success');
      setTransferTo('');
    } catch (err) { showToast((err as Error).message, 'error'); }
    finally { setTransferring(false); }
  }

  if (!activeProduct) {
    return (
      <div className="h-full flex items-center justify-center" style={{ color: 'var(--text-3)' }}>
        <p className="text-sm">Select a project to manage its settings.</p>
      </div>
    );
  }

  if (!canManage) {
    async function leaveProject() {
      if (!activeProduct || !currentUser) return;
      if (!confirm(`Leave "${activeProduct.name}"? You will lose access until re-invited.`)) return;
      try {
        await api.teams.removeMember(activeProduct.teamId, currentUser.id);
        await refreshProducts();
      } catch (err) { showToast((err as Error).message, 'error'); }
    }
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ color: 'var(--text-3)' }}>
        <span className="text-4xl opacity-30">🔒</span>
        <p className="text-sm">Only the project owner and co-owners can access settings.</p>
        <button
          onClick={leaveProject}
          className="text-sm px-4 py-2 rounded-lg transition-colors"
          style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.06)'; }}
        >Leave project</button>
      </div>
    );
  }

  const members = team?.members ?? [];
  const ownerMember = members.find(m => m.userId === activeProduct.ownerId);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page header + tab bar */}
      <div className="px-6 pt-6 flex-shrink-0">
        <h1 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--text)' }}>
          {activeProduct.emoji && <span className="mr-2">{activeProduct.emoji}</span>}
          {activeProduct.name} — Settings
        </h1>
        {ownerMember && (
          <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
            Owner: <span style={{ color: 'var(--text-2)' }}>{ownerMember.user.avatarEmoji} {ownerMember.user.username}</span>
            {isOwner && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}>You</span>}
          </p>
        )}
        <div className="flex gap-0 border-b overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
          {PAGE_TABS.filter(t => !t.ownerOnly || isOwner).map(({ key, label, danger }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="px-4 py-2 text-sm font-medium transition-colors flex-shrink-0"
              style={{
                color: danger
                  ? (activeTab === key ? '#ef4444' : 'rgba(239,68,68,0.6)')
                  : (activeTab === key ? 'var(--brand)' : 'var(--text-3)'),
                borderBottom: activeTab === key
                  ? `2px solid ${danger ? '#ef4444' : 'var(--brand)'}`
                  : '2px solid transparent',
                marginBottom: -1,
              }}
            >{label}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">

        {/* ── Team tab ── */}
        {activeTab === 'team' && (
          <div className="max-w-2xl space-y-8">
            <div>
              <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Add member</h2>
              <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>Search for a registered user and add them directly to the project.</p>
              {(() => {
                const memberIds = new Set(members.map(m => m.userId));
                const q = addSearch.toLowerCase().trim();
                const suggestions = q.length >= 1
                  ? allUsers.filter(u => !memberIds.has(u.id) && u.username.toLowerCase().includes(q)).slice(0, 6)
                  : [];
                return (
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
                        {suggestions.map(u => (
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
                );
              })()}
            </div>

            <div>
              <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Members</h2>
              <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
                Co-owners can manage settings and approve access requests.
              </p>
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
                          {isProductOwner && <RoleBadge role="owner" />}
                          {!isProductOwner && isCoOwner && <RoleBadge role="co_owner" />}
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
                          className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0 transition-colors"
                          style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', background: 'transparent' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >Remove</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Invite links ── */}
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
                  placeholder="Email (optional — leave blank for a link only)"
                  className="input text-sm flex-1 min-w-48"
                />
                <button
                  disabled={creatingInvite}
                  className="btn-primary text-sm flex-shrink-0"
                  onClick={async () => {
                    if (!team) return;
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
                        <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                          Expires {new Date(inv.expiresAt).toLocaleDateString()}
                        </p>
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
                          if (!team) return;
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
        )}

        {/* ── Permissions tab ── */}
        {activeTab === 'permissions' && (
          <div className="max-w-4xl">
            <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Tab access</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>Control which tabs each member can view or edit. Owner and co-owners always have full write access.</p>

            <div className="flex items-center gap-4 mb-4 flex-wrap">
              {LEVELS.map(({ value, label, color }) => (
                <div key={value} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                    {label}{value === 'none' ? ' — hidden' : value === 'read' ? ' — view only' : ' — full access'}
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <div className="flex items-center px-4 py-2.5" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                <div className="w-44 flex-shrink-0 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Member</div>
                {FEATURE_TABS.map(({ key, label }) => (
                  <div key={key} className="flex-1 text-center text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{label}</div>
                ))}
              </div>
              {members.length === 0 && (
                <div className="px-4 py-6 text-sm text-center" style={{ color: 'var(--text-3)' }}>No members yet.</div>
              )}
              {members.map(({ userId, user, role }, idx) => {
                const isProductOwner = userId === activeProduct.ownerId;
                const isPrivileged = isProductOwner || role === 'co_owner';
                return (
                  <div
                    key={userId}
                    className="flex items-center px-4 py-3"
                    style={{
                      background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                      borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <div className="w-44 flex-shrink-0 flex items-center gap-2 min-w-0">
                      <span className="text-base flex-shrink-0">{user.avatarEmoji ?? '👤'}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm truncate" style={{ color: 'var(--text)' }}>{user.username}</span>
                          {isProductOwner && <RoleBadge role="owner" />}
                          {!isProductOwner && role === 'co_owner' && <RoleBadge role="co_owner" />}
                        </div>
                      </div>
                    </div>
                    {FEATURE_TABS.map(({ key }) => {
                      const level = matrix[userId]?.[key] ?? 'write';
                      return (
                        <div key={key} className="flex-1 flex justify-center">
                          {isPrivileged ? (
                            <span className="text-xs px-2 py-1 rounded-lg font-medium" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>Write</span>
                          ) : (
                            <select
                              value={level}
                              onChange={(e) => setLevel(userId, key, e.target.value)}
                              className="text-xs rounded-lg px-2 py-1 font-medium"
                              style={{
                                background: level === 'write' ? 'rgba(16,185,129,0.12)' : level === 'read' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                                color: level === 'write' ? '#10b981' : level === 'read' ? '#f59e0b' : '#ef4444',
                                border: `1px solid ${level === 'write' ? 'rgba(16,185,129,0.3)' : level === 'read' ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
                                outline: 'none',
                              }}
                            >
                              {LEVELS.map(({ value, label }) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="mt-4">
              <button onClick={savePermissions} disabled={saving} className="btn-primary flex justify-center" style={{ minWidth: 140 }}>
                {saving ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Save permissions'}
              </button>
            </div>
          </div>
        )}

        {/* ── Color labels tab ── */}
        {activeTab === 'colors' && (
          <div className="max-w-lg">
            <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Color labels</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>Toggle which colors are active and give them a name for this project.</p>
            <div className="space-y-2">
              {COLORS.map((color) => {
                const on = enabledColors.includes(color);
                return (
                  <div
                    key={color}
                    className="flex items-center gap-4 px-4 py-3 rounded-xl transition-opacity"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', opacity: on ? 1 : 0.45 }}
                  >
                    <button
                      onClick={() => toggleEnabled(color)}
                      title={on ? 'Disable' : 'Enable'}
                      className="w-6 h-6 rounded-full flex-shrink-0 transition-all"
                      style={{ background: color, boxShadow: on ? `0 0 0 2px var(--surface-2), 0 0 0 3.5px ${color}` : 'none' }}
                    />
                    <input
                      type="text"
                      value={legend[color] ?? ''}
                      onChange={(e) => updateLegend(color, e.target.value)}
                      className="flex-1 bg-transparent text-sm outline-none"
                      style={{ color: 'var(--text)' }}
                      placeholder="e.g. Bug, Feature, Design…"
                    />
                    <span className="text-xs flex-shrink-0" style={{ color: on ? 'var(--brand)' : 'var(--text-3)' }}>
                      {on ? 'Active' : 'Hidden'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Ownership tab (owner only) ── */}
        {activeTab === 'ownership' && isOwner && (
          <div className="max-w-lg space-y-8">
            <div>
              <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Export project data</h2>
              <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
                Download a complete JSON export of this project including all tasks, sprints, messages, and settings.
              </p>
              <a
                href={activeProduct ? api.export.product(activeProduct.id) : '#'}
                download
                className="btn-secondary text-sm inline-flex items-center gap-2"
                style={{ textDecoration: 'none' }}
              >
                <span>⬇</span> Export as JSON
              </a>
            </div>

            <div>
              <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Transfer ownership</h2>
              <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
                Hand over ownership to another team member. You will become a regular member after this action.
              </p>
              <div className="flex gap-3 items-center">
                <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)} className="input text-sm flex-1 max-w-xs">
                  <option value="">Select new owner…</option>
                  {members.filter(({ userId }) => userId !== currentUser?.id).map(({ userId, user }) => (
                    <option key={userId} value={userId}>{user.avatarEmoji} {user.username}</option>
                  ))}
                </select>
                <button
                  onClick={transferOwnership}
                  disabled={!transferTo || transferring}
                  className="btn-secondary text-sm"
                  style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                >
                  {transferring ? 'Transferring…' : 'Transfer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Apps tab ── */}
        {activeTab === 'apps' && (
          <div className="max-w-2xl space-y-10">

            {/* ── App registrations ── */}
            <div>
              <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>App registrations</h2>
              <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
                Create named apps (bots, integrations, CI pipelines) and issue tokens for each.
                App tokens act with your permissions. Useful for separating automation from personal access.
              </p>

              {/* Create app form */}
              <div className="flex gap-3 mb-4">
                <input
                  type="text"
                  value={newAppName}
                  onChange={(e) => setNewAppName(e.target.value)}
                  placeholder="App name (e.g. Slack bot)"
                  className="input text-sm flex-1"
                />
                <button
                  disabled={!newAppName.trim() || creatingApp}
                  className="btn-primary text-sm flex-shrink-0"
                  onClick={async () => {
                    setCreatingApp(true);
                    try {
                      await api.appRegistrations.create({ name: newAppName.trim() });
                      setNewAppName(''); await loadTokens();
                    } catch (err) { showToast((err as Error).message, 'error'); }
                    finally { setCreatingApp(false); }
                  }}
                >
                  {creatingApp ? '…' : 'Create app'}
                </button>
              </div>

              {/* One-time reveal */}
              {revealedToken && (
                <div className="p-4 rounded-xl mb-4" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)' }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: '#10b981' }}>Copy this token now — it will not be shown again.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs break-all px-3 py-2 rounded-lg" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                      {revealedToken}
                    </code>
                    <button className="btn-secondary text-xs flex-shrink-0" onClick={() => { navigator.clipboard.writeText(revealedToken); showToast('Copied!', 'success'); }}>Copy</button>
                    <button className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }} onClick={() => setRevealedToken(null)}>Dismiss</button>
                  </div>
                </div>
              )}

              {/* App list */}
              {apps.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-3)' }}>No apps registered yet.</p>
              ) : (
                <div className="space-y-3">
                  {apps.map((app) => (
                    <div key={app.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                      <div
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                        style={{ background: selectedAppId === app.id ? 'var(--brand-subtle)' : 'var(--surface-2)' }}
                        onClick={() => setSelectedAppId(selectedAppId === app.id ? null : app.id)}
                      >
                        <span className="text-lg flex-shrink-0">🤖</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{app.name}</p>
                          <p className="text-xs" style={{ color: 'var(--text-3)' }}>Created {new Date(app.createdAt).toLocaleDateString()}</p>
                        </div>
                        <span className="text-xs" style={{ color: 'var(--text-3)' }}>{selectedAppId === app.id ? '▲' : '▼'}</span>
                        <button
                          className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0"
                          style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm(`Delete app "${app.name}" and all its tokens?`)) return;
                            try { await api.appRegistrations.delete(app.id); await loadTokens(); showToast('App deleted', 'success'); }
                            catch (err) { showToast((err as Error).message, 'error'); }
                          }}
                        >Delete</button>
                      </div>

                      {/* App token management (expanded) */}
                      {selectedAppId === app.id && (
                        <div className="px-4 pb-4 pt-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                          <div className="flex gap-3 mb-3">
                            <input
                              type="text"
                              value={newAppTokenName}
                              onChange={(e) => setNewAppTokenName(e.target.value)}
                              placeholder="Token name"
                              className="input text-sm flex-1"
                            />
                            <button
                              disabled={!newAppTokenName.trim()}
                              className="btn-primary text-sm flex-shrink-0"
                              onClick={async () => {
                                try {
                                  const t = await api.appRegistrations.createToken(app.id, { name: newAppTokenName.trim() });
                                  setRevealedToken(t.token ?? null);
                                  setNewAppTokenName('');
                                  const ts = await api.appRegistrations.listTokens(app.id);
                                  setAppTokens(ts);
                                } catch (err) { showToast((err as Error).message, 'error'); }
                              }}
                            >Issue token</button>
                          </div>
                          {appTokens.length === 0 ? (
                            <p className="text-xs" style={{ color: 'var(--text-3)' }}>No tokens yet.</p>
                          ) : (
                            <div className="space-y-1">
                              {appTokens.map((t) => (
                                <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                                  <span className="text-sm flex-shrink-0">🔑</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{t.name}</p>
                                    <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                                      {t.lastUsedAt ? `Last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : 'Never used'}
                                      {t.expiresAt && ` · Expires ${new Date(t.expiresAt).toLocaleDateString()}`}
                                    </p>
                                  </div>
                                  <button
                                    className="text-[10px] px-2 py-0.5 rounded flex-shrink-0"
                                    style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
                                    onClick={async () => {
                                      if (!confirm(`Revoke "${t.name}"?`)) return;
                                      try {
                                        await api.appRegistrations.deleteToken(app.id, t.id);
                                        setAppTokens((prev) => prev.filter((x) => x.id !== t.id));
                                        showToast('Token revoked', 'success');
                                      } catch (err) { showToast((err as Error).message, 'error'); }
                                    }}
                                  >Revoke</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Usage hint */}
              <div className="mt-6 p-4 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-2)' }}>Using app tokens</p>
                <p className="text-xs mb-2" style={{ color: 'var(--text-3)' }}>Pass the token in the Authorization header. For personal access tokens, use the <strong>Integrations</strong> option in the account menu.</p>
                <code className="block text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                  Authorization: Bearer planly_…
                </code>
              </div>
            </div>

          </div>
        )}

        {/* ── Webhooks tab ── */}
        {activeTab === 'webhooks' && (
          <div className="max-w-2xl space-y-6">
            <div>
              <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Webhooks</h2>
              <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
                Webhooks send HTTP POST requests to your URL when events happen in this project.
                Each delivery is signed with HMAC-SHA256 using the webhook secret in the <code>X-Planly-Signature</code> header.
              </p>

              {/* Create webhook */}
              <div className="p-4 rounded-xl mb-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text)' }}>Add webhook</h3>
                <div className="space-y-3">
                  <input
                    type="url"
                    value={newWebhookUrl}
                    onChange={(e) => setNewWebhookUrl(e.target.value)}
                    placeholder="https://your-server.com/webhook"
                    className="input text-sm w-full"
                  />
                  <div>
                    <p className="text-xs mb-2" style={{ color: 'var(--text-3)' }}>Events to send:</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {WEBHOOK_EVENTS.map(({ value, label }) => (
                        <label key={value} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newWebhookEvents.includes(value)}
                            onChange={(e) => setNewWebhookEvents((prev) =>
                              e.target.checked ? [...prev, value] : prev.filter((x) => x !== value)
                            )}
                            className="rounded"
                          />
                          <span className="text-xs" style={{ color: 'var(--text-2)' }}>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <button
                    disabled={!newWebhookUrl.trim() || newWebhookEvents.length === 0 || creatingWebhook}
                    className="btn-primary text-sm"
                    onClick={async () => {
                      if (!activeProduct) return;
                      setCreatingWebhook(true);
                      try {
                        const wh = await api.webhooks.create(activeProduct.id, { url: newWebhookUrl, events: newWebhookEvents });
                        setRevealedSecret(wh.secret!);
                        setNewWebhookUrl(''); setNewWebhookEvents([]);
                        await loadWebhooks();
                        showToast('Webhook created', 'success');
                      } catch (err) { showToast((err as Error).message, 'error'); }
                      finally { setCreatingWebhook(false); }
                    }}
                  >{creatingWebhook ? '…' : 'Add webhook'}</button>
                </div>
              </div>

              {/* One-time secret reveal */}
              {revealedSecret && (
                <div className="p-4 rounded-xl mb-4" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)' }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: '#10b981' }}>Save this secret — it will not be shown again.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs break-all px-3 py-2 rounded-lg" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                      {revealedSecret}
                    </code>
                    <button
                      className="btn-secondary text-xs flex-shrink-0"
                      onClick={() => { navigator.clipboard.writeText(revealedSecret); showToast('Copied!', 'success'); }}
                    >Copy</button>
                    <button className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }} onClick={() => setRevealedSecret(null)}>Dismiss</button>
                  </div>
                </div>
              )}

              {/* Webhook list */}
              {webhooks.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-3)' }}>No webhooks configured.</p>
              ) : (
                <div className="space-y-3">
                  {webhooks.map((wh) => (
                    <div key={wh.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                      <div className="px-4 py-3 flex items-center gap-3" style={{ background: 'var(--surface-2)' }}>
                        <span className="text-base flex-shrink-0">{wh.active ? '✅' : '⏸️'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{wh.url}</p>
                          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                            {wh.events.length} event{wh.events.length !== 1 ? 's' : ''} · Created {new Date(wh.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            className="text-xs px-2.5 py-1 rounded-lg"
                            style={{ color: wh.active ? 'var(--text-3)' : 'var(--brand)', border: '1px solid var(--border)', background: 'transparent' }}
                            onClick={async () => {
                              if (!activeProduct) return;
                              try {
                                await api.webhooks.update(activeProduct.id, wh.id, { active: !wh.active });
                                await loadWebhooks();
                              } catch (err) { showToast((err as Error).message, 'error'); }
                            }}
                          >{wh.active ? 'Disable' : 'Enable'}</button>
                          <button
                            className="text-xs px-2.5 py-1 rounded-lg"
                            style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', background: 'transparent' }}
                            onClick={async () => {
                              if (!activeProduct || !confirm('Delete this webhook?')) return;
                              try { await api.webhooks.delete(activeProduct.id, wh.id); await loadWebhooks(); showToast('Deleted', 'success'); }
                              catch (err) { showToast((err as Error).message, 'error'); }
                            }}
                          >Delete</button>
                        </div>
                      </div>
                      <div className="px-4 py-2 flex flex-wrap gap-1.5" style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
                        {wh.events.map((ev) => (
                          <span key={ev} className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                            {ev}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Verification hint */}
              <div className="mt-6 p-4 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-2)' }}>Verifying webhook signatures</p>
                <code className="block text-xs px-3 py-2 rounded-lg whitespace-pre" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>{`const sig = req.headers['x-planly-signature'];
const expected = 'sha256=' +
  crypto.createHmac('sha256', SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');
if (sig !== expected) throw new Error('Bad signature');`}</code>
              </div>
            </div>
          </div>
        )}

        {/* ── Danger zone tab ── */}
        {activeTab === 'danger' && (
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
                    if (!activeProduct || !currentUser) return;
                    if (!confirm(`Leave "${activeProduct.name}"? You will lose access until re-invited.`)) return;
                    try {
                      await api.teams.removeMember(activeProduct.teamId, currentUser.id);
                      await refreshProducts();
                    } catch (err) { showToast((err as Error).message, 'error'); }
                  }}
                  className="text-sm px-4 py-2 rounded-lg transition-colors"
                  style={{ color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.06)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.12)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.06)'; }}
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
                    if (!activeProduct) return;
                    if (!confirm(`Delete "${activeProduct.name}"? All tasks will be permanently deleted. This cannot be undone.`)) return;
                    try {
                      await api.products.delete(activeProduct.id);
                      await refreshProducts();
                    } catch (err) { showToast((err as Error).message, 'error'); }
                  }}
                  className="text-sm px-4 py-2 rounded-lg transition-colors"
                  style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.06)'; }}
                >Delete project</button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
