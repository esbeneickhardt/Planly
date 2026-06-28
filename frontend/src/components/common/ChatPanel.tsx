import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { api } from '../../api/client';
import type { Message } from '../../api/client';
import { useProduct } from '../../context/ProductContext';
import { useAuth } from '../../context/AuthContext';
import type { User, Task } from '../../types';
import TaskDetailPanel from './TaskDetailPanel';

interface Props {
  taskId?: string;
  taskName?: string;
  onClose: () => void;
}

type Tab = 'messages' | 'tasks' | 'search' | 'files';

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return `Yesterday ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function MessageBubble({ msg, isOwn, onEdit, onDelete, onImageClick }: {
  msg: Message;
  isOwn: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onImageClick: (url: string) => void;
}) {
  const renderContent = (content: string, isOwn: boolean) => (
    <div className="chat-markdown" style={{ fontSize: 13, lineHeight: 1.5 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => (
            <pre style={{ margin: '6px -4px', borderRadius: 6, overflow: 'auto', fontSize: 12 }}>{children}</pre>
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = Boolean(className?.startsWith('language-'));
            return isBlock ? (
              <code className={className} {...props}>{children}</code>
            ) : (
              <code style={{ background: isOwn ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)', padding: '1px 4px', borderRadius: 3, fontSize: '0.88em', fontFamily: 'monospace' }} {...props}>{children}</code>
            );
          },
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" style={{ color: isOwn ? 'rgba(255,255,255,0.85)' : 'var(--brand)', textDecoration: 'underline' }}>{children}</a>
          ),
          p: ({ children }) => <p style={{ margin: '2px 0' }}>{children}</p>,
          ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 16 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: 16 }}>{children}</ol>,
          li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote style={{ margin: '4px 0', paddingLeft: 10, borderLeft: `3px solid ${isOwn ? 'rgba(255,255,255,0.4)' : 'var(--brand)'}`, opacity: 0.8 }}>{children}</blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );

  return (
    <div className={`flex gap-2.5 group ${isOwn ? 'flex-row-reverse' : ''}`}>
      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        {msg.author.avatarEmoji ?? '👤'}
      </div>
      <div className={`flex-1 min-w-0 ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className={`flex items-baseline gap-2 mb-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
          <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{msg.author.username}</span>
          <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
            {formatTime(msg.createdAt)}{msg.editedAt ? ' (edited)' : ''}
          </span>
        </div>
        {msg.content && (
          <div
            className={`px-3 py-2 rounded-2xl text-sm max-w-[280px] ${isOwn ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
            style={{
              background: isOwn ? 'var(--brand)' : 'var(--surface-2)',
              color: isOwn ? 'white' : 'var(--text)',
              border: isOwn ? 'none' : '1px solid var(--border)',
              wordBreak: 'break-word',
            }}
          >
            {renderContent(msg.content, isOwn)}
          </div>
        )}
        {msg.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {msg.attachments.map((att, i) =>
              att.type.startsWith('image/') ? (
                <button key={i} onClick={() => onImageClick(att.url)} className="block">
                  <img src={att.url} alt={att.name} className="rounded-lg object-cover cursor-zoom-in hover:opacity-90 transition-opacity" style={{ maxWidth: 200, maxHeight: 160 }} />
                </button>
              ) : (
                <a key={i} href={att.url} download={att.name} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs" style={{ background: 'var(--surface-2)', color: 'var(--brand)', border: '1px solid var(--border)' }}>
                  📎 {att.name}
                </a>
              )
            )}
          </div>
        )}
        {isOwn && (
          <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onEdit} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--text-3)' }}>Edit</button>
            <button onClick={onDelete} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: '#ef4444' }}>Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

const PINS_KEY = (productId: string) => `planly_pinned_chats_${productId}`;
const DISMISSED_KEY = (productId: string) => `planly_dismissed_chats_${productId}`;

function loadPins(productId: string): string[] {
  try { return JSON.parse(localStorage.getItem(PINS_KEY(productId)) ?? '[]'); } catch { return []; }
}
function savePins(productId: string, ids: string[]) {
  localStorage.setItem(PINS_KEY(productId), JSON.stringify(ids));
}
function loadDismissed(productId: string): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY(productId)) ?? '[]'); } catch { return []; }
}
function saveDismissed(productId: string, ids: string[]) {
  localStorage.setItem(DISMISSED_KEY(productId), JSON.stringify(ids));
}

export default function ChatPanel({ taskId, taskName, onClose }: Props) {
  const { activeProduct, tasks } = useProduct();
  const { user } = useAuth();
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [tab, setTab] = useState<Tab>('messages');
  const [selectedTask, setSelectedTask] = useState<{ id: string; name: string } | null>(null);
  const [openedTask, setOpenedTask] = useState<Task | null>(null);
  const [openingTask, setOpeningTask] = useState(false);

  // Compose state
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [attachments, setAttachments] = useState<{ url: string; name: string; type: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // @ mention state
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionCursorStart, setMentionCursorStart] = useState<number>(0);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const [teamMembers, setTeamMembers] = useState<Pick<User, 'id' | 'username' | 'avatarEmoji'>[]>([]);

  // Pin/dismiss state for Tasks tab
  const [pinnedTaskIds, setPinnedTaskIds] = useState<string[]>([]);
  const [dismissedTaskIds, setDismissedTaskIds] = useState<string[]>([]);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const panelRight = taskId ? 448 : 0;
  const productId = activeProduct?.id;
  const sendTaskId = taskId ?? (tab === 'tasks' && selectedTask ? selectedTask.id : undefined);

  // Load team members for @ mentions
  useEffect(() => {
    const teamId = activeProduct?.teamId;
    if (!teamId) return;
    api.teams.get(teamId)
      .then((team) => setTeamMembers(team.members.map((m) => m.user)))
      .catch(() => {});
  }, [activeProduct?.teamId]);

  // Clear messages immediately when product changes (prevents stale cross-product data)
  useEffect(() => {
    setAllMessages([]);
  }, [productId]);

  // Load pins + dismissed from localStorage
  useEffect(() => {
    if (!productId) return;
    setPinnedTaskIds(loadPins(productId));
    setDismissedTaskIds(loadDismissed(productId));
    setShowAllTasks(false);
  }, [productId]);

  const togglePin = useCallback((taskId: string) => {
    if (!productId) return;
    setPinnedTaskIds((prev) => {
      const next = prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId];
      savePins(productId, next);
      return next;
    });
  }, [productId]);

  const dismissTask = useCallback((taskId: string) => {
    if (!productId) return;
    // Unpin if pinned
    setPinnedTaskIds((prev) => {
      const next = prev.filter((id) => id !== taskId);
      savePins(productId, next);
      return next;
    });
    setDismissedTaskIds((prev) => {
      const next = [...prev, taskId];
      saveDismissed(productId, next);
      return next;
    });
  }, [productId]);

  const load = useCallback(async () => {
    if (!productId) return;
    try {
      const msgs = taskId
        ? await api.messages.list(productId, taskId)
        : await api.messages.listAll(productId);
      setAllMessages(msgs);
    } catch {}
  }, [productId, taskId]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setLightboxUrl(null); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const displayMessages = useMemo(() => {
    if (taskId) return allMessages;
    if (tab === 'tasks' && selectedTask) return allMessages.filter((m) => m.taskId === selectedTask.id);
    if (tab === 'search' || tab === 'files') return allMessages;
    return allMessages.filter((m) => !m.taskId);
  }, [allMessages, taskId, tab, selectedTask]);

  // Build task groups with message counts
  const taskMessageCounts = useMemo(() => {
    const counts = new Map<string, { count: number; last: Message; task: { id: string; name: string } }>();
    for (const msg of allMessages) {
      if (!msg.task) continue;
      const existing = counts.get(msg.task.id);
      if (!existing) {
        counts.set(msg.task.id, { task: msg.task, count: 1, last: msg });
      } else {
        existing.count++;
        existing.last = msg;
      }
    }
    return counts;
  }, [allMessages]);

  // Tasks where the current user is @mentioned in any message
  const mentionedTaskIds = useMemo(() => {
    if (!user) return new Set<string>();
    const pattern = new RegExp(`@${user.username}\\b`, 'i');
    const ids = new Set<string>();
    for (const msg of allMessages) {
      if (msg.taskId && pattern.test(msg.content)) ids.add(msg.taskId);
    }
    return ids;
  }, [allMessages, user]);

  // Filtered task list for Tasks tab
  const filteredTasks = useMemo(() => {
    const q = taskSearch.toLowerCase().trim();
    return tasks.filter((t) => {
      if (q) return t.name.toLowerCase().includes(q);
      if (showAllTasks) return true;
      // Default: show pinned, owned, mentioned — hide dismissed and done (unless pinned)
      if (pinnedTaskIds.includes(t.id)) return true;
      if (dismissedTaskIds.includes(t.id)) return false;
      if (t.status === 'done') return false;
      if (t.ownerId === user?.id) return true;
      if (mentionedTaskIds.has(t.id)) return true;
      return false;
    });
  }, [tasks, taskSearch, showAllTasks, pinnedTaskIds, dismissedTaskIds, user, mentionedTaskIds]);

  // Pinned tasks shown first in list
  const sortedFilteredTasks = useMemo(() => {
    const pinned = filteredTasks.filter((t) => pinnedTaskIds.includes(t.id));
    const rest = filteredTasks.filter((t) => !pinnedTaskIds.includes(t.id));
    // Sort rest by last message date, then by task creation
    const withMsg = rest.filter((t) => taskMessageCounts.has(t.id))
      .sort((a, b) => new Date(taskMessageCounts.get(b.id)!.last.createdAt).getTime() - new Date(taskMessageCounts.get(a.id)!.last.createdAt).getTime());
    const withoutMsg = rest.filter((t) => !taskMessageCounts.has(t.id));
    return [...pinned, ...withMsg, ...withoutMsg];
  }, [filteredTasks, pinnedTaskIds, taskMessageCounts]);

  const showingMessages = tab === 'messages' || (tab === 'tasks' && selectedTask != null) || !!taskId;
  useEffect(() => {
    if (showingMessages) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages.length, showingMessages]);

  const filteredMessages = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return [];
    return displayMessages.filter((m) =>
      (m.content ?? '').toLowerCase().includes(q) ||
      m.author.username.toLowerCase().includes(q) ||
      (m.task?.name ?? '').toLowerCase().includes(q)
    );
  }, [displayMessages, search]);

  const allAttachments = useMemo(() => {
    const result: { att: Message['attachments'][number]; msg: Message }[] = [];
    for (const msg of displayMessages) {
      for (const att of msg.attachments) result.push({ att, msg });
    }
    return result;
  }, [displayMessages]);

  // Filtered mention candidates
  const mentionCandidates = useMemo(() => {
    if (mentionSearch === null) return [];
    const q = mentionSearch.toLowerCase();
    return teamMembers.filter((m) => m.username.toLowerCase().startsWith(q) && m.id !== user?.id).slice(0, 6);
  }, [mentionSearch, teamMembers, user?.id]);

  function handleDraftChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setDraft(val);
    const cursor = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      setMentionSearch(mentionMatch[1]);
      setMentionCursorStart(cursor - mentionMatch[0].length);
      setMentionHighlight(0);
    } else {
      setMentionSearch(null);
    }
  }

  function insertMention(username: string) {
    const before = draft.slice(0, mentionCursorStart);
    const after = draft.slice(mentionCursorStart + 1 + (mentionSearch?.length ?? 0));
    const newDraft = `${before}@${username} ${after}`;
    setDraft(newDraft);
    setMentionSearch(null);
    setTimeout(() => {
      if (textRef.current) {
        const pos = before.length + username.length + 2;
        textRef.current.focus();
        textRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  }

  function handleDraftKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionSearch !== null && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionHighlight((h) => Math.min(h + 1, mentionCandidates.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionHighlight((h) => Math.max(h - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionCandidates[mentionHighlight].username); return; }
      if (e.key === 'Escape') { setMentionSearch(null); return; }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
  }

  async function send() {
    if ((!draft.trim() && attachments.length === 0) || !productId) return;
    setSending(true);
    try {
      const msg = await api.messages.create(productId, { content: draft.trim(), taskId: sendTaskId, attachments });
      setAllMessages((prev) => [...prev, msg]);
      setDraft('');
      setAttachments([]);
      setPreview(false);
      setMentionSearch(null);
    } finally {
      setSending(false);
      setTimeout(() => textRef.current?.focus(), 0);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map((f) => api.upload(f)));
      setAttachments((prev) => [...prev, ...uploaded]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageItems = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith('image/'));
    if (!imageItems.length) return;
    e.preventDefault();
    setUploading(true);
    try {
      const files = imageItems.map((i) => i.getAsFile()).filter(Boolean) as File[];
      const uploaded = await Promise.all(files.map((f) => api.upload(f)));
      setAttachments((prev) => [...prev, ...uploaded]);
    } finally { setUploading(false); }
  }

  async function saveEdit(id: string) {
    if (!productId || !editDraft.trim()) return;
    const updated = await api.messages.update(productId, id, editDraft.trim());
    setAllMessages((prev) => prev.map((m) => (m.id === id ? updated : m)));
    setEditingId(null);
  }

  async function deleteMsg(id: string) {
    if (!productId || !confirm('Delete this message?')) return;
    await api.messages.delete(productId, id);
    setAllMessages((prev) => prev.filter((m) => m.id !== id));
  }

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => { setTab(t); if (t !== 'tasks') setSelectedTask(null); if (t !== 'search') setSearch(''); }}
      className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex-shrink-0"
      style={{ background: tab === t ? 'var(--brand-subtle)' : 'transparent', color: tab === t ? 'var(--brand)' : 'var(--text-3)' }}
    >{label}</button>
  );

  function composeArea() {
    return (
      <div className="px-4 pb-4 pt-2 flex-shrink-0 relative" style={{ borderTop: '1px solid var(--border)' }}>
        {/* @ mention dropdown */}
        {mentionSearch !== null && mentionCandidates.length > 0 && (
          <div
            className="absolute left-4 right-4 bottom-full mb-1 rounded-xl overflow-hidden shadow-xl z-10"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Mention a member</span>
            </div>
            {mentionCandidates.map((m, i) => (
              <button
                key={m.id}
                onMouseDown={(e) => { e.preventDefault(); insertMention(m.username); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                style={{ background: i === mentionHighlight ? 'var(--surface-2)' : 'transparent' }}
                onMouseEnter={() => setMentionHighlight(i)}
              >
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  {m.avatarEmoji ?? '👤'}
                </span>
                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>@{m.username}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1 mb-2">
          <button
            onClick={() => setPreview((v) => !v)}
            className="text-xs px-2 py-0.5 rounded-md transition-colors"
            style={{ background: preview ? 'var(--brand-subtle)' : 'var(--surface-2)', color: preview ? 'var(--brand)' : 'var(--text-3)' }}
          >MD preview</button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-xs px-2 py-0.5 rounded-md transition-colors"
            style={{ background: 'var(--surface-2)', color: uploading ? 'var(--text-3)' : 'var(--text-2)' }}
          >{uploading ? '⏳' : '📎'} Attach</button>
        </div>

        {preview ? (
          <div className="min-h-[80px] max-h-40 overflow-y-auto px-3 py-2 rounded-lg mb-2 text-sm"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}>
              {draft || '*Nothing to preview*'}
            </ReactMarkdown>
          </div>
        ) : (
          <textarea
            ref={textRef}
            rows={3}
            value={draft}
            onChange={handleDraftChange}
            onPaste={handlePaste}
            onKeyDown={handleDraftKeyDown}
            placeholder="Write a message… type @ to mention · ⌘↵ send"
            className="input text-sm w-full resize-none mb-2"
          />
        )}

        {attachments.length > 0 && (
          <div className="pb-2 flex gap-2 flex-wrap">
            {attachments.map((att, i) => (
              <div key={i} className="relative group/att">
                {att.type.startsWith('image/') ? (
                  <img src={att.url} alt={att.name} className="h-14 w-14 rounded-lg object-cover" />
                ) : (
                  <div className="h-14 px-3 flex items-center text-xs rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>📎 {att.name}</div>
                )}
                <button
                  onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover/att:opacity-100"
                  style={{ background: '#ef4444', color: 'white' }}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center">
          <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>@ mention · ```python · ⌘↵ send</span>
          <button onClick={send} disabled={sending || (!draft.trim() && attachments.length === 0)} className="btn-primary text-xs px-4">
            {sending ? '…' : 'Send'}
          </button>
        </div>
      </div>
    );
  }

  function messageList(msgs: Message[]) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {msgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-3)' }}>
            <span className="text-3xl opacity-30">💬</span>
            <p className="text-sm">No messages yet. Start the conversation!</p>
          </div>
        ) : msgs.map((msg) => {
          const isOwn = msg.authorId === user?.id;
          const isEditing = editingId === msg.id;
          return (
            <div key={msg.id}>
              {isEditing ? (
                <div className="space-y-1.5">
                  <textarea
                    autoFocus
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit(msg.id); if (e.key === 'Escape') setEditingId(null); }}
                    className="input text-sm w-full resize-none"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(msg.id)} className="text-xs px-2 py-1 rounded-lg font-medium" style={{ background: 'var(--brand)', color: 'white' }}>Save</button>
                    <button onClick={() => setEditingId(null)} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <MessageBubble
                  msg={msg}
                  isOwn={isOwn}
                  onEdit={() => { setEditingId(msg.id); setEditDraft(msg.content); }}
                  onDelete={() => deleteMsg(msg.id)}
                  onImageClick={setLightboxUrl}
                />
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    );
  }

  const projectMsgCount = allMessages.filter((m) => !m.taskId).length;
  const taskThreadCount = taskMessageCounts.size;

  return (
    <div
      className="fixed top-0 h-full z-[60] flex flex-col"
      style={{ width: 420, right: panelRight, background: 'var(--surface)', borderLeft: '1px solid var(--border)', borderRight: panelRight > 0 ? '1px solid var(--border)' : 'none', boxShadow: '-12px 0 40px rgba(0,0,0,0.18)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            💬 {taskName ? 'Task chat' : 'Project chat'}
          </h2>
          {taskName && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-3)', maxWidth: 260 }}>{taskName}</p>}
        </div>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-sm flex-shrink-0" style={{ color: 'var(--text-3)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}>✕</button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 flex-shrink-0 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)', scrollbarWidth: 'none' }}>
        {tabBtn('messages', `Messages${projectMsgCount > 0 ? ` (${projectMsgCount})` : ''}`)}
        {!taskId && tabBtn('tasks', `Tasks${taskThreadCount > 0 ? ` (${taskThreadCount})` : ''}`)}
        {tabBtn('search', 'Search')}
        {tabBtn('files', `Files${allAttachments.length > 0 ? ` (${allAttachments.length})` : ''}`)}
      </div>

      {/* ── Messages tab ── */}
      {tab === 'messages' && (
        <>
          {messageList(displayMessages)}
          {composeArea()}
        </>
      )}

      {/* ── Tasks tab ── */}
      {tab === 'tasks' && !taskId && (
        selectedTask ? (
          <>
            <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <button
                onClick={() => { setSelectedTask(null); setDraft(''); setAttachments([]); }}
                className="text-xs px-2 py-1 rounded-lg transition-colors flex-shrink-0"
                style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
              >← Back</button>
              <p className="text-xs font-medium truncate flex-1 min-w-0" style={{ color: 'var(--text)' }}>{selectedTask.name}</p>
              <button
                onClick={() => togglePin(selectedTask.id)}
                className="text-sm px-2 py-1 rounded-lg transition-colors flex-shrink-0"
                title={pinnedTaskIds.includes(selectedTask.id) ? 'Unpin' : 'Pin'}
                style={{ background: pinnedTaskIds.includes(selectedTask.id) ? 'var(--brand-subtle)' : 'var(--surface-2)', color: pinnedTaskIds.includes(selectedTask.id) ? 'var(--brand)' : 'var(--text-3)' }}
              >📌</button>
              <button
                onClick={async () => {
                  if (!selectedTask || !activeProduct) return;
                  setOpeningTask(true);
                  try {
                    const full = await api.tasks.get(activeProduct.id, selectedTask.id);
                    setOpenedTask(full);
                  } catch { /* ignore */ }
                  finally { setOpeningTask(false); }
                }}
                disabled={openingTask}
                className="text-xs px-2 py-1 rounded-lg transition-colors flex-shrink-0"
                style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}
              >{openingTask ? '…' : 'Open task →'}</button>
            </div>
            {messageList(displayMessages)}
            {composeArea()}
          </>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Search / filter tasks */}
            <div className="px-4 pt-3 pb-2 flex-shrink-0 space-y-2">
              <input
                type="text"
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                placeholder="Search tasks…"
                className="input text-sm w-full"
              />
              {!taskSearch && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                    {showAllTasks ? 'All tasks' : 'Your tasks (owned or mentioned)'}
                  </span>
                  <button
                    onClick={() => setShowAllTasks((v) => !v)}
                    className="text-[10px] px-2 py-0.5 rounded-md transition-colors"
                    style={{ background: showAllTasks ? 'var(--brand-subtle)' : 'var(--surface-2)', color: showAllTasks ? 'var(--brand)' : 'var(--text-3)' }}
                  >
                    {showAllTasks ? 'Show mine' : 'Show all'}
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {sortedFilteredTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2" style={{ color: 'var(--text-3)' }}>
                  <span className="text-3xl opacity-30">📋</span>
                  <p className="text-sm">{taskSearch ? 'No tasks match.' : 'No active tasks assigned to you.'}</p>
                  {!taskSearch && !showAllTasks && (
                    <button
                      onClick={() => setShowAllTasks(true)}
                      className="text-xs px-3 py-1 rounded-lg"
                      style={{ background: 'var(--surface-2)', color: 'var(--brand)' }}
                    >Show all tasks</button>
                  )}
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {sortedFilteredTasks.map((task) => {
                    const msgInfo = taskMessageCounts.get(task.id);
                    const isPinned = pinnedTaskIds.includes(task.id);
                    const isMentioned = mentionedTaskIds.has(task.id);
                    return (
                      <div
                        key={task.id}
                        className="flex gap-2 px-4 py-3 group/task transition-colors"
                        style={{ background: 'transparent' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <button
                          onClick={() => setSelectedTask({ id: task.id, name: task.name })}
                          className="flex gap-3 flex-1 min-w-0 text-left"
                        >
                          <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-base" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                            {task.color ? <span style={{ background: task.color }} className="w-3.5 h-3.5 rounded-full block" /> : '📋'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2 mb-0.5">
                              <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                                {isPinned && <span className="mr-1 text-xs">📌</span>}
                                {isMentioned && !isPinned && <span className="mr-1 text-xs">@</span>}
                                {task.name}
                              </p>
                              {msgInfo && <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-3)' }}>{formatTime(msgInfo.last.createdAt)}</span>}
                            </div>
                            {msgInfo ? (
                              <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>
                                {msgInfo.last.author.avatarEmoji ?? '👤'} {msgInfo.last.author.username}: {msgInfo.last.content || '📎 attachment'}
                              </p>
                            ) : (
                              <p className="text-xs" style={{ color: 'var(--text-3)' }}>No messages yet</p>
                            )}
                          </div>
                          {msgInfo && (
                            <span className="flex-shrink-0 self-center text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}>
                              {msgInfo.count}
                            </span>
                          )}
                        </button>
                        {/* Action buttons */}
                        <div className="flex flex-col gap-1 self-center opacity-0 group-hover/task:opacity-100 transition-opacity flex-shrink-0">
                          <button
                            onClick={() => togglePin(task.id)}
                            className="w-6 h-6 rounded flex items-center justify-center text-xs"
                            title={isPinned ? 'Unpin' : 'Pin to top'}
                            style={{ background: isPinned ? 'var(--brand-subtle)' : 'var(--surface)', color: isPinned ? 'var(--brand)' : 'var(--text-3)', border: '1px solid var(--border)' }}
                          >📌</button>
                          {!isPinned && (
                            <button
                              onClick={() => dismissTask(task.id)}
                              className="w-6 h-6 rounded flex items-center justify-center text-xs"
                              title="Remove from feed"
                              style={{ background: 'var(--surface)', color: 'var(--text-3)', border: '1px solid var(--border)' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                            >✕</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* ── Search tab ── */}
      {tab === 'search' && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="px-4 pt-3 pb-2 flex-shrink-0">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search messages, task names, authors…"
              className="input text-sm w-full"
            />
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
            {!search.trim() ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2" style={{ color: 'var(--text-3)' }}>
                <span className="text-3xl opacity-30">🔍</span>
                <p className="text-sm">Type to search messages</p>
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2" style={{ color: 'var(--text-3)' }}>
                <p className="text-sm">No messages match "{search}"</p>
              </div>
            ) : filteredMessages.map((msg) => (
              <button
                key={msg.id}
                className="w-full text-left rounded-xl px-3 py-2.5 transition-colors"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--brand)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                onClick={() => {
                  if (msg.task) {
                    setSelectedTask(msg.task);
                    setTab('tasks');
                  } else {
                    setTab('messages');
                  }
                  setSearch('');
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm">{msg.author.avatarEmoji ?? '👤'}</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{msg.author.username}</span>
                  {msg.task && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full ml-1" style={{ background: 'var(--surface)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                      📋 {msg.task.name}
                    </span>
                  )}
                  <span className="text-[10px] ml-auto flex-shrink-0" style={{ color: 'var(--text-3)' }}>{formatTime(msg.createdAt)}</span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', textAlign: 'left' }}>{msg.content}</p>
                {msg.attachments.length > 0 && (
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>📎 {msg.attachments.length} attachment{msg.attachments.length > 1 ? 's' : ''}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Files tab ── */}
      {tab === 'files' && (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {allAttachments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2" style={{ color: 'var(--text-3)' }}>
              <span className="text-3xl opacity-30">📎</span>
              <p className="text-sm">No attachments yet.</p>
            </div>
          ) : (() => {
            const images = allAttachments.filter((x) => x.att.type.startsWith('image/'));
            const docs = allAttachments.filter((x) => !x.att.type.startsWith('image/'));
            return (
              <div className="space-y-4">
                {images.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>Images ({images.length})</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {images.map(({ att, msg }, i) => (
                        <div key={i} className="relative group/img aspect-square">
                          <img
                            src={att.url} alt={att.name}
                            className="w-full h-full object-cover rounded-lg cursor-zoom-in"
                            onClick={() => setLightboxUrl(att.url)}
                          />
                          <div className="absolute inset-0 rounded-lg flex flex-col items-center justify-center gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-none" style={{ background: 'rgba(0,0,0,0.55)' }}>
                            <span className="text-white text-[10px] px-2 py-1 rounded font-medium" style={{ background: 'rgba(255,255,255,0.15)' }}>Click to view</span>
                            <a href={att.url} download={att.name} onClick={(e) => e.stopPropagation()} className="text-white text-[10px] px-2 py-1 rounded font-medium pointer-events-auto" style={{ background: 'rgba(255,255,255,0.15)' }}>Download</a>
                          </div>
                          <div className="absolute bottom-1 left-1 right-1 text-[9px] truncate text-white opacity-0 group-hover/img:opacity-70 px-1">
                            {formatTime(msg.createdAt)} · {msg.author.username}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {docs.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>Documents ({docs.length})</p>
                    <div className="space-y-1.5">
                      {docs.map(({ att, msg }, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg group/doc" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                          <span className="text-lg flex-shrink-0">{att.type === 'application/pdf' ? '📄' : '📁'}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{att.name}</p>
                            <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{msg.author.username} · {formatTime(msg.createdAt)}</p>
                          </div>
                          <a href={att.url} download={att.name} className="text-xs px-2 py-1 rounded-lg flex-shrink-0 opacity-0 group-hover/doc:opacity-100 transition-opacity" style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}>↓ Download</a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.txt,.csv,.zip" className="hidden" onChange={handleFileChange} />

      {/* Task detail panel opened via "Open task →" */}
      {openedTask && (
        <TaskDetailPanel
          task={openedTask}
          readOnly={false}
          onClose={() => setOpenedTask(null)}
          onUpdated={(updated) => setOpenedTask(updated)}
          onDeleted={() => setOpenedTask(null)}
        />
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white text-xl font-bold transition-colors"
            style={{ background: 'rgba(255,255,255,0.15)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.3)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
          >✕</button>
          <img
            src={lightboxUrl}
            alt=""
            className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <a
            href={lightboxUrl}
            download
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-6 text-white text-sm px-4 py-2 rounded-xl font-medium transition-colors"
            style={{ background: 'rgba(255,255,255,0.15)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
          >↓ Download</a>
        </div>
      )}
    </div>
  );
}
