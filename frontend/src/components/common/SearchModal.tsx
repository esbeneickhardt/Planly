import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProduct } from '../../context/ProductContext';
import type { Task } from '../../types';
import TaskDetailPanel from './TaskDetailPanel';

const STATUS_COLOR: Record<string, string> = {
  backlog: '#64748b', todo: '#3b82f6', in_progress: '#f59e0b', done: '#10b981', blocked: '#ef4444',
};
const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog', todo: 'To Do', in_progress: 'In Progress', done: 'Done', blocked: 'Blocked',
};

// Normalise common aliases so "in-progress" and "inprogress" both work
const STATUS_ALIASES: Record<string, string> = {
  'in-progress': 'in_progress', inprogress: 'in_progress', 'in_progress': 'in_progress',
  done: 'done', todo: 'todo', backlog: 'backlog', blocked: 'blocked',
};

interface Filters { text: string; status: string | null; }

function parseQuery(raw: string): Filters {
  const statusMatch = raw.match(/\bstatus:(\S+)/i);
  const text = raw.replace(/\bstatus:\S+/gi, '').trim();
  return {
    text,
    status: statusMatch ? STATUS_ALIASES[statusMatch[1].toLowerCase()] ?? null : null,
  };
}

interface Props { onClose: () => void; }

export default function SearchModal({ onClose }: Props) {
  const { tasks, activeProduct, products, setActiveProduct, refreshTasks } = useProduct();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const { text, status } = parseQuery(query);

  const results = query.trim()
    ? tasks.filter((t) => {
        const matchText = !text || t.name.toLowerCase().includes(text.toLowerCase()) || t.description?.toLowerCase().includes(text.toLowerCase());
        const matchStatus = !status || t.status === status;
        return matchText && matchStatus;
      })
    : [];

  function goToView(path: string) { navigate(path); onClose(); }

  if (selectedTask) {
    return (
      <TaskDetailPanel
        task={selectedTask}
        onClose={() => { setSelectedTask(null); onClose(); }}
        onUpdated={async (updated) => { setSelectedTask(updated); await refreshTasks(); }}
      />
    );
  }

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
            placeholder="Search in Planly…"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--text)' }}
          />
          {/* Active filter chips */}
          {status && (
            <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}>
              status: {STATUS_LABEL[status] ?? status}
            </span>
          )}
          <kbd className="text-xs px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>Esc</kbd>
        </div>

        {/* Results */}
        <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
          {query && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>
              No tasks match "{query}"
            </div>
          )}

          {results.length > 0 && (
            <div className="py-1">
              <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                Tasks — {activeProduct?.name}
              </div>
              {results.map((task) => (
                <button
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[task.status] ?? '#64748b' }} />
                  <span className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block" style={{ color: 'var(--text)' }}>{task.name}</span>
                    {task.description && (
                      <span className="text-xs truncate block" style={{ color: 'var(--text-3)' }}>{task.description}</span>
                    )}
                  </span>
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>{STATUS_LABEL[task.status] ?? task.status}</span>
                  {task.owner && <span className="text-xs flex-shrink-0">{task.owner.avatarEmoji ?? '👤'}</span>}
                </button>
              ))}
            </div>
          )}

          {!query && (
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
          <span>↵ Open task</span>
          <span>·</span>
          <span className="font-mono" style={{ color: 'var(--text-3)' }}>status:done</span>
          <span className="font-mono" style={{ color: 'var(--text-3)' }}>status:in_progress</span>
          <span className="ml-auto">Esc close</span>
        </div>
      </div>
    </>
  );
}
