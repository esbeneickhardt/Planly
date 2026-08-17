/**
 * Manages the People/DM tab state for the chat panel: conversation list,
 * active DM thread, direct messages, and user search roster.
 * `loadPeople`/`loadDmMessages` (polled by ChatPanel while the People tab or a DM thread is open)
 * skip fetching while the browser tab is hidden and skip `setState` when the fetched data is
 * unchanged from last time, mirroring useChatMessages.ts's polling guards.
 */
import { useState, useCallback, useRef } from 'react';
import { api } from '../api/client';
import type { ConversationSummary, DirectMessage } from '../api/client';

interface Options {
  isAdminChat: boolean;
  /** Non-admin chat is always scoped to one project - required whenever isAdminChat is false. */
  productId?: string;
}

export function useChatPeople({ isAdminChat, productId }: Options) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeConvOther, setActiveConvOther] = useState<{
    id: string;
    username: string;
    realName: string | null;
    avatarEmoji: string | null;
  } | null>(null);
  const [dmMessages, setDmMessages] = useState<DirectMessage[]>([]);
  const [dmLoading, setDmLoading] = useState(false);
  const [allUsers, setAllUsers] = useState<
    {
      id: string;
      username: string;
      avatarEmoji: string | null;
      isAdmin: boolean;
    }[]
  >([]);
  // The conversation id most recently *requested* by loadDmMessages - guards against a stale,
  // slow-to-resolve fetch for a previous conversation overwriting a fresher one if it lands after
  // the user has already switched threads (e.g. a poll tick for A racing a fresh open of B).
  const latestRequestedConvId = useRef<string | null>(null);
  // Fingerprints of the last data actually applied via setState, so a poll tick that fetches the
  // same data (the common case) doesn't force a re-render - same pattern as useChatMessages.ts.
  const lastConvFingerprintRef = useRef<string>('');
  const lastUsersFingerprintRef = useRef<string>('');
  const lastDmFingerprintRef = useRef<string>('');

  const loadPeople = useCallback(async () => {
    // Skip while the tab is hidden (polled every 5-30s by ChatPanel) - same guard as
    // useChatMessages.ts's `load`, since there's nothing for the user to see mid-background.
    if (document.hidden) return;
    // Non-admin chat always needs a project to scope to - without one there's nothing to load
    // (and the backend would 400), e.g. briefly while switching projects.
    if (!isAdminChat && !productId) {
      setConversations([]);
      return;
    }
    try {
      const { conversations: convs } = await api.conversations.list(isAdminChat, productId);
      // Groups are a separate tab (see useChatGroups.ts's mirrored filter) - without this, a
      // group conversation can appear (and be opened) here as if it were a 1:1 DM.
      const filtered = convs.filter((c) => !c.isGroup);
      const fingerprint = JSON.stringify(filtered);
      if (fingerprint !== lastConvFingerprintRef.current) {
        lastConvFingerprintRef.current = fingerprint;
        setConversations(filtered);
      }
    } catch {}
    if (isAdminChat) {
      try {
        const users = await api.users.list();
        const fingerprint = JSON.stringify(users);
        if (fingerprint !== lastUsersFingerprintRef.current) {
          lastUsersFingerprintRef.current = fingerprint;
          setAllUsers(users);
        }
      } catch {}
    }
  }, [isAdminChat, productId]);

  const loadDmMessages = useCallback(async (convId: string) => {
    if (document.hidden) return;
    latestRequestedConvId.current = convId;
    setDmLoading(true);
    try {
      const { messages } = await api.conversations.messages(convId);
      if (latestRequestedConvId.current !== convId) return; // superseded by a newer request
      const fingerprint = JSON.stringify(messages);
      if (fingerprint !== lastDmFingerprintRef.current) {
        lastDmFingerprintRef.current = fingerprint;
        setDmMessages(messages);
      }
    } catch {
    } finally {
      if (latestRequestedConvId.current === convId) setDmLoading(false);
    }
  }, []);

  const openDm = useCallback(
    async (
      userId: string,
      other?: {
        id: string;
        username: string;
        realName: string | null;
        avatarEmoji: string | null;
      } | null,
      onDraftClear?: () => void,
    ) => {
      if (!isAdminChat && !productId) return;
      onDraftClear?.();
      if (other) setActiveConvOther(other);
      try {
        const { id } = await api.conversations.findOrCreate(userId, isAdminChat, productId);
        setActiveConvId(id);
        await loadDmMessages(id);
        await api.conversations.markRead(id).catch(() => {});
        const { conversations: fresh } = await api.conversations.list(isAdminChat, productId);
        setConversations(fresh.filter((c) => !c.isGroup));
        const freshConv = fresh.find((c) => c.id === id);
        if (freshConv?.other) setActiveConvOther(freshConv.other);
        setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
      } catch {}
    },
    [isAdminChat, productId, loadDmMessages],
  );

  const totalDmUnread = conversations.reduce((n, c) => n + c.unread, 0);

  return {
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
    openDm,
    totalDmUnread,
  };
}
