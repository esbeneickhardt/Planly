/**
 * Manages the admin Projects tab state: project list and per-project message thread.
 */
import { useState, useCallback } from 'react';
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

  const loadAdminProjects = useCallback(async () => {
    try {
      const projects = await api.admin.projects();
      setAdminProjects(projects);
    } catch {}
  }, []);

  const loadProjectMessages = useCallback(async (productId: string) => {
    try {
      const { messages } = await api.admin.projectMessages(productId);
      setProjectMessages(messages);
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
