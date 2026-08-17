/**
 * ChatPanel's People/Users tab: either the DM thread (open conversation) or the browse view
 * (search + recent conversations + user search results). Split out of ChatPanel.tsx, which still
 * owns the shared conversation/message state (via useChatPeople) and passes it down as props,
 * along with the compose-box/message-list prop bundles it builds once for every tab to share.
 */
import { useAuth } from '../../context/AuthContext';
import { api, displayName } from '../../api/client';
import type { ConversationSummary, Message } from '../../api/client';
import ChatMessageList from './ChatMessageList';
import ChatComposeBox, { type ChatComposeBoxProps, type TeamMemberEntry } from './ChatComposeBox';

interface Props {
  isAdminChat: boolean;
  isExpanded: boolean;
  onExpandedTouchStart: (e: React.TouchEvent) => void;
  onExpandedTouchMove: (e: React.TouchEvent) => void;
  onExpandedTouchEnd: () => void;
  activeConvId: string | null;
  activeConvOther: { id: string; username: string; realName: string | null; avatarEmoji: string | null } | null;
  conversations: ConversationSummary[];
  setConversations: React.Dispatch<React.SetStateAction<ConversationSummary[]>>;
  /** Resets the open DM thread (id/other/messages/draft) and reloads the conversation list. */
  onBack: () => void;
  dmLoading: boolean;
  messages: Message[];
  dmUserSearch: string;
  setDmUserSearch: React.Dispatch<React.SetStateAction<string>>;
  allUsers: { id: string; username: string; avatarEmoji: string | null; isAdmin: boolean }[];
  teamMembers: TeamMemberEntry[];
  openDm: (
    userId: string,
    other?: { id: string; username: string; realName: string | null; avatarEmoji: string | null } | null,
  ) => void;
  composeBoxProps: ChatComposeBoxProps;
  messageListProps: Omit<React.ComponentProps<typeof ChatMessageList>, 'messages' | 'showLoadOlder'>;
}

export default function ChatPeopleTab({
  isAdminChat,
  isExpanded,
  onExpandedTouchStart,
  onExpandedTouchMove,
  onExpandedTouchEnd,
  activeConvId,
  activeConvOther,
  conversations,
  setConversations,
  onBack,
  dmLoading,
  messages,
  dmUserSearch,
  setDmUserSearch,
  allUsers,
  teamMembers,
  openDm,
  composeBoxProps,
  messageListProps,
}: Props) {
  const { user } = useAuth();

  if (activeConvId) {
    // DM thread - same visual identity as project/admin chat
    const conv = conversations.find((c) => c.id === activeConvId);
    const closed = conv?.closed ?? false;
    return (
      <>
        <div
          onTouchStart={isExpanded ? onExpandedTouchStart : undefined}
          onTouchMove={isExpanded ? onExpandedTouchMove : undefined}
          onTouchEnd={isExpanded ? onExpandedTouchEnd : undefined}
          onTouchCancel={isExpanded ? onExpandedTouchEnd : undefined}
          className="flex items-center gap-2 px-2 py-2 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)', touchAction: isExpanded ? 'none' : undefined }}
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
            {activeConvOther?.avatarEmoji ?? '👤'}
          </span>
          <p className="text-sm font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--text)' }}>
            {activeConvOther ? displayName(activeConvOther) : conv?.other ? displayName(conv.other) : 'Direct message'}
          </p>
          {isAdminChat && activeConvId && (
            <button
              onClick={async () => {
                try {
                  const r = await api.conversations.close(activeConvId);
                  setConversations((prev) => prev.map((c) => (c.id === activeConvId ? { ...c, closed: r.closed } : c)));
                } catch {}
              }}
              className="text-xs px-2 py-1 rounded-lg transition-colors flex-shrink-0"
              style={{
                background: closed ? 'var(--surface-2)' : '#fee2e2',
                color: closed ? 'var(--text-2)' : '#dc2626',
              }}
              title={closed ? 'Reopen this chat' : 'Close this chat so the user cannot send more messages'}
            >
              {closed ? 'Reopen' : 'Close chat'}
            </button>
          )}
        </div>
        {dmLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div
              className="w-5 h-5 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }}
            />
          </div>
        ) : (
          <ChatMessageList messages={messages} {...messageListProps} />
        )}
        {conv?.closed && !isAdminChat ? (
          <div
            className="px-4 py-3 text-xs text-center flex-shrink-0"
            style={{ borderTop: '1px solid var(--border)', color: 'var(--text-3)' }}
          >
            This conversation has been closed. Contact us to reopen.
          </div>
        ) : (
          <ChatComposeBox {...composeBoxProps} />
        )}
      </>
    );
  }

  // People list - search input + recent conversations
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-4 pt-3 pb-2 flex-shrink-0 space-y-2">
        <input
          type="text"
          value={dmUserSearch}
          onChange={(e) => setDmUserSearch(e.target.value)}
          placeholder={isAdminChat ? 'Search users…' : 'Search members…'}
          className="input text-sm w-full"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {/* Recent conversations - always shown when no search query */}
        {!dmUserSearch && conversations.length > 0 && (
          <div className="px-4 pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-3)' }}>
              Recent
            </p>
            <div className="space-y-0.5">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => openDm(conv.other?.id ?? '', conv.other)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
                  style={{ background: 'transparent' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold relative"
                    style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}
                  >
                    {conv.other?.avatarEmoji ?? conv.other?.username[0]?.toUpperCase() ?? '?'}
                    {conv.unread > 0 && (
                      <span
                        className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white text-[9px] font-bold"
                        style={{ background: '#ef4444', minWidth: 14, height: 14, padding: '0 2px' }}
                      >
                        {conv.unread}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                      {conv.other ? displayName(conv.other) : 'Unknown'}
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
          </div>
        )}

        {/* Search results */}
        {dmUserSearch &&
          (() => {
            const q = dmUserSearch.toLowerCase();
            // DMs never exclude a project team member from being messageable, regardless
            // of their platform-wide admin status.
            const roster = isAdminChat
              ? allUsers.filter((u) => u.id !== user?.id)
              : teamMembers.filter((m) => m.id !== user?.id);
            const filtered = roster.filter(
              (m) =>
                m.username.toLowerCase().includes(q) ||
                (m as { realName?: string | null }).realName?.toLowerCase().includes(q),
            );
            if (filtered.length === 0)
              return (
                <div className="flex flex-col items-center justify-center h-24 gap-1" style={{ color: 'var(--text-3)' }}>
                  <p className="text-sm">No users found.</p>
                </div>
              );
            return (
              <div className="px-4 pb-3 space-y-0.5">
                {filtered.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setDmUserSearch('');
                      openDm(m.id);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
                    style={{ background: 'transparent' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
                    >
                      {m.avatarEmoji ?? m.username[0]?.toUpperCase()}
                    </div>
                    <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                      {m.username}
                    </p>
                  </button>
                ))}
              </div>
            );
          })()}

        {/* Empty state - no search and no conversations yet */}
        {!dmUserSearch && conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2" style={{ color: 'var(--text-3)' }}>
            <span className="text-3xl opacity-30">💬</span>
            <p className="text-sm">Search for someone to message.</p>
          </div>
        )}
      </div>
    </div>
  );
}
