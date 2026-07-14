/**
 * Thin context that exposes the chat panel's open/close state and currently focused task.
 * The provider lives in AppLayout, not here — this file only defines the shape and defaults.
 * `adminMode` switches the panel between product chat and the admin-wide announcement channel.
 */
import { createContext, useContext } from 'react';

interface ChatContextValue {
  openChat: (taskId?: string, taskName?: string) => void;
  chatOpen: boolean;
  chatTaskId?: string;
  adminMode: boolean;
}

const ChatContext = createContext<ChatContextValue>({
  openChat: () => {},
  chatOpen: false,
  chatTaskId: undefined,
  adminMode: false,
});

export function useChat() { return useContext(ChatContext); }
export { ChatContext };
