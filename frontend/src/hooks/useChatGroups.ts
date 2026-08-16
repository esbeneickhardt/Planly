/**
 * Manages the Groups tab state for the chat panel: group conversation list, active group thread,
 * and group management (create/rename/add/remove participants). Mirrors useChatPeople.ts's
 * structure but kept separate since group "open" is by-existing-conversation-id (rows already
 * exist in the list) rather than DM's find-or-create-by-user-id.
 * `loadGroups`/`loadGroupMessages` (polled by ChatPanel while the Groups tab or a group thread is
 * open) skip fetching while the browser tab is hidden and skip `setState` when the fetched data is
 * unchanged from last time - same guards as useChatMessages.ts's polling.
 */
import { useState, useCallback, useRef } from 'react';
import { api } from '../api/client';
import type { ConversationSummary, DirectMessage } from '../api/client';

interface Options {
  isAdminChat: boolean;
  /** Non-admin chat is always scoped to one project - required whenever isAdminChat is false. */
  productId?: string;
}

export function useChatGroups({ isAdminChat, productId }: Options) {
  const [groupConversations, setGroupConversations] = useState<ConversationSummary[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groupMessages, setGroupMessages] = useState<DirectMessage[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);
  // Same stale-fetch guard as useChatPeople.ts's loadDmMessages - see there for why.
  const latestRequestedConvId = useRef<string | null>(null);
  // Fingerprints of the last data actually applied via setState - same dedupe pattern as
  // useChatMessages.ts, so an unchanged poll response doesn't force a re-render.
  const lastGroupsFingerprintRef = useRef<string>('');
  const lastGroupMsgFingerprintRef = useRef<string>('');

  const loadGroups = useCallback(async () => {
    // Skip while the tab is hidden (polled every 5-30s by ChatPanel) - same guard as
    // useChatMessages.ts's `load`.
    if (document.hidden) return;
    if (!isAdminChat && !productId) {
      setGroupConversations([]);
      return;
    }
    try {
      const { conversations: convs } = await api.conversations.list(isAdminChat, productId);
      const filtered = convs.filter((c) => c.isGroup);
      const fingerprint = JSON.stringify(filtered);
      if (fingerprint !== lastGroupsFingerprintRef.current) {
        lastGroupsFingerprintRef.current = fingerprint;
        setGroupConversations(filtered);
      }
    } catch {}
  }, [isAdminChat, productId]);

  const loadGroupMessages = useCallback(async (convId: string) => {
    if (document.hidden) return;
    latestRequestedConvId.current = convId;
    setGroupLoading(true);
    try {
      const { messages } = await api.conversations.messages(convId);
      if (latestRequestedConvId.current !== convId) return; // superseded by a newer request
      const fingerprint = JSON.stringify(messages);
      if (fingerprint !== lastGroupMsgFingerprintRef.current) {
        lastGroupMsgFingerprintRef.current = fingerprint;
        setGroupMessages(messages);
      }
    } catch {
    } finally {
      if (latestRequestedConvId.current === convId) setGroupLoading(false);
    }
  }, []);

  const openGroup = useCallback(
    async (id: string, onDraftClear?: () => void) => {
      onDraftClear?.();
      setActiveGroupId(id);
      await loadGroupMessages(id);
      await api.conversations.markRead(id).catch(() => {});
      setGroupConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    },
    [loadGroupMessages],
  );

  const createGroup = useCallback(
    async (participantIds: string[], name?: string) => {
      const { id } = await api.conversations.createGroup(participantIds, name, isAdminChat, productId);
      await loadGroups();
      await openGroup(id);
      return id;
    },
    [isAdminChat, productId, loadGroups, openGroup],
  );

  const renameGroup = useCallback(
    async (id: string, name: string) => {
      await api.conversations.rename(id, name);
      await loadGroups();
    },
    [loadGroups],
  );

  const addParticipants = useCallback(
    async (id: string, userIds: string[]) => {
      await api.conversations.addParticipants(id, userIds);
      await loadGroups();
    },
    [loadGroups],
  );

  const removeParticipant = useCallback(
    async (id: string, userId: string, selfUserId: string) => {
      await api.conversations.removeParticipant(id, userId);
      if (userId === selfUserId) {
        setActiveGroupId((cur) => (cur === id ? null : cur));
        setGroupConversations((prev) => prev.filter((c) => c.id !== id));
      } else {
        await loadGroups();
      }
    },
    [loadGroups],
  );

  const totalGroupUnread = groupConversations.reduce((n, c) => n + c.unread, 0);

  return {
    groupConversations,
    setGroupConversations,
    activeGroupId,
    setActiveGroupId,
    groupMessages,
    setGroupMessages,
    groupLoading,
    loadGroups,
    loadGroupMessages,
    openGroup,
    createGroup,
    renameGroup,
    addParticipants,
    removeParticipant,
    totalGroupUnread,
  };
}
