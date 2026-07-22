/**
 * Manages the People/DM tab state for the chat panel: conversation list,
 * active DM thread, direct messages, and user search roster.
 */
import { useState, useCallback } from 'react';
import { api } from '../api/client';
import type { ConversationSummary, DirectMessage } from '../api/client';

interface Options {
  isAdminChat: boolean;
}

export function useChatPeople({ isAdminChat }: Options) {
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
    { id: string; username: string; avatarEmoji: string | null; isAdmin: boolean }[]
  >([]);

  const loadPeople = useCallback(async () => {
    try {
      const { conversations: convs } = await api.conversations.list(isAdminChat);
      setConversations(convs);
    } catch {}
    if (isAdminChat) {
      try {
        const users = await api.users.list();
        setAllUsers(users);
      } catch {}
    }
  }, [isAdminChat]);

  const loadDmMessages = useCallback(async (convId: string) => {
    setDmLoading(true);
    try {
      const { messages } = await api.conversations.messages(convId);
      setDmMessages(messages);
    } catch {
    } finally {
      setDmLoading(false);
    }
  }, []);

  const openDm = useCallback(
    async (
      userId: string,
      other?: { id: string; username: string; realName: string | null; avatarEmoji: string | null } | null,
      onDraftClear?: () => void,
    ) => {
      onDraftClear?.();
      if (other) setActiveConvOther(other);
      try {
        const { id } = await api.conversations.findOrCreate(userId, isAdminChat);
        setActiveConvId(id);
        await loadDmMessages(id);
        await api.conversations.markRead(id).catch(() => {});
        const { conversations: fresh } = await api.conversations.list(isAdminChat);
        setConversations(fresh);
        const freshConv = fresh.find((c) => c.id === id);
        if (freshConv?.other) setActiveConvOther(freshConv.other);
        setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
      } catch {}
    },
    [isAdminChat, loadDmMessages],
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
