import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProduct } from '../../context/ProductContext';
import { api } from '../../api/client';
import type { Task } from '../../types';
import type { SearchResults } from '../../api/client';
import TaskDetailPanel from './TaskDetailPanel';

type MsgResult = SearchResults['messages'][number];

const STATUS_COLOR: Record<string, string> = {
  backlog: '#64748b', todo: '#3b82f6', in_progress: '#f59e0b', done: '#10b981', blocked: '#ef4444',
};
const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog', todo: 'To Do', in_progress: 'In Progress', done: 'Done', blocked: 'Blocked',
};

interface Props { onClose: () => void; }

export default function SearchModal({ onClose }: Props) {
  const { activeProduct, products, setActiveProduct, refreshTasks } = useProduct();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults(null); return; }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.search(query.trim(), activeProduct?.id);
        setResults(r);
      } catch { setResults(null); }
      finally { setSearching(false); }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, activeProduct?.id]);

  function goToView(path: string) { navigate(path); onClose(); }

  async function handleMessageClick(msg: MsgResult) {
    const targetProduct = products.find((p) => p.id === msg.product.id);
    if (targetProduct && targetProduct.id !== activeProduct?.id) {
      setActiveProduct(targetProduct);
    }
    if (msg.task) {
      setLoadingMsg(true);
      try {
        const task = await api.tasks.get(msg.product.id, msg.task.id);
        setSelectedTask(task);
      } catch { onClose(); }
      finally { setLoadingMsg(false); }
    } else {
      onClose();
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

  const milestoneTasks = results?.tasks.filter((t) => !!t.deadline) ?? [];
  const regularTasks = results?.tasks.filter((t) => !t.deadline) ?? [];
  const hasResults = results && (results.tasks.length > 0 || results.messages.length > 0);

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
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
            placeholder={activeProduct ? `Search in ${activeProduct.name}…` : 'Search in Planly…'}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--text)' }}
          />
          {searching && (
            <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin flex-shrink-0" style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }} />
          )}
          <kbd className="text-xs px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>Esc</kbd>
        </div>

        {/* Results */}
        <div className="overflow-y-auto" style={{ maxHeight: 420 }}>
          {query.trim().length >= 2 && !searching && !hasResults && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>
              No results for "{query}"
            </div>
          )}

          {milestoneTasks.length > 0 && (
            <div className="py-1">
              <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Milestones</div>
              {milestoneTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => setSelectedTask(task as unknown as Task)}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="text-xs flex-shrink-0">🏁</span>
                  <span className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block" style={{ color: 'var(--text)' }}>{task.name}</span>
                    <span className="text-xs truncate block" style={{ color: 'var(--text-3)' }}>
                      {task.product.emoji} {task.product.name} · {STATUS_LABEL[task.status] ?? task.status}
                      {task.deadline && ` · due ${new Date(task.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {regularTasks.length > 0 && (
            <div className="py-1">
              <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Tasks</div>
              {regularTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => setSelectedTask(task as unknown as Task)}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[task.status] ?? '#64748b' }} />
                  <span className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block" style={{ color: 'var(--text)' }}>{task.name}</span>
                    <span className="text-xs truncate block" style={{ color: 'var(--text-3)' }}>
                      {task.product.emoji} {task.product.name} · {STATUS_LABEL[task.status] ?? task.status}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {results && results.messages.length > 0 && (
            <div className="py-1">
              <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Chats</div>
              {results.messages.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => handleMessageClick(msg)}
                  disabled={loadingMsg}
                  className="w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors"
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="text-base flex-shrink-0 mt-0.5">{msg.author.avatarEmoji ?? '👤'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                      {msg.author.username} · {msg.product.emoji} {msg.product.name}
                      {msg.task && <span style={{ color: 'var(--text-3)' }}> · {msg.task.name}</span>}
                    </p>
                    <p className="text-sm truncate mt-0.5" style={{ color: 'var(--text)' }}>{msg.content}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!query.trim() && (
            <div className="py-1.5">
              {/* Project switcher */}
              {products.length > 1 && (
                <>
                  <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Switch project</div>
                  {products.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setActiveProduct(p); onClose(); }}
                      className="w-full text-left px-4 py-2 flex items-center gap-3 transition-colors"
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span>{p.emoji ?? '📁'}</span>
                      <span className="text-sm flex-1" style={{ color: activeProduct?.id === p.id ? 'var(--brand)' : 'var(--text)' }}>{p.name}</span>
                      {activeProduct?.id === p.id && <span className="text-xs font-bold" style={{ color: 'var(--brand)' }}>✓</span>}
                    </button>
                  ))}
                  <div className="mx-4 my-1.5" style={{ height: 1, background: 'var(--border)' }} />
                </>
              )}
              {/* Quick navigate */}
              <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Navigate</div>
              {[
                { label: 'Plan — Canvas & Dependencies', path: '/canvas' },
                { label: 'Execute — Kanban Board',       path: '/kanban' },
                { label: 'Progress — Gantt & Milestones', path: '/gantt' },
                { label: 'Tasks — Full task list',        path: '/backlog' },
              ].map((item) => (
                <button
                  key={item.path}
                  onClick={() => goToView(item.path)}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="text-sm" style={{ color: 'var(--text)' }}>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 flex items-center gap-4 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-3)' }}>
          <span>Type 2+ chars to search across all projects</span>
          <span className="ml-auto">Esc close</span>
        </div>
      </div>
    </>
  );
}
