/**
 * Manages the Groups tab state for the chat panel: group conversation list, active group thread,
 * and group management (create/rename/add/remove participants). Mirrors useChatPeople.ts's
 * structure but kept separate since group "open" is by-existing-conversation-id (rows already
 * exist in the list) rather than DM's find-or-create-by-user-id.
 */
import { useState, useCallback } from 'react';
import { api } from '../api/client';
import type { ConversationSummary, DirectMessage } from '../api/client';

interface Options {
  isAdminChat: boolean;
}

export function useChatGroups({ isAdminChat }: Options) {
  const [groupConversations, setGroupConversations] = useState<ConversationSummary[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groupMessages, setGroupMessages] = useState<DirectMessage[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);

  const loadGroups = useCallback(async () => {
    try {
      const { conversations: convs } = await api.conversations.list(isAdminChat);
      setGroupConversations(convs.filter((c) => c.isGroup));
    } catch {}
  }, [isAdminChat]);

  const loadGroupMessages = useCallback(async (convId: string) => {
    setGroupLoading(true);
    try {
      const { messages } = await api.conversations.messages(convId);
      setGroupMessages(messages);
    } catch {
    } finally {
      setGroupLoading(false);
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
      const { id } = await api.conversations.createGroup(participantIds, name, isAdminChat);
      await loadGroups();
      await openGroup(id);
      return id;
    },
    [isAdminChat, loadGroups, openGroup],
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
