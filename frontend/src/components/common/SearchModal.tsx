import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProduct } from '../../context/ProductContext';
import { useChat } from '../../context/ChatContext';
import { usePermission } from '../../context/PermissionContext';
import { useAuth } from '../../context/AuthContext';
import { api, displayName } from '../../api/client';
import type { Task } from '../../types';
import type { SearchResults, Sprint } from '../../api/client';
import TaskDetailPanel from './TaskDetailPanel';

type MsgResult = SearchResults['messages'][number];
type TabFilter = 'all' | 'tasks' | 'messages';

type NavItem = { label: string; subtitle: string; path: string; icon: string; keywords: string[] };

function buildNavItems(canRead: (tab: string) => boolean, canManage: boolean, isAdmin: boolean, announcementsEnabled?: boolean): NavItem[] {
  const items: NavItem[] = [];
  if (canRead('canvas'))    items.push({ label: 'Plan',      subtitle: 'Canvas - dependency graph',      path: '/canvas',              icon: '◈',  keywords: ['plan', 'canvas', 'dependency', 'dependencies', 'graph', 'layout', 'map', 'node'] });
  if (canRead('kanban'))    items.push({ label: 'Kanban',    subtitle: 'Execute - board view',           path: '/kanban',              icon: '▦',  keywords: ['kanban', 'board', 'execute', 'column', 'card', 'status', 'sprint backlog'] });
  if (canRead('gantt'))     items.push({ label: 'Gantt',     subtitle: 'Progress - milestones & sprints', path: '/gantt',             icon: '📅', keywords: ['gantt', 'progress', 'milestone', 'milestones', 'timeline', 'deadline', 'roadmap', 'sprint', 'sprints'] });
  if (canRead('backlog'))   items.push({ label: 'Tasks',     subtitle: 'All tasks list',                 path: '/backlog',             icon: '☰',  keywords: ['backlog', 'tasks', 'list', 'all tasks', 'task list'] });
  if (canRead('analytics')) items.push({ label: 'Analytics', subtitle: 'Stats, charts & workload',      path: '/analytics',           icon: '📊', keywords: ['analytics', 'stats', 'statistics', 'chart', 'velocity', 'throughput', 'metrics', 'workload', 'performance', 'insights', 'data'] });
  if (announcementsEnabled) items.push({ label: 'Announcements', subtitle: 'Team & server posts',        path: '/announcements',       icon: '📢', keywords: ['announcement', 'announcements', 'news', 'update', 'updates', 'broadcast', 'notice', 'post'] });
  if (canManage) {
    items.push({ label: 'Settings - Project',      subtitle: 'Name, emoji, description, deadline', path: '/settings?tab=project',     icon: '⚙️', keywords: ['settings', 'project', 'name', 'description', 'details', 'deadline', 'configuration', 'emoji'] });
    items.push({ label: 'Settings - Team',         subtitle: 'Members, roles, invites',             path: '/settings?tab=team',        icon: '👥', keywords: ['team', 'members', 'member', 'invite', 'role', 'people', 'collaborator', 'access request', 'co-owner'] });
    items.push({ label: 'Settings - Permissions',  subtitle: 'Tab-level access control',            path: '/settings?tab=permissions', icon: '🔒', keywords: ['permissions', 'permission', 'access', 'rights', 'restrict', 'allow', 'read', 'write', 'lock'] });
    items.push({ label: 'Settings - Color Labels', subtitle: 'Task color tags',                     path: '/settings?tab=colors',      icon: '🎨', keywords: ['color', 'colors', 'label', 'labels', 'tag', 'tags', 'visual', 'legend', 'palette'] });
    items.push({ label: 'Settings - Apps & Tokens', subtitle: 'API tokens, app registrations',     path: '/settings?tab=apps',        icon: '🔗', keywords: ['api', 'token', 'tokens', 'app', 'apps', 'integration', 'developer', 'automation', 'rest', 'key'] });
    items.push({ label: 'Settings - Webhooks',     subtitle: 'Event-driven notifications',          path: '/settings?tab=webhooks',    icon: '🪝', keywords: ['webhook', 'webhooks', 'automation', 'integration', 'event', 'trigger', 'callback', 'notification'] });
  }
  if (isAdmin) items.push({ label: 'Admin Panel', subtitle: 'Users, config, audit log',           path: '/admin',                     icon: '🛡️', keywords: ['admin', 'administration', 'server', 'users', 'system', 'manage', 'audit', 'config', 'security'] });
  return items;
}

const STATUS_COLOR: Record<string, string> = {
  backlog: '#64748b', todo: '#3b82f6', in_progress: '#f59e0b', done: '#10b981', blocked: '#ef4444',
};
const STATUS_LABEL: Record<string, string> = {
  backlog: 'Not started', todo: 'To Do', in_progress: 'In Progress', done: 'Done', blocked: 'Blocked',
};

interface Props { onClose: () => void; }

export default function SearchModal({ onClose }: Props) {
  const { activeProduct, products, setActiveProduct, refreshTasks } = useProduct();
  const { openChat } = useChat();
  const { canRead, canManage } = usePermission();
  const { user } = useAuth();
  const navigate = useNavigate();
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

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setHighlightIdx(-1);
    if (query.trim().length < 2) { setResults(null); return; }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        // Always scope to active project; no cross-project fallback
        const r = await api.search(query.trim(), activeProduct?.id);
        setResults(r);
      } catch { setResults(null); }
      finally { setSearching(false); }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, activeProduct?.id]);

  useEffect(() => {
    if (!activeProduct) { setSprints([]); return; }
    api.sprints.list(activeProduct.id).then(setSprints).catch(() => setSprints([]));
  }, [activeProduct?.id]);

  const navItems = useMemo(() => buildNavItems(canRead, canManage, !!user?.isAdmin, user?.announcementsEnabled), [canRead, canManage, user?.isAdmin, user?.announcementsEnabled]);

  const { matchingNav, matchingSprints } = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return { matchingNav: [], matchingSprints: [] };
    const matchingNav = navItems.filter((item) =>
      item.label.toLowerCase().includes(q) ||
      item.subtitle.toLowerCase().includes(q) ||
      item.keywords.some((k) => k.includes(q) || q.includes(k))
    );
    const matchingSprints = sprints.filter((s) => s.name.toLowerCase().includes(q));
    return { matchingNav, matchingSprints };
  }, [query, navItems, sprints]);

  const QUICK_NAV = [
    { label: 'Plan - Canvas & Dependencies',  path: '/canvas'   },
    { label: 'Execute - Kanban Board',         path: '/kanban'   },
    { label: 'Progress - Gantt & Milestones',  path: '/gantt'    },
    { label: 'Tasks - Full task list',          path: '/backlog'  },
  ];

  type FlatItem =
    | { type: 'nav';      item: NavItem }
    | { type: 'sprint';   sprint: Sprint }
    | { type: 'task';     task: SearchResults['tasks'][number] }
    | { type: 'msg';      msg: MsgResult }
    | { type: 'quicknav'; label: string; path: string };

  // Unified flat list that mirrors the visual order of every row in the results pane
  const allItems = useMemo((): FlatItem[] => {
    const list: FlatItem[] = [];
    if (!query.trim()) {
      QUICK_NAV.forEach((n) => list.push({ type: 'quicknav', ...n }));
      return list;
    }
    matchingNav.forEach((item) => list.push({ type: 'nav', item }));
    matchingSprints.forEach((sprint) => list.push({ type: 'sprint', sprint }));
    const taskList = tab === 'messages' ? [] : (results?.tasks ?? []);
    taskList.forEach((task) => list.push({ type: 'task', task }));
    const msgList = tab === 'tasks' ? [] : (results?.messages ?? []);
    msgList.forEach((msg) => list.push({ type: 'msg', msg }));
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, matchingNav, matchingSprints, results, tab]);

  function goToView(path: string) { navigate(path); onClose(); }

  async function handleTaskClick(task: SearchResults['tasks'][number]) {
    if (!activeProduct) return;
    setLoadingMsg(true);
    try {
      const full = await api.tasks.get(activeProduct.id, task.id);
      setSelectedTask(full);
    } catch { onClose(); }
    finally { setLoadingMsg(false); }
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { onClose(); return; }
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
      if (item.type === 'nav')      goToView(item.item.path);
      else if (item.type === 'sprint')   goToView('/gantt');
      else if (item.type === 'task')     handleTaskClick(item.task);
      else if (item.type === 'msg')      handleMessageClick(item.msg);
      else if (item.type === 'quicknav') goToView(item.path);
    }
  }

  if (selectedTask) {
    return (
      <TaskDetailPanel
        task={selectedTask}
        onClose={() => { setSelectedTask(null); onClose(); }}
        onUpdated={async (updated) => { setSelectedTask(updated); await refreshTasks(); }}
      />
    );
  }

  const tasks   = tab === 'messages' ? [] : (results?.tasks ?? []);
  const msgs    = tab === 'tasks'    ? [] : (results?.messages ?? []);
  const milestones = tasks.filter((t) => !!t.deadline);
  const regular    = tasks.filter((t) => !t.deadline);
  const hasResults = tasks.length > 0 || msgs.length > 0 || matchingNav.length > 0 || matchingSprints.length > 0;

  // Running index that mirrors allItems order — used to assign data-idx to every row
  let rowIdx = -1;

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div
        className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 flex flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.4">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
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
            <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin flex-shrink-0" style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }} />
          )}
          <kbd className="text-xs px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>Esc</kbd>
        </div>

        {/* Type filter tabs - only shown when there are results */}
        {results && (results.tasks.length > 0 || results.messages.length > 0) && (
          <div className="flex items-center gap-1 px-4 pt-2 pb-0" style={{ borderBottom: '1px solid var(--border)' }}>
            {(['all', 'tasks', 'messages'] as const).map((t) => {
              const count = t === 'all' ? (results.tasks.length + results.messages.length) : t === 'tasks' ? results.tasks.length : results.messages.length;
              return (
                <button
                  key={t}
                  onClick={() => { setTab(t); setHighlightIdx(-1); }}
                  className="px-3 py-1.5 text-xs font-medium rounded-t-md transition-all relative"
                  style={{
                    color: tab === t ? 'var(--brand)' : 'var(--text-3)',
                    background: tab === t ? 'var(--brand-subtle)' : 'transparent',
                    borderBottom: tab === t ? '2px solid var(--brand)' : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 400 }}>
          {query.trim().length >= 2 && !searching && !hasResults && matchingNav.length === 0 && matchingSprints.length === 0 && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>
              No results for "{query}"{activeProduct ? ` in ${activeProduct.name}` : ''}
            </div>
          )}

          {/* Nav destinations */}
          {(matchingNav.length > 0 || matchingSprints.length > 0) && (
            <div className="py-1">
              <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Go to</div>
              {matchingNav.map((item) => {
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
                    onMouseLeave={(e) => (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')}
                  >
                    <span className="text-base flex-shrink-0 w-5 text-center">{item.icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium block" style={{ color: 'var(--text)' }}>{item.label}</span>
                      <span className="text-xs block" style={{ color: 'var(--text-3)' }}>{item.subtitle}</span>
                    </span>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>→</span>
                  </button>
                );
              })}
              {matchingSprints.map((cycle) => {
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
                    onMouseLeave={(e) => (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')}
                  >
                    <span className="w-3 h-3 rounded-full flex-shrink-0 ml-1" style={{ background: cycle.color }} />
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium block" style={{ color: 'var(--text)' }}>{cycle.name}</span>
                      <span className="text-xs block" style={{ color: 'var(--text-3)' }}>
                        Sub-plan · {new Date(cycle.startDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })} – {new Date(cycle.endDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })} · Progress
                      </span>
                    </span>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>→</span>
                  </button>
                );
              })}
            </div>
          )}

          {milestones.length > 0 && (
            <div className="py-1">
              <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Milestones</div>
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
                    onMouseLeave={(e) => (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')}
                  >
                    <span className="text-xs flex-shrink-0">🏁</span>
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block" style={{ color: 'var(--text)' }}>{task.name}</span>
                      <span className="text-xs truncate block" style={{ color: 'var(--text-3)' }}>
                        {STATUS_LABEL[task.status] ?? task.status}
                        {task.deadline && ` · due ${new Date(task.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {regular.length > 0 && (
            <div className="py-1">
              <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Tasks</div>
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
                    onMouseLeave={(e) => (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[task.status] ?? '#64748b' }} />
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block" style={{ color: 'var(--text)' }}>{task.name}</span>
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

          {msgs.length > 0 && (
            <div className="py-1">
              <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Messages</div>
              {msgs.map((msg) => {
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
                    onMouseLeave={(e) => (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')}
                  >
                    <span className="text-base flex-shrink-0 mt-0.5">{msg.author.avatarEmoji ?? '👤'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                        {displayName(msg.author)}
                        {msg.task && <span style={{ color: 'var(--text-3)' }}> · {msg.task.name}</span>}
                      </p>
                      <p className="text-sm truncate mt-0.5" style={{ color: 'var(--text)' }}>{msg.content}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {!query.trim() && (
            <div className="py-1.5">
              <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Navigate</div>
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
                    onMouseLeave={(e) => (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')}
                  >
                    <span className="text-sm" style={{ color: 'var(--text)' }}>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 flex items-center gap-4 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-3)' }}>
          <span>↑↓ navigate · Enter open · Esc close</span>
          {activeProduct && <span className="ml-auto">{activeProduct.emoji} {activeProduct.name}</span>}
        </div>
      </div>
    </>
  );
}
