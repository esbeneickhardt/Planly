/**
 * Search command palette for admin mode - a sibling to SearchModal.tsx, mirroring its shell
 * (backdrop, input, tab-filtered results, ↑↓/←→/Enter/Esc keyboard nav, 300ms debounce for the
 * server-backed section) but scoped to admin-mode data: admin panel settings tabs, the user's own
 * personal/profile settings (same items SearchModal surfaces, since those aren't project-scoped
 * and are just as reachable from admin mode), platform-wide projects, and admin chat.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, displayName } from '../../api/client';
import type { Message } from '../../api/client';
import { useChat } from '../../context/ChatContext';
import { useProfileModals } from '../../context/ProfileModalsContext';
import { ADMIN_TABS } from './TopBar';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback';

interface AdminProject {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
}

type TabFilter = 'all' | 'settings' | 'projects' | 'chat';

type NavItem = {
  key: string;
  label: string;
  subtitle: string;
  keywords: string[];
  icon: React.ReactNode;
  action: () => void;
};

interface Props {
  onClose: () => void;
}

export default function AdminSearchModal({ onClose }: Props) {
  const navigate = useNavigate();
  const { openChat } = useChat();
  const { openProfileModal } = useProfileModals();
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [chatResults, setChatResults] = useState<Message[]>([]);
  const [searchingChat, setSearchingChat] = useState(false);
  const [tab, setTab] = useState<TabFilter>('all');
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Projects list is small and un-paginated - fetch once and filter client-side, same idiom
  // SearchModal.tsx uses for the user's own product list.
  useEffect(() => {
    inputRef.current?.focus();
    api.admin
      .projects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  // Admin chat search - 300ms debounce.
  const [scheduleSearch, cancelSearch] = useDebouncedCallback(async (q: string) => {
    setSearchingChat(true);
    try {
      setChatResults(await api.adminChat.list(undefined, q));
    } catch {
      setChatResults([]);
    } finally {
      setSearchingChat(false);
    }
  }, 300);

  useEffect(() => {
    // Unconditional, before the length check below - cancels a still-pending search from a
    // previous (now stale) query, even on a run that itself doesn't schedule a new one.
    cancelSearch();
    setHighlightIdx(-1);
    const q = query.trim();
    if (q.length < 2) {
      setChatResults([]);
      return;
    }
    scheduleSearch(q);
  }, [query, scheduleSearch, cancelSearch]);

  function goToTab(key: string) {
    navigate(`/admin?tab=${key}`);
    onClose();
  }

  function openChatResult() {
    openChat();
    onClose();
  }

  // Settings results: the admin panel's own tabs plus the user's personal/profile settings -
  // the same items SearchModal surfaces (they're user-level, not project-scoped, so they apply
  // just as much in admin mode). Unlike the label-substring-only matching this modal used to do,
  // this also matches on subtitle/keywords like SearchModal, so e.g. "2fa" finds Security.
  // Not memoized - this list is cheap to rebuild every render (a handful of static entries), and
  // memoizing it would need `goToTab`/`openProfileModal`/`onClose` in the dep array anyway, which
  // are recreated each render regardless.
  const settingsNavItems: NavItem[] = [
      ...ADMIN_TABS.map((t) => ({
        key: `admin-${t.key}`,
        label: t.label,
        subtitle: 'Admin panel',
        keywords: ADMIN_TAB_KEYWORDS[t.key] ?? [t.label.toLowerCase()],
        icon: <t.Icon size={16} />,
        action: () => goToTab(t.key),
      })),
      {
        key: 'profile-theme',
        label: 'Profile - Appearance',
        subtitle: 'Theme, colors, mobile nav position',
        keywords: ['appearance', 'theme', 'themes', 'color', 'colors', 'dark mode', 'light mode', 'style'],
        icon: '🎨',
        action: () => {
          openProfileModal('theme');
          onClose();
        },
      },
      {
        key: 'profile-notifications',
        label: 'Profile - Notification Settings',
        subtitle: 'Email & in-app notification preferences',
        keywords: ['notification', 'notifications', 'email', 'alerts', 'preferences'],
        icon: '🔔',
        action: () => {
          openProfileModal('notifications');
          onClose();
        },
      },
      {
        key: 'profile-privacy',
        label: 'Profile - Privacy',
        subtitle: 'Who can invite you, activity visibility',
        keywords: ['privacy', 'invite', 'invites', 'visibility'],
        icon: '🔒',
        action: () => {
          openProfileModal('privacy');
          onClose();
        },
      },
      {
        key: 'profile-integrations',
        label: 'Profile - Integrations',
        subtitle: 'API tokens & connected apps',
        keywords: ['integration', 'integrations', 'api', 'token', 'tokens', 'app', 'apps'],
        icon: '🔗',
        action: () => {
          openProfileModal('integrations');
          onClose();
        },
      },
      {
        key: 'profile-security',
        label: 'Profile - Security (2FA)',
        subtitle: 'Two-factor authentication',
        keywords: ['security', '2fa', 'mfa', 'two factor', 'authenticator', 'totp'],
        icon: '🛡️',
        action: () => {
          openProfileModal('security');
          onClose();
        },
      },
      {
        key: 'profile-change-password',
        label: 'Profile - Change Password',
        subtitle: 'Update your account password',
        keywords: ['password', 'change password'],
        icon: '🔑',
        action: () => {
          openProfileModal('changePassword');
          onClose();
        },
      },
      {
        key: 'profile-memberships',
        label: 'Profile - Memberships',
        subtitle: 'Projects you belong to',
        keywords: ['membership', 'memberships', 'projects', 'teams'],
        icon: '👥',
        action: () => {
          openProfileModal('memberships');
          onClose();
        },
      },
  ];

  const q = query.trim().toLowerCase();
  const matchingNav =
    q.length >= 2
      ? settingsNavItems.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.subtitle.toLowerCase().includes(q) ||
            item.keywords.some((k) => k.includes(q) || q.includes(k)),
        )
      : [];
  const matchingProjects =
    q.length >= 2
      ? projects.filter((p) => p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q))
      : [];

  const TAB_ORDER: TabFilter[] = ['all', 'settings', 'projects', 'chat'];
  const TAB_LABELS: Record<TabFilter, string> = { all: 'All', settings: 'Settings', projects: 'Projects', chat: 'Chat' };
  const tabCounts: Record<TabFilter, number> = {
    all: matchingNav.length + matchingProjects.length + chatResults.length,
    settings: matchingNav.length,
    projects: matchingProjects.length,
    chat: chatResults.length,
  };
  const showTabs = q.length >= 2 && (matchingNav.length > 0 || matchingProjects.length > 0 || chatResults.length > 0);

  type FlatItem =
    | { type: 'nav'; item: NavItem }
    | { type: 'project'; project: AdminProject }
    | { type: 'chat'; msg: Message }
    | { type: 'quicknav'; tabKey: string };
  // Mirrors the visual row order below - not memoized, same reasoning as settingsNavItems above.
  const allItems: FlatItem[] = [];
  if (q.length < 2) {
    // Before typing anything, jump straight to any admin tab - the same "Navigate" quick-list
    // SearchModal shows for project views, so admin search isn't a dead end until you type.
    ADMIN_TABS.forEach((t) => allItems.push({ type: 'quicknav', tabKey: t.key }));
  } else {
    if (tab === 'all' || tab === 'settings') matchingNav.forEach((item) => allItems.push({ type: 'nav', item }));
    if (tab === 'all' || tab === 'projects') matchingProjects.forEach((project) => allItems.push({ type: 'project', project }));
    if (tab === 'all' || tab === 'chat') chatResults.forEach((msg) => allItems.push({ type: 'chat', msg }));
  }

  const hasResults = matchingNav.length > 0 || matchingProjects.length > 0 || chatResults.length > 0;

  useEffect(() => {
    if (highlightIdx < 0) return;
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector(`[data-idx="${highlightIdx}"]`) as HTMLElement | null;
      el?.scrollIntoView({ block: 'nearest' });
    });
  }, [highlightIdx]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && showTabs) {
      e.preventDefault();
      const cur = TAB_ORDER.indexOf(tab);
      const next =
        e.key === 'ArrowRight'
          ? TAB_ORDER[(cur + 1) % TAB_ORDER.length]
          : TAB_ORDER[(cur - 1 + TAB_ORDER.length) % TAB_ORDER.length];
      setTab(next!);
      setHighlightIdx(-1);
      return;
    }
    if (allItems.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault();
      const item = allItems[highlightIdx];
      if (!item) return;
      if (item.type === 'nav') item.item.action();
      else if (item.type === 'project') goToTab('projects');
      else if (item.type === 'chat') openChatResult();
      else if (item.type === 'quicknav') goToTab(item.tabKey);
    }
  }

  let rowIdx = -1;

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- mouse-only backdrop dismiss; Escape (handled in handleKeyDown above) is the keyboard-accessible equivalent */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only guard against the backdrop's onClick */}
      <div
        className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 flex flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '60vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.4"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search admin settings, projects, chat…"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--text)' }}
          />
          {searchingChat && (
            <div
              className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin flex-shrink-0"
              style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }}
            />
          )}
          <kbd
            className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
            style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}
          >
            Esc
          </kbd>
        </div>

        {/* Type filter tabs - shown as soon as any results exist, same pattern as SearchModal */}
        {showTabs && (
          <div className="flex items-center gap-1 px-4 pt-2 pb-0 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            {TAB_ORDER.map((t) => {
              const count = tabCounts[t];
              return (
                <button
                  key={t}
                  onClick={() => {
                    setTab(t);
                    setHighlightIdx(-1);
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-t-md transition-all relative"
                  style={{
                    color: tab === t ? 'var(--brand)' : count === 0 ? 'var(--text-3)' : 'var(--text-2)',
                    background: tab === t ? 'var(--brand-subtle)' : 'transparent',
                    borderBottom: tab === t ? '2px solid var(--brand)' : '2px solid transparent',
                    marginBottom: -1,
                    opacity: count === 0 && t !== 'all' ? 0.45 : 1,
                  }}
                >
                  {TAB_LABELS[t]}
                  {count > 0 && <span style={{ opacity: 0.7 }}> ({count})</span>}
                </button>
              );
            })}
          </div>
        )}

        <div ref={listRef} className="overflow-y-auto">
          {q.length < 2 ? (
            <div className="py-1.5">
              <p
                className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: 'var(--text-3)' }}
              >
                Navigate
              </p>
              {ADMIN_TABS.map((t) => {
                rowIdx++;
                const i = rowIdx;
                const isHighlighted = highlightIdx === i;
                return (
                  <button
                    key={t.key}
                    data-idx={i}
                    onClick={() => goToTab(t.key)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors"
                    style={{ background: isHighlighted ? 'var(--brand-subtle)' : 'transparent', color: 'var(--text-2)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')
                    }
                  >
                    <span className="text-base flex-shrink-0 w-5 text-center">
                      <t.Icon size={16} />
                    </span>
                    <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : !hasResults ? (
            <p className="px-4 py-6 text-sm text-center" style={{ color: 'var(--text-3)' }}>
              No results for "{query.trim()}"
            </p>
          ) : (
            <>
              {(tab === 'all' || tab === 'settings') && matchingNav.length > 0 && (
                <div className="py-2">
                  <p
                    className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--text-3)' }}
                  >
                    Settings
                  </p>
                  {matchingNav.map((item) => {
                    rowIdx++;
                    const i = rowIdx;
                    const isHighlighted = highlightIdx === i;
                    return (
                      <button
                        key={item.key}
                        data-idx={i}
                        onClick={item.action}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors"
                        style={{ background: isHighlighted ? 'var(--brand-subtle)' : 'transparent', color: 'var(--text-2)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')
                        }
                      >
                        <span className="text-base flex-shrink-0 w-5 text-center">{item.icon}</span>
                        <span className="flex-1 min-w-0">
                          <span className="text-sm font-medium block" style={{ color: 'var(--text)' }}>
                            {item.label}
                          </span>
                          <span className="text-xs block" style={{ color: 'var(--text-3)' }}>
                            {item.subtitle}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {(tab === 'all' || tab === 'projects') && matchingProjects.length > 0 && (
                <div className="py-2" style={{ borderTop: rowIdx >= 0 ? '1px solid var(--border)' : 'none' }}>
                  <p
                    className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--text-3)' }}
                  >
                    Projects
                  </p>
                  {matchingProjects.slice(0, 20).map((p) => {
                    rowIdx++;
                    const i = rowIdx;
                    const isHighlighted = highlightIdx === i;
                    return (
                      <button
                        key={p.id}
                        data-idx={i}
                        onClick={() => goToTab('projects')}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors"
                        style={{ background: isHighlighted ? 'var(--brand-subtle)' : 'transparent', color: 'var(--text-2)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')
                        }
                      >
                        <span className="flex-shrink-0">{p.emoji ?? '🎯'}</span>
                        <span className="flex-1 min-w-0 truncate">{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {(tab === 'all' || tab === 'chat') && chatResults.length > 0 && (
                <div className="py-2" style={{ borderTop: rowIdx >= 0 ? '1px solid var(--border)' : 'none' }}>
                  <p
                    className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--text-3)' }}
                  >
                    Admin chat
                  </p>
                  {chatResults.map((m) => {
                    rowIdx++;
                    const i = rowIdx;
                    const isHighlighted = highlightIdx === i;
                    return (
                      <button
                        key={m.id}
                        data-idx={i}
                        onClick={openChatResult}
                        className="w-full flex items-start gap-3 px-4 py-2 text-sm text-left transition-colors"
                        style={{ background: isHighlighted ? 'var(--brand-subtle)' : 'transparent', color: 'var(--text-2)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')
                        }
                      >
                        <span className="flex-shrink-0">{m.author.avatarEmoji ?? '👤'}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate">{m.content}</span>
                          <span className="block text-xs" style={{ color: 'var(--text-3)' }}>
                            {displayName(m.author)} · {new Date(m.createdAt).toLocaleDateString()}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer hint */}
        <div
          className="px-4 py-2 flex items-center gap-4 text-xs flex-shrink-0"
          style={{ borderTop: '1px solid var(--border)', color: 'var(--text-3)' }}
        >
          <span>↑↓ navigate · ←→ switch tab · Enter open · Esc close</span>
        </div>
      </div>
    </>
  );
}

// Keyword synonyms per admin tab so e.g. "2fa"/"firewall"/"history" find the right tab even
// though none of those words appear in the tab's own short label - same idea as SearchModal's
// per-nav-item keyword lists.
const ADMIN_TAB_KEYWORDS: Record<string, string[]> = {
  ownership: ['ownership', 'owner', 'transfer', 'transfer ownership'],
  users: ['users', 'accounts', 'people', 'manage users', 'roles'],
  projects: ['projects', 'products'],
  email: ['email', 'smtp', 'mail', 'mailer'],
  'ip-rules': ['networking', 'ip', 'ip rules', 'firewall', 'allowlist', 'blocklist', 'block', 'allow'],
  logs: ['audit', 'audit logs', 'logs', 'history', 'activity'],
  statistics: ['stats', 'statistics', 'analytics', 'metrics', 'usage'],
};
