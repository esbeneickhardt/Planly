/**
 * Project settings shell gated to owners and co-owners, rendering sub-panels via a tab strip.
 * Active tab is synced with the `?tab=` search param so links can deep-link to a specific panel.
 * The team is fetched here and passed to sub-panels so they share a single up-to-date copy.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
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
  { key: 'project', label: 'Project' },
  { key: 'team', label: 'Team' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'colors', label: 'Color labels' },
  { key: 'apps', label: 'Apps' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'danger', label: 'Danger zone', danger: true },
];

export default function SettingsPage() {
  const { activeProduct, productsLoaded, refreshProducts, setActiveProduct } = useProduct();
  const { user: currentUser } = useAuth();
  const { refresh: refreshPerms, canManage, isOwner } = usePermission();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    const t = searchParams.get('tab') as SettingsTab | null;
    return PAGE_TABS.some((p) => p.key === t) ? t! : 'project';
  });

  // Mobile swipeable panels: scroll-snap container synced with activeTab, lazy-mounting each
  // panel only once it's actually been visited (visited panels stay mounted after that) so
  // swiping through the tabs doesn't fire every sub-page's data fetch all at once on open.
  const mobileScrollerRef = useRef<HTMLDivElement>(null);
  const [visitedTabs, setVisitedTabs] = useState<Set<SettingsTab>>(() => new Set([activeTab]));
  const tabButtonRefs = useRef<Map<SettingsTab, HTMLButtonElement>>(new Map());

  function scrollMobileToIndex(i: number) {
    const el = mobileScrollerRef.current;
    if (!el?.scrollTo) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  }

  function goToTab(key: SettingsTab) {
    setActiveTab(key);
    setVisitedTabs((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    const idx = PAGE_TABS.findIndex((t) => t.key === key);
    if (idx !== -1) scrollMobileToIndex(idx);
  }

  function onMobileScroll() {
    const el = mobileScrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    const key = PAGE_TABS[idx]?.key;
    if (key && key !== activeTab) {
      setActiveTab(key);
      setVisitedTabs((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    }
  }

  // Keep the active tab button scrolled into view within its own (horizontally scrollable) strip,
  // e.g. after swiping several panels past what's currently visible in the strip.
  useEffect(() => {
    tabButtonRefs.current.get(activeTab)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeTab]);

  // Keep active tab in sync when the URL changes (e.g. browser back/forward or external link)
  useEffect(() => {
    const t = searchParams.get('tab') as SettingsTab | null;
    if (t && PAGE_TABS.some((p) => p.key === t)) goToTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const [team, setTeam] = useState<Team | null>(null);

  const loadTeam = useCallback(async () => {
    if (!activeProduct) return;
    setTeam(await api.teams.get(activeProduct.teamId));
    // activeProduct: only `.id` drives this callback (a product's teamId doesn't change while its
    // id stays the same); object identity changes on every context re-render regardless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProduct?.id]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  if (!activeProduct) {
    // Still loading - show spinner rather than the empty-state message so the UI
    // doesn't flash "Select a project" during the auth→products→permissions chain.
    if (!productsLoaded) {
      return (
        <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg)' }}>
          <div
            className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }}
          />
        </div>
      );
    }
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
            if (!(await confirm(`Leave "${activeProduct.name}"? You will lose access until re-invited.`))) return;
            try {
              await api.teams.removeMember(activeProduct.teamId, currentUser.id);
              await refreshProducts();
            } catch (err) {
              showToast((err as Error).message, 'error');
            }
          }}
          className="text-sm px-4 py-2 rounded-lg transition-colors bg-[rgba(239,68,68,0.06)] hover:bg-[rgba(239,68,68,0.12)]"
          style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
        >
          Leave project
        </button>
      </div>
    );
  }

  const members = team?.members ?? [];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* No title/owner header here - the top navbar already shows the active project and that
          "Settings" is the current tab, so repeating both here was redundant. Tab strip in its own
          scrollable row so it can overflow on narrow screens. The full-width divider is desktop-only
          - on mobile the active tab's own short colored underline is enough, and a full-width line
          under it just doubled up and looked dated. */}
      <div className="flex-shrink-0 overflow-x-auto no-scrollbar md:border-b pt-4" style={{ borderColor: 'var(--border)' }}>
        <div className="flex justify-center px-6 min-w-max max-w-4xl mx-auto">
          {PAGE_TABS.map(({ key, label, danger }) => (
            <button
              key={key}
              ref={(el) => {
                if (el) tabButtonRefs.current.set(key, el);
                else tabButtonRefs.current.delete(key);
              }}
              onClick={() => goToTab(key)}
              className="px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap"
              style={{
                color: danger
                  ? activeTab === key
                    ? '#ef4444'
                    : 'rgba(239,68,68,0.6)'
                  : activeTab === key
                    ? 'var(--brand)'
                    : 'var(--text-3)',
                borderBottom:
                  activeTab === key ? `2px solid ${danger ? '#ef4444' : 'var(--brand)'}` : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {(() => {
        // Shared per-tab content, reused by both the desktop single-panel view and each mobile
        // swipeable section below, so the prop-wiring for each sub-page exists in exactly one place.
        function renderTabContent(key: SettingsTab) {
          switch (key) {
            case 'project':
              return (
                <SettingsGeneral
                  activeProduct={activeProduct!}
                  isOwner={isOwner}
                  canManage={canManage}
                  currentUser={currentUser}
                  members={members}
                  refreshProducts={refreshProducts}
                  setActiveProduct={setActiveProduct}
                  showToast={showToast}
                  confirm={confirm}
                />
              );
            case 'team':
              return team ? (
                <SettingsTeam
                  team={team}
                  members={members}
                  activeProduct={activeProduct!}
                  canManage={canManage}
                  isOwner={isOwner}
                  currentUser={currentUser}
                  onMembersChanged={loadTeam}
                  showToast={showToast}
                  confirm={confirm}
                  refreshPerms={refreshPerms}
                />
              ) : null;
            case 'permissions':
              return (
                <SettingsPermissions
                  activeProduct={activeProduct!}
                  members={members}
                  refreshPerms={refreshPerms}
                  showToast={showToast}
                />
              );
            case 'colors':
              return <SettingsColors productId={activeProduct!.id} />;
            case 'apps':
              return <SettingsApps activeProduct={activeProduct!} showToast={showToast} confirm={confirm} />;
            case 'webhooks':
              return <SettingsWebhooks activeProduct={activeProduct!} showToast={showToast} confirm={confirm} />;
            case 'danger':
              return (
                <SettingsDanger
                  activeProduct={activeProduct!}
                  isOwner={isOwner}
                  canManage={canManage}
                  currentUser={currentUser}
                  members={members}
                  showToast={showToast}
                  confirm={confirm}
                  refreshProducts={refreshProducts}
                />
              );
            default:
              return null;
          }
        }

        return (
          <>
            {/* Desktop: single active panel */}
            <div className="hidden md:block flex-1 overflow-y-auto px-6 py-6">{renderTabContent(activeTab)}</div>

            {/* Mobile: swipeable one-panel-at-a-time view (native scroll-snap), synced with the tab
                strip above in both directions - tapping a tab scrolls here, swiping here updates the
                tab strip. Panels lazy-mount on first visit and stay mounted after that. */}
            <div
              ref={mobileScrollerRef}
              onScroll={onMobileScroll}
              className="md:hidden flex-1 flex overflow-x-auto overflow-y-hidden"
              style={{ scrollSnapType: 'x mandatory' }}
            >
              {PAGE_TABS.map(({ key }) => (
                <section
                  key={key}
                  className="w-full flex-shrink-0 overflow-y-auto px-4 py-4"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  {visitedTabs.has(key) ? renderTabContent(key) : null}
                </section>
              ))}
            </div>
          </>
        );
      })()}
    </div>
  );
}
