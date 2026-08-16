/**
 * Manages the admin Projects tab state: project list and per-project message thread.
 * `loadProjectMessages` (polled by ChatPanel every 5s while a project thread is open) skips
 * fetching while the browser tab is hidden and skips `setState` when the fetched data is
 * unchanged from last time - same guards as useChatMessages.ts's polling.
 */
import { useState, useCallback, useRef } from 'react';
import { api } from '../api/client';
import type { Message } from '../api/client';

type AdminProject = {
  id: string;
  name: string;
  emoji: string | null;
  ownerId: string | null;
  teamMembers: { userId: string; role: string }[];
};

export function useChatProjects() {
  const [adminProjects, setAdminProjects] = useState<AdminProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectMessages, setProjectMessages] = useState<Message[]>([]);
  const lastProjectsFingerprintRef = useRef<string>('');
  const lastProjectMsgFingerprintRef = useRef<string>('');

  const loadAdminProjects = useCallback(async () => {
    if (document.hidden) return;
    try {
      const projects = await api.admin.projects();
      const fingerprint = JSON.stringify(projects);
      if (fingerprint !== lastProjectsFingerprintRef.current) {
        lastProjectsFingerprintRef.current = fingerprint;
        setAdminProjects(projects);
      }
    } catch {}
  }, []);

  const loadProjectMessages = useCallback(async (productId: string) => {
    if (document.hidden) return;
    try {
      const { messages } = await api.admin.projectMessages(productId);
      const fingerprint = JSON.stringify(messages);
      if (fingerprint !== lastProjectMsgFingerprintRef.current) {
        lastProjectMsgFingerprintRef.current = fingerprint;
        setProjectMessages(messages);
      }
    } catch {}
  }, []);

  return {
    adminProjects,
    setAdminProjects,
    activeProjectId,
    setActiveProjectId,
    projectMessages,
    setProjectMessages,
    loadAdminProjects,
    loadProjectMessages,
  };
}
