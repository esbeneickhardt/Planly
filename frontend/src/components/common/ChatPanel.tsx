import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { api } from '../../api/client';
import type { Message } from '../../api/client';
import { useProduct } from '../../context/ProductContext';
import { useAuth } from '../../context/AuthContext';

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
                {msg.content}
              </ReactMarkdown>
            </div>
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

export default function ChatPanel({ taskId, taskName, onClose }: Props) {
  const { activeProduct } = useProduct();
  const { user } = useAuth();
  const navigate = useNavigate();

  // All messages for this product (used in top-bar mode for task grouping, search, files)
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [tab, setTab] = useState<Tab>('messages');
  // Which task is open in the Tasks tab
  const [selectedTask, setSelectedTask] = useState<{ id: string; name: string } | null>(null);

  // Compose state (shared across message views)
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [attachments, setAttachments] = useState<{ url: string; name: string; type: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const panelRight = taskId ? 448 : 0;
  const productId = activeProduct?.id;

  // What taskId to use when sending
  const sendTaskId = taskId ?? (tab === 'tasks' && selectedTask ? selectedTask.id : undefined);

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

  // Messages shown in the active message pane
  const displayMessages = useMemo(() => {
    if (taskId) return allMessages; // task-panel mode: all loaded msgs are for this task
    if (tab === 'tasks' && selectedTask) return allMessages.filter((m) => m.taskId === selectedTask.id);
    if (tab === 'search' || tab === 'files') return allMessages; // search/files span all product messages
    return allMessages.filter((m) => !m.taskId); // Messages tab: project-level only
  }, [allMessages, taskId, tab, selectedTask]);

  // Task groups for the Tasks tab list
  const taskGroups = useMemo(() => {
    const groups = new Map<string, { task: { id: string; name: string }; count: number; last: Message }>();
    for (const msg of allMessages) {
      if (!msg.task) continue;
      const existing = groups.get(msg.task.id);
      if (!existing) {
        groups.set(msg.task.id, { task: msg.task, count: 1, last: msg });
      } else {
        existing.count++;
        existing.last = msg;
      }
    }
    return Array.from(groups.values()).sort(
      (a, b) => new Date(b.last.createdAt).getTime() - new Date(a.last.createdAt).getTime()
    );
  }, [allMessages]);

  // Scroll to bottom when messages or tab changes to a message view
  const showingMessages = tab === 'messages' || (tab === 'tasks' && selectedTask != null) || !!taskId;
  useEffect(() => {
    if (showingMessages) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages.length, showingMessages]);

  // Search across context-scoped messages
  const filteredMessages = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return [];
    return displayMessages.filter((m) =>
      (m.content ?? '').toLowerCase().includes(q) ||
      m.author.username.toLowerCase().includes(q) ||
      (m.task?.name ?? '').toLowerCase().includes(q)
    );
  }, [displayMessages, search]);

  // All attachments in the current context
  const allAttachments = useMemo(() => {
    const result: { att: Message['attachments'][number]; msg: Message }[] = [];
    for (const msg of displayMessages) {
      for (const att of msg.attachments) result.push({ att, msg });
    }
    return result;
  }, [displayMessages]);

  async function send() {
    if ((!draft.trim() && attachments.length === 0) || !productId) return;
    setSending(true);
    try {
      const msg = await api.messages.create(productId, { content: draft.trim(), taskId: sendTaskId, attachments });
      setAllMessages((prev) => [...prev, msg]);
      setDraft('');
      setAttachments([]);
      setPreview(false);
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

  // Called as {composeArea()} — NOT as <ComposeArea /> — so React never remounts it on render
  function composeArea() {
    return (
      <div className="px-4 pb-4 pt-2 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
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
            onChange={(e) => setDraft(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
            placeholder="Write a message… (⌘↵ to send)"
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
          <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>Paste images · ```python · ⌘↵ send</span>
          <button onClick={send} disabled={sending || (!draft.trim() && attachments.length === 0)} className="btn-primary text-xs px-4">
            {sending ? '…' : 'Send'}
          </button>
        </div>
      </div>
    );
  }

  // Called as {messageList(msgs)} — NOT as <MessageList /> — so React never remounts it on render
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

      {/* Tabs — Tasks tab only shown in top-bar (project) mode */}
      <div className="flex items-center gap-1 px-3 py-2 flex-shrink-0 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)', scrollbarWidth: 'none' }}>
        {tabBtn('messages', `Messages${projectMsgCount > 0 ? ` (${projectMsgCount})` : ''}`)}
        {!taskId && tabBtn('tasks', `Tasks${taskGroups.length > 0 ? ` (${taskGroups.length})` : ''}`)}
        {tabBtn('search', 'Search')}
        {tabBtn('files', `Files${allAttachments.length > 0 ? ` (${allAttachments.length})` : ''}`)}
      </div>

      {/* ── Messages tab ── project-level only */}
      {tab === 'messages' && (
        <>
          {messageList(displayMessages)}
          {composeArea()}
        </>
      )}

      {/* ── Tasks tab ── */}
      {tab === 'tasks' && !taskId && (
        selectedTask ? (
          // Task detail view
          <>
            <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <button
                onClick={() => { setSelectedTask(null); setDraft(''); setAttachments([]); }}
                className="text-xs px-2 py-1 rounded-lg transition-colors flex-shrink-0"
                style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
              >← Back</button>
              <p className="text-xs font-medium truncate flex-1 min-w-0" style={{ color: 'var(--text)' }}>{selectedTask.name}</p>
              <button
                onClick={() => { onClose(); navigate('/kanban'); }}
                className="text-xs px-2 py-1 rounded-lg transition-colors flex-shrink-0"
                style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}
              >Open task →</button>
            </div>
            {messageList(displayMessages)}
            {composeArea()}
          </>
        ) : (
          // Task list view
          <div className="flex-1 overflow-y-auto">
            {taskGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-3)' }}>
                <span className="text-3xl opacity-30">📋</span>
                <p className="text-sm">No task messages yet.</p>
                <p className="text-xs text-center px-6">Open a task and use the chat icon there to start a conversation.</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {taskGroups.map(({ task, count, last }) => (
                  <button
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className="w-full text-left px-4 py-3.5 flex gap-3 transition-colors"
                    style={{ background: 'transparent' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-base" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      📋
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2 mb-0.5">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{task.name}</p>
                        <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-3)' }}>{formatTime(last.createdAt)}</span>
                      </div>
                      <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>
                        {last.author.avatarEmoji ?? '👤'} {last.author.username}: {last.content || '📎 attachment'}
                      </p>
                    </div>
                    {count > 0 && (
                      <span className="flex-shrink-0 self-center text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}>
                        {count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
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
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>Searches content, task names, and authors</p>
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2" style={{ color: 'var(--text-3)' }}>
                <p className="text-sm">No messages match "{search}"</p>
              </div>
            ) : filteredMessages.map((msg) => (
              <div key={msg.id} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
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
                <p className="text-xs" style={{ color: 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</p>
                {msg.attachments.length > 0 && (
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>📎 {msg.attachments.length} attachment{msg.attachments.length > 1 ? 's' : ''}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Files tab ── all files across all messages */}
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
