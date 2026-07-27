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
  // Fingerprint of the last data we actually applied, so a poll tick that fetches the exact same
  // messages (the common case) doesn't call setState and force a full list re-render every 5s -
  // that was the cause of a visible flicker/jank on every poll even when nothing had changed.
  const lastFingerprintRef = useRef<string>('');

  const applyMessages = useCallback((msgs: unknown) => {
    const list = Array.isArray(msgs) ? (msgs as Message[]) : [];
    const fingerprint = JSON.stringify(list);
    if (fingerprint === lastFingerprintRef.current) return;
    lastFingerprintRef.current = fingerprint;
    setAllMessages(list);
  }, []);

  const load = useCallback(async () => {
    if (document.hidden) return;
    try {
      if (isAdminChat) {
        const msgs = await api.adminChat.list();
        applyMessages(msgs);
      } else {
        if (!productId) return;
        const msgs = await api.messages.listAll(productId);
        applyMessages(msgs);
      }
    } catch {}
  }, [isAdminChat, productId, applyMessages]);

  // Clear stale messages immediately on product switch
  useEffect(() => {
    setAllMessages([]);
    lastFingerprintRef.current = '';
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
