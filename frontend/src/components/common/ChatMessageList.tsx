/**
 * Renders a scrollable list of chat messages - shared by every thread ChatPanel can show (the
 * project/task channel, a DM, a group chat, an admin project thread). Split out of ChatPanel.tsx
 * together with the MessageBubble React.memo wrapper and its per-message callback cache below -
 * these are two halves of one fix and must not be separated (see the comment on the memo).
 */
import React, { useRef } from 'react';
import type { Message } from '../../api/client';
import MessageBubbleImpl from './MessageBubble';

// Wrapped in React.memo here rather than inside MessageBubble.tsx itself (which is intentionally
// frozen after its own touch-gesture stabilization) - see the messageCallbacksRef cache further
// down for the other half of this fix. Without both halves together, this memo does nothing: a
// memoized component still re-renders whenever any prop is a *new* value, and every callback prop
// below used to be a fresh inline closure on every ChatPanel render (e.g. on every compose-box
// keystroke), which is exactly what defeated any benefit memoizing would otherwise have had.
const MessageBubble = React.memo(MessageBubbleImpl);

// Messages remain editable by their author for this long after being sent.
const EDIT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

interface Props {
  messages: Message[];
  /** Only the project-chat message list (backed by useChatMessages' pagination) supports this -
   * DM/group/admin-project views don't. */
  showLoadOlder?: boolean;
  hasMoreOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  editingId: string | null;
  editDraft: string;
  setEditDraft: (v: string) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  currentUserId: string | null;
  chatWritable: boolean;
  isMobile: boolean;
  reactionPickerFor: string | null;
  setReactionPickerFor: React.Dispatch<React.SetStateAction<string | null>>;
  activeMessageId: string | null;
  setActiveMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  /** Included (with productId) only to key the per-message callback cache below - both affect what
   * onDelete/onReact end up doing (see ChatPanel.tsx's deleteMsg/toggleReaction routing). */
  tab: string;
  productId: string | undefined;
  onStartEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
  onReply: (msg: Message) => void;
  onImageClick: (url: string) => void;
  onScrollToReply: (id: string) => void;
  messageListRef: React.RefObject<HTMLDivElement>;
  bottomRef: React.RefObject<HTMLDivElement>;
  onScroll: () => void;
}

export default function ChatMessageList({
  messages,
  showLoadOlder = false,
  hasMoreOlder,
  loadingOlder,
  onLoadOlder,
  editingId,
  editDraft,
  setEditDraft,
  onSaveEdit,
  onCancelEdit,
  currentUserId,
  chatWritable,
  isMobile,
  reactionPickerFor,
  setReactionPickerFor,
  activeMessageId,
  setActiveMessageId,
  tab,
  productId,
  onStartEdit,
  onDelete,
  onReact,
  onReply,
  onImageClick,
  onScrollToReply,
  messageListRef,
  bottomRef,
  onScroll,
}: Props) {
  // Stable per-message callback bundle for MessageBubble (wrapped in React.memo above) - the other
  // half of that fix. Without this, every visible bubble would get brand-new onEdit/onDelete/onReact/
  // etc. closures on every render (e.g. every keystroke in the compose box), which would defeat the
  // memo and re-render the entire visible message list on every keystroke anyway.
  // Cached by message id and only regenerated when something an entry actually closes over changes
  // (msg.content for edit; chatWritable/tab/productId for the writability + routing checks inside
  // onDelete/onReact) - anything else re-rendering the parent reuses the same functions.
  const messageCallbacksRef = useRef(
    new Map<
      string,
      {
        key: string;
        onEdit: () => void;
        onDelete: () => void;
        onReact: (emoji: string) => void;
        onToggleReactionPicker: () => void;
        onToggleActions: () => void;
        onReply: (() => void) | undefined;
      }
    >(),
  );
  function getMessageCallbacks(msg: Message) {
    // JSON-encoded (not a manually-delimited template string) so a value containing the separator
    // can't coincidentally collide with a different combination of values - same fingerprinting
    // idiom used by useChatMessages.ts and the useChatPeople/useChatGroups/useChatProjects pollers.
    const key = JSON.stringify([msg.content, chatWritable, tab, productId]);
    const cached = messageCallbacksRef.current.get(msg.id);
    if (cached && cached.key === key) return cached;
    const entry = {
      key,
      onEdit: () => {
        onStartEdit(msg.id, msg.content);
        setActiveMessageId(null);
      },
      onDelete: () => {
        onDelete(msg.id);
        setActiveMessageId(null);
      },
      onReact: (emoji: string) => {
        if (chatWritable) onReact(msg.id, emoji);
      },
      onToggleReactionPicker: () => {
        if (chatWritable) setReactionPickerFor((v) => (v === msg.id ? null : msg.id));
      },
      onToggleActions: () => {
        if (chatWritable) setActiveMessageId((v) => (v === msg.id ? null : msg.id));
      },
      onReply: chatWritable
        ? () => {
            onReply(msg);
            setActiveMessageId(null);
          }
        : undefined,
    };
    messageCallbacksRef.current.set(msg.id, entry);
    return entry;
  }

  return (
    <div ref={messageListRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
      {showLoadOlder && messages.length > 0 && (
        <div className="flex justify-center pb-1">
          {hasMoreOlder ? (
            <button
              onClick={onLoadOlder}
              disabled={loadingOlder}
              className="text-xs px-3 py-1 rounded-lg"
              style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
            >
              {loadingOlder ? 'Loading…' : 'Load earlier messages'}
            </button>
          ) : (
            <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
              Beginning of conversation
            </span>
          )}
        </div>
      )}
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-3)' }}>
          <span className="text-3xl opacity-30">💬</span>
          <p className="text-sm">No messages yet. Start the conversation!</p>
        </div>
      ) : (
        messages.map((msg) => {
          const isOwn = msg.authorId === currentUserId;
          const isEditing = editingId === msg.id;
          const authorRole = msg.postedAsRole ?? null;
          return (
            <div key={msg.id} id={`chat-msg-${msg.id}`}>
              {isEditing ? (
                <div className="space-y-1.5">
                  <textarea
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- edit field just revealed by clicking "Edit" on this message
                    autoFocus
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSaveEdit(msg.id);
                      if (e.key === 'Escape') onCancelEdit();
                    }}
                    className="input text-sm w-full resize-none"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => onSaveEdit(msg.id)}
                      className="text-xs px-2 py-1 rounded-lg font-medium"
                      style={{ background: 'var(--brand)', color: 'white' }}
                    >
                      Save
                    </button>
                    <button
                      onClick={onCancelEdit}
                      className="text-xs px-2 py-1 rounded-lg"
                      style={{
                        background: 'var(--surface-2)',
                        color: 'var(--text-3)',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div data-emoji-picker>
                  {(() => {
                    const cb = getMessageCallbacks(msg);
                    return (
                      <MessageBubble
                        msg={msg}
                        isOwn={isOwn}
                        onEdit={cb.onEdit}
                        onDelete={cb.onDelete}
                        onImageClick={onImageClick}
                        canEdit={chatWritable && Date.now() - new Date(msg.createdAt).getTime() < EDIT_TIMEOUT_MS}
                        onReact={cb.onReact}
                        currentUserId={currentUserId}
                        reactionPickerOpen={reactionPickerFor === msg.id}
                        onToggleReactionPicker={cb.onToggleReactionPicker}
                        actionsOpen={activeMessageId === msg.id}
                        onToggleActions={cb.onToggleActions}
                        onReply={cb.onReply}
                        onScrollToReply={onScrollToReply}
                        authorRole={authorRole}
                        isMobile={isMobile}
                        scrollContainerRef={messageListRef}
                      />
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
}
