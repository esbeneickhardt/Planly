import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { api, displayName } from '../../api/client';
import type { Message } from '../../api/client';
import { useProduct } from '../../context/ProductContext';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import type { User, Task } from '../../types';
import TaskDetailPanel from './TaskDetailPanel';
import { EMOJI_SET } from './MarkdownEditor';
import MessageBubble, { formatTime } from './MessageBubble';
import { useMessageEdit } from '../../hooks/useMessageEdit';

interface Props {
  initialTask?: { id: string; name: string };
  onClose: () => void;
  isAdminChat?: boolean;
}

type Tab = 'messages' | 'tasks' | 'search' | 'files';

const EDIT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes


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

export default function ChatPanel({ initialTask, onClose, isAdminChat = false }: Props) {
  const { activeProduct, tasks } = useProduct();
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [tab, setTab] = useState<Tab>('messages');
  const [selectedTask, setSelectedTask] = useState<{ id: string; name: string } | null>(null);
  const [openedTask, setOpenedTask] = useState<Task | null>(null);
  const [openingTask, setOpeningTask] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSidebar, setIsSidebar] = useState(() => { try { return localStorage.getItem('planly-chat-sidebar') === 'true'; } catch { return false; } });
  const [panelWidth, setPanelWidth] = useState(() => { try { return parseInt(localStorage.getItem('planly-chat-width') ?? '380'); } catch { return 380; } });
  const [panelHeight, setPanelHeight] = useState(() => { try { return parseInt(localStorage.getItem('planly-chat-height') ?? '560'); } catch { return 560; } });
  const [chatPos, setChatPos] = useState<{ x: number; y: number }>(() => {
    try { const s = localStorage.getItem('planly-chat-pos'); if (s) return JSON.parse(s); } catch {}
    const w = parseInt(localStorage.getItem('planly-chat-width') ?? '380');
    return { x: Math.max(8, window.innerWidth - w - 16), y: 64 };
  });
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [showComposePicker, setShowComposePicker] = useState(false);
  const [showMarkdownHelp, setShowMarkdownHelp] = useState(false);
  const panelWidthRef = useRef(panelWidth);
  panelWidthRef.current = panelWidth;
  const panelHeightRef = useRef(panelHeight);
  panelHeightRef.current = panelHeight;
  const chatPosRef = useRef(chatPos);
  chatPosRef.current = chatPos;
  const isSidebarRef = useRef(isSidebar);
  isSidebarRef.current = isSidebar;
  const headerDragRef = useRef<{ startX: number; startY: number; px: number; py: number } | null>(null);

  // Compose state
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [attachments, setAttachments] = useState<{ url: string; name: string; type: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

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

  const [scrollToMsgId, setScrollToMsgId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);


  const productId = activeProduct?.id;
  const sendTaskId = tab === 'tasks' && selectedTask ? selectedTask.id : undefined;
  const { editingId, editDraft, setEditDraft, startEdit, cancelEdit, saveEdit } = useMessageEdit({ isAdminChat, productId, setAllMessages });

  // When opened from a task's chat button, jump directly to that task's thread
  useEffect(() => {
    if (initialTask) {
      setTab('tasks');
      setSelectedTask({ id: initialTask.id, name: initialTask.name });
    }
  }, [initialTask?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!scrollToMsgId) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`chat-msg-${scrollToMsgId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'background 0.3s';
        el.style.background = 'var(--brand-subtle)';
        setTimeout(() => { el.style.background = ''; }, 2000);
      }
      setScrollToMsgId(null);
    }, 120);
    return () => clearTimeout(timer);
  }, [scrollToMsgId]);

  // Load team members for @ mentions (not applicable in admin chat)
  useEffect(() => {
    if (isAdminChat) return;
    const teamId = activeProduct?.teamId;
    if (!teamId) return;
    api.teams.get(teamId)
      .then((team) => setTeamMembers(team.members.map((m) => m.user)))
      .catch(() => {});
  }, [isAdminChat, activeProduct?.teamId]);

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
    try {
      if (isAdminChat) {
        const msgs = await api.adminChat.list();
        setAllMessages(msgs);
      } else {
        if (!productId) return;
        const msgs = await api.messages.listAll(productId);
        setAllMessages(msgs);
      }
    } catch {}
  }, [isAdminChat, productId]);

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
    if (tab === 'tasks' && selectedTask) return allMessages.filter((m) => m.taskId === selectedTask.id);
    if (tab === 'search' || tab === 'files') return allMessages;
    return allMessages.filter((m) => !m.taskId);
  }, [allMessages, tab, selectedTask]);

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
      // Default: show pinned, owned, mentioned - hide dismissed and done (unless pinned)
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

  const showingMessages = tab === 'messages' || (tab === 'tasks' && selectedTask != null);
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
      setMentionSearch(mentionMatch[1] ?? null);
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
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionCandidates[mentionHighlight]!.username); return; }
      if (e.key === 'Escape') { setMentionSearch(null); return; }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
  }

  async function send() {
    if (!draft.trim() && attachments.length === 0) return;
    if (!isAdminChat && !productId) return;
    setSending(true);
    try {
      const msg = isAdminChat
        ? await api.adminChat.create({ content: draft.trim(), attachments })
        : await api.messages.create(productId!, { content: draft.trim(), taskId: sendTaskId, attachments });
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

  async function deleteMsg(id: string) {
    if (!await confirm('Delete this message?')) return;
    if (!isAdminChat && !productId) return;
    if (isAdminChat) {
      await api.adminChat.delete(id);
    } else {
      await api.messages.delete(productId!, id);
    }
    setAllMessages((prev) => prev.filter((m) => m.id !== id));
  }

  const startResizeDir = useCallback((e: React.PointerEvent, dir: string) => {
    e.preventDefault();
    e.stopPropagation();
    const sx = chatPosRef.current.x, sy = chatPosRef.current.y;
    const sw = panelWidthRef.current, sh = panelHeightRef.current;
    const startX = e.clientX, startY = e.clientY;
    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      let newW = sw, newH = sh, newX = sx, newY = sy;
      if (dir.includes('e')) newW = Math.max(300, Math.min(1200, sw + dx));
      if (dir.includes('w')) {
        newW = Math.max(300, Math.min(1200, sw - dx));
        if (!isSidebarRef.current) newX = sx + sw - newW;
      }
      if (dir.includes('s')) newH = Math.max(200, Math.min(window.innerHeight - 40, sh + dy));
      if (dir.includes('n')) { newH = Math.max(200, Math.min(window.innerHeight - 40, sh - dy)); newY = sy + sh - newH; }
      newX = Math.max(0, Math.min(window.innerWidth - newW, newX));
      newY = Math.max(0, newY);
      setPanelWidth(newW); panelWidthRef.current = newW;
      setPanelHeight(newH); panelHeightRef.current = newH;
      if (!isSidebarRef.current) setChatPos({ x: newX, y: newY });
    }
    function onUp() {
      try {
        localStorage.setItem('planly-chat-width', String(panelWidthRef.current));
        localStorage.setItem('planly-chat-height', String(panelHeightRef.current));
        localStorage.setItem('planly-chat-pos', JSON.stringify(chatPosRef.current));
      } catch {}
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  const onHeaderDrag = useCallback((e: React.PointerEvent) => {
    if ((e.target as Element).closest('button')) return;
    e.preventDefault();
    const startPX = isSidebarRef.current ? window.innerWidth - panelWidthRef.current : chatPosRef.current.x;
    const startPY = isSidebarRef.current ? 0 : chatPosRef.current.y;
    headerDragRef.current = { startX: e.clientX, startY: e.clientY, px: startPX, py: startPY };
    function onMove(ev: PointerEvent) {
      if (!headerDragRef.current) return;
      const x = Math.max(0, Math.min(window.innerWidth - panelWidthRef.current, headerDragRef.current.px + (ev.clientX - headerDragRef.current.startX)));
      const y = Math.max(0, Math.min(window.innerHeight - 56, headerDragRef.current.py + (ev.clientY - headerDragRef.current.startY)));
      // Undock from sidebar if dragged away from right edge
      if (isSidebarRef.current && x + panelWidthRef.current < window.innerWidth - 40) {
        setIsSidebar(false); isSidebarRef.current = false;
        try { localStorage.setItem('planly-chat-sidebar', 'false'); } catch {}
      }
      setChatPos({ x, y });
    }
    function onUp() {
      // Snap to sidebar if released near right edge
      const pos = chatPosRef.current;
      if (!isSidebarRef.current && pos.x + panelWidthRef.current >= window.innerWidth - 40) {
        setIsSidebar(true); isSidebarRef.current = true;
        try { localStorage.setItem('planly-chat-sidebar', 'true'); } catch {}
      }
      try { localStorage.setItem('planly-chat-pos', JSON.stringify(chatPosRef.current)); } catch {}
      headerDragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  async function toggleReaction(messageId: string, emoji: string) {
    if (!isAdminChat && !productId) return;
    const userId = user?.id ?? '';
    setAllMessages((prev) => prev.map((m) => {
      if (m.id !== messageId) return m;
      const mine = m.reactions.find((r) => r.emoji === emoji && r.userId === userId);
      return { ...m, reactions: mine ? m.reactions.filter((r) => !(r.emoji === emoji && r.userId === userId)) : [...m.reactions, { emoji, userId, messageId }] };
    }));
    try {
      const { reactions } = isAdminChat
        ? await api.adminChat.toggleReaction(messageId, emoji)
        : await api.messages.toggleReaction(productId!, messageId, emoji);
      setAllMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, reactions } : m));
    } catch { /* revert handled by next poll */ }
  }

  useEffect(() => {
    if (!reactionPickerFor && !showComposePicker) return;
    function onDown(e: MouseEvent) {
      const el = e.target as Element;
      if (!el.closest('[data-emoji-picker]')) {
        setReactionPickerFor(null);
        setShowComposePicker(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [reactionPickerFor, showComposePicker]);

  async function handleDeleteFile(url: string) {
    if (!await confirm('Delete this file? It will no longer be accessible from chat messages.')) return;
    const filename = url.split('/').pop() ?? '';
    setDeletingFile(url);
    try {
      await api.deleteUpload(filename);
      // Remove from messages in local state so Files tab updates immediately
      setAllMessages((prev) => prev.map((m) => ({
        ...m,
        attachments: m.attachments.filter((a) => a.url !== url),
      })));
    } catch { /* file may already be gone */ }
    finally { setDeletingFile(null); }
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

        {/* Compose emoji picker */}
        {showComposePicker && (
          <div data-emoji-picker className="absolute left-4 bottom-full mb-1 z-50 p-2 rounded-xl shadow-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 28px)', gap: 2 }}>
              {EMOJI_SET.map((e) => (
                <button key={e}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    const ta = textRef.current;
                    if (ta) {
                      const start = ta.selectionStart ?? draft.length;
                      const end = ta.selectionEnd ?? draft.length;
                      const next = draft.slice(0, start) + e + draft.slice(end);
                      setDraft(next);
                      requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + e.length, start + e.length); });
                    } else {
                      setDraft((d) => d + e);
                    }
                    setShowComposePicker(false);
                  }}
                  className="flex items-center justify-center rounded text-base"
                  style={{ width: 28, height: 28 }}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Markdown cheatsheet */}
        {showMarkdownHelp && (
          <div
            className="absolute left-0 right-0 bottom-full mb-1 z-50 rounded-xl shadow-xl overflow-y-auto"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: 380 }}
          >
            <div className="flex items-center justify-between px-4 py-2.5 sticky top-0" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
              <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Markdown reference</span>
              <button onClick={() => setShowMarkdownHelp(false)} className="text-xs" style={{ color: 'var(--text-3)' }}>✕</button>
            </div>
            <div className="p-4 space-y-4">
              {([
                ['Headings', '# H1\n## H2\n### H3'],
                ['Bold / Italic / Strike', '**bold**   *italic*   ~~strike~~'],
                ['Inline code', '`code here`'],
                ['Code block', '```python\ndef hello():\n    return "world"\n```'],
                ['Link', '[link text](https://example.com)'],
                ['Image', '![alt text](https://example.com/img.png)'],
                ['Unordered list', '- Item one\n- Item two\n  - Nested'],
                ['Ordered list', '1. First\n2. Second\n3. Third'],
                ['Blockquote', '> This is a quote\n> spanning two lines'],
                ['Table', '| Name   | Value |\n|--------|-------|\n| Alpha  | 1     |\n| Beta   | 2     |'],
                ['Horizontal rule', '---'],
              ] as [string, string][]).map(([label, syntax]) => (
                <div key={label}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-3)' }}>{label}</p>
                  <pre
                    className="text-xs rounded-lg px-3 py-2 select-all cursor-pointer"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-2)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
                    onClick={() => {
                      const ta = textRef.current;
                      if (!ta) return;
                      const ins = '\n' + syntax;
                      const pos = ta.selectionEnd ?? draft.length;
                      setDraft((d) => d.slice(0, pos) + ins + d.slice(pos));
                      setShowMarkdownHelp(false);
                      requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(pos + ins.length, pos + ins.length); });
                    }}
                    title="Click to insert"
                  >{syntax}</pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Toolbar - order: 😊 Emoji | 📎 Attach | ℹ Markdown | Preview */}
        <div className="flex items-center gap-1 mb-2">
          <button
            data-emoji-picker
            onClick={() => setShowComposePicker((v) => !v)}
            className="text-xs px-2 py-0.5 rounded-md transition-colors"
            style={{ background: showComposePicker ? 'var(--brand-subtle)' : 'var(--surface-2)', color: showComposePicker ? 'var(--brand)' : 'var(--text-2)' }}
            title="Insert emoji"
          >😊</button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-xs px-2 py-0.5 rounded-md transition-colors"
            style={{ background: 'var(--surface-2)', color: uploading ? 'var(--text-3)' : 'var(--text-2)' }}
          >{uploading ? '⏳' : '📎'} Attach</button>
          <button
            onClick={() => setShowMarkdownHelp((v) => !v)}
            className="text-xs px-2 py-0.5 rounded-md transition-colors font-medium"
            style={{ background: showMarkdownHelp ? 'var(--brand-subtle)' : 'var(--surface-2)', color: showMarkdownHelp ? 'var(--brand)' : 'var(--text-3)' }}
            title="Markdown reference"
          >ℹ Markdown</button>
          <button
            onClick={() => setPreview((v) => !v)}
            className="text-xs px-2 py-0.5 rounded-md transition-colors"
            style={{ background: preview ? 'var(--brand-subtle)' : 'var(--surface-2)', color: preview ? 'var(--brand)' : 'var(--text-3)' }}
          >{preview ? 'Edit' : 'Preview'}</button>
        </div>

        {preview ? (
          <div className="min-h-[80px] max-h-40 overflow-y-auto px-3 py-2 rounded-lg mb-2 text-sm"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}>
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
            <div key={msg.id} id={`chat-msg-${msg.id}`}>
              {isEditing ? (
                <div className="space-y-1.5">
                  <textarea
                    autoFocus
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit(msg.id); if (e.key === 'Escape') cancelEdit(); }}
                    className="input text-sm w-full resize-none"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(msg.id)} className="text-xs px-2 py-1 rounded-lg font-medium" style={{ background: 'var(--brand)', color: 'white' }}>Save</button>
                    <button onClick={cancelEdit} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div data-emoji-picker>
                <MessageBubble
                  msg={msg}
                  isOwn={isOwn}
                  onEdit={() => startEdit(msg.id, msg.content)}
                  onDelete={() => deleteMsg(msg.id)}
                  onImageClick={setLightboxUrl}
                  canEdit={Date.now() - new Date(msg.createdAt).getTime() < EDIT_TIMEOUT_MS}
                  onReact={(emoji) => toggleReaction(msg.id, emoji)}
                  currentUserId={user?.id ?? null}
                  reactionPickerOpen={reactionPickerFor === msg.id}
                  onToggleReactionPicker={() => setReactionPickerFor((v) => v === msg.id ? null : msg.id)}
                />
              </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    );
  }

  const taskThreadCount = taskMessageCounts.size;

  const ExpandIcon = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8,1 12,1 12,5" /><polyline points="5,12 1,12 1,8" />
      <line x1="12" y1="1" x2="7" y2="6" /><line x1="1" y1="12" x2="6" y2="7" />
    </svg>
  );
  const CollapseIcon = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="12,8 12,12 8,12" /><polyline points="1,5 1,1 5,1" />
      <line x1="7" y1="7" x2="12" y2="12" /><line x1="1" y1="1" x2="6" y2="6" />
    </svg>
  );

  const headerBtn = (title: string, onClick: () => void, icon: React.ReactNode) => (
    <button title={title} onClick={onClick}
      className="w-7 h-7 flex items-center justify-center rounded-lg text-sm flex-shrink-0"
      style={{ color: 'var(--text-3)' }}
      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}>
      {icon}
    </button>
  );

  return (
    <div
      className="fixed flex flex-col"
      style={isExpanded
        ? { inset: 0, zIndex: 100, background: 'var(--surface)' }
        : isSidebar
        ? { top: 0, right: 0, bottom: 0, zIndex: 60, width: panelWidth, background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-12px 0 40px rgba(0,0,0,0.22)', overflow: 'hidden' }
        : { left: chatPos.x, top: chatPos.y, zIndex: 60, width: panelWidth, height: isMinimized ? 'auto' : panelHeight, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 64px rgba(0,0,0,0.28)', overflow: 'hidden' }}
    >
      {/* Resize handles */}
      {!isExpanded && !isSidebar && (
        <>
          <div onPointerDown={(e) => startResizeDir(e, 'n')}  style={{ position: 'absolute', top: 0,    left: 12,   right: 12,  height: 5, cursor: 'n-resize',  zIndex: 10 }} />
          <div onPointerDown={(e) => startResizeDir(e, 's')}  style={{ position: 'absolute', bottom: 0, left: 12,   right: 12,  height: 5, cursor: 's-resize',  zIndex: 10 }} />
          <div onPointerDown={(e) => startResizeDir(e, 'e')}  style={{ position: 'absolute', top: 12,   right: 0,   bottom: 12, width: 5,  cursor: 'e-resize',  zIndex: 10 }} />
          <div onPointerDown={(e) => startResizeDir(e, 'w')}  style={{ position: 'absolute', top: 12,   left: 0,    bottom: 12, width: 5,  cursor: 'w-resize',  zIndex: 10 }} />
          <div onPointerDown={(e) => startResizeDir(e, 'nw')} style={{ position: 'absolute', top: 0,    left: 0,    width: 12,  height: 12, cursor: 'nw-resize', zIndex: 11 }} />
          <div onPointerDown={(e) => startResizeDir(e, 'ne')} style={{ position: 'absolute', top: 0,    right: 0,   width: 12,  height: 12, cursor: 'ne-resize', zIndex: 11 }} />
          <div onPointerDown={(e) => startResizeDir(e, 'sw')} style={{ position: 'absolute', bottom: 0, left: 0,    width: 12,  height: 12, cursor: 'sw-resize', zIndex: 11 }} />
          <div onPointerDown={(e) => startResizeDir(e, 'se')} style={{ position: 'absolute', bottom: 0, right: 0,   width: 12,  height: 12, cursor: 'se-resize', zIndex: 11 }} />
        </>
      )}
      {/* Sidebar mode: left-edge resize only */}
      {!isExpanded && isSidebar && (
        <div onPointerDown={(e) => startResizeDir(e, 'w')} style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 5, cursor: 'w-resize', zIndex: 10 }} />
      )}
      {/* Header - drag handle */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0 select-none"
        style={{ borderBottom: isMinimized ? 'none' : '1px solid var(--border)', cursor: isExpanded ? 'default' : 'grab' }}
        onPointerDown={isExpanded ? undefined : onHeaderDrag}
      >
        <div className="min-w-0">
          {!isAdminChat && tab === 'tasks' && selectedTask && !isMinimized ? (
            <div className="flex items-center gap-1 min-w-0">
              <button
                onClick={() => { setTab('messages'); setSelectedTask(null); }}
                className="text-xs font-medium flex-shrink-0 transition-colors"
                style={{ color: 'var(--brand)' }}
              >💬 Project chat</button>
              <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>›</span>
              <span className="text-xs truncate" style={{ color: 'var(--text-2)' }}>{selectedTask.name}</span>
            </div>
          ) : (
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              💬 {isAdminChat ? 'Admin chat' : 'Project chat'}
            </h2>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isExpanded && headerBtn(isMinimized ? 'Restore' : 'Minimise', () => setIsMinimized((v) => !v), isMinimized ? '▲' : '−')}
          {headerBtn(isExpanded ? 'Exit fullscreen' : 'Fullscreen', () => { setIsExpanded((v) => !v); setIsMinimized(false); }, isExpanded ? <CollapseIcon /> : <ExpandIcon />)}
          {headerBtn('Close', onClose, '✕')}
        </div>
      </div>

      {!isMinimized && <>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 flex-shrink-0 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)', scrollbarWidth: 'none' }}>
        {tabBtn('messages', 'Messages')}
        {!isAdminChat && tabBtn('tasks', `Tasks${taskThreadCount > 0 ? ` (${taskThreadCount})` : ''}`)}
        {tabBtn('search', 'Search')}
        {tabBtn('files', 'Files')}
      </div>

      {/* ── Messages tab ── */}
      {tab === 'messages' && (
        <>
          {messageList(displayMessages)}
          {composeArea()}
        </>
      )}

      {/* ── Tasks tab ── */}
      {tab === 'tasks' && !isAdminChat && (
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
                                {msgInfo.last.author.avatarEmoji ?? '👤'} {displayName(msgInfo.last.author)}: {msgInfo.last.content || '📎 attachment'}
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
                  setScrollToMsgId(msg.id);
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
                  <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{displayName(msg.author)}</span>
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
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteFile(att.url); }}
                            disabled={deletingFile === att.url}
                            title="Delete file"
                            className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-auto"
                            style={{ background: 'rgba(239,68,68,0.9)', color: 'white' }}
                          >
                            <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" />
                            </svg>
                          </button>
                          <div className="absolute bottom-1 left-1 right-1 text-[9px] truncate text-white opacity-0 group-hover/img:opacity-70 px-1">
                            {formatTime(msg.createdAt)} · {displayName(msg.author)}
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
                            <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{displayName(msg.author)} · {formatTime(msg.createdAt)}</p>
                          </div>
                          <div className="flex items-center gap-1.5 opacity-0 group-hover/doc:opacity-100 transition-opacity flex-shrink-0">
                            <a href={att.url} download={att.name} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}>↓</a>
                            <button
                              onClick={() => handleDeleteFile(att.url)}
                              disabled={deletingFile === att.url}
                              title="Delete file"
                              className="text-xs px-2 py-1 rounded-lg transition-colors"
                              style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.2)')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                            >{deletingFile === att.url ? '…' : '🗑'}</button>
                          </div>
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

      <input ref={fileRef} type="file" multiple accept="image/*,.svg,.pdf,.txt,.md,.csv,.json,.zip,.docx,.xlsx,.pptx,.doc,.xls" className="hidden" onChange={handleFileChange} />

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

      </>}
    </div>
  );
}
