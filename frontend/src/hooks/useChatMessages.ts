/**
 * Manages the main message list for a chat panel (project chat or admin chat).
 * Polls every 5 seconds but pauses while the browser tab is hidden to reduce load.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import type { Message } from '../api/client';

interface Options {
  isAdminChat: boolean;
  productId: string | undefined;
}

export function useChatMessages({ isAdminChat, productId }: Options) {
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (document.hidden) return;
    try {
      if (isAdminChat) {
        const msgs = await api.adminChat.list();
        setAllMessages(Array.isArray(msgs) ? msgs : []);
      } else {
        if (!productId) return;
        const msgs = await api.messages.listAll(productId);
        setAllMessages(Array.isArray(msgs) ? msgs : []);
      }
    } catch {}
  }, [isAdminChat, productId]);

  // Clear stale messages immediately on product switch
  useEffect(() => {
    setAllMessages([]);
  }, [productId]);

  // Poll every 5 s; skip hidden-tab ticks to save server requests
  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 5000);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  return { allMessages, setAllMessages };
}
