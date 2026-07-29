/**
 * Manages the main message list for a chat panel (project chat or admin chat).
 * Polls every 5 seconds but pauses while the browser tab is hidden to reduce load.
 *
 * Only the latest `PAGE_SIZE` messages are held initially (and kept fresh by polling) - older
 * history is lazily fetched on demand via `loadOlder()` and merged in, so a channel with a long
 * history doesn't have to load (and re-render) its entire past on every visit/poll tick.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import type { Message } from '../api/client';

interface Options {
  isAdminChat: boolean;
  productId: string | undefined;
}

const PAGE_SIZE = 60;

/** Merges a freshly-fetched batch into the currently-held list, de-duped by id (a message that
 * was edited/reacted-to since last fetch gets the newer copy) and re-sorted by time. */
function mergeById(prev: Message[], fresh: Message[]): Message[] {
  if (fresh.length === 0) return prev;
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const m of fresh) byId.set(m.id, m);
  return Array.from(byId.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function useChatMessages({ isAdminChat, productId }: Options) {
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Fingerprint of the last data we actually applied, so a poll tick that fetches the exact same
  // messages (the common case) doesn't call setState and force a full list re-render every 5s -
  // that was the cause of a visible flicker/jank on every poll even when nothing had changed.
  const lastFingerprintRef = useRef<string>('');
  const allMessagesRef = useRef<Message[]>([]);
  allMessagesRef.current = allMessages;

  const fetchLatest = useCallback(
    (opts?: { before?: string; limit?: number }): Promise<Message[]> => {
      if (isAdminChat) return api.adminChat.list(undefined, undefined, opts);
      if (!productId) return Promise.resolve([]);
      return api.messages.listAll(productId, opts);
    },
    [isAdminChat, productId],
  );

  const load = useCallback(async () => {
    if (document.hidden) return;
    if (!isAdminChat && !productId) return;
    try {
      const msgs = await fetchLatest({ limit: PAGE_SIZE });
      const merged = mergeById(allMessagesRef.current, Array.isArray(msgs) ? msgs : []);
      const fingerprint = JSON.stringify(merged);
      if (fingerprint === lastFingerprintRef.current) return;
      lastFingerprintRef.current = fingerprint;
      setAllMessages(merged);
    } catch {}
  }, [isAdminChat, productId, fetchLatest]);

  // Fetches the next older batch and prepends it - called when the user scrolls up and asks for
  // more history. Stops offering more once a batch comes back shorter than a full page.
  const loadOlder = useCallback(async () => {
    const current = allMessagesRef.current;
    if (loadingOlder || !hasMoreOlder || current.length === 0) return;
    const oldest = current[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const batch = await fetchLatest({ before: oldest.createdAt, limit: PAGE_SIZE });
      const list = Array.isArray(batch) ? batch : [];
      if (list.length < PAGE_SIZE) setHasMoreOlder(false);
      if (list.length > 0) {
        const merged = mergeById(allMessagesRef.current, list);
        lastFingerprintRef.current = JSON.stringify(merged);
        setAllMessages(merged);
      }
    } catch {
    } finally {
      setLoadingOlder(false);
    }
  }, [fetchLatest, loadingOlder, hasMoreOlder]);

  // Clear stale messages immediately on product switch
  useEffect(() => {
    setAllMessages([]);
    lastFingerprintRef.current = '';
    setHasMoreOlder(true);
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

  return { allMessages, setAllMessages, loadOlder, hasMoreOlder, loadingOlder };
}
