/**
 * Search command palette for admin mode - a separate, smaller sibling to SearchModal.tsx. Admin
 * mode searches a completely different dataset (platform-wide projects, admin chat, and the admin
 * panel's own settings tabs) rather than one product's tasks/messages, so this mirrors the other
 * modal's shell (backdrop, input, Escape-to-close, 300ms debounce for the server-backed section)
 * without threading admin-mode conditionals through that already-large component.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, displayName } from '../../api/client';
import type { Message } from '../../api/client';
import { useChat } from '../../context/ChatContext';
import { ADMIN_TABS } from './TopBar';

interface AdminProject {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
}

interface Props {
  onClose: () => void;
}

export default function AdminSearchModal({ onClose }: Props) {
  const navigate = useNavigate();
  const { openChat } = useChat();
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [chatResults, setChatResults] = useState<Message[]>([]);
  const [searchingChat, setSearchingChat] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Projects list is small and un-paginated - fetch once and filter client-side, same idiom
  // SearchModal.tsx uses for the user's own product list.
  useEffect(() => {
    inputRef.current?.focus();
    api.admin
      .projects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setChatResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearchingChat(true);
      try {
        setChatResults(await api.adminChat.list(undefined, q));
      } catch {
        setChatResults([]);
      } finally {
        setSearchingChat(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const q = query.trim().toLowerCase();
  const matchingTabs = q.length > 0 ? ADMIN_TABS.filter((t) => t.label.toLowerCase().includes(q)) : [];
  const matchingProjects =
    q.length >= 2
      ? projects.filter((p) => p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q))
      : [];
  const hasResults = matchingTabs.length > 0 || matchingProjects.length > 0 || chatResults.length > 0;

  function goToTab(key: string) {
    navigate(`/admin?tab=${key}`);
    onClose();
  }

  function openChatResult() {
    openChat();
    onClose();
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
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
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Search admin chat, projects, settings…"
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

        <div className="overflow-y-auto">
          {q.length < 2 ? (
            <p className="px-4 py-6 text-sm text-center" style={{ color: 'var(--text-3)' }}>
              Search admin chat, projects, and settings…
            </p>
          ) : !hasResults ? (
            <p className="px-4 py-6 text-sm text-center" style={{ color: 'var(--text-3)' }}>
              No results for "{query.trim()}"
            </p>
          ) : (
            <>
              {matchingTabs.length > 0 && (
                <div className="py-2">
                  <p
                    className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--text-3)' }}
                  >
                    Settings
                  </p>
                  {matchingTabs.map(({ key, label, Icon }) => (
                    <button
                      key={key}
                      onClick={() => goToTab(key)}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors hover:bg-[var(--surface-2)]"
                      style={{ color: 'var(--text-2)' }}
                    >
                      <Icon size={16} />
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {matchingProjects.length > 0 && (
                <div className="py-2" style={{ borderTop: matchingTabs.length > 0 ? '1px solid var(--border)' : 'none' }}>
                  <p
                    className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--text-3)' }}
                  >
                    Projects
                  </p>
                  {matchingProjects.slice(0, 20).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => goToTab('projects')}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors hover:bg-[var(--surface-2)]"
                      style={{ color: 'var(--text-2)' }}
                    >
                      <span className="flex-shrink-0">{p.emoji ?? '🎯'}</span>
                      <span className="flex-1 min-w-0 truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {chatResults.length > 0 && (
                <div
                  className="py-2"
                  style={{
                    borderTop: matchingTabs.length > 0 || matchingProjects.length > 0 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <p
                    className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--text-3)' }}
                  >
                    Admin chat
                  </p>
                  {chatResults.map((m) => (
                    <button
                      key={m.id}
                      onClick={openChatResult}
                      className="w-full flex items-start gap-3 px-4 py-2 text-sm text-left transition-colors hover:bg-[var(--surface-2)]"
                      style={{ color: 'var(--text-2)' }}
                    >
                      <span className="flex-shrink-0">{m.author.avatarEmoji ?? '👤'}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">{m.content}</span>
                        <span className="block text-xs" style={{ color: 'var(--text-3)' }}>
                          {displayName(m.author)} · {new Date(m.createdAt).toLocaleDateString()}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
