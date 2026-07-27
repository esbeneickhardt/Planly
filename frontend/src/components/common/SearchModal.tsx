/**
 * Keyboard-navigable command palette that searches nav destinations, sprints, tasks, messages, and projects.
 * Nav items and sprints are filtered client-side; tasks and messages are fetched from the API with 300ms debounce.
 * `allItems` is a flat list in visual order so keyboard navigation (↑/↓/Enter) and `data-idx` attributes stay in sync.
 * Tabs narrow results: tasks-only, messages-only, settings-only, projects-only; 'all' shows everything with projects last.
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProduct } from '../../context/ProductContext';
import { useChat } from '../../context/ChatContext';
import { useProfileModals } from '../../context/ProfileModalsContext';
import { usePermission } from '../../context/PermissionContext';
import { useAuth } from '../../context/AuthContext';
import { api, displayName } from '../../api/client';
import type { Task, Product } from '../../types';
import type { SearchResults, Sprint } from '../../api/client';
import TaskDetailPanel from './TaskDetailPanel';

type MsgResult = SearchResults['messages'][number];
type TabFilter = 'all' | 'tasks' | 'messages' | 'settings' | 'projects';

type NavItem = {
  label: string;
  subtitle: string;
  /** Only used as a React key and as the destination when `action` is absent - personal/profile
   * items that open a modal instead of navigating use a unique `#`-prefixed placeholder here. */
  path: string;
  icon: string;
  keywords: string[];
  /** When present, runs instead of `navigate(path)` - used for items that open a modal
   * (personal settings, chat) or need to do something before navigating (create new task). */
  action?: () => void;
};

/** Returns true for settings/admin nav items so they can be separated into the Settings tab. */
function isSettingsNav(item: NavItem): boolean {
  return item.label.startsWith('Settings') || item.label.startsWith('Profile') || item.label === 'Admin Panel';
}

function buildNavItems(
  canRead: (tab: string) => boolean,
  canManage: boolean,
  isAdmin: boolean,
  announcementsEnabled?: boolean,
): NavItem[] {
  const items: NavItem[] = [];
  items.push({
    label: 'About',
    subtitle: 'Project overview & description',
    path: '/about',
    icon: 'ℹ️',
    keywords: ['about', 'overview', 'description', 'info', 'information', 'readme', 'summary', 'project'],
  });
  if (canRead('canvas'))
    items.push({
      label: 'Plan',
      subtitle: 'Canvas - dependency graph',
      path: '/canvas',
      icon: '◈',
      keywords: ['plan', 'canvas', 'dependency', 'dependencies', 'graph', 'layout', 'map', 'node'],
    });
  if (canRead('kanban'))
    items.push({
      label: 'Kanban',
      subtitle: 'Execute - board view',
      path: '/kanban',
      icon: '▦',
      keywords: ['kanban', 'board', 'execute', 'column', 'card', 'status', 'sprint backlog'],
    });
  if (canRead('gantt'))
    items.push({
      label: 'Gantt',
      subtitle: 'Progress - milestones & sprints',
      path: '/gantt',
      icon: '📅',
      keywords: [
        'gantt',
        'progress',
        'milestone',
        'milestones',
        'timeline',
        'deadline',
        'roadmap',
        'sprint',
        'sprints',
      ],
    });
  if (canRead('backlog'))
    items.push({
      label: 'Tasks',
      subtitle: 'All tasks list',
      path: '/backlog',
      icon: '☰',
      keywords: ['backlog', 'tasks', 'list', 'all tasks', 'task list'],
    });
  if (canRead('analytics'))
    items.push({
      label: 'Analytics',
      subtitle: 'Stats, charts & workload',
      path: '/analytics',
      icon: '📊',
      keywords: [
        'analytics',
        'stats',
        'statistics',
        'chart',
        'velocity',
        'throughput',
        'metrics',
        'workload',
        'performance',
        'insights',
        'data',
      ],
    });
  if (announcementsEnabled)
    items.push({
      label: 'Announcements',
      subtitle: 'Team & server posts',
      path: '/announcements',
      icon: '📢',
      keywords: ['announcement', 'announcements', 'news', 'update', 'updates', 'broadcast', 'notice', 'post'],
    });
  if (canManage) {
    items.push({
      label: 'Settings - Project',
      subtitle: 'Name, emoji, description, deadline',
      path: '/settings?tab=project',
      icon: '⚙️',
      keywords: ['settings', 'project', 'name', 'description', 'details', 'deadline', 'configuration', 'emoji'],
    });
    items.push({
      label: 'Settings - Team',
      subtitle: 'Members, roles, invites',
      path: '/settings?tab=team',
      icon: '👥',
      keywords: ['team', 'members', 'member', 'invite', 'role', 'people', 'collaborator', 'access request', 'co-owner'],
    });
    items.push({
      label: 'Settings - Permissions',
      subtitle: 'Tab-level access control',
      path: '/settings?tab=permissions',
      icon: '🔒',
      keywords: ['permissions', 'permission', 'access', 'rights', 'restrict', 'allow', 'read', 'write', 'lock'],
    });
    items.push({
      label: 'Settings - Color Labels',
      subtitle: 'Task color tags',
      path: '/settings?tab=colors',
      icon: '🎨',
      keywords: ['color', 'colors', 'label', 'labels', 'tag', 'tags', 'visual', 'legend', 'palette'],
    });
    items.push({
      label: 'Settings - Apps & Tokens',
      subtitle: 'API tokens, app registrations',
      path: '/settings?tab=apps',
      icon: '🔗',
      keywords: ['api', 'token', 'tokens', 'app', 'apps', 'integration', 'developer', 'automation', 'rest', 'key'],
    });
    items.push({
      label: 'Settings - Webhooks',
      subtitle: 'Event-driven notifications',
      path: '/settings?tab=webhooks',
      icon: '🪝',
      keywords: ['webhook', 'webhooks', 'automation', 'integration', 'event', 'trigger', 'callback', 'notification'],
    });
  }
  if (isAdmin)
    items.push({
      label: 'Admin Panel',
      subtitle: 'Users, config, audit log',
      path: '/admin',
      icon: '🛡️',
      keywords: ['admin', 'administration', 'server', 'users', 'system', 'manage', 'audit', 'config', 'security'],
    });
  return items;
}

const STATUS_COLOR: Record<string, string> = {
  backlog: '#64748b',
  todo: '#3b82f6',
  in_progress: '#f59e0b',
  done: '#10b981',
  blocked: '#ef4444',
};
const STATUS_LABEL: Record<string, string> = {
  backlog: 'Not started',
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
  blocked: 'Blocked',
};
// Reduces clutter in a large result set: active/queued work surfaces above done tasks
const STATUS_PRIORITY: Record<string, number> = {
  todo: 0,
  in_progress: 1,
  blocked: 2,
  backlog: 3,
  done: 4,
};

interface Props {
  onClose: () => void;
}

export default function SearchModal({ onClose }: Props) {
  const { activeProduct, products, setActiveProduct, refreshTasks } = useProduct();
  const { openChat } = useChat();
  const { openProfileModal } = useProfileModals();
  const { canRead, canManage, canWrite } = usePermission();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Search + UI state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [tab, setTab] = useState<TabFilter>('all');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setHighlightIdx(-1);
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        // Always scope to active project; no cross-project fallback
        const r = await api.search(query.trim(), activeProduct?.id);
        setResults(r);
      } catch {
        setResults(null);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, activeProduct?.id]);

  useEffect(() => {
    if (!activeProduct) {
      setSprints([]);
      return;
    }
    api.sprints
      .list(activeProduct.id)
      .then(setSprints)
      .catch(() => setSprints([]));
  }, [activeProduct?.id]);

  const navItems = useMemo(
    () => buildNavItems(canRead, canManage, !!user?.isAdmin, user?.announcementsEnabled),
    [canRead, canManage, user?.isAdmin, user?.announcementsEnabled],
  );

  // Actions and personal/profile settings - these open a modal (or navigate + act) instead of
  // being a plain route, so they carry `action` and use a `#`-prefixed placeholder `path` (only
  // used as a React key here, never actually visited).
  const personalNavItems = useMemo((): NavItem[] => {
    const items: NavItem[] = [
      {
        label: 'Chat',
        subtitle: 'Open the project chat panel',
        path: '#chat',
        icon: '💬',
        keywords: ['chat', 'message', 'messages', 'talk', 'conversation', 'discuss'],
        action: () => openChat(),
      },
      {
        label: 'Profile - Appearance',
        subtitle: 'Theme, colors, mobile nav position',
        path: '#profile-theme',
        icon: '🎨',
        keywords: ['appearance', 'theme', 'themes', 'color', 'colors', 'dark mode', 'light mode', 'style'],
        action: () => openProfileModal('theme'),
      },
      {
        label: 'Profile - Notification Settings',
        subtitle: 'Email & in-app notification preferences',
        path: '#profile-notifications',
        icon: '🔔',
        keywords: ['notification', 'notifications', 'email', 'alerts', 'preferences'],
        action: () => openProfileModal('notifications'),
      },
      {
        label: 'Profile - Privacy',
        subtitle: 'Who can invite you, activity visibility',
        path: '#profile-privacy',
        icon: '🔒',
        keywords: ['privacy', 'invite', 'invites', 'visibility'],
        action: () => openProfileModal('privacy'),
      },
      {
        label: 'Profile - Integrations',
        subtitle: 'API tokens & connected apps',
        path: '#profile-integrations',
        icon: '🔗',
        keywords: ['integration', 'integrations', 'api', 'token', 'tokens', 'app', 'apps'],
        action: () => openProfileModal('integrations'),
      },
      {
        label: 'Profile - Security (2FA)',
        subtitle: 'Two-factor authentication',
        path: '#profile-security',
        icon: '🛡️',
        keywords: ['security', '2fa', 'mfa', 'two factor', 'authenticator', 'totp'],
        action: () => openProfileModal('security'),
      },
      {
        label: 'Profile - Change Password',
        subtitle: 'Update your account password',
        path: '#profile-change-password',
        icon: '🔑',
        keywords: ['password', 'change password'],
        action: () => openProfileModal('changePassword'),
      },
      {
        label: 'Profile - Memberships',
        subtitle: 'Projects you belong to',
        path: '#profile-memberships',
        icon: '👥',
        keywords: ['membership', 'memberships', 'projects', 'teams'],
        action: () => openProfileModal('memberships'),
      },
    ];
    if (activeProduct && canWrite('backlog')) {
      items.unshift({
        label: 'Create new task',
        subtitle: 'Add a task to the backlog',
        path: '#new-task',
        icon: '➕',
        keywords: ['create', 'new', 'add', 'task', 'todo'],
        action: () => {
          navigate('/backlog?newTask=1');
        },
      });
    }
    return items;
  }, [activeProduct, canWrite, openChat, openProfileModal, navigate]);

  const allNavItems = useMemo(() => [...navItems, ...personalNavItems], [navItems, personalNavItems]);

  const { matchingNav, matchingSprints, matchingProjects } = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return { matchingNav: [], matchingSprints: [], matchingProjects: [] };
    const matchingNav = allNavItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.includes(q) || q.includes(k)),
    );
    const matchingSprints = sprints.filter((s) => s.name.toLowerCase().includes(q));
    const matchingProjects = products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q),
    );
    return { matchingNav, matchingSprints, matchingProjects };
  }, [query, allNavItems, sprints, products]);

  const QUICK_NAV = [
    { label: 'Plan - Canvas & Dependencies', path: '/canvas' },
    { label: 'Execute - Kanban Board', path: '/kanban' },
    { label: 'Progress - Gantt & Milestones', path: '/gantt' },
    { label: 'Tasks - Full task list', path: '/backlog' },
  ];

  type FlatItem =
    | { type: 'nav'; item: NavItem }
    | { type: 'sprint'; sprint: Sprint }
    | { type: 'project'; product: Product }
    | { type: 'task'; task: SearchResults['tasks'][number] }
    | { type: 'msg'; msg: MsgResult }
    | { type: 'quicknav'; label: string; path: string };

  // Per-tab item counts for the tab bar
  const tabCounts: Record<TabFilter, number> = {
    all:
      matchingNav.length +
      matchingSprints.length +
      (results?.tasks.length ?? 0) +
      (results?.messages.length ?? 0) +
      matchingProjects.length,
    tasks: results?.tasks.length ?? 0,
    messages: results?.messages.length ?? 0,
    settings: matchingNav.filter(isSettingsNav).length,
    projects: matchingProjects.length,
  };

  // Unified flat list that mirrors the visual order of every row in the results pane.
  // Projects are always appended last (inside 'all') regardless of section order.
  const allItems = useMemo((): FlatItem[] => {
    const list: FlatItem[] = [];
    if (!query.trim()) {
      QUICK_NAV.forEach((n) => list.push({ type: 'quicknav', ...n }));
      return list;
    }
    if (tab === 'all') {
      matchingNav.forEach((item) => list.push({ type: 'nav', item }));
      matchingSprints.forEach((sprint) => list.push({ type: 'sprint', sprint }));
      (results?.tasks ?? []).forEach((task) => list.push({ type: 'task', task }));
      (results?.messages ?? []).forEach((msg) => list.push({ type: 'msg', msg }));
      matchingProjects.forEach((product) => list.push({ type: 'project', product }));
    } else if (tab === 'tasks') {
      (results?.tasks ?? []).forEach((task) => list.push({ type: 'task', task }));
    } else if (tab === 'messages') {
      (results?.messages ?? []).forEach((msg) => list.push({ type: 'msg', msg }));
    } else if (tab === 'settings') {
      matchingNav.filter(isSettingsNav).forEach((item) => list.push({ type: 'nav', item }));
    } else if (tab === 'projects') {
      matchingProjects.forEach((product) => list.push({ type: 'project', product }));
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, tab, matchingNav, matchingSprints, results, matchingProjects]);

  function goToView(path: string) {
    navigate(path);
    onClose();
  }

  // Runs a NavItem's `action` if it has one (personal-settings modals, chat, create task) instead
  // of navigating - see the NavItem type for why these use an action rather than a real route.
  function activateNav(item: NavItem) {
    if (item.action) {
      item.action();
      onClose();
    } else {
      goToView(item.path);
    }
  }

  async function handleTaskClick(task: SearchResults['tasks'][number]) {
    if (!activeProduct) return;
    setLoadingMsg(true);
    try {
      const full = await api.tasks.get(activeProduct.id, task.id);
      setSelectedTask(full);
    } catch {
      onClose();
    } finally {
      setLoadingMsg(false);
    }
  }

  function handleMessageClick(msg: MsgResult) {
    if (msg.product.id !== activeProduct?.id) {
      const p = products.find((x) => x.id === msg.product.id);
      if (p) setActiveProduct(p);
    }
    openChat(msg.task?.id, msg.task?.name ?? undefined);
    onClose();
  }

  // Scroll to highlighted row whenever the index changes
  useEffect(() => {
    if (highlightIdx < 0) return;
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector(`[data-idx="${highlightIdx}"]`) as HTMLElement | null;
      el?.scrollIntoView({ block: 'nearest' });
    });
  }, [highlightIdx]);

  const TAB_ORDER: TabFilter[] = ['all', 'tasks', 'messages', 'settings', 'projects'];

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      onClose();
      return;
    }

    // Left/right cycle through result-type tabs when they're visible
    if (
      (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
      showTabs
    ) {
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
      if (item.type === 'nav') activateNav(item.item);
      else if (item.type === 'sprint') goToView('/gantt');
      else if (item.type === 'project') {
        setActiveProduct(item.product);
        onClose();
      } else if (item.type === 'task') handleTaskClick(item.task);
      else if (item.type === 'msg') handleMessageClick(item.msg);
      else if (item.type === 'quicknav') goToView(item.path);
    }
  }

  if (selectedTask) {
    // Matches the backend's requireTabWrite OR-semantics for task mutations (kanban or backlog write access).
    const readOnly = !(canWrite('backlog') || canWrite('kanban'));
    return (
      <TaskDetailPanel
        task={selectedTask}
        readOnly={readOnly}
        onClose={() => {
          setSelectedTask(null);
          onClose();
        }}
        onUpdated={async (updated) => {
          setSelectedTask(updated);
          await refreshTasks();
        }}
        onDeleted={() => {
          setSelectedTask(null);
          onClose();
        }}
      />
    );
  }

  // Derive what to render per tab
  const showNav = tab === 'all' ? matchingNav : tab === 'settings' ? matchingNav.filter(isSettingsNav) : [];
  const showSprints = tab === 'all' ? matchingSprints : [];
  const showTasks = tab === 'all' || tab === 'tasks' ? (results?.tasks ?? []) : [];
  const showMsgs = tab === 'all' || tab === 'messages' ? (results?.messages ?? []) : [];
  const showProjects = tab === 'all' || tab === 'projects' ? matchingProjects : [];

  // Stable sort: same-status ties keep the backend's relative order (most-recently-updated first)
  const statusSortedTasks = [...showTasks].sort(
    (a, b) => (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99),
  );
  const milestones = statusSortedTasks.filter((t) => !!t.deadline);
  const regular = statusSortedTasks.filter((t) => !t.deadline);

  const hasResults =
    showNav.length > 0 ||
    showSprints.length > 0 ||
    showTasks.length > 0 ||
    showMsgs.length > 0 ||
    showProjects.length > 0;

  // Show tabs as soon as there are any client-side or API results
  const showTabs =
    query.trim().length >= 2 &&
    (matchingNav.length > 0 ||
      matchingSprints.length > 0 ||
      matchingProjects.length > 0 ||
      (results?.tasks.length ?? 0) > 0 ||
      (results?.messages.length ?? 0) > 0);

  // Running index that mirrors allItems order - used to assign data-idx to every row
  let rowIdx = -1;

  const TAB_LABELS: Record<TabFilter, string> = {
    all: 'All',
    tasks: 'Tasks',
    messages: 'Messages',
    settings: 'Settings',
    projects: 'Projects',
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 flex flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
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
            placeholder={activeProduct ? `Search in ${activeProduct.name}…` : 'Select a project to search…'}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--text)' }}
          />
          {searching && (
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

        {/* Type filter tabs — shown as soon as any results exist */}
        {showTabs && (
          <div className="flex items-center gap-1 px-4 pt-2 pb-0" style={{ borderBottom: '1px solid var(--border)' }}>
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

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 400 }}>
          {query.trim().length >= 2 && !searching && !hasResults && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>
              No results for "{query}"{activeProduct ? ` in ${activeProduct.name}` : ''}
            </div>
          )}

          {/* Nav destinations + sprints (shown in 'all' and 'settings' tabs) */}
          {(showNav.length > 0 || showSprints.length > 0) && (
            <div className="py-1">
              <div
                className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-3)' }}
              >
                {tab === 'settings' ? 'Settings' : 'Go to'}
              </div>
              {showNav.map((item) => {
                rowIdx++;
                const i = rowIdx;
                const isHighlighted = highlightIdx === i;
                return (
                  <button
                    key={item.path}
                    data-idx={i}
                    onClick={() => activateNav(item)}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                    style={{ background: isHighlighted ? 'var(--brand-subtle)' : 'transparent' }}
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
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>
                      →
                    </span>
                  </button>
                );
              })}
              {showSprints.map((cycle) => {
                rowIdx++;
                const i = rowIdx;
                const isHighlighted = highlightIdx === i;
                return (
                  <button
                    key={cycle.id}
                    data-idx={i}
                    onClick={() => goToView('/gantt')}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                    style={{ background: isHighlighted ? 'var(--brand-subtle)' : 'transparent' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')
                    }
                  >
                    <span className="w-3 h-3 rounded-full flex-shrink-0 ml-1" style={{ background: cycle.color }} />
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium block" style={{ color: 'var(--text)' }}>
                        {cycle.name}
                      </span>
                      <span className="text-xs block" style={{ color: 'var(--text-3)' }}>
                        Sub-plan ·{' '}
                        {new Date(cycle.startDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })} –{' '}
                        {new Date(cycle.endDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })} ·
                        Progress
                      </span>
                    </span>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>
                      →
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Milestones */}
          {milestones.length > 0 && (
            <div className="py-1">
              <div
                className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-3)' }}
              >
                Milestones
              </div>
              {milestones.map((task) => {
                rowIdx++;
                const i = rowIdx;
                const isHighlighted = highlightIdx === i;
                return (
                  <button
                    key={task.id}
                    data-idx={i}
                    onClick={() => handleTaskClick(task)}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                    style={{ background: isHighlighted ? 'var(--brand-subtle)' : 'transparent' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')
                    }
                  >
                    <span className="text-xs flex-shrink-0">🏁</span>
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block" style={{ color: 'var(--text)' }}>
                        {task.name}
                      </span>
                      <span className="text-xs truncate block" style={{ color: 'var(--text-3)' }}>
                        {STATUS_LABEL[task.status] ?? task.status}
                        {task.deadline &&
                          ` · due ${new Date(task.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Regular tasks */}
          {regular.length > 0 && (
            <div className="py-1">
              <div
                className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-3)' }}
              >
                Tasks
              </div>
              {regular.map((task) => {
                rowIdx++;
                const i = rowIdx;
                const isHighlighted = highlightIdx === i;
                return (
                  <button
                    key={task.id}
                    data-idx={i}
                    onClick={() => handleTaskClick(task)}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                    style={{ background: isHighlighted ? 'var(--brand-subtle)' : 'transparent' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')
                    }
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: STATUS_COLOR[task.status] ?? '#64748b' }}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block" style={{ color: 'var(--text)' }}>
                        {task.name}
                      </span>
                      <span className="text-xs truncate block" style={{ color: 'var(--text-3)' }}>
                        {STATUS_LABEL[task.status] ?? task.status}
                        {task.owner && ` · ${displayName(task.owner)}`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Messages */}
          {showMsgs.length > 0 && (
            <div className="py-1">
              <div
                className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-3)' }}
              >
                Messages
              </div>
              {showMsgs.map((msg) => {
                rowIdx++;
                const i = rowIdx;
                const isHighlighted = highlightIdx === i;
                return (
                  <button
                    key={msg.id}
                    data-idx={i}
                    onClick={() => handleMessageClick(msg)}
                    disabled={loadingMsg}
                    className="w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors"
                    style={{ background: isHighlighted ? 'var(--brand-subtle)' : 'transparent' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')
                    }
                  >
                    <span className="text-base flex-shrink-0 mt-0.5">{msg.author.avatarEmoji ?? '👤'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                        {displayName(msg.author)}
                        {msg.task && <span style={{ color: 'var(--text-3)' }}> · {msg.task.name}</span>}
                      </p>
                      <p className="text-sm truncate mt-0.5" style={{ color: 'var(--text)' }}>
                        {msg.content}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Projects — always last in 'all', only content in 'projects' tab */}
          {showProjects.length > 0 && (
            <div className="py-1">
              <div
                className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-3)' }}
              >
                Projects
              </div>
              {showProjects.map((product) => {
                rowIdx++;
                const i = rowIdx;
                const isHighlighted = highlightIdx === i;
                const isActive = product.id === activeProduct?.id;
                return (
                  <button
                    key={product.id}
                    data-idx={i}
                    onClick={() => {
                      setActiveProduct(product);
                      onClose();
                    }}
                    className="w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors"
                    style={{ background: isHighlighted ? 'var(--brand-subtle)' : 'transparent' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')
                    }
                  >
                    <span className="text-base flex-shrink-0 mt-0.5">{product.emoji ?? '🎯'}</span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                          {product.name}
                        </span>
                        {isActive && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                            style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}
                          >
                            Active
                          </span>
                        )}
                      </span>
                      {product.description?.trim() ? (
                        <span
                          className="text-xs block mt-0.5 overflow-hidden"
                          style={{
                            color: 'var(--text-2)',
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: 2,
                          }}
                        >
                          {product.description
                            .replace(/#{1,6}\s|[*_`[\]()]/g, '')
                            .trim()
                            .slice(0, 200)}
                        </span>
                      ) : (
                        <span className="text-xs block mt-0.5 italic" style={{ color: 'var(--text-3)' }}>
                          No description set
                        </span>
                      )}
                    </span>
                    <span className="text-xs flex-shrink-0 mt-0.5" style={{ color: 'var(--text-3)' }}>
                      →
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Quick nav (empty query) */}
          {!query.trim() && (
            <div className="py-1.5">
              <div
                className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-3)' }}
              >
                Navigate
              </div>
              {QUICK_NAV.map((item) => {
                rowIdx++;
                const i = rowIdx;
                const isHighlighted = highlightIdx === i;
                return (
                  <button
                    key={item.path}
                    data-idx={i}
                    onClick={() => goToView(item.path)}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                    style={{ background: isHighlighted ? 'var(--brand-subtle)' : 'transparent' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')
                    }
                  >
                    <span className="text-sm" style={{ color: 'var(--text)' }}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div
          className="px-4 py-2 flex items-center gap-4 text-xs"
          style={{ borderTop: '1px solid var(--border)', color: 'var(--text-3)' }}
        >
          <span>↑↓ navigate · ←→ switch tab · Enter open · Esc close</span>
          {activeProduct && (
            <span className="ml-auto">
              {activeProduct.emoji} {activeProduct.name}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
