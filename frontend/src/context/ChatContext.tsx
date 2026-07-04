import { createContext, useContext } from 'react';

interface ChatContextValue {
  openChat: (taskId?: string, taskName?: string) => void;
  chatOpen: boolean;
  chatTaskId?: string;
}

const ChatContext = createContext<ChatContextValue>({
  openChat: () => {},
  chatOpen: false,
  chatTaskId: undefined,
});

export function useChat() { return useContext(ChatContext); }
export { ChatContext };
