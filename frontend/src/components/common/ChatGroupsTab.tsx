/**
 * ChatPanel's Groups tab: either the open group thread or the browse view (group list + "New
 * group" button). Split out of ChatPanel.tsx, which still owns the shared group state (via
 * useChatGroups) and the New-group/Manage-group modals - those stay in ChatPanel since they were
 * already rendered outside the `tab === 'groups'` conditional there (so an open modal doesn't get
 * unmounted if `tab` were ever to change underneath it), just triggered from here via callbacks.
 */
import type { ConversationSummary, Message } from '../../api/client';
import ChatMessageList from './ChatMessageList';
import ChatComposeBox, { type ChatComposeBoxProps } from './ChatComposeBox';

/** Display name for a group: its custom name, or a comma-joined list of participant names. */
export function groupTitle(conv: {
  name: string | null;
  participants: { username: string; realName?: string | null }[];
}) {
  if (conv.name) return conv.name;
  if (conv.participants.length === 0) return 'Group';
  return conv.participants.map((p) => p.realName || p.username).join(', ');
}

interface Props {
  isExpanded: boolean;
  onExpandedTouchStart: (e: React.TouchEvent) => void;
  onExpandedTouchMove: (e: React.TouchEvent) => void;
  onExpandedTouchEnd: () => void;
  groupConversations: ConversationSummary[];
  activeGroupId: string | null;
  /** Resets the open group thread (id/messages/draft) and reloads the group list. */
  onBack: () => void;
  groupLoading: boolean;
  messages: Message[];
  openGroup: (id: string) => void;
  onOpenManageGroup: () => void;
  onOpenNewGroup: () => void;
  composeBoxProps: ChatComposeBoxProps;
  messageListProps: Omit<React.ComponentProps<typeof ChatMessageList>, 'messages' | 'showLoadOlder'>;
}

export default function ChatGroupsTab({
  isExpanded,
  onExpandedTouchStart,
  onExpandedTouchMove,
  onExpandedTouchEnd,
  groupConversations,
  activeGroupId,
  onBack,
  groupLoading,
  messages,
  openGroup,
  onOpenManageGroup,
  onOpenNewGroup,
  composeBoxProps,
  messageListProps,
}: Props) {
  if (activeGroupId) {
    // Group thread - same visual identity as DM/project chat
    const conv = groupConversations.find((c) => c.id === activeGroupId);
    return (
      <>
        <div
          onTouchStart={isExpanded ? onExpandedTouchStart : undefined}
          onTouchMove={isExpanded ? onExpandedTouchMove : undefined}
          onTouchEnd={isExpanded ? onExpandedTouchEnd : undefined}
          onTouchCancel={isExpanded ? onExpandedTouchEnd : undefined}
          className="flex items-center gap-2 px-2 py-2 flex-shrink-0"
          style={{
            borderBottom: '1px solid var(--border)',
            touchAction: isExpanded ? 'none' : undefined,
          }}
        >
          <button
            onClick={onBack}
            aria-label="Back"
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-lg"
            style={{ color: 'var(--text-2)' }}
          >
            ‹
          </button>
          <span
            className="w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0"
            style={{ background: 'var(--surface-2)' }}
            aria-hidden="true"
          >
            👥
          </span>
          <p className="text-sm font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--text)' }}>
            {conv ? groupTitle(conv) : 'Group'}
          </p>
          <button
            onClick={onOpenManageGroup}
            className="text-xs px-2 py-1 rounded-lg transition-colors flex-shrink-0"
            style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
            title="Manage group"
          >
            ⚙
          </button>
        </div>
        {groupLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div
              className="w-5 h-5 border-2 rounded-full animate-spin"
              style={{
                borderColor: 'var(--brand)',
                borderTopColor: 'transparent',
              }}
            />
          </div>
        ) : (
          <ChatMessageList messages={messages} {...messageListProps} />
        )}
        {conv?.closed ? (
          <div
            className="px-4 py-3 text-xs text-center flex-shrink-0"
            style={{
              borderTop: '1px solid var(--border)',
              color: 'var(--text-3)',
            }}
          >
            This conversation has been closed.
          </div>
        ) : (
          <ChatComposeBox {...composeBoxProps} />
        )}
      </>
    );
  }

  // Group list - "+ New group" button + existing groups
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-4 pt-3 pb-2 flex-shrink-0">
        <button onClick={onOpenNewGroup} className="btn-primary text-xs w-full justify-center flex">
          + New group
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {groupConversations.length > 0 ? (
          <div className="px-4 pb-3 space-y-0.5">
            {groupConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => openGroup(conv.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
                style={{ background: 'transparent' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold relative"
                  style={{
                    background: 'var(--brand-subtle)',
                    color: 'var(--brand)',
                  }}
                >
                  👥
                  {conv.unread > 0 && (
                    <span
                      className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white text-[9px] font-bold"
                      style={{
                        background: '#ef4444',
                        minWidth: 14,
                        height: 14,
                        padding: '0 2px',
                      }}
                    >
                      {conv.unread}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                    {groupTitle(conv)}
                  </p>
                  {conv.lastMessage && (
                    <p className="text-[11px] truncate" style={{ color: 'var(--text-3)' }}>
                      {conv.lastMessage.content}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-32 gap-2" style={{ color: 'var(--text-3)' }}>
            <span className="text-3xl opacity-30">👥</span>
            <p className="text-sm">Start a group to chat with several people at once.</p>
          </div>
        )}
      </div>
    </div>
  );
}
