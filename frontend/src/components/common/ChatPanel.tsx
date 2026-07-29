/**
 * Floating/dockable chat panel with tabs: messages, tasks (per-task threads), people (DMs), files, search.
 * Messages are polled every 5 s and paused while the browser tab is hidden.
 * Pinned and dismissed task IDs are persisted to localStorage; reactions are applied optimistically.
 */
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { MermaidBlock } from './MermaidBlock';
import { api, displayName } from '../../api/client';
import type { Message, DirectMessage, MessageAttachment } from '../../api/client';
import { useProduct } from '../../context/ProductContext';
import { usePermission } from '../../context/PermissionContext';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useChat } from '../../context/ChatContext';
import type { Task } from '../../types';
import TaskDetailPanel from './TaskDetailPanel';
import MessageBubble, { formatTime } from './MessageBubble';
import EmojiPicker from './EmojiPicker';
import { useMessageEdit } from '../../hooks/useMessageEdit';
import { useChatMessages } from '../../hooks/useChatMessages';
import { useChatPeople } from '../../hooks/useChatPeople';
import { useChatGroups } from '../../hooks/useChatGroups';
import { useChatProjects } from '../../hooks/useChatProjects';
import PdfPreview from './PdfPreview';
import Modal from './Modal';

interface Props {
  initialTask?: { id: string; name: string };
  /** Scrolls to and briefly highlights this specific message once its thread has loaded - set
   * when opening chat from a notification about one particular message (e.g. a reaction). Applies
   * to the task thread when `initialTask` is also set, otherwise the general project channel. */
  scrollToMessageId?: string;
  onClose: () => void;
  isAdminChat?: boolean;
}

type Tab = 'messages' | 'tasks' | 'search' | 'files' | 'people' | 'groups' | 'projects';

const EDIT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

const PINS_KEY = (productId: string) => `planly_pinned_chats_${productId}`;
const DISMISSED_KEY = (productId: string) => `planly_dismissed_chats_${productId}`;

function loadPins(productId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(PINS_KEY(productId)) ?? '[]');
  } catch {
    return [];
  }
}
function savePins(productId: string, ids: string[]) {
  localStorage.setItem(PINS_KEY(productId), JSON.stringify(ids));
}
function loadDismissed(productId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY(productId)) ?? '[]');
  } catch {
    return [];
  }
}
function saveDismissed(productId: string, ids: string[]) {
  localStorage.setItem(DISMISSED_KEY(productId), JSON.stringify(ids));
}

export default function ChatPanel({ initialTask, scrollToMessageId, onClose, isAdminChat = false }: Props) {
  const { activeProduct, tasks } = useProduct();
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const { adminMode } = useChat();
  const { canWrite } = usePermission();
  // Matches the backend's requireTabWrite OR-semantics for task mutations (kanban or backlog write access).
  // Only relevant when a task is actually opened here, which only happens outside admin chat.
  const taskReadOnly = !(canWrite('backlog') || canWrite('kanban'));

  // ── Extracted hooks ──
  const { allMessages, setAllMessages, loadOlder, hasMoreOlder, loadingOlder } = useChatMessages({
    isAdminChat,
    productId: activeProduct?.id,
  });
  const {
    conversations,
    setConversations,
    activeConvId,
    setActiveConvId,
    activeConvOther,
    setActiveConvOther,
    dmMessages,
    setDmMessages,
    dmLoading,
    allUsers,
    loadPeople,
    loadDmMessages,
    openDm: openDmBase,
    totalDmUnread,
  } = useChatPeople({ isAdminChat, productId: activeProduct?.id });
  const {
    groupConversations,
    activeGroupId,
    setActiveGroupId,
    groupMessages,
    setGroupMessages,
    groupLoading,
    loadGroups,
    loadGroupMessages,
    openGroup: openGroupBase,
    createGroup,
    renameGroup,
    addParticipants: addGroupParticipants,
    removeParticipant: removeGroupParticipant,
    totalGroupUnread,
  } = useChatGroups({ isAdminChat, productId: activeProduct?.id });
  const {
    adminProjects,
    activeProjectId,
    setActiveProjectId,
    projectMessages,
    setProjectMessages,
    loadAdminProjects,
    loadProjectMessages,
  } = useChatProjects();

  // Message + tab state
  const [tab, setTab] = useState<Tab>('messages');
  const [selectedTask, setSelectedTask] = useState<{ id: string; name: string } | null>(null);
  const [openedTask, setOpenedTask] = useState<Task | null>(null);
  const [openingTask, setOpeningTask] = useState(false);

  // Unread @mention counts, broken down by task thread - powers the Project tab's aggregate
  // badge (`general`), the Tasks tab's aggregate badge (sum of `byTask`), and each individual
  // task-thread row's own badge. Not applicable to admin chat (mentions are a per-project
  // feature tied to a productId, which admin chat doesn't have).
  const [unreadByTask, setUnreadByTask] = useState<{ general: number; byTask: Record<string, number> }>({
    general: 0,
    byTask: {},
  });
  const refreshUnreadByTask = useCallback(async () => {
    if (isAdminChat || !activeProduct?.id) return;
    try {
      const data = await api.notifications.unreadByTask(activeProduct.id);
      setUnreadByTask(data);
    } catch {}
  }, [isAdminChat, activeProduct?.id]);
  useEffect(() => {
    refreshUnreadByTask();
    const interval = setInterval(refreshUnreadByTask, 30_000);
    return () => clearInterval(interval);
  }, [refreshUnreadByTask]);
  const tasksUnread = useMemo(
    () => Object.values(unreadByTask.byTask).reduce((sum, n) => sum + n, 0),
    [unreadByTask],
  );

  // Mark mentions read as the user actually visits the general channel or a specific task thread -
  // granular, unlike the navbar Chat button which used to blanket-clear everything on open.
  useEffect(() => {
    if (isAdminChat || !activeProduct?.id) return;
    let taskId: string | null;
    if (tab === 'tasks' && selectedTask) taskId = selectedTask.id;
    else if (tab === 'messages') taskId = null;
    else return;
    api.notifications
      .markAllRead({ types: ['mention'], taskId })
      .then(() => {
        setUnreadByTask((prev) => {
          if (taskId === null) return prev.general === 0 ? prev : { ...prev, general: 0 };
          if (!(taskId in prev.byTask)) return prev;
          const next = { ...prev.byTask };
          delete next[taskId];
          return { ...prev, byTask: next };
        });
      })
      .catch(() => {});
  }, [tab, selectedTask, isAdminChat, activeProduct?.id]);

  // Panel layout state: size + position persisted to localStorage; refs shadow state for pointer closures
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  // Swipe-down-to-dismiss while expanded (the layout mobile is always forced into below 768px) -
  // the header's ✕ is a reach on a phone, so dragging down from the header closes the panel
  // instead. Harmless on desktop's manually-toggled fullscreen too, since touch events simply
  // never fire from mouse interaction there.
  const [expandedDragY, setExpandedDragY] = useState(0);
  const [expandedDragging, setExpandedDragging] = useState(false);
  const expandedDragStartYRef = useRef<number | null>(null);
  const [isSidebar, setIsSidebar] = useState(() => {
    try {
      return localStorage.getItem('planly-chat-sidebar') === 'true';
    } catch {
      return false;
    }
  });
  const [panelWidth, setPanelWidth] = useState(() => {
    try {
      return parseInt(localStorage.getItem('planly-chat-width') ?? '380');
    } catch {
      return 380;
    }
  });
  const [panelHeight, setPanelHeight] = useState(() => {
    try {
      return parseInt(localStorage.getItem('planly-chat-height') ?? '560');
    } catch {
      return 560;
    }
  });
  const [chatPos, setChatPos] = useState<{ x: number; y: number }>(() => {
    try {
      const s = localStorage.getItem('planly-chat-pos');
      if (s) return JSON.parse(s);
    } catch {}
    const w = parseInt(localStorage.getItem('planly-chat-width') ?? '380');
    return { x: Math.max(8, window.innerWidth - w - 16), y: 64 };
  });
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  // Which message's reply/edit/delete overlay is showing - tap-to-reveal on touch devices, since
  // the old opacity-0 group-hover approach never showed at all without a real :hover state.
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [showComposePicker, setShowComposePicker] = useState(false);
  const [showMarkdownHelp, setShowMarkdownHelp] = useState(false);
  // Mobile-only overflow menu for Emoji/Markdown/Preview - keeps the compose bar down to just
  // Attach + textarea + Send on a phone, closer to Messenger's minimal bar.
  const [showMoreTools, setShowMoreTools] = useState(false);
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
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  // @ mention state
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionCursorStart, setMentionCursorStart] = useState<number>(0);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  type TeamMemberEntry = {
    id: string;
    username: string;
    realName?: string | null;
    avatarEmoji?: string | null;
    isAdmin?: boolean;
    role?: string;
  };
  const [teamMembers, setTeamMembers] = useState<TeamMemberEntry[]>([]);

  // Pin/dismiss state for Tasks tab
  const [pinnedTaskIds, setPinnedTaskIds] = useState<string[]>([]);
  const [dismissedTaskIds, setDismissedTaskIds] = useState<string[]>([]);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');

  const [scrollToMsgId, setScrollToMsgId] = useState<string | null>(null);

  // Reply state — shared across tabs
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    content: string;
    attachments: MessageAttachment[];
    author: { username: string; realName: string | null; avatarEmoji: string | null };
  } | null>(null);

  const [dmUserSearch, setDmUserSearch] = useState('');

  // Groups tab state
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newGroupSelected, setNewGroupSelected] = useState<Set<string>>(new Set());
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupSearch, setNewGroupSearch] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [showManageGroupModal, setShowManageGroupModal] = useState(false);
  const [manageGroupName, setManageGroupName] = useState('');
  const [addPeopleSearch, setAddPeopleSearch] = useState('');
  const [addPeopleSelected, setAddPeopleSelected] = useState<Set<string>>(new Set());
  const [groupBusy, setGroupBusy] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // The scrollable message-list container - tracked so the auto-scroll-to-bottom effect below can
  // check whether the user is actually near the bottom (rather than yanking their view down every
  // time a poll tick delivers someone else's message while they're scrolled up reading history),
  // and so "Load earlier messages" can restore the scroll position after prepending older history.
  const messageListRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  function onMessageListScroll() {
    const el = messageListRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }
  async function handleLoadOlder() {
    const el = messageListRef.current;
    if (!el) return;
    const prevScrollHeight = el.scrollHeight;
    const prevScrollTop = el.scrollTop;
    await loadOlder();
    requestAnimationFrame(() => {
      if (!messageListRef.current) return;
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight - prevScrollHeight + prevScrollTop;
    });
  }

  const productId = activeProduct?.id;
  const sendTaskId = tab === 'tasks' && selectedTask ? selectedTask.id : undefined;
  const { editingId, editDraft, setEditDraft, startEdit, cancelEdit, saveEdit } = useMessageEdit({
    isAdminChat,
    productId,
    setAllMessages,
  });

  // On small screens always use fullscreen mode; also re-check on resize. `isMobile` is tracked
  // separately from `isExpanded` because the latter can also be true on desktop (manual fullscreen
  // toggle) - the compose bar needs a real breakpoint signal to render only one textarea (mobile's
  // compact single-row one, or desktop's toolbar+textarea), never both, so `textRef` always points
  // at whichever one is actually visible.
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    function syncMobile() {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setIsExpanded(true);
    }
    syncMobile();
    window.addEventListener('resize', syncMobile);
    return () => window.removeEventListener('resize', syncMobile);
  }, []);

  // Mobile's single-line compose textarea grows with the message (up to the same 100px cap it
  // already had) instead of staying a fixed one-line height. "Multiline" (which switches the
  // +/textarea/Send row from centered to bottom-anchored) is judged against THIS device's own
  // actual empty-textarea height, captured once, rather than a hardcoded pixel guess - line-height
  // and padding render slightly differently across browsers/fonts, and a static threshold could
  // misfire and leave the row bottom-anchored (looking off-center) even for a single line.
  const [composeMultiline, setComposeMultiline] = useState(false);
  const singleLineHeightRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!isMobile) return;
    const ta = textRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const next = Math.min(ta.scrollHeight, 100);
    ta.style.height = `${next}px`;
    if (!draft) singleLineHeightRef.current = next;
    const baseline = singleLineHeightRef.current ?? next;
    setComposeMultiline(next > baseline + 4);
  }, [draft, isMobile]);

  // When opened from a task's chat button, jump directly to that task's thread
  useEffect(() => {
    if (initialTask) {
      setTab('tasks');
      setSelectedTask({ id: initialTask.id, name: initialTask.name });
    }
  }, [initialTask?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opened from a notification about one specific message (e.g. a reaction) - land on the right
  // thread and queue it up to scroll to. When initialTask is also set, the effect above already
  // handles switching to that task's thread; otherwise the target is the general project channel.
  useEffect(() => {
    if (!scrollToMessageId) return;
    if (!initialTask) setTab('messages');
    setScrollToMsgId(scrollToMessageId);
  }, [scrollToMessageId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!scrollToMsgId) return;
    const id = scrollToMsgId;
    let attempt = 0;
    // Retries with backoff instead of one fixed delay - a same-thread "jump to reply" only needs a
    // beat for the DOM to settle, but landing here fresh from a notification (new thread, history
    // still being fetched) can take noticeably longer for the target message to actually render.
    const maxAttempts = 10;
    let timer: ReturnType<typeof setTimeout>;
    function tryScroll() {
      const el = document.getElementById(`chat-msg-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'background 0.3s';
        el.style.background = 'var(--brand-subtle)';
        setTimeout(() => {
          el.style.background = '';
        }, 2000);
        setScrollToMsgId(null);
        return;
      }
      attempt += 1;
      if (attempt >= maxAttempts) {
        setScrollToMsgId(null);
        return;
      }
      timer = setTimeout(tryScroll, 150 * attempt);
    }
    timer = setTimeout(tryScroll, 120);
    return () => clearTimeout(timer);
  }, [scrollToMsgId]);

  // Load team members for @ mentions (not applicable in admin chat)
  useEffect(() => {
    if (isAdminChat) return;
    const teamId = activeProduct?.teamId;
    if (!teamId) return;
    api.teams
      .get(teamId)
      .then((team) => setTeamMembers(team.members.map((m) => ({ ...m.user, role: m.role }))))
      .catch(() => {});
  }, [isAdminChat, activeProduct?.teamId]);

  // Load pins + dismissed from localStorage
  useEffect(() => {
    if (!productId) return;
    setPinnedTaskIds(loadPins(productId));
    setDismissedTaskIds(loadDismissed(productId));
    setShowAllTasks(false);
  }, [productId]);

  const togglePin = useCallback(
    (taskId: string) => {
      if (!productId) return;
      setPinnedTaskIds((prev) => {
        const next = prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId];
        savePins(productId, next);
        return next;
      });
    },
    [productId],
  );

  const dismissTask = useCallback(
    (taskId: string) => {
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
    },
    [productId],
  );

  // When People tab is active, poll conversations; when a DM thread is open, poll its messages
  useEffect(() => {
    if (tab !== 'people') return;
    loadPeople();
    if (activeConvId) loadDmMessages(activeConvId);
    const interval = setInterval(() => {
      loadPeople();
      if (activeConvId) loadDmMessages(activeConvId);
    }, 5000);
    return () => clearInterval(interval);
  }, [tab, activeConvId, loadPeople, loadDmMessages]);

  // When Groups tab is active, poll group conversations; when a group thread is open, poll its messages
  useEffect(() => {
    if (tab !== 'groups') return;
    loadGroups();
    if (activeGroupId) loadGroupMessages(activeGroupId);
    const interval = setInterval(() => {
      loadGroups();
      if (activeGroupId) loadGroupMessages(activeGroupId);
    }, 5000);
    return () => clearInterval(interval);
  }, [tab, activeGroupId, loadGroups, loadGroupMessages]);

  // When Projects tab is active, load projects; poll project chat when one is open
  useEffect(() => {
    if (tab !== 'projects') return;
    loadAdminProjects();
    if (activeProjectId) loadProjectMessages(activeProjectId);
    const interval = setInterval(() => {
      if (activeProjectId) loadProjectMessages(activeProjectId);
    }, 5000);
    return () => clearInterval(interval);
  }, [tab, activeProjectId, loadAdminProjects, loadProjectMessages]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxUrl(null);
    }
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
      // Default: only pinned tasks and ones with an existing chat thread - being owned by or
      // mentioning you isn't enough to earn a spot here on its own (a bulk task assignment would
      // otherwise flood this list and bury the one task you're actually mid-conversation on);
      // search above still finds any task by name regardless of this filter.
      if (pinnedTaskIds.includes(t.id)) return true;
      if (dismissedTaskIds.includes(t.id)) return false;
      return taskMessageCounts.has(t.id);
    });
  }, [tasks, taskSearch, showAllTasks, pinnedTaskIds, dismissedTaskIds, taskMessageCounts]);

  // Pinned tasks shown first in list
  const sortedFilteredTasks = useMemo(() => {
    const pinned = filteredTasks.filter((t) => pinnedTaskIds.includes(t.id));
    const rest = filteredTasks.filter((t) => !pinnedTaskIds.includes(t.id));
    // Sort rest by last message date, then by task creation
    const withMsg = rest
      .filter((t) => taskMessageCounts.has(t.id))
      .sort(
        (a, b) =>
          new Date(taskMessageCounts.get(b.id)!.last.createdAt).getTime() -
          new Date(taskMessageCounts.get(a.id)!.last.createdAt).getTime(),
      );
    const withoutMsg = rest.filter((t) => !taskMessageCounts.has(t.id));
    return [...pinned, ...withMsg, ...withoutMsg];
  }, [filteredTasks, pinnedTaskIds, taskMessageCounts]);

  const showingMessages = tab === 'messages' || (tab === 'tasks' && selectedTask != null);
  // Whether a specific conversation is open (a DM thread, a group thread, or a task thread) - each
  // of these already has its own compact "← Back" sub-header, so the outer panel header and tab
  // bar are pure redundant chrome stacked above it on a phone; hidden there, kept on desktop where
  // there's room for both and the tab bar stays useful as persistent navigation.
  const inSubThread =
    (tab === 'people' && !!activeConvId) ||
    (tab === 'groups' && !!activeGroupId) ||
    (tab === 'tasks' && !!selectedTask) ||
    (tab === 'projects' && !!activeProjectId);
  useEffect(() => {
    // Only auto-scroll when the user was already near the bottom - otherwise a poll tick
    // delivering someone else's message (or loading older history) would yank a user who's
    // scrolled up reading back down. Right after sending your own message you're virtually
    // always near the bottom already, so this still auto-scrolls for that case with no extra flag.
    if (showingMessages && isNearBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages.length, showingMessages]);

  const filteredMessages = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return [];
    return displayMessages.filter(
      (m) =>
        (m.content ?? '').toLowerCase().includes(q) ||
        m.author.username.toLowerCase().includes(q) ||
        (m.task?.name ?? '').toLowerCase().includes(q),
    );
  }, [displayMessages, search]);

  const allAttachments = useMemo(() => {
    const result: { att: Message['attachments'][number]; msg: Message }[] = [];
    for (const msg of displayMessages) {
      for (const att of msg.attachments) result.push({ att, msg });
    }
    return result;
  }, [displayMessages]);

  // Filtered mention candidates. "@all" is a standard-chat-style shortcut (like Slack's @channel)
  // that notifies every project team member - it's a synthetic entry alongside real members, not
  // a real TeamMemberEntry, matching the same shape so the dropdown below needs no special-casing.
  const mentionCandidates = useMemo(() => {
    if (mentionSearch === null) return [];
    const q = mentionSearch.toLowerCase();
    const members = teamMembers
      .filter(
        (m) =>
          m.id !== user?.id &&
          (m.username.toLowerCase().startsWith(q) || m.realName?.trim().toLowerCase().startsWith(q)),
      )
      .slice(0, 6);
    const allEntry: TeamMemberEntry = { id: '__all__', username: 'all', realName: 'Everyone', avatarEmoji: '📢' };
    // Only offered in project chat, where the backend actually fans out notifications for it -
    // admin chat has no team roster and no backend support for this shortcut.
    return !isAdminChat && 'all'.startsWith(q) ? [allEntry, ...members] : members;
  }, [mentionSearch, teamMembers, user?.id, isAdminChat]);

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
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionHighlight((h) => Math.min(h + 1, mentionCandidates.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionHighlight((h) => Math.max(h - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionCandidates[mentionHighlight]!.username);
        return;
      }
      if (e.key === 'Escape') {
        setMentionSearch(null);
        return;
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
  }

  // Compute the role badge to attach to a new message based on current mode and context
  function computePostedAsRole(): string | null {
    if (isAdminChat || adminMode) {
      if (user?.isFoundingAdmin) return 'Server Owner';
      if (user?.isAdmin) return 'Server Admin';
    }
    if (activeProduct?.ownerId === user?.id) return 'Project Owner';
    const member = teamMembers.find((m) => m.id === user?.id);
    if (member?.role === 'co_owner') return 'Project Co-Owner';
    return null;
  }

  async function send() {
    if (!draft.trim() && attachments.length === 0) return;

    // Route to DM when a conversation is open in the People tab
    if (tab === 'people' && activeConvId) {
      if (!draft.trim()) return;
      setSending(true);
      try {
        const msg = await api.conversations.send(activeConvId, draft.trim(), replyingTo?.id);
        setDmMessages((prev) => [...prev, msg]);
        setDraft('');
        setAttachments([]);
        setPreview(false);
        setReplyingTo(null);
        await api.conversations.markRead(activeConvId).catch(() => {});
      } catch (err) {
        alert((err as Error).message ?? 'Failed to send message');
      } finally {
        setSending(false);
        setTimeout(() => textRef.current?.focus(), 0);
      }
      return;
    }

    // Route to a group thread when one is open in the Groups tab
    if (tab === 'groups' && activeGroupId) {
      if (!draft.trim()) return;
      setSending(true);
      try {
        const msg = await api.conversations.send(activeGroupId, draft.trim(), replyingTo?.id);
        setGroupMessages((prev) => [...prev, msg]);
        setDraft('');
        setAttachments([]);
        setPreview(false);
        setReplyingTo(null);
        await api.conversations.markRead(activeGroupId).catch(() => {});
      } catch (err) {
        alert((err as Error).message ?? 'Failed to send message');
      } finally {
        setSending(false);
        setTimeout(() => textRef.current?.focus(), 0);
      }
      return;
    }

    // Route to project chat when admin is viewing a project in the Projects tab
    if (tab === 'projects' && activeProjectId) {
      if (!draft.trim()) return;
      setSending(true);
      try {
        const msg = await api.admin.postProjectMessage(activeProjectId, draft.trim(), computePostedAsRole());
        setProjectMessages((prev) => [...prev, msg]);
        setDraft('');
        setAttachments([]);
        setPreview(false);
      } catch (err) {
        alert((err as Error).message ?? 'Failed to send message');
      } finally {
        setSending(false);
        setTimeout(() => textRef.current?.focus(), 0);
      }
      return;
    }

    if (!isAdminChat && !productId) return;
    setSending(true);
    try {
      const postedAsRole = computePostedAsRole();
      const msg = isAdminChat
        ? await api.adminChat.create({ content: draft.trim(), replyToId: replyingTo?.id, attachments, postedAsRole })
        : await api.messages.create(productId!, {
            content: draft.trim(),
            taskId: sendTaskId,
            replyToId: replyingTo?.id,
            attachments,
            postedAsRole,
          });
      setAllMessages((prev) => [...prev, msg]);
      setDraft('');
      setAttachments([]);
      setPreview(false);
      setMentionSearch(null);
      setReplyingTo(null);
    } catch (err) {
      alert((err as Error).message ?? 'Failed to send message');
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
    } catch (err) {
      alert((err as Error).message ?? 'Upload failed');
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
    } catch (err) {
      alert((err as Error).message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function deleteMsg(id: string) {
    if (tab === 'people' || tab === 'groups' || tab === 'projects') return;
    if (!(await confirm('Delete this message?'))) return;
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
    const sx = chatPosRef.current.x,
      sy = chatPosRef.current.y;
    const sw = panelWidthRef.current,
      sh = panelHeightRef.current;
    const startX = e.clientX,
      startY = e.clientY;
    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX,
        dy = ev.clientY - startY;
      let newW = sw,
        newH = sh,
        newX = sx,
        newY = sy;
      if (dir.includes('e')) newW = Math.max(300, Math.min(1200, sw + dx));
      if (dir.includes('w')) {
        newW = Math.max(300, Math.min(1200, sw - dx));
        if (!isSidebarRef.current) newX = sx + sw - newW;
      }
      if (dir.includes('s')) newH = Math.max(200, Math.min(window.innerHeight - 40, sh + dy));
      if (dir.includes('n')) {
        newH = Math.max(200, Math.min(window.innerHeight - 40, sh - dy));
        newY = sy + sh - newH;
      }
      newX = Math.max(0, Math.min(window.innerWidth - newW, newX));
      newY = Math.max(0, newY);
      setPanelWidth(newW);
      panelWidthRef.current = newW;
      setPanelHeight(newH);
      panelHeightRef.current = newH;
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
      const x = Math.max(
        0,
        Math.min(
          window.innerWidth - panelWidthRef.current,
          headerDragRef.current.px + (ev.clientX - headerDragRef.current.startX),
        ),
      );
      const y = Math.max(
        0,
        Math.min(window.innerHeight - 56, headerDragRef.current.py + (ev.clientY - headerDragRef.current.startY)),
      );
      // Undock from sidebar if dragged away from right edge
      if (isSidebarRef.current && x + panelWidthRef.current < window.innerWidth - 40) {
        setIsSidebar(false);
        isSidebarRef.current = false;
        try {
          localStorage.setItem('planly-chat-sidebar', 'false');
        } catch {}
      }
      setChatPos({ x, y });
    }
    function onUp() {
      // Snap to sidebar if released near right edge
      const pos = chatPosRef.current;
      if (!isSidebarRef.current && pos.x + panelWidthRef.current >= window.innerWidth - 40) {
        setIsSidebar(true);
        isSidebarRef.current = true;
        try {
          localStorage.setItem('planly-chat-sidebar', 'true');
        } catch {}
      }
      try {
        localStorage.setItem('planly-chat-pos', JSON.stringify(chatPosRef.current));
      } catch {}
      headerDragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  async function toggleReaction(messageId: string, emoji: string) {
    if (tab === 'people' || tab === 'groups' || tab === 'projects') return;
    if (!isAdminChat && !productId) return;
    const userId = user?.id ?? '';
    setAllMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const mine = m.reactions.find((r) => r.emoji === emoji && r.userId === userId);
        return {
          ...m,
          reactions: mine
            ? m.reactions.filter((r) => !(r.emoji === emoji && r.userId === userId))
            : [...m.reactions, { emoji, userId, messageId }],
        };
      }),
    );
    try {
      const { reactions } = isAdminChat
        ? await api.adminChat.toggleReaction(messageId, emoji)
        : await api.messages.toggleReaction(productId!, messageId, emoji);
      setAllMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    } catch {
      /* revert handled by next poll */
    }
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
    if (!(await confirm('Delete this file? It will no longer be accessible from chat messages.'))) return;
    const filename = url.split('/').pop() ?? '';
    setDeletingFile(url);
    try {
      await api.deleteUpload(filename);
      // Remove from messages in local state so Files tab updates immediately
      setAllMessages((prev) =>
        prev.map((m) => ({
          ...m,
          attachments: m.attachments.filter((a) => a.url !== url),
        })),
      );
    } catch {
      /* file may already be gone */
    } finally {
      setDeletingFile(null);
    }
  }

  // Adapt a DirectMessage to the Message shape so messageList() can render it with full markdown/image support
  function adaptDm(dm: DirectMessage): Message {
    return {
      id: dm.id,
      content: dm.content,
      createdAt: dm.createdAt,
      editedAt: dm.editedAt,
      author: dm.author,
      authorId: dm.author.id,
      productId: null,
      taskId: null,
      task: null,
      attachments: [],
      reactions: [],
      replyToId: dm.replyToId,
      replyTo: dm.replyTo ? { ...dm.replyTo, attachments: [] } : null,
      postedAsRole: null,
    };
  }

  function openDm(
    userId: string,
    other?: { id: string; username: string; realName: string | null; avatarEmoji: string | null } | null,
  ) {
    return openDmBase(userId, other, () => {
      setDraft('');
      setAttachments([]);
    });
  }

  function openGroup(id: string) {
    return openGroupBase(id, () => {
      setDraft('');
      setAttachments([]);
    });
  }

  // Display name for a group: its custom name, or a comma-joined list of participant names
  function groupTitle(conv: { name: string | null; participants: { username: string; realName?: string | null }[] }) {
    if (conv.name) return conv.name;
    if (conv.participants.length === 0) return 'Group';
    return conv.participants.map((p) => p.realName || p.username).join(', ');
  }

  // Shared roster for group-picking (New group + Add people): all users in admin scope, every
  // other project team member otherwise. Unlike the DM "People" tab's roster, this deliberately
  // does NOT exclude admin-flagged users - a project's own team members should all be selectable
  // for a project group chat regardless of their platform-wide admin status.
  function groupRoster(): { id: string; username: string; realName?: string | null; avatarEmoji?: string | null }[] {
    return isAdminChat ? allUsers.filter((u) => u.id !== user?.id) : teamMembers.filter((m) => m.id !== user?.id);
  }

  const tabBtn = (t: Tab, label: string, badge?: number) => (
    <button
      onClick={() => {
        setTab(t);
        if (t !== 'tasks') setSelectedTask(null);
        if (t !== 'search') setSearch('');
      }}
      className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex-shrink-0 relative"
      style={{
        background: tab === t ? 'var(--brand-subtle)' : 'transparent',
        color: tab === t ? 'var(--brand)' : 'var(--text-3)',
      }}
    >
      {label}
      {!!badge && badge > 0 && tab !== t && (
        <span
          className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white text-[9px] font-bold"
          style={{ background: '#ef4444', minWidth: 14, height: 14, padding: '0 2px' }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );

  // Rendered markdown preview of the current draft - shared by mobile and desktop's compose areas.
  function markdownPreviewPane() {
    return (
      <div
        className="min-h-[80px] max-h-40 overflow-y-auto px-3 py-2 rounded-lg mb-2 text-sm"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
          components={{
            pre: ({ children }: any) => <>{children}</>,
            code: ({ className, children, ...props }: any) => {
              if (className?.includes('language-mermaid')) return <MermaidBlock code={String(children).trimEnd()} />;
              if (String(children).includes('\n'))
                return (
                  <pre>
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                );
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
          }}
        >
          {draft || '*Nothing to preview*'}
        </ReactMarkdown>
      </div>
    );
  }

  function composeArea() {
    return (
      // pb-4 (16px) used to be exactly double pt-2 (8px) here - fine on desktop where more rows
      // (attachments, mention footer) usually sit between the last input row and this padding,
      // but on mobile the compact row is always the very last thing in flow, so that doubled
      // bottom padding read as a lopsided gap instead of the row sitting centered in its box.
      <div
        className={`px-4 flex-shrink-0 relative ${isMobile ? 'pt-2 pb-2' : 'pt-2 pb-4'}`}
        style={{ borderTop: '1px solid var(--border)' }}
      >
        {/* Reply-to preview bar */}
        {replyingTo && (
          <div
            className="flex items-center gap-2 mb-2 px-2.5 py-1.5 rounded-lg"
            style={{ background: 'var(--surface-2)', borderLeft: '2px solid var(--brand)' }}
          >
            {(() => {
              const img = replyingTo.attachments.find((a) => a.type?.startsWith('image/'));
              return img ? (
                <img
                  src={img.thumbnailUrl ?? img.url}
                  alt=""
                  className="w-8 h-8 rounded object-cover flex-shrink-0"
                />
              ) : null;
            })()}
            <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--brand)' }}>
              ↩ {displayName(replyingTo.author)}
            </span>
            <span className="text-[10px] flex-1 truncate" style={{ color: 'var(--text-3)' }}>
              {replyingTo.content ? replyingTo.content.slice(0, 80) : replyingTo.attachments.length > 0 ? '📷 Photo' : ''}
            </span>
            <button
              onClick={() => setReplyingTo(null)}
              className="flex-shrink-0 text-[10px] px-1 rounded"
              style={{ color: 'var(--text-3)' }}
            >
              ✕
            </button>
          </div>
        )}
        {/* @ mention dropdown */}
        {mentionSearch !== null && mentionCandidates.length > 0 && (
          <div
            className="absolute left-4 right-4 bottom-full mb-1 rounded-xl overflow-hidden shadow-xl z-10"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                Mention a member
              </span>
            </div>
            {mentionCandidates.map((m, i) => (
              <button
                key={m.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(m.username);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                style={{ background: i === mentionHighlight ? 'var(--surface-2)' : 'transparent' }}
                onMouseEnter={() => setMentionHighlight(i)}
              >
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                >
                  {m.avatarEmoji ?? '👤'}
                </span>
                <div className="flex flex-col min-w-0">
                  {m.realName?.trim() && (
                    <span className="text-sm font-medium leading-tight" style={{ color: 'var(--text)' }}>
                      {m.realName.trim()}
                    </span>
                  )}
                  <span
                    className={m.realName?.trim() ? 'text-xs leading-tight' : 'text-sm font-medium'}
                    style={{ color: m.realName?.trim() ? 'var(--text-3)' : 'var(--text)' }}
                  >
                    @{m.username}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Compose emoji picker - fixed near the bottom of the viewport on mobile so it never
            renders off-screen; anchored precisely above the toolbar at md: and up. */}
        {showComposePicker && (
          <div
            data-emoji-picker
            className="fixed left-2 right-2 bottom-4 md:absolute md:left-4 md:right-auto md:bottom-full md:mb-1 z-50 p-2 rounded-xl shadow-xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            {/* onMouseDown+preventDefault here (not inside EmojiPicker itself) keeps the textarea
                focused through the tap, same fix as the Send button - otherwise the click steals
                focus first, closing the mobile keyboard, then the refocus below reopens it. */}
            <div onMouseDown={(ev) => ev.preventDefault()}>
              <EmojiPicker
                onChange={(e) => {
                  const ta = textRef.current;
                  if (ta) {
                    const start = ta.selectionStart ?? draft.length;
                    const end = ta.selectionEnd ?? draft.length;
                    const next = draft.slice(0, start) + e + draft.slice(end);
                    setDraft(next);
                    requestAnimationFrame(() => {
                      ta.focus();
                      ta.setSelectionRange(start + e.length, start + e.length);
                    });
                  } else {
                    setDraft((d) => d + e);
                  }
                  setShowComposePicker(false);
                }}
              />
            </div>
          </div>
        )}

        {/* Markdown cheatsheet */}
        {showMarkdownHelp && (
          <div
            className="absolute left-0 right-0 bottom-full mb-1 z-50 rounded-xl shadow-xl overflow-y-auto"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: 380 }}
          >
            <div
              className="flex items-center justify-between px-4 py-2.5 sticky top-0"
              style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
            >
              <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                Markdown reference
              </span>
              <button onClick={() => setShowMarkdownHelp(false)} className="text-xs" style={{ color: 'var(--text-3)' }}>
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4">
              {(
                [
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
                ] as [string, string][]
              ).map(([label, syntax]) => (
                <div key={label}>
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: 'var(--text-3)' }}
                  >
                    {label}
                  </p>
                  <pre
                    className="text-xs rounded-lg px-3 py-2 select-all cursor-pointer"
                    style={{
                      background: 'var(--surface-2)',
                      color: 'var(--text-2)',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.6,
                    }}
                    onClick={() => {
                      const ta = textRef.current;
                      if (!ta) return;
                      const ins = '\n' + syntax;
                      const pos = ta.selectionEnd ?? draft.length;
                      setDraft((d) => d.slice(0, pos) + ins + d.slice(pos));
                      setShowMarkdownHelp(false);
                      requestAnimationFrame(() => {
                        ta.focus();
                        ta.setSelectionRange(pos + ins.length, pos + ins.length);
                      });
                    }}
                    title="Click to insert"
                  >
                    {syntax}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {isMobile ? (
          <>
            {/* Attachment previews sit above the composer row on mobile (no separate row to put
                them below, since the compact bar's Send is already inline). */}
            {attachments.length > 0 && (
              <div className="pb-2 flex gap-2 flex-wrap">
                {attachments.map((att, i) => (
                  <div key={i} className="relative">
                    {att.type?.startsWith('image/') ? (
                      <img
                        src={att.thumbnailUrl ?? att.url}
                        alt={att.name}
                        className="h-14 w-14 rounded-lg object-cover"
                      />
                    ) : (
                      <div
                        className="h-14 px-3 flex items-center text-xs rounded-lg"
                        style={{
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-2)',
                        }}
                      >
                        📎 {att.name}
                      </div>
                    )}
                    <button
                      onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px]"
                      style={{ background: '#ef4444', color: 'white' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Mobile compact bar - Messenger-style: one "+" tray replaces the whole desktop
                toolbar row, a single-line textarea grows in place, Send sits at the end. Hidden
                while previewing markdown (falls through to the shared preview pane below instead,
                with its own Send row, same as desktop). */}
            {!preview && (
              // No trailing margin here - this row is always the last thing in flow in this branch
              // (the container's own pb-4 already provides bottom spacing), so an mb-2 here was
              // pure extra dead space stacking on top of that padding - "two boxes" worth of bottom
              // spacing for what should have been one, pushing the row up off-center inside the
              // bordered compose box.
              <div className={`flex ${composeMultiline ? 'items-end' : 'items-center'} gap-2`}>
                <div className="relative flex-shrink-0">
                  <button
                    onClick={() => setShowMoreTools((v) => !v)}
                    aria-label="More options"
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xl transition-colors flex-shrink-0"
                    style={{
                      background: showMoreTools ? 'var(--brand-subtle)' : 'var(--surface-2)',
                      color: showMoreTools ? 'var(--brand)' : 'var(--text-2)',
                    }}
                  >
                    {showMoreTools ? '✕' : '+'}
                  </button>
                  {showMoreTools && (
                    <>
                      <button
                        className="fixed inset-0 z-10"
                        style={{ background: 'transparent' }}
                        aria-label="Close more options"
                        onClick={() => setShowMoreTools(false)}
                      />
                      <div
                        className="absolute left-0 bottom-full mb-2 z-20 rounded-2xl shadow-xl p-3 grid grid-cols-4 gap-3 animate-dropdown-in"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 236 }}
                      >
                        {[
                          {
                            icon: uploading ? '⏳' : '📎',
                            label: 'Attach',
                            active: false,
                            onClick: () => {
                              fileRef.current?.click();
                              setShowMoreTools(false);
                            },
                          },
                          {
                            icon: '😊',
                            label: 'Emoji',
                            active: showComposePicker,
                            onClick: () => {
                              setShowComposePicker((v) => !v);
                              setShowMoreTools(false);
                            },
                            dataAttr: true,
                          },
                          {
                            icon: 'ℹ',
                            label: 'Markdown',
                            active: showMarkdownHelp,
                            onClick: () => {
                              setShowMarkdownHelp((v) => !v);
                              setShowMoreTools(false);
                            },
                          },
                          {
                            icon: '👁',
                            label: preview ? 'Edit' : 'Preview',
                            active: preview as boolean,
                            onClick: () => {
                              setPreview((v) => !v);
                              setShowMoreTools(false);
                            },
                          },
                        ].map((item) => (
                          <button
                            key={item.label}
                            {...(item.dataAttr ? { 'data-emoji-picker': true } : {})}
                            onClick={item.onClick}
                            className="flex flex-col items-center gap-1"
                          >
                            <span
                              className="w-11 h-11 rounded-full flex items-center justify-center text-lg transition-colors"
                              style={{
                                background: item.active ? 'var(--brand-subtle)' : 'var(--surface-2)',
                                color: item.active ? 'var(--brand)' : 'var(--text-2)',
                              }}
                            >
                              {item.icon}
                            </span>
                            <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                              {item.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <textarea
                  ref={textRef}
                  rows={1}
                  value={draft}
                  onChange={handleDraftChange}
                  onPaste={handlePaste}
                  onKeyDown={handleDraftKeyDown}
                  placeholder="Message…"
                  className="input text-sm flex-1 resize-none rounded-full py-2"
                  style={{ maxHeight: 100, overflowY: 'auto', boxSizing: 'border-box', lineHeight: '20px' }}
                />
                <button
                  onClick={send}
                  onMouseDown={(e) => e.preventDefault()}
                  disabled={sending || (!draft.trim() && attachments.length === 0)}
                  aria-label="Send"
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-opacity disabled:opacity-40"
                  style={{ background: 'var(--brand)', color: 'white' }}
                >
                  {sending ? '…' : '➤'}
                </button>
              </div>
            )}

            {preview && (
              <>
                {markdownPreviewPane()}
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setPreview(false)}
                    className="text-xs px-3 py-1.5 rounded-lg"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
                  >
                    ✎ Edit
                  </button>
                  <button
                    onClick={send}
                    onMouseDown={(e) => e.preventDefault()}
                    disabled={sending || (!draft.trim() && attachments.length === 0)}
                    className="btn-primary text-xs px-4"
                  >
                    {sending ? '…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            {/* Desktop toolbar - order: 😊 Emoji | 📎 Attach | ℹ Markdown | Preview, all inline */}
            <div className="flex items-center gap-1 mb-2">
              <button
                data-emoji-picker
                onClick={() => setShowComposePicker((v) => !v)}
                className="text-xs px-2 py-0.5 rounded-md transition-colors"
                style={{
                  background: showComposePicker ? 'var(--brand-subtle)' : 'var(--surface-2)',
                  color: showComposePicker ? 'var(--brand)' : 'var(--text-2)',
                }}
                title="Insert emoji"
              >
                😊
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="text-xs px-2 py-0.5 rounded-md transition-colors"
                style={{ background: 'var(--surface-2)', color: uploading ? 'var(--text-3)' : 'var(--text-2)' }}
              >
                {uploading ? '⏳' : '📎'} Attach
              </button>
              <button
                onClick={() => setShowMarkdownHelp((v) => !v)}
                className="text-xs px-2 py-0.5 rounded-md transition-colors font-medium"
                style={{
                  background: showMarkdownHelp ? 'var(--brand-subtle)' : 'var(--surface-2)',
                  color: showMarkdownHelp ? 'var(--brand)' : 'var(--text-3)',
                }}
                title="Markdown reference"
              >
                ℹ Markdown
              </button>
              <button
                onClick={() => setPreview((v) => !v)}
                className="text-xs px-2 py-0.5 rounded-md transition-colors"
                style={{
                  background: preview ? 'var(--brand-subtle)' : 'var(--surface-2)',
                  color: preview ? 'var(--brand)' : 'var(--text-3)',
                }}
              >
                {preview ? 'Edit' : 'Preview'}
              </button>
            </div>

            {preview ? (
              markdownPreviewPane()
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
                    {att.type?.startsWith('image/') ? (
                      <img
                        src={att.thumbnailUrl ?? att.url}
                        alt={att.name}
                        className="h-14 w-14 rounded-lg object-cover"
                      />
                    ) : (
                      <div
                        className="h-14 px-3 flex items-center text-xs rounded-lg"
                        style={{
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-2)',
                        }}
                      >
                        📎 {att.name}
                      </div>
                    )}
                    <button
                      onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover/att:opacity-100"
                      style={{ background: '#ef4444', color: 'white' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                @ mention · ```python · ⌘↵ send
              </span>
              <button
                onClick={send}
                onMouseDown={(e) => e.preventDefault()}
                disabled={sending || (!draft.trim() && attachments.length === 0)}
                className="btn-primary text-xs px-4"
              >
                {sending ? '…' : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // Renders a list of messages; role badges come directly from msg.postedAsRole stored at send time.
  // `showLoadOlder` only applies to project-chat's own message list (the one backed by
  // useChatMessages' pagination) - DM/group/admin-project views don't support it.
  function messageList(msgs: Message[], showLoadOlder = false) {
    return (
      <div ref={messageListRef} onScroll={onMessageListScroll} className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
        {showLoadOlder && msgs.length > 0 && (
          <div className="flex justify-center pb-1">
            {hasMoreOlder ? (
              <button
                onClick={handleLoadOlder}
                disabled={loadingOlder}
                className="text-xs px-3 py-1 rounded-lg"
                style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
              >
                {loadingOlder ? 'Loading…' : 'Load earlier messages'}
              </button>
            ) : (
              <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                Beginning of conversation
              </span>
            )}
          </div>
        )}
        {msgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-3)' }}>
            <span className="text-3xl opacity-30">💬</span>
            <p className="text-sm">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          msgs.map((msg) => {
            const isOwn = msg.authorId === user?.id;
            const isEditing = editingId === msg.id;
            const authorRole = msg.postedAsRole ?? null;
            return (
              <div key={msg.id} id={`chat-msg-${msg.id}`}>
                {isEditing ? (
                  <div className="space-y-1.5">
                    <textarea
                      autoFocus
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit(msg.id);
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      className="input text-sm w-full resize-none"
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(msg.id)}
                        className="text-xs px-2 py-1 rounded-lg font-medium"
                        style={{ background: 'var(--brand)', color: 'white' }}
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="text-xs px-2 py-1 rounded-lg"
                        style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div data-emoji-picker>
                    <MessageBubble
                      msg={msg}
                      isOwn={isOwn}
                      onEdit={() => {
                        startEdit(msg.id, msg.content);
                        setActiveMessageId(null);
                      }}
                      onDelete={() => {
                        deleteMsg(msg.id);
                        setActiveMessageId(null);
                      }}
                      onImageClick={setLightboxUrl}
                      canEdit={Date.now() - new Date(msg.createdAt).getTime() < EDIT_TIMEOUT_MS}
                      onReact={(emoji) => toggleReaction(msg.id, emoji)}
                      currentUserId={user?.id ?? null}
                      reactionPickerOpen={reactionPickerFor === msg.id}
                      onToggleReactionPicker={() => setReactionPickerFor((v) => (v === msg.id ? null : msg.id))}
                      actionsOpen={activeMessageId === msg.id}
                      onToggleActions={() => setActiveMessageId((v) => (v === msg.id ? null : msg.id))}
                      onReply={() => {
                        setReplyingTo(msg);
                        setActiveMessageId(null);
                        setTimeout(() => textRef.current?.focus(), 0);
                      }}
                      onScrollToReply={(id) => setScrollToMsgId(id)}
                      authorRole={authorRole}
                      isMobile={isMobile}
                      scrollContainerRef={messageListRef}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    );
  }

  const taskThreadCount = taskMessageCounts.size;

  const ExpandIcon = () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="8,1 12,1 12,5" />
      <polyline points="5,12 1,12 1,8" />
      <line x1="12" y1="1" x2="7" y2="6" />
      <line x1="1" y1="12" x2="6" y2="7" />
    </svg>
  );
  const CollapseIcon = () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="12,8 12,12 8,12" />
      <polyline points="1,5 1,1 5,1" />
      <line x1="7" y1="7" x2="12" y2="12" />
      <line x1="1" y1="1" x2="6" y2="6" />
    </svg>
  );

  const headerBtn = (title: string, onClick: () => void, icon: React.ReactNode) => (
    <button
      title={title}
      onClick={onClick}
      className="w-7 h-7 flex items-center justify-center rounded-lg text-sm flex-shrink-0"
      style={{ color: 'var(--text-3)' }}
      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
    >
      {icon}
    </button>
  );

  const EXPANDED_DRAG_CLOSE_THRESHOLD = 100;
  const EXPANDED_DRAG_MAX = 300;

  function handleExpandedTouchStart(e: React.TouchEvent) {
    if (!isExpanded) return;
    const t = e.touches[0];
    if (!t) return;
    expandedDragStartYRef.current = t.clientY;
    setExpandedDragging(true);
  }

  function handleExpandedTouchMove(e: React.TouchEvent) {
    if (expandedDragStartYRef.current === null) return;
    const t = e.touches[0];
    if (!t) return;
    const dy = t.clientY - expandedDragStartYRef.current;
    setExpandedDragY(Math.max(0, Math.min(dy, EXPANDED_DRAG_MAX)));
  }

  function handleExpandedTouchEnd() {
    if (expandedDragStartYRef.current === null) return;
    expandedDragStartYRef.current = null;
    setExpandedDragging(false);
    if (expandedDragY >= EXPANDED_DRAG_CLOSE_THRESHOLD) onClose();
    setExpandedDragY(0);
  }

  return (
    <div
      className="fixed flex flex-col"
      style={
        isExpanded
          ? {
              inset: 0,
              zIndex: 100,
              background: 'var(--surface)',
              transform: expandedDragY ? `translateY(${expandedDragY}px)` : undefined,
              transition: expandedDragging ? 'none' : 'transform 200ms ease',
            }
          : isSidebar
            ? {
                top: 0,
                right: 0,
                bottom: 0,
                zIndex: 60,
                width: panelWidth,
                background: 'var(--surface)',
                borderLeft: '1px solid var(--border)',
                boxShadow: '-12px 0 40px rgba(0,0,0,0.22)',
                overflow: 'hidden',
              }
            : {
                left: chatPos.x,
                top: chatPos.y,
                zIndex: 60,
                width: panelWidth,
                height: isMinimized ? 'auto' : panelHeight,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
                overflow: 'hidden',
              }
      }
    >
      {/* Resize handles */}
      {!isExpanded && !isSidebar && (
        <>
          <div
            onPointerDown={(e) => startResizeDir(e, 'n')}
            style={{ position: 'absolute', top: 0, left: 12, right: 12, height: 5, cursor: 'n-resize', zIndex: 10 }}
          />
          <div
            onPointerDown={(e) => startResizeDir(e, 's')}
            style={{ position: 'absolute', bottom: 0, left: 12, right: 12, height: 5, cursor: 's-resize', zIndex: 10 }}
          />
          <div
            onPointerDown={(e) => startResizeDir(e, 'e')}
            style={{ position: 'absolute', top: 12, right: 0, bottom: 12, width: 5, cursor: 'e-resize', zIndex: 10 }}
          />
          <div
            onPointerDown={(e) => startResizeDir(e, 'w')}
            style={{ position: 'absolute', top: 12, left: 0, bottom: 12, width: 5, cursor: 'w-resize', zIndex: 10 }}
          />
          <div
            onPointerDown={(e) => startResizeDir(e, 'nw')}
            style={{ position: 'absolute', top: 0, left: 0, width: 12, height: 12, cursor: 'nw-resize', zIndex: 11 }}
          />
          <div
            onPointerDown={(e) => startResizeDir(e, 'ne')}
            style={{ position: 'absolute', top: 0, right: 0, width: 12, height: 12, cursor: 'ne-resize', zIndex: 11 }}
          />
          <div
            onPointerDown={(e) => startResizeDir(e, 'sw')}
            style={{ position: 'absolute', bottom: 0, left: 0, width: 12, height: 12, cursor: 'sw-resize', zIndex: 11 }}
          />
          <div
            onPointerDown={(e) => startResizeDir(e, 'se')}
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 12,
              height: 12,
              cursor: 'se-resize',
              zIndex: 11,
            }}
          />
        </>
      )}
      {/* Sidebar mode: left-edge resize only */}
      {!isExpanded && isSidebar && (
        <div
          onPointerDown={(e) => startResizeDir(e, 'w')}
          style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 5, cursor: 'w-resize', zIndex: 10 }}
        />
      )}
      {/* Header - drag handle (desktop float-panel drag) or swipe-down-to-dismiss (expanded); also
          doubles as the grab handle itself (no separate bar needed - one less stacked row). Hidden
          on mobile while a sub-thread's own compact header is showing (see inSubThread above). */}
      <div
        onTouchStart={isExpanded ? handleExpandedTouchStart : undefined}
        onTouchMove={isExpanded ? handleExpandedTouchMove : undefined}
        onTouchEnd={isExpanded ? handleExpandedTouchEnd : undefined}
        onTouchCancel={isExpanded ? handleExpandedTouchEnd : undefined}
        className="hidden md:flex items-center justify-between px-4 py-3 flex-shrink-0 select-none"
        style={{
          borderBottom: isMinimized ? 'none' : '1px solid var(--border)',
          cursor: isExpanded ? 'default' : 'grab',
          touchAction: isExpanded ? 'none' : undefined,
        }}
        onPointerDown={isExpanded ? undefined : onHeaderDrag}
      >
        <div className="min-w-0">
          {!isAdminChat && tab === 'tasks' && selectedTask && !isMinimized ? (
            <div className="flex items-center gap-1 min-w-0">
              <button
                onClick={() => {
                  setTab('messages');
                  setSelectedTask(null);
                }}
                className="text-xs font-medium flex-shrink-0 transition-colors"
                style={{ color: 'var(--brand)' }}
              >
                💬 Project chat
              </button>
              <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>
                ›
              </span>
              <span className="text-xs truncate" style={{ color: 'var(--text-2)' }}>
                {selectedTask.name}
              </span>
            </div>
          ) : (
            // Hidden on mobile - the tab bar directly below already shows which section is
            // selected, so this title would just repeat it; desktop keeps it as window chrome.
            <h2 className="hidden md:block text-sm font-semibold" style={{ color: 'var(--text)' }}>
              💬 {isAdminChat ? 'Admin chat' : 'Project chat'}
            </h2>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isExpanded &&
            headerBtn(isMinimized ? 'Restore' : 'Minimise', () => setIsMinimized((v) => !v), isMinimized ? '▲' : '−')}
          {window.innerWidth >= 768 &&
            headerBtn(
              isExpanded ? 'Exit fullscreen' : 'Fullscreen',
              () => {
                setIsExpanded((v) => !v);
                setIsMinimized(false);
              },
              isExpanded ? <CollapseIcon /> : <ExpandIcon />,
            )}
          {headerBtn('Close', onClose, '✕')}
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Tabs - the top-most row on mobile (the panel header above is desktop-only there),
              so it also carries the swipe-down-to-dismiss handlers and a mobile-only close button.
              Hidden entirely on mobile while a sub-thread's own header is showing instead. */}
          <div
            onTouchStart={isExpanded ? handleExpandedTouchStart : undefined}
            onTouchMove={isExpanded ? handleExpandedTouchMove : undefined}
            onTouchEnd={isExpanded ? handleExpandedTouchEnd : undefined}
            onTouchCancel={isExpanded ? handleExpandedTouchEnd : undefined}
            className={`${inSubThread ? 'hidden md:flex' : 'flex'} items-center gap-1 px-3 py-2 flex-shrink-0`}
            style={{ borderBottom: '1px solid var(--border)', touchAction: isExpanded ? 'none' : undefined }}
          >
            <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {tabBtn('messages', isAdminChat ? 'Admin' : 'Project', unreadByTask.general)}
              {isAdminChat && (
              <button
                onClick={() => {
                  setTab('projects');
                  setSelectedTask(null);
                  setSearch('');
                  setActiveProjectId(null);
                  setProjectMessages([]);
                  loadAdminProjects();
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex-shrink-0"
                style={{
                  background: tab === 'projects' ? 'var(--brand-subtle)' : 'transparent',
                  color: tab === 'projects' ? 'var(--brand)' : 'var(--text-3)',
                }}
              >
                Projects
              </button>
            )}
            <button
              onClick={() => {
                setTab('people');
                setSelectedTask(null);
                setSearch('');
                if (!activeConvId) loadPeople();
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex-shrink-0 relative"
              style={{
                background: tab === 'people' ? 'var(--brand-subtle)' : 'transparent',
                color: tab === 'people' ? 'var(--brand)' : 'var(--text-3)',
              }}
            >
              Users
              {totalDmUnread > 0 && tab !== 'people' && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white text-[9px] font-bold"
                  style={{ background: '#ef4444', minWidth: 14, height: 14, padding: '0 2px' }}
                >
                  {totalDmUnread > 99 ? '99+' : totalDmUnread}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setTab('groups');
                setSelectedTask(null);
                setSearch('');
                if (!activeGroupId) loadGroups();
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex-shrink-0 relative"
              style={{
                background: tab === 'groups' ? 'var(--brand-subtle)' : 'transparent',
                color: tab === 'groups' ? 'var(--brand)' : 'var(--text-3)',
              }}
            >
              Groups
              {totalGroupUnread > 0 && tab !== 'groups' && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white text-[9px] font-bold"
                  style={{ background: '#ef4444', minWidth: 14, height: 14, padding: '0 2px' }}
                >
                  {totalGroupUnread > 99 ? '99+' : totalGroupUnread}
                </span>
              )}
            </button>
              {!isAdminChat && tabBtn('tasks', `Tasks${taskThreadCount > 0 ? ` (${taskThreadCount})` : ''}`, tasksUnread)}
              {tabBtn('files', 'Files')}
              {tabBtn('search', 'Search')}
            </div>
            <button
              onClick={onClose}
              aria-label="Close chat"
              className="md:hidden flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm ml-1"
              style={{ color: 'var(--text-3)' }}
            >
              ✕
            </button>
          </div>

          {/* ── Messages tab ── */}
          {tab === 'messages' && (
            <>
              {messageList(displayMessages, true)}
              {composeArea()}
            </>
          )}

          {/* ── Tasks tab ── */}
          {tab === 'tasks' &&
            !isAdminChat &&
            (selectedTask ? (
              <>
                <div
                  onTouchStart={isExpanded ? handleExpandedTouchStart : undefined}
                  onTouchMove={isExpanded ? handleExpandedTouchMove : undefined}
                  onTouchEnd={isExpanded ? handleExpandedTouchEnd : undefined}
                  onTouchCancel={isExpanded ? handleExpandedTouchEnd : undefined}
                  className="flex items-center gap-2 px-2 py-2 flex-shrink-0"
                  style={{ borderBottom: '1px solid var(--border)', touchAction: isExpanded ? 'none' : undefined }}
                >
                  <button
                    onClick={() => {
                      setSelectedTask(null);
                      setDraft('');
                      setAttachments([]);
                    }}
                    aria-label="Back"
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-lg"
                    style={{ color: 'var(--text-2)' }}
                  >
                    ‹
                  </button>
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0"
                    style={{ background: 'var(--surface-2)' }}
                    aria-hidden="true"
                  >
                    📋
                  </span>
                  <p className="text-sm font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--text)' }}>
                    {selectedTask.name}
                  </p>
                  <button
                    onClick={() => togglePin(selectedTask.id)}
                    className="text-sm px-2 py-1 rounded-lg transition-colors flex-shrink-0"
                    title={pinnedTaskIds.includes(selectedTask.id) ? 'Unpin' : 'Pin'}
                    style={{
                      background: pinnedTaskIds.includes(selectedTask.id) ? 'var(--brand-subtle)' : 'var(--surface-2)',
                      color: pinnedTaskIds.includes(selectedTask.id) ? 'var(--brand)' : 'var(--text-3)',
                    }}
                  >
                    📌
                  </button>
                  <button
                    onClick={async () => {
                      if (!selectedTask || !activeProduct) return;
                      setOpeningTask(true);
                      try {
                        const full = await api.tasks.get(activeProduct.id, selectedTask.id);
                        setOpenedTask(full);
                      } catch {
                        /* ignore */
                      } finally {
                        setOpeningTask(false);
                      }
                    }}
                    disabled={openingTask}
                    className="text-xs px-2 py-1 rounded-lg transition-colors flex-shrink-0"
                    style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}
                  >
                    {openingTask ? '…' : 'Open task →'}
                  </button>
                </div>
                {messageList(displayMessages, true)}
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
                        {showAllTasks ? 'All tasks' : 'Pinned & active chats'}
                      </span>
                      <button
                        onClick={() => setShowAllTasks((v) => !v)}
                        className="text-[10px] px-2 py-0.5 rounded-md transition-colors"
                        style={{
                          background: showAllTasks ? 'var(--brand-subtle)' : 'var(--surface-2)',
                          color: showAllTasks ? 'var(--brand)' : 'var(--text-3)',
                        }}
                      >
                        {showAllTasks ? 'Show mine' : 'Show all'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto">
                  {sortedFilteredTasks.length === 0 ? (
                    <div
                      className="flex flex-col items-center justify-center h-32 gap-2"
                      style={{ color: 'var(--text-3)' }}
                    >
                      <span className="text-3xl opacity-30">📋</span>
                      <p className="text-sm">
                        {taskSearch ? 'No tasks match.' : 'No pinned tasks or active chats yet - search to find one.'}
                      </p>
                      {!taskSearch && !showAllTasks && (
                        <button
                          onClick={() => setShowAllTasks(true)}
                          className="text-xs px-3 py-1 rounded-lg"
                          style={{ background: 'var(--surface-2)', color: 'var(--brand)' }}
                        >
                          Show all tasks
                        </button>
                      )}
                    </div>
                  ) : (
                    <div>
                      {sortedFilteredTasks.map((task) => {
                        const msgInfo = taskMessageCounts.get(task.id);
                        const isPinned = pinnedTaskIds.includes(task.id);
                        const isMentioned = mentionedTaskIds.has(task.id);
                        const unread = unreadByTask.byTask[task.id] ?? 0;
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
                              <div
                                className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-base"
                                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                              >
                                {task.color ? (
                                  <span style={{ background: task.color }} className="w-3.5 h-3.5 rounded-full block" />
                                ) : (
                                  '📋'
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between gap-2 mb-0.5">
                                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                                    {isPinned && <span className="mr-1 text-xs">📌</span>}
                                    {isMentioned && !isPinned && <span className="mr-1 text-xs">@</span>}
                                    {task.name}
                                  </p>
                                  {msgInfo && (
                                    <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-3)' }}>
                                      {formatTime(msgInfo.last.createdAt)}
                                    </span>
                                  )}
                                </div>
                                {msgInfo ? (
                                  <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>
                                    {msgInfo.last.author.avatarEmoji ?? '👤'} {displayName(msgInfo.last.author)}:{' '}
                                    {msgInfo.last.content || '📎 attachment'}
                                  </p>
                                ) : (
                                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                                    No messages yet
                                  </p>
                                )}
                              </div>
                              {unread > 0 && (
                                <span
                                  className="flex-shrink-0 self-center flex items-center justify-center rounded-full text-white text-[9px] font-bold"
                                  style={{ background: '#ef4444', minWidth: 14, height: 14, padding: '0 2px' }}
                                >
                                  {unread > 99 ? '99+' : unread}
                                </span>
                              )}
                              {msgInfo && (
                                <span
                                  className="flex-shrink-0 self-center text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                                  style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}
                                >
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
                                style={{
                                  background: isPinned ? 'var(--brand-subtle)' : 'var(--surface)',
                                  color: isPinned ? 'var(--brand)' : 'var(--text-3)',
                                  border: '1px solid var(--border)',
                                }}
                              >
                                📌
                              </button>
                              {!isPinned && (
                                <button
                                  onClick={() => dismissTask(task.id)}
                                  className="w-6 h-6 rounded flex items-center justify-center text-xs"
                                  title="Remove from feed"
                                  style={{
                                    background: 'var(--surface)',
                                    color: 'var(--text-3)',
                                    border: '1px solid var(--border)',
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}

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
                  <div
                    className="flex flex-col items-center justify-center h-32 gap-2"
                    style={{ color: 'var(--text-3)' }}
                  >
                    <span className="text-3xl opacity-30">🔍</span>
                    <p className="text-sm">Type to search messages</p>
                  </div>
                ) : filteredMessages.length === 0 ? (
                  <div
                    className="flex flex-col items-center justify-center h-32 gap-2"
                    style={{ color: 'var(--text-3)' }}
                  >
                    <p className="text-sm">No messages match "{search}"</p>
                  </div>
                ) : (
                  filteredMessages.map((msg) => (
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
                        <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                          {displayName(msg.author)}
                        </span>
                        {msg.task && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full ml-1"
                            style={{
                              background: 'var(--surface)',
                              color: 'var(--text-3)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            📋 {msg.task.name}
                          </span>
                        )}
                        <span className="text-[10px] ml-auto flex-shrink-0" style={{ color: 'var(--text-3)' }}>
                          {formatTime(msg.createdAt)}
                        </span>
                      </div>
                      <p
                        className="text-xs"
                        style={{
                          color: 'var(--text-2)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          textAlign: 'left',
                        }}
                      >
                        {msg.content}
                      </p>
                      {msg.attachments.length > 0 && (
                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>
                          📎 {msg.attachments.length} attachment{msg.attachments.length > 1 ? 's' : ''}
                        </p>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── Files tab ── */}
          {tab === 'files' && (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {allAttachments.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center h-32 gap-2"
                  style={{ color: 'var(--text-3)' }}
                >
                  <span className="text-3xl opacity-30">📎</span>
                  <p className="text-sm">No attachments yet.</p>
                </div>
              ) : (
                (() => {
                  const images = allAttachments.filter((x) => x.att.type?.startsWith('image/'));
                  const docs = allAttachments.filter((x) => !x.att.type?.startsWith('image/'));
                  return (
                    <div className="space-y-4">
                      {images.length > 0 && (
                        <div>
                          <p
                            className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                            style={{ color: 'var(--text-3)' }}
                          >
                            Images ({images.length})
                          </p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {images.map(({ att, msg }, i) => (
                              <div key={i} className="relative group/img aspect-square">
                                <img
                                  src={att.thumbnailUrl ?? att.url}
                                  alt={att.name}
                                  loading="lazy"
                                  decoding="async"
                                  className="w-full h-full object-cover rounded-lg cursor-zoom-in"
                                  onClick={() => setLightboxUrl(att.url)}
                                />
                                <div
                                  className="absolute inset-0 rounded-lg flex flex-col items-center justify-center gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-none"
                                  style={{ background: 'rgba(0,0,0,0.55)' }}
                                >
                                  <span
                                    className="text-white text-[10px] px-2 py-1 rounded font-medium"
                                    style={{ background: 'rgba(255,255,255,0.15)' }}
                                  >
                                    Click to view
                                  </span>
                                  <a
                                    href={att.url}
                                    download={att.name}
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-white text-[10px] px-2 py-1 rounded font-medium pointer-events-auto"
                                    style={{ background: 'rgba(255,255,255,0.15)' }}
                                  >
                                    Download
                                  </a>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteFile(att.url);
                                  }}
                                  disabled={deletingFile === att.url}
                                  title="Delete file"
                                  className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-auto"
                                  style={{ background: 'rgba(239,68,68,0.9)', color: 'white' }}
                                >
                                  <svg
                                    width="8"
                                    height="8"
                                    viewBox="0 0 10 10"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                  >
                                    <line x1="2" y1="2" x2="8" y2="8" />
                                    <line x1="8" y1="2" x2="2" y2="8" />
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
                          <p
                            className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                            style={{ color: 'var(--text-3)' }}
                          >
                            Documents ({docs.length})
                          </p>
                          <div className="space-y-1.5">
                            {docs.map(({ att, msg }, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg group/doc"
                                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                              >
                                <span className="text-lg flex-shrink-0">
                                  {att.type === 'application/pdf' ? '📄' : '📁'}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                                    {att.name}
                                  </p>
                                  <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                                    {displayName(msg.author)} · {formatTime(msg.createdAt)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 opacity-0 group-hover/doc:opacity-100 transition-opacity flex-shrink-0">
                                  {att.type === 'application/pdf' && <PdfPreview url={att.url} name={att.name} />}
                                  <a
                                    href={att.url}
                                    download={att.name}
                                    className="text-xs px-2 py-1 rounded-lg"
                                    style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}
                                  >
                                    ↓
                                  </a>
                                  <button
                                    onClick={() => handleDeleteFile(att.url)}
                                    disabled={deletingFile === att.url}
                                    title="Delete file"
                                    className="text-xs px-2 py-1 rounded-lg transition-colors"
                                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.2)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                                  >
                                    {deletingFile === att.url ? '…' : '🗑'}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* ── People/Users tab ── */}
          {tab === 'people' &&
            (activeConvId ? (
              // DM thread — same visual identity as project/admin chat
              <>
                <div
                  onTouchStart={isExpanded ? handleExpandedTouchStart : undefined}
                  onTouchMove={isExpanded ? handleExpandedTouchMove : undefined}
                  onTouchEnd={isExpanded ? handleExpandedTouchEnd : undefined}
                  onTouchCancel={isExpanded ? handleExpandedTouchEnd : undefined}
                  className="flex items-center gap-2 px-2 py-2 flex-shrink-0"
                  style={{ borderBottom: '1px solid var(--border)', touchAction: isExpanded ? 'none' : undefined }}
                >
                  <button
                    onClick={() => {
                      setActiveConvId(null);
                      setActiveConvOther(null);
                      setDmMessages([]);
                      setDraft('');
                      setAttachments([]);
                      loadPeople();
                    }}
                    aria-label="Back"
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-lg"
                    style={{ color: 'var(--text-2)' }}
                  >
                    ‹
                  </button>
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0"
                    style={{ background: 'var(--surface-2)' }}
                    aria-hidden="true"
                  >
                    {activeConvOther?.avatarEmoji ?? '👤'}
                  </span>
                  <p className="text-sm font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--text)' }}>
                    {(() => {
                      if (activeConvOther) return displayName(activeConvOther);
                      const conv = conversations.find((c) => c.id === activeConvId);
                      return conv?.other ? displayName(conv.other) : 'Direct message';
                    })()}
                  </p>
                  {isAdminChat &&
                    activeConvId &&
                    (() => {
                      const conv = conversations.find((c) => c.id === activeConvId);
                      const closed = conv?.closed ?? false;
                      return (
                        <button
                          onClick={async () => {
                            try {
                              const r = await api.conversations.close(activeConvId);
                              setConversations((prev) =>
                                prev.map((c) => (c.id === activeConvId ? { ...c, closed: r.closed } : c)),
                              );
                            } catch {}
                          }}
                          className="text-xs px-2 py-1 rounded-lg transition-colors flex-shrink-0"
                          style={{
                            background: closed ? 'var(--surface-2)' : '#fee2e2',
                            color: closed ? 'var(--text-2)' : '#dc2626',
                          }}
                          title={closed ? 'Reopen this chat' : 'Close this chat so the user cannot send more messages'}
                        >
                          {closed ? 'Reopen' : 'Close chat'}
                        </button>
                      );
                    })()}
                </div>
                {dmLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div
                      className="w-5 h-5 border-2 rounded-full animate-spin"
                      style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }}
                    />
                  </div>
                ) : (
                  messageList(dmMessages.map(adaptDm))
                )}
                {(() => {
                  const conv = conversations.find((c) => c.id === activeConvId);
                  if (conv?.closed && !isAdminChat) {
                    return (
                      <div
                        className="px-4 py-3 text-xs text-center flex-shrink-0"
                        style={{ borderTop: '1px solid var(--border)', color: 'var(--text-3)' }}
                      >
                        This conversation has been closed. Contact us to reopen.
                      </div>
                    );
                  }
                  return composeArea();
                })()}
              </>
            ) : (
              // People list — search input + recent conversations
              <div className="flex flex-col flex-1 min-h-0">
                <div className="px-4 pt-3 pb-2 flex-shrink-0 space-y-2">
                  <input
                    type="text"
                    value={dmUserSearch}
                    onChange={(e) => setDmUserSearch(e.target.value)}
                    placeholder={isAdminChat ? 'Search users…' : 'Search members…'}
                    className="input text-sm w-full"
                  />
                </div>
                <div className="flex-1 overflow-y-auto">
                  {/* Recent conversations — always shown when no search query */}
                  {!dmUserSearch && conversations.length > 0 && (
                    <div className="px-4 pb-2">
                      <p
                        className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                        style={{ color: 'var(--text-3)' }}
                      >
                        Recent
                      </p>
                      <div className="space-y-0.5">
                        {conversations.map((conv) => (
                          <button
                            key={conv.id}
                            onClick={() => openDm(conv.other?.id ?? '', conv.other)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
                            style={{ background: 'transparent' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold relative"
                              style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}
                            >
                              {conv.other?.avatarEmoji ?? conv.other?.username[0]?.toUpperCase() ?? '?'}
                              {conv.unread > 0 && (
                                <span
                                  className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white text-[9px] font-bold"
                                  style={{ background: '#ef4444', minWidth: 14, height: 14, padding: '0 2px' }}
                                >
                                  {conv.unread}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                                {conv.other ? displayName(conv.other) : 'Unknown'}
                              </p>
                              {conv.lastMessage && (
                                <p className="text-[11px] truncate" style={{ color: 'var(--text-3)' }}>
                                  {conv.lastMessage.content}
                                </p>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Search results */}
                  {dmUserSearch &&
                    (() => {
                      const q = dmUserSearch.toLowerCase();
                      // DMs never exclude a project team member from being messageable, regardless
                      // of their platform-wide admin status.
                      const roster = isAdminChat
                        ? allUsers.filter((u) => u.id !== user?.id)
                        : teamMembers.filter((m) => m.id !== user?.id);
                      const filtered = roster.filter(
                        (m) =>
                          m.username.toLowerCase().includes(q) ||
                          (m as { realName?: string | null }).realName?.toLowerCase().includes(q),
                      );
                      if (filtered.length === 0)
                        return (
                          <div
                            className="flex flex-col items-center justify-center h-24 gap-1"
                            style={{ color: 'var(--text-3)' }}
                          >
                            <p className="text-sm">No users found.</p>
                          </div>
                        );
                      return (
                        <div className="px-4 pb-3 space-y-0.5">
                          {filtered.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => {
                                setDmUserSearch('');
                                openDm(m.id);
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
                              style={{ background: 'transparent' }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                            >
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold"
                                style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
                              >
                                {m.avatarEmoji ?? m.username[0]?.toUpperCase()}
                              </div>
                              <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                                {m.username}
                              </p>
                            </button>
                          ))}
                        </div>
                      );
                    })()}

                  {/* Empty state — no search and no conversations yet */}
                  {!dmUserSearch && conversations.length === 0 && (
                    <div
                      className="flex flex-col items-center justify-center h-32 gap-2"
                      style={{ color: 'var(--text-3)' }}
                    >
                      <span className="text-3xl opacity-30">💬</span>
                      <p className="text-sm">Search for someone to message.</p>
                    </div>
                  )}
                </div>
              </div>
            ))}

          {/* ── Groups tab ── */}
          {tab === 'groups' &&
            (activeGroupId ? (
              // Group thread — same visual identity as DM/project chat
              <>
                <div
                  onTouchStart={isExpanded ? handleExpandedTouchStart : undefined}
                  onTouchMove={isExpanded ? handleExpandedTouchMove : undefined}
                  onTouchEnd={isExpanded ? handleExpandedTouchEnd : undefined}
                  onTouchCancel={isExpanded ? handleExpandedTouchEnd : undefined}
                  className="flex items-center gap-2 px-2 py-2 flex-shrink-0"
                  style={{ borderBottom: '1px solid var(--border)', touchAction: isExpanded ? 'none' : undefined }}
                >
                  <button
                    onClick={() => {
                      setActiveGroupId(null);
                      setGroupMessages([]);
                      setDraft('');
                      setAttachments([]);
                      loadGroups();
                    }}
                    aria-label="Back"
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-lg"
                    style={{ color: 'var(--text-2)' }}
                  >
                    ‹
                  </button>
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0"
                    style={{ background: 'var(--surface-2)' }}
                    aria-hidden="true"
                  >
                    👥
                  </span>
                  <p className="text-sm font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--text)' }}>
                    {(() => {
                      const conv = groupConversations.find((c) => c.id === activeGroupId);
                      return conv ? groupTitle(conv) : 'Group';
                    })()}
                  </p>
                  <button
                    onClick={() => {
                      const conv = groupConversations.find((c) => c.id === activeGroupId);
                      setManageGroupName(conv?.name ?? '');
                      setAddPeopleSearch('');
                      setAddPeopleSelected(new Set());
                      setShowManageGroupModal(true);
                    }}
                    className="text-xs px-2 py-1 rounded-lg transition-colors flex-shrink-0"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
                    title="Manage group"
                  >
                    ⚙
                  </button>
                </div>
                {groupLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div
                      className="w-5 h-5 border-2 rounded-full animate-spin"
                      style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }}
                    />
                  </div>
                ) : (
                  messageList(groupMessages.map(adaptDm))
                )}
                {(() => {
                  const conv = groupConversations.find((c) => c.id === activeGroupId);
                  if (conv?.closed) {
                    return (
                      <div
                        className="px-4 py-3 text-xs text-center flex-shrink-0"
                        style={{ borderTop: '1px solid var(--border)', color: 'var(--text-3)' }}
                      >
                        This conversation has been closed.
                      </div>
                    );
                  }
                  return composeArea();
                })()}
              </>
            ) : (
              // Group list — "+ New group" button + existing groups
              <div className="flex flex-col flex-1 min-h-0">
                <div className="px-4 pt-3 pb-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      setNewGroupSelected(new Set());
                      setNewGroupName('');
                      setNewGroupSearch('');
                      setShowNewGroupModal(true);
                    }}
                    className="btn-primary text-xs w-full justify-center flex"
                  >
                    + New group
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {groupConversations.length > 0 ? (
                    <div className="px-4 pb-3 space-y-0.5">
                      {groupConversations.map((conv) => (
                        <button
                          key={conv.id}
                          onClick={() => openGroup(conv.id)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
                          style={{ background: 'transparent' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold relative"
                            style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}
                          >
                            👥
                            {conv.unread > 0 && (
                              <span
                                className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white text-[9px] font-bold"
                                style={{ background: '#ef4444', minWidth: 14, height: 14, padding: '0 2px' }}
                              >
                                {conv.unread}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                              {groupTitle(conv)}
                            </p>
                            {conv.lastMessage && (
                              <p className="text-[11px] truncate" style={{ color: 'var(--text-3)' }}>
                                {conv.lastMessage.content}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div
                      className="flex flex-col items-center justify-center h-32 gap-2"
                      style={{ color: 'var(--text-3)' }}
                    >
                      <span className="text-3xl opacity-30">👥</span>
                      <p className="text-sm">Start a group to chat with several people at once.</p>
                    </div>
                  )}
                </div>
              </div>
            ))}

          {/* ── Admin Projects tab ── */}
          {tab === 'projects' &&
            isAdminChat &&
            (activeProjectId ? (
              // Project chat view
              <>
                <div
                  onTouchStart={isExpanded ? handleExpandedTouchStart : undefined}
                  onTouchMove={isExpanded ? handleExpandedTouchMove : undefined}
                  onTouchEnd={isExpanded ? handleExpandedTouchEnd : undefined}
                  onTouchCancel={isExpanded ? handleExpandedTouchEnd : undefined}
                  className="flex items-center gap-2 px-2 py-2 flex-shrink-0"
                  style={{ borderBottom: '1px solid var(--border)', touchAction: isExpanded ? 'none' : undefined }}
                >
                  <button
                    onClick={() => {
                      setActiveProjectId(null);
                      setProjectMessages([]);
                      setDraft('');
                      setAttachments([]);
                    }}
                    aria-label="Back"
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-lg"
                    style={{ color: 'var(--text-2)' }}
                  >
                    ‹
                  </button>
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0"
                    style={{ background: 'var(--surface-2)' }}
                    aria-hidden="true"
                  >
                    {adminProjects.find((p) => p.id === activeProjectId)?.emoji ?? '📁'}
                  </span>
                  <p className="text-sm font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--text)' }}>
                    {adminProjects.find((p) => p.id === activeProjectId)?.name ?? 'Project'}
                  </p>
                </div>
                {messageList(projectMessages)}
                {composeArea()}
              </>
            ) : (
              // Projects list
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <p
                  className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--text-3)' }}
                >
                  All projects
                </p>
                {adminProjects.length === 0 ? (
                  <div
                    className="flex flex-col items-center justify-center h-32 gap-2"
                    style={{ color: 'var(--text-3)' }}
                  >
                    <span className="text-2xl opacity-30">📋</span>
                    <p className="text-sm">No projects found.</p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {adminProjects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setActiveProjectId(p.id);
                          loadProjectMessages(p.id);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
                        style={{ background: 'transparent' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span className="text-lg w-8 text-center flex-shrink-0">{p.emoji ?? '📋'}</span>
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                          {p.name}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,.svg,.pdf,.txt,.md,.csv,.json,.zip,.docx,.xlsx,.pptx,.doc,.xls"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Task detail panel opened via "Open task →" */}
          {openedTask && (
            <TaskDetailPanel
              task={openedTask}
              readOnly={taskReadOnly}
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
              >
                ✕
              </button>
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
              >
                ↓ Download
              </a>
            </div>
          )}

          {/* New group creation */}
          {showNewGroupModal && (
            <Modal
              title="New group"
              onClose={() => setShowNewGroupModal(false)}
              width="max-w-sm"
              mobileFullscreen
            >
              <div className="space-y-3">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Group name (optional)"
                  className="input text-sm w-full"
                />
                <input
                  type="text"
                  value={newGroupSearch}
                  onChange={(e) => setNewGroupSearch(e.target.value)}
                  placeholder={isAdminChat ? 'Search users…' : 'Search members…'}
                  className="input text-sm w-full"
                />
                {groupRoster().length > 0 && (
                  <button
                    onClick={() => {
                      const visible = groupRoster().filter((m) => {
                        const q = newGroupSearch.toLowerCase().trim();
                        if (!q) return true;
                        return m.username.toLowerCase().includes(q) || (m.realName ?? '').toLowerCase().includes(q);
                      });
                      const allSelected = visible.every((m) => newGroupSelected.has(m.id));
                      setNewGroupSelected(allSelected ? new Set() : new Set(visible.map((m) => m.id)));
                    }}
                    className="text-xs font-medium"
                    style={{ color: 'var(--brand)' }}
                  >
                    {groupRoster().every((m) => newGroupSelected.has(m.id)) ? 'Deselect all' : 'Select all'}
                  </button>
                )}
                <div className="max-h-64 overflow-y-auto space-y-0.5">
                  {groupRoster()
                    .filter((m) => {
                      const q = newGroupSearch.toLowerCase().trim();
                      if (!q) return true;
                      return m.username.toLowerCase().includes(q) || (m.realName ?? '').toLowerCase().includes(q);
                    })
                    .map((m) => {
                      const checked = newGroupSelected.has(m.id);
                      return (
                        <label
                          key={m.id}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors"
                          style={{ background: checked ? 'var(--brand-subtle)' : 'transparent' }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setNewGroupSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(m.id)) next.delete(m.id);
                                else next.add(m.id);
                                return next;
                              })
                            }
                            style={{ accentColor: 'var(--brand)' }}
                          />
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold"
                            style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
                          >
                            {m.avatarEmoji ?? m.username[0]?.toUpperCase()}
                          </div>
                          <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                            {m.realName || m.username}
                          </span>
                        </label>
                      );
                    })}
                  {groupRoster().length === 0 && (
                    <p className="text-xs text-center py-4" style={{ color: 'var(--text-3)' }}>
                      No one else to add.
                    </p>
                  )}
                </div>
                <div
                  className="flex items-center justify-between gap-2 pt-2"
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                    {newGroupSelected.size} selected
                  </span>
                  <button
                    disabled={newGroupSelected.size < 2 || creatingGroup}
                    onClick={async () => {
                      setCreatingGroup(true);
                      try {
                        await createGroup(Array.from(newGroupSelected), newGroupName.trim() || undefined);
                        setShowNewGroupModal(false);
                      } catch (err) {
                        alert((err as Error).message ?? 'Failed to create group');
                      } finally {
                        setCreatingGroup(false);
                      }
                    }}
                    className="btn-primary text-xs px-4"
                  >
                    {creatingGroup ? '…' : 'Create'}
                  </button>
                </div>
              </div>
            </Modal>
          )}

          {/* Manage group: rename, add/remove participants, leave */}
          {showManageGroupModal &&
            activeGroupId &&
            (() => {
              const conv = groupConversations.find((c) => c.id === activeGroupId);
              if (!conv) return null;
              return (
                <Modal
                  title="Manage group"
                  onClose={() => setShowManageGroupModal(false)}
                  width="max-w-sm"
                  mobileFullscreen
                >
                  <div className="space-y-4">
                    <div>
                      <label className="label">Group name</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={manageGroupName}
                          onChange={(e) => setManageGroupName(e.target.value)}
                          placeholder={groupTitle(conv)}
                          className="input text-sm flex-1"
                        />
                        <button
                          disabled={!manageGroupName.trim() || groupBusy}
                          onClick={async () => {
                            setGroupBusy(true);
                            try {
                              await renameGroup(activeGroupId, manageGroupName.trim());
                            } catch (err) {
                              alert((err as Error).message ?? 'Failed to rename');
                            } finally {
                              setGroupBusy(false);
                            }
                          }}
                          className="btn-secondary text-xs px-3 flex-shrink-0"
                        >
                          Save
                        </button>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-3)' }}>
                        Participants
                      </p>
                      <div className="space-y-1">
                        {conv.participants.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                            style={{ background: 'var(--surface-2)' }}
                          >
                            <span className="text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>
                              {displayName(p)}
                            </span>
                            <button
                              disabled={groupBusy}
                              onClick={async () => {
                                setGroupBusy(true);
                                try {
                                  await removeGroupParticipant(activeGroupId, p.id, user?.id ?? '');
                                } catch (err) {
                                  alert((err as Error).message ?? 'Failed to remove');
                                } finally {
                                  setGroupBusy(false);
                                }
                              }}
                              className="text-xs opacity-60 hover:opacity-100 flex-shrink-0"
                              style={{ color: '#ef4444' }}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                          Add people
                        </p>
                        {(() => {
                          const addable = groupRoster().filter((m) => !conv.participants.some((p) => p.id === m.id));
                          if (addable.length === 0) return null;
                          const allSelected = addable.every((m) => addPeopleSelected.has(m.id));
                          return (
                            <button
                              onClick={() =>
                                setAddPeopleSelected(allSelected ? new Set() : new Set(addable.map((m) => m.id)))
                              }
                              className="text-xs font-medium"
                              style={{ color: 'var(--brand)' }}
                            >
                              {allSelected ? 'Deselect all' : 'Select all'}
                            </button>
                          );
                        })()}
                      </div>
                      <input
                        type="text"
                        value={addPeopleSearch}
                        onChange={(e) => setAddPeopleSearch(e.target.value)}
                        placeholder="Search…"
                        className="input text-sm w-full mb-2"
                      />
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {groupRoster()
                          .filter((m) => !conv.participants.some((p) => p.id === m.id))
                          .filter((m) => {
                            const q = addPeopleSearch.toLowerCase().trim();
                            if (!q) return true;
                            return (
                              m.username.toLowerCase().includes(q) || (m.realName ?? '').toLowerCase().includes(q)
                            );
                          })
                          .map((m) => {
                            const checked = addPeopleSelected.has(m.id);
                            return (
                              <label
                                key={m.id}
                                className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer"
                                style={{ background: checked ? 'var(--brand-subtle)' : 'transparent' }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setAddPeopleSelected((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(m.id)) next.delete(m.id);
                                      else next.add(m.id);
                                      return next;
                                    })
                                  }
                                  style={{ accentColor: 'var(--brand)' }}
                                />
                                <span className="text-xs" style={{ color: 'var(--text)' }}>
                                  {m.realName || m.username}
                                </span>
                              </label>
                            );
                          })}
                      </div>
                      <button
                        disabled={addPeopleSelected.size === 0 || groupBusy}
                        onClick={async () => {
                          setGroupBusy(true);
                          try {
                            await addGroupParticipants(activeGroupId, Array.from(addPeopleSelected));
                            setAddPeopleSelected(new Set());
                            setAddPeopleSearch('');
                          } catch (err) {
                            alert((err as Error).message ?? 'Failed to add');
                          } finally {
                            setGroupBusy(false);
                          }
                        }}
                        className="btn-primary text-xs px-4 mt-2"
                      >
                        Add selected
                      </button>
                    </div>

                    <button
                      disabled={groupBusy}
                      onClick={async () => {
                        if (!(await confirm('Leave this group?'))) return;
                        setGroupBusy(true);
                        try {
                          await removeGroupParticipant(activeGroupId, user?.id ?? '', user?.id ?? '');
                          setShowManageGroupModal(false);
                        } catch (err) {
                          alert((err as Error).message ?? 'Failed to leave');
                        } finally {
                          setGroupBusy(false);
                        }
                      }}
                      className="btn-danger w-full justify-center flex text-sm"
                    >
                      Leave group
                    </button>
                  </div>
                </Modal>
              );
            })()}
        </>
      )}
    </div>
  );
}
