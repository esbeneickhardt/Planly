/**
 * Floating/dockable chat panel with tabs: messages, tasks (per-task threads), people (DMs), files, search.
 * Messages are polled every 5 s and paused while the browser tab is hidden.
 * Pinned and dismissed task IDs are persisted to localStorage; reactions are applied optimistically.
 */
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { api, displayName } from '../../api/client';
import type { Message, DirectMessage, MessageAttachment } from '../../api/client';
import { useProduct } from '../../context/ProductContext';
import { usePermission } from '../../context/PermissionContext';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useChat } from '../../context/ChatContext';
import type { Task } from '../../types';
import TaskDetailPanel from './TaskDetailPanel';
import { formatTime } from './MessageBubble';
import TouchDebugOverlay from './TouchDebugOverlay';
import { useMessageEdit } from '../../hooks/useMessageEdit';
import { useChatMessages } from '../../hooks/useChatMessages';
import { useChatPeople } from '../../hooks/useChatPeople';
import { useChatGroups } from '../../hooks/useChatGroups';
import { useChatProjects } from '../../hooks/useChatProjects';
import Modal from './Modal';
import ChatFilesTab from './ChatFilesTab';
import ChatMessageList from './ChatMessageList';
import ChatComposeBox, { type ChatComposeBoxProps, type ReplyingTo, type TeamMemberEntry } from './ChatComposeBox';
import ChatPeopleTab from './ChatPeopleTab';
import ChatGroupsTab, { groupTitle } from './ChatGroupsTab';
import ChatProjectsTab from './ChatProjectsTab';

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
  // Mirrors the backend's requireProductWritable rule (messages.ts/conversations.ts): false once
  // the active project is 'completed' (member) or 'archived' (anyone). Always true in admin chat,
  // since there's no activeProduct to lock there.
  const chatWritable = canWrite('messages');

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
  const [teamMembers, setTeamMembers] = useState<TeamMemberEntry[]>([]);

  // Pin/dismiss state for Tasks tab
  const [pinnedTaskIds, setPinnedTaskIds] = useState<string[]>([]);
  const [dismissedTaskIds, setDismissedTaskIds] = useState<string[]>([]);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');

  const [scrollToMsgId, setScrollToMsgId] = useState<string | null>(null);

  // Reply state — shared across tabs
  const [replyingTo, setReplyingTo] = useState<ReplyingTo | null>(null);

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

  // Keep the Users/Groups tab badges (totalDmUnread/totalGroupUnread) live even when neither tab
  // is the active one - a notification badge that only updates once you've already opened the tab
  // it's warning you about defeats its own purpose. Runs unconditionally (unlike the "active tab"
  // pollers below, which also fetch the open thread's messages), same unconditional-polling
  // pattern already used for unreadByTask above.
  useEffect(() => {
    loadPeople();
    loadGroups();
    const interval = setInterval(() => {
      loadPeople();
      loadGroups();
    }, 30_000);
    return () => clearInterval(interval);
  }, [loadPeople, loadGroups]);

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

  // Adapt a DirectMessage to the Message shape so ChatMessageList can render it with full markdown/image support.
  // Stable via useCallback (pure function of its argument, no closure deps) so the two useMemos below
  // can depend on it without recomputing every render - see their own comments for why that matters.
  const adaptDm = useCallback(
    (dm: DirectMessage): Message => ({
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
    }),
    [],
  );

  // Adapted once per actual `dmMessages`/`groupMessages` change, not on every ChatPanel render (e.g.
  // every compose-box keystroke) - `.map()` was previously called directly in the JSX below, which
  // hands ChatMessageList (and therefore each MessageBubble's `msg` prop) a brand-new array of
  // brand-new objects every render, defeating ChatMessageList's own MessageBubble React.memo
  // regardless of how stable its other props are.
  const dmMessagesAdapted = useMemo(() => dmMessages.map(adaptDm), [dmMessages, adaptDm]);
  const groupMessagesAdapted = useMemo(() => groupMessages.map(adaptDm), [groupMessages, adaptDm]);

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

  // Shared prop bundle for ChatComposeBox - every prop here is already common to every thread
  // ChatPanel can show (project/task/DM/group/admin-project), so this bundle is spread as-is at
  // every call site with no per-tab overrides.
  const composeBoxProps: ChatComposeBoxProps = {
    isMobile,
    chatWritable,
    draft,
    onDraftChange: handleDraftChange,
    onKeyDown: handleDraftKeyDown,
    onPaste: handlePaste,
    textRef,
    fileRef,
    uploading,
    sending,
    onSend: send,
    preview,
    setPreview,
    composeMultiline,
    attachments,
    setAttachments,
    replyingTo,
    setReplyingTo,
    mentionSearch,
    mentionCandidates,
    mentionHighlight,
    setMentionHighlight,
    insertMention,
    showComposePicker,
    setShowComposePicker,
    showMarkdownHelp,
    setShowMarkdownHelp,
    showMoreTools,
    setShowMoreTools,
    setDraft,
  };

  // Shared prop bundle for ChatMessageList - `messages` and `showLoadOlder` vary per call site, so
  // they're passed separately at each <ChatMessageList /> below rather than folded in here.
  const messageListProps = {
    hasMoreOlder,
    loadingOlder,
    onLoadOlder: handleLoadOlder,
    editingId,
    editDraft,
    setEditDraft,
    onSaveEdit: saveEdit,
    onCancelEdit: cancelEdit,
    currentUserId: user?.id ?? null,
    chatWritable,
    isMobile,
    reactionPickerFor,
    setReactionPickerFor,
    activeMessageId,
    setActiveMessageId,
    tab,
    productId,
    onStartEdit: startEdit,
    onDelete: deleteMsg,
    onReact: toggleReaction,
    onReply: (msg: Message) => {
      setReplyingTo(msg);
      setTimeout(() => textRef.current?.focus(), 0);
    },
    onImageClick: setLightboxUrl,
    onScrollToReply: setScrollToMsgId,
    messageListRef,
    bottomRef,
    onScroll: onMessageListScroll,
  };

  // Resets the open DM thread and reloads the conversation list - passed to ChatPeopleTab's "Back".
  function closeDmThread() {
    setActiveConvId(null);
    setActiveConvOther(null);
    setDmMessages([]);
    setDraft('');
    setAttachments([]);
    loadPeople();
  }

  // Resets the open group thread and reloads the group list - passed to ChatGroupsTab's "Back".
  function closeGroupThread() {
    setActiveGroupId(null);
    setGroupMessages([]);
    setDraft('');
    setAttachments([]);
    loadGroups();
  }

  // Resets the open admin-project thread (no reload - matches the original inline handler, which
  // didn't refetch the project list on close either) - passed to ChatProjectsTab's "Back".
  function closeProjectThread() {
    setActiveProjectId(null);
    setProjectMessages([]);
    setDraft('');
    setAttachments([]);
  }

  function openProjectThread(id: string) {
    setActiveProjectId(id);
    loadProjectMessages(id);
  }

  function openNewGroupModal() {
    setNewGroupSelected(new Set());
    setNewGroupName('');
    setNewGroupSearch('');
    setShowNewGroupModal(true);
  }

  function openManageGroupModal() {
    const conv = groupConversations.find((c) => c.id === activeGroupId);
    setManageGroupName(conv?.name ?? '');
    setAddPeopleSearch('');
    setAddPeopleSelected(new Set());
    setShowManageGroupModal(true);
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
      <TouchDebugOverlay />
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
            {/* pt-1.5 gives the unread badges (positioned -top-0.5 on each tab button, i.e.
                slightly overlapping the button's top-right corner) room to render - without it,
                this row's own overflow-x-auto forces overflow-y to 'auto' too (browsers coerce a
                'visible' cross-axis to 'auto' whenever the other axis isn't 'visible'), which was
                clipping the badges' top edge since they had zero slack above the buttons. */}
            <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto pt-1.5" style={{ scrollbarWidth: 'none' }}>
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
              <ChatMessageList messages={displayMessages} showLoadOlder {...messageListProps} />
              <ChatComposeBox {...composeBoxProps} />
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
                <ChatMessageList messages={displayMessages} showLoadOlder {...messageListProps} />
                <ChatComposeBox {...composeBoxProps} />
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
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- search field for a just-opened dedicated search tab
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
            <ChatFilesTab
              attachments={allAttachments}
              deletingFile={deletingFile}
              onDeleteFile={handleDeleteFile}
              onImageClick={setLightboxUrl}
            />
          )}

          {/* ── People/Users tab ── */}
          {tab === 'people' && (
            <ChatPeopleTab
              isAdminChat={isAdminChat}
              isExpanded={isExpanded}
              onExpandedTouchStart={handleExpandedTouchStart}
              onExpandedTouchMove={handleExpandedTouchMove}
              onExpandedTouchEnd={handleExpandedTouchEnd}
              activeConvId={activeConvId}
              activeConvOther={activeConvOther}
              conversations={conversations}
              setConversations={setConversations}
              onBack={closeDmThread}
              dmLoading={dmLoading}
              messages={dmMessagesAdapted}
              dmUserSearch={dmUserSearch}
              setDmUserSearch={setDmUserSearch}
              allUsers={allUsers}
              teamMembers={teamMembers}
              openDm={openDm}
              composeBoxProps={composeBoxProps}
              messageListProps={messageListProps}
            />
          )}

          {/* ── Groups tab ── */}
          {tab === 'groups' && (
            <ChatGroupsTab
              isExpanded={isExpanded}
              onExpandedTouchStart={handleExpandedTouchStart}
              onExpandedTouchMove={handleExpandedTouchMove}
              onExpandedTouchEnd={handleExpandedTouchEnd}
              groupConversations={groupConversations}
              activeGroupId={activeGroupId}
              onBack={closeGroupThread}
              groupLoading={groupLoading}
              messages={groupMessagesAdapted}
              openGroup={openGroup}
              onOpenManageGroup={openManageGroupModal}
              onOpenNewGroup={openNewGroupModal}
              composeBoxProps={composeBoxProps}
              messageListProps={messageListProps}
            />
          )}

          {/* ── Admin Projects tab ── */}
          {tab === 'projects' && isAdminChat && (
            <ChatProjectsTab
              isExpanded={isExpanded}
              onExpandedTouchStart={handleExpandedTouchStart}
              onExpandedTouchMove={handleExpandedTouchMove}
              onExpandedTouchEnd={handleExpandedTouchEnd}
              adminProjects={adminProjects}
              activeProjectId={activeProjectId}
              onBack={closeProjectThread}
              messages={projectMessages}
              onOpenProject={openProjectThread}
              composeBoxProps={composeBoxProps}
              messageListProps={messageListProps}
            />
          )}

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
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- mouse-only backdrop dismiss; the ✕ button below is the keyboard-accessible equivalent
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
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- stopPropagation-only guard against the backdrop's dismiss-on-click */}
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
                      <label className="label" htmlFor="chat-manage-group-name">
                        Group name
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="chat-manage-group-name"
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
