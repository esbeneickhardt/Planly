/**
 * Floating/dockable chat panel with tabs: messages, tasks (per-task threads), people (DMs), files, search.
 * Messages are polled every 5 s and paused while the browser tab is hidden.
 * Pinned and dismissed task IDs are persisted to localStorage; reactions are applied optimistically.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api, displayName } from '../../api/client';
import type { Message, DirectMessage, MinUser } from '../../api/client';
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
import { useChatPanelLayout } from '../../hooks/useChatPanelLayout';
import { useChatCompose, type Tab } from '../../hooks/useChatCompose';
import ChatFilesTab from './ChatFilesTab';
import ChatMessageList from './ChatMessageList';
import ChatComposeBox, { type ChatComposeBoxProps } from './ChatComposeBox';
import ChatPeopleTab from './ChatPeopleTab';
import ChatGroupsTab from './ChatGroupsTab';
import ChatProjectsTab from './ChatProjectsTab';
import ChatPanelHeader from './ChatPanelHeader';
import ChatGroupModals from './ChatGroupModals';
import ChatLightbox from './ChatLightbox';

interface Props {
  initialTask?: { id: string; name: string };
  /** Opens directly onto a specific DM or group thread (e.g. a search result) instead of the
   * general project channel - `other` is required for a DM (isGroup: false), unused for a group. */
  initialConversation?: {
    id: string;
    isGroup: boolean;
    other?: MinUser | null;
  };
  /** Scrolls to and briefly highlights this specific message once its thread has loaded - set
   * when opening chat from a notification about one particular message (e.g. a reaction), or from
   * a search result. Applies to whichever thread `initialTask`/`initialConversation` selects,
   * otherwise the general project channel. */
  scrollToMessageId?: string;
  onClose: () => void;
  isAdminChat?: boolean;
}

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

export default function ChatPanel({
  initialTask,
  initialConversation,
  scrollToMessageId,
  onClose,
  isAdminChat = false,
}: Props) {
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
  const [selectedTask, setSelectedTask] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [openedTask, setOpenedTask] = useState<Task | null>(null);
  const [openingTask, setOpeningTask] = useState(false);

  // Unread @mention counts, broken down by task thread - powers the Project tab's aggregate
  // badge (`general`), the Tasks tab's aggregate badge (sum of `byTask`), and each individual
  // task-thread row's own badge. Not applicable to admin chat (mentions are a per-project
  // feature tied to a productId, which admin chat doesn't have).
  const [unreadByTask, setUnreadByTask] = useState<{
    general: number;
    byTask: Record<string, number>;
  }>({
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
  const tasksUnread = useMemo(() => Object.values(unreadByTask.byTask).reduce((sum, n) => sum + n, 0), [unreadByTask]);

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

  // ── Layout hook: expand/minimize/sidebar/size/position + drag/resize handlers. The
  // ref-shadowing pattern the handlers rely on to dodge stale closures in native `window` pointer
  // listeners lives inside the hook - see its own header comment. ──
  const {
    isExpanded,
    setIsExpanded,
    isMinimized,
    setIsMinimized,
    expandedDragY,
    expandedDragging,
    isSidebar,
    panelWidth,
    panelHeight,
    chatPos,
    isMobile,
    startResizeDir,
    onHeaderDrag,
    handleExpandedTouchStart,
    handleExpandedTouchMove,
    handleExpandedTouchEnd,
  } = useChatPanelLayout({ onClose });

  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  // Which message's reply/edit/delete overlay is showing - tap-to-reveal on touch devices, since
  // the old opacity-0 group-hover approach never showed at all without a real :hover state.
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Pin/dismiss state for Tasks tab
  const [pinnedTaskIds, setPinnedTaskIds] = useState<string[]>([]);
  const [dismissedTaskIds, setDismissedTaskIds] = useState<string[]>([]);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');

  const [scrollToMsgId, setScrollToMsgId] = useState<string | null>(null);

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

  // ── Compose hook: draft/attachments/@mention state + handlers, the send() dispatcher (routes to
  // whichever thread is open), and file upload/paste/delete. ──
  const {
    draft,
    setDraft,
    sending,
    preview,
    setPreview,
    attachments,
    setAttachments,
    uploading,
    deletingFile,
    mentionSearch,
    mentionHighlight,
    setMentionHighlight,
    mentionCandidates,
    teamMembers,
    replyingTo,
    setReplyingTo,
    showComposePicker,
    setShowComposePicker,
    showMarkdownHelp,
    setShowMarkdownHelp,
    showMoreTools,
    setShowMoreTools,
    composeMultiline,
    fileRef,
    textRef,
    handleDraftChange,
    handleDraftKeyDown,
    handlePaste,
    insertMention,
    send,
    handleFileChange,
    handleDeleteFile,
  } = useChatCompose({
    isAdminChat,
    adminMode,
    activeProduct,
    user,
    productId,
    tab,
    sendTaskId,
    activeConvId,
    activeGroupId,
    activeProjectId,
    isMobile,
    confirm,
    setAllMessages,
    setDmMessages,
    setGroupMessages,
    setProjectMessages,
  });

  // When opened from a task's chat button, jump directly to that task's thread
  useEffect(() => {
    if (initialTask) {
      setTab('tasks');
      setSelectedTask({ id: initialTask.id, name: initialTask.name });
    }
  }, [initialTask?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // When opened onto a specific DM/group thread (e.g. a search result), jump directly there -
  // openDm/openGroup do the same find-existing-conversation + load-messages work the People/Groups
  // tabs themselves use when a user clicks a row, so this reuses the exact same, already-correct path.
  useEffect(() => {
    if (!initialConversation) return;
    if (initialConversation.isGroup) {
      setTab('groups');
      openGroup(initialConversation.id);
    } else if (initialConversation.other) {
      setTab('people');
      openDm(initialConversation.other.id, initialConversation.other);
    }
  }, [initialConversation?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opened from a notification about one specific message (e.g. a reaction) or a search result -
  // land on the right thread and queue it up to scroll to. When initialTask/initialConversation is
  // also set, the effects above already handle switching to that thread; otherwise the target is
  // the general project channel.
  useEffect(() => {
    if (!scrollToMessageId) return;
    if (!initialTask && !initialConversation) setTab('messages');
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
  }, [reactionPickerFor, showComposePicker, setShowComposePicker]);

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
    other?: {
      id: string;
      username: string;
      realName: string | null;
      avatarEmoji: string | null;
    } | null,
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
  function groupRoster(): {
    id: string;
    username: string;
    realName?: string | null;
    avatarEmoji?: string | null;
  }[] {
    return isAdminChat ? allUsers.filter((u) => u.id !== user?.id) : teamMembers.filter((m) => m.id !== user?.id);
  }

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
            style={{
              position: 'absolute',
              top: 0,
              left: 12,
              right: 12,
              height: 5,
              cursor: 'n-resize',
              zIndex: 10,
            }}
          />
          <div
            onPointerDown={(e) => startResizeDir(e, 's')}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 12,
              right: 12,
              height: 5,
              cursor: 's-resize',
              zIndex: 10,
            }}
          />
          <div
            onPointerDown={(e) => startResizeDir(e, 'e')}
            style={{
              position: 'absolute',
              top: 12,
              right: 0,
              bottom: 12,
              width: 5,
              cursor: 'e-resize',
              zIndex: 10,
            }}
          />
          <div
            onPointerDown={(e) => startResizeDir(e, 'w')}
            style={{
              position: 'absolute',
              top: 12,
              left: 0,
              bottom: 12,
              width: 5,
              cursor: 'w-resize',
              zIndex: 10,
            }}
          />
          <div
            onPointerDown={(e) => startResizeDir(e, 'nw')}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 12,
              height: 12,
              cursor: 'nw-resize',
              zIndex: 11,
            }}
          />
          <div
            onPointerDown={(e) => startResizeDir(e, 'ne')}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 12,
              height: 12,
              cursor: 'ne-resize',
              zIndex: 11,
            }}
          />
          <div
            onPointerDown={(e) => startResizeDir(e, 'sw')}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: 12,
              height: 12,
              cursor: 'sw-resize',
              zIndex: 11,
            }}
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
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: 5,
            cursor: 'w-resize',
            zIndex: 10,
          }}
        />
      )}
      <ChatPanelHeader
        isAdminChat={isAdminChat}
        tab={tab}
        setTab={setTab}
        selectedTask={selectedTask}
        setSelectedTask={setSelectedTask}
        isMinimized={isMinimized}
        setIsMinimized={setIsMinimized}
        isExpanded={isExpanded}
        setIsExpanded={setIsExpanded}
        onClose={onClose}
        inSubThread={inSubThread}
        unreadByTask={unreadByTask}
        tasksUnread={tasksUnread}
        taskThreadCount={taskThreadCount}
        totalDmUnread={totalDmUnread}
        totalGroupUnread={totalGroupUnread}
        activeConvId={activeConvId}
        activeGroupId={activeGroupId}
        setSearch={setSearch}
        setActiveProjectId={setActiveProjectId}
        setProjectMessages={setProjectMessages}
        loadAdminProjects={loadAdminProjects}
        loadPeople={loadPeople}
        loadGroups={loadGroups}
        onExpandedTouchStart={handleExpandedTouchStart}
        onExpandedTouchMove={handleExpandedTouchMove}
        onExpandedTouchEnd={handleExpandedTouchEnd}
        onHeaderDrag={onHeaderDrag}
      />

      {!isMinimized && (
        <>
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
                  style={{
                    borderBottom: '1px solid var(--border)',
                    touchAction: isExpanded ? 'none' : undefined,
                  }}
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
                    style={{
                      background: 'var(--brand-subtle)',
                      color: 'var(--brand)',
                    }}
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
                          style={{
                            background: 'var(--surface-2)',
                            color: 'var(--brand)',
                          }}
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
                              onClick={() =>
                                setSelectedTask({
                                  id: task.id,
                                  name: task.name,
                                })
                              }
                              className="flex gap-3 flex-1 min-w-0 text-left"
                            >
                              <div
                                className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-base"
                                style={{
                                  background: 'var(--surface)',
                                  border: '1px solid var(--border)',
                                }}
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
                                  style={{
                                    background: '#ef4444',
                                    minWidth: 14,
                                    height: 14,
                                    padding: '0 2px',
                                  }}
                                >
                                  {unread > 99 ? '99+' : unread}
                                </span>
                              )}
                              {msgInfo && (
                                <span
                                  className="flex-shrink-0 self-center text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                                  style={{
                                    background: 'var(--brand-subtle)',
                                    color: 'var(--brand)',
                                  }}
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
                      style={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                      }}
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
                          📎 {msg.attachments.length} attachment
                          {msg.attachments.length > 1 ? 's' : ''}
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
          {lightboxUrl && <ChatLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

          <ChatGroupModals
            isAdminChat={isAdminChat}
            groupRoster={groupRoster}
            showNewGroupModal={showNewGroupModal}
            onCloseNewGroupModal={() => setShowNewGroupModal(false)}
            newGroupName={newGroupName}
            setNewGroupName={setNewGroupName}
            newGroupSearch={newGroupSearch}
            setNewGroupSearch={setNewGroupSearch}
            newGroupSelected={newGroupSelected}
            setNewGroupSelected={setNewGroupSelected}
            creatingGroup={creatingGroup}
            setCreatingGroup={setCreatingGroup}
            createGroup={createGroup}
            showManageGroupModal={showManageGroupModal}
            onCloseManageGroupModal={() => setShowManageGroupModal(false)}
            activeGroupId={activeGroupId}
            groupConversations={groupConversations}
            manageGroupName={manageGroupName}
            setManageGroupName={setManageGroupName}
            groupBusy={groupBusy}
            setGroupBusy={setGroupBusy}
            renameGroup={renameGroup}
            removeGroupParticipant={removeGroupParticipant}
            addGroupParticipants={addGroupParticipants}
            addPeopleSearch={addPeopleSearch}
            setAddPeopleSearch={setAddPeopleSearch}
            addPeopleSelected={addPeopleSelected}
            setAddPeopleSelected={setAddPeopleSelected}
            currentUserId={user?.id ?? ''}
            confirm={confirm}
          />
        </>
      )}
    </div>
  );
}
