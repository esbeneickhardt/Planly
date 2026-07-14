/**
 * Project settings shell gated to owners and co-owners, rendering sub-panels via a tab strip.
 * Active tab is synced with the `?tab=` search param so links can deep-link to a specific panel.
 * The team is fetched here and passed to sub-panels so they share a single up-to-date copy.
 */
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useProduct } from '../context/ProductContext';
import { usePermission } from '../context/PermissionContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import type { Team } from '../types';
import SettingsGeneral from './settings/SettingsGeneral';
import SettingsTeam from './settings/SettingsTeam';
import SettingsPermissions from './settings/SettingsPermissions';
import SettingsColors from './settings/SettingsColors';
import SettingsApps from './settings/SettingsApps';
import SettingsWebhooks from './settings/SettingsWebhooks';
import SettingsDanger from './settings/SettingsDanger';

type SettingsTab = 'project' | 'team' | 'permissions' | 'colors' | 'apps' | 'webhooks' | 'danger';

const PAGE_TABS: { key: SettingsTab; label: string; danger?: boolean }[] = [
  { key: 'project',     label: 'Project' },
  { key: 'team',        label: 'Team' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'colors',      label: 'Color labels' },
  { key: 'apps',        label: 'Apps' },
  { key: 'webhooks',    label: 'Webhooks' },
  { key: 'danger',      label: 'Danger zone', danger: true },
];

export default function SettingsPage() {
  const { activeProduct, refreshProducts } = useProduct();
  const { user: currentUser } = useAuth();
  const { refresh: refreshPerms, canManage, isOwner } = usePermission();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    const t = searchParams.get('tab') as SettingsTab | null;
    return PAGE_TABS.some((p) => p.key === t) ? t! : 'project';
  });

  // Keep active tab in sync when the URL changes (e.g. browser back/forward or external link)
  useEffect(() => {
    const t = searchParams.get('tab') as SettingsTab | null;
    if (t && PAGE_TABS.some((p) => p.key === t)) setActiveTab(t);
  }, [searchParams]);

  const [team, setTeam] = useState<Team | null>(null);

  const loadTeam = useCallback(async () => {
    if (!activeProduct) return;
    setTeam(await api.teams.get(activeProduct.teamId));
  }, [activeProduct?.id]);

  useEffect(() => { loadTeam(); }, [loadTeam]);

  if (!activeProduct) {
    return (
      <div className="h-full flex items-center justify-center" style={{ color: 'var(--text-3)' }}>
        <p className="text-sm">Select a project to manage its settings.</p>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ color: 'var(--text-3)' }}>
        <span className="text-4xl opacity-30">🔒</span>
        <p className="text-sm">Only the project owner and co-owners can access settings.</p>
        <button
          onClick={async () => {
            if (!currentUser) return;
            if (!await confirm(`Leave "${activeProduct.name}"? You will lose access until re-invited.`)) return;
            try {
              await api.teams.removeMember(activeProduct.teamId, currentUser.id);
              await refreshProducts();
            } catch (err) { showToast((err as Error).message, 'error'); }
          }}
          className="text-sm px-4 py-2 rounded-lg transition-colors bg-[rgba(239,68,68,0.06)] hover:bg-[rgba(239,68,68,0.12)]"
          style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
        >Leave project</button>
      </div>
    );
  }

  const members = team?.members ?? [];
  const ownerMember = members.find((m) => m.userId === activeProduct.ownerId);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-6 flex-shrink-0">
        <h1 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--text)' }}>
          {activeProduct.emoji && <span className="mr-2">{activeProduct.emoji}</span>}
          {activeProduct.name} - Settings
        </h1>
        {ownerMember && (
          <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
            Owner: <span style={{ color: 'var(--text-2)' }}>{ownerMember.user.avatarEmoji} {ownerMember.user.username}</span>
            {isOwner && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}>You</span>}
          </p>
        )}
      </div>
      {/* Tab strip in its own scrollable row so it can overflow on narrow screens */}
      <div className="flex-shrink-0 overflow-x-auto border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex px-6 min-w-max">
          {PAGE_TABS.map(({ key, label, danger }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap"
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
        {activeTab === 'project' && (
          <SettingsGeneral
            activeProduct={activeProduct}
            isOwner={isOwner}
            canManage={canManage}
            currentUser={currentUser}
            members={members}
            refreshProducts={refreshProducts}
            showToast={showToast}
            confirm={confirm}
          />
        )}

        {activeTab === 'team' && team && (
          <SettingsTeam
            team={team}
            members={members}
            activeProduct={activeProduct}
            canManage={canManage}
            isOwner={isOwner}
            currentUser={currentUser}
            onMembersChanged={loadTeam}
            showToast={showToast}
            confirm={confirm}
            refreshPerms={refreshPerms}
          />
        )}

        {activeTab === 'permissions' && (
          <SettingsPermissions
            activeProduct={activeProduct}
            members={members}
            refreshPerms={refreshPerms}
            showToast={showToast}
          />
        )}

        {activeTab === 'colors' && (
          <SettingsColors productId={activeProduct.id} />
        )}

        {activeTab === 'apps' && (
          <SettingsApps
            activeProduct={activeProduct}
            showToast={showToast}
            confirm={confirm}
          />
        )}

        {activeTab === 'webhooks' && (
          <SettingsWebhooks
            activeProduct={activeProduct}
            showToast={showToast}
            confirm={confirm}
          />
        )}

        {activeTab === 'danger' && (
          <SettingsDanger
            activeProduct={activeProduct}
            isOwner={isOwner}
            currentUser={currentUser}
            members={members}
            showToast={showToast}
            confirm={confirm}
            refreshProducts={refreshProducts}
          />
        )}
      </div>
    </div>
  );
}
