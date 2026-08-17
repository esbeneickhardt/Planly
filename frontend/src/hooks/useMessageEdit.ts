/**
 * Manages inline edit state for a single chat message at a time (editingId + editDraft).
 * `saveEdit` routes to either the admin chat API or the product chat API depending on `isAdminChat`.
 * On successful save the message is updated optimistically in the caller's `setAllMessages` state.
 */
import { useState } from 'react';
import { api } from '../api/client';
import type { Message } from '../api/client';

interface Options {
  isAdminChat: boolean;
  productId: string | undefined;
  setAllMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

export function useMessageEdit({ isAdminChat, productId, setAllMessages }: Options) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  function startEdit(id: string, content: string) {
    setEditingId(id);
    setEditDraft(content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft('');
  }

  async function saveEdit(id: string) {
    if (!editDraft.trim()) return;
    if (!isAdminChat && !productId) return;
    const updated = isAdminChat
      ? await api.adminChat.update(id, editDraft.trim())
      : await api.messages.update(productId!, id, editDraft.trim());
    setAllMessages((prev) => prev.map((m) => (m.id === id ? updated : m)));
    cancelEdit();
  }

  return {
    editingId,
    editDraft,
    setEditDraft,
    startEdit,
    cancelEdit,
    saveEdit,
  };
}
