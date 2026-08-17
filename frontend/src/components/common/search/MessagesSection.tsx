import { displayName } from '../../../api/client';
import type { SearchResults } from '../../../api/client';
import { groupTitle } from '../ChatGroupsTab';

type MsgResult = SearchResults['messages'][number];

interface Props {
  items: MsgResult[];
  highlightIdx: number;
  nextIdx: () => number;
  loading: boolean;
  onMessageClick: (msg: MsgResult) => void;
}

export default function MessagesSection({ items, highlightIdx, nextIdx, loading, onMessageClick }: Props) {
  if (items.length === 0) return null;
  return (
    <div className="py-1">
      <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        Messages
      </div>
      {items.map((msg) => {
        const i = nextIdx();
        const isHighlighted = highlightIdx === i;
        return (
          <button
            key={msg.id}
            data-idx={i}
            onClick={() => onMessageClick(msg)}
            disabled={loading}
            className="w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors"
            style={{
              background: isHighlighted ? 'var(--brand-subtle)' : 'transparent',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')
            }
          >
            <span className="text-base flex-shrink-0 mt-0.5">{msg.author.avatarEmoji ?? '👤'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                {displayName(msg.author)}
                {msg.task && <span style={{ color: 'var(--text-3)' }}> · {msg.task.name}</span>}
                {msg.conversation && (
                  <span style={{ color: 'var(--text-3)' }}>
                    {' '}
                    ·{' '}
                    {msg.conversation.isGroup
                      ? groupTitle(msg.conversation)
                      : `DM with ${msg.conversation.other ? displayName(msg.conversation.other) : '…'}`}
                  </span>
                )}
              </p>
              <p className="text-sm truncate mt-0.5" style={{ color: 'var(--text)' }}>
                {msg.content}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
