import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import { displayName } from '../../api/client';
import type { Message } from '../../api/client';
import { EMOJI_SET } from './MarkdownEditor';

export function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return `Yesterday ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

interface Props {
  msg: Message;
  isOwn: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onImageClick: (url: string) => void;
  canEdit: boolean;
  onReact: (emoji: string) => void;
  currentUserId: string | null;
  reactionPickerOpen: boolean;
  onToggleReactionPicker: () => void;
}

export default function MessageBubble({
  msg, isOwn, onEdit, onDelete, onImageClick, canEdit, onReact,
  currentUserId, reactionPickerOpen, onToggleReactionPicker,
}: Props) {
  const renderContent = (content: string, own: boolean) => (
    <div className="chat-markdown" style={{ fontSize: 13, lineHeight: 1.5 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => (
            <pre style={{ margin: '6px -4px', borderRadius: 6, overflow: 'auto', fontSize: 12 }}>{children}</pre>
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = Boolean(className?.startsWith('language-'));
            return isBlock ? (
              <code className={className} {...props}>{children}</code>
            ) : (
              <code style={{ background: own ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)', padding: '1px 4px', borderRadius: 3, fontSize: '0.88em', fontFamily: 'monospace' }} {...props}>{children}</code>
            );
          },
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" style={{ color: own ? 'rgba(255,255,255,0.85)' : 'var(--brand)', textDecoration: 'underline' }}>{children}</a>
          ),
          p: ({ children }) => <p style={{ margin: '2px 0' }}>{children}</p>,
          ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 16 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: 16 }}>{children}</ol>,
          li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote style={{ margin: '4px 0', paddingLeft: 10, borderLeft: `3px solid ${own ? 'rgba(255,255,255,0.4)' : 'var(--brand)'}`, opacity: 0.8 }}>{children}</blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );

  const reactionGroups: Record<string, string[]> = {};
  for (const r of (msg.reactions ?? [])) {
    if (!reactionGroups[r.emoji]) reactionGroups[r.emoji] = [];
    reactionGroups[r.emoji]!.push(r.userId);
  }
  const hasReactions = Object.keys(reactionGroups).length > 0;

  return (
    <div className={`flex gap-2.5 group ${isOwn ? 'flex-row-reverse' : ''}`}>
      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        {msg.author.avatarEmoji ?? '👤'}
      </div>
      <div className={`flex-1 min-w-0 ${isOwn ? 'items-end' : 'items-start'} flex flex-col relative`}>
        <div className={`flex items-baseline gap-2 mb-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
          <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{displayName(msg.author)}</span>
          <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
            {formatTime(msg.createdAt)}{msg.editedAt ? ' (edited)' : ''}
          </span>
        </div>
        {msg.content && (
          <div
            className={`px-3 py-2 rounded-2xl text-sm max-w-[280px] ${isOwn ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
            style={{
              background: isOwn ? 'var(--brand)' : 'var(--surface-2)',
              color: isOwn ? 'white' : 'var(--text)',
              border: isOwn ? 'none' : '1px solid var(--border)',
              wordBreak: 'break-word',
            }}
          >
            {renderContent(msg.content, isOwn)}
          </div>
        )}
        {msg.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {msg.attachments.map((att, i) =>
              att.type.startsWith('image/') ? (
                <button key={i} onClick={() => onImageClick(att.url)} className="block">
                  <img src={att.url} alt={att.name} className="rounded-lg object-cover cursor-zoom-in hover:opacity-90 transition-opacity" style={{ maxWidth: 200, maxHeight: 160 }} />
                </button>
              ) : (
                <a key={i} href={att.url} download={att.name} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs" style={{ background: 'var(--surface-2)', color: 'var(--brand)', border: '1px solid var(--border)' }}>
                  📎 {att.name}
                </a>
              )
            )}
          </div>
        )}

        {/* Reactions */}
        <div className={`flex flex-wrap items-center gap-1 mt-1.5 ${isOwn ? 'justify-end' : ''}`}>
          {Object.entries(reactionGroups).map(([emoji, userIds]) => {
            const mine = currentUserId ? userIds.includes(currentUserId) : false;
            return (
              <button
                key={emoji}
                onClick={() => onReact(emoji)}
                title={userIds.length > 3 ? userIds.join(', ') : undefined}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-colors"
                style={{ background: mine ? 'var(--brand-subtle)' : 'var(--surface-2)', border: `1px solid ${mine ? 'var(--brand)' : 'var(--border)'}`, color: mine ? 'var(--brand)' : 'var(--text-2)' }}
              >
                {emoji} <span>{userIds.length}</span>
              </button>
            );
          })}
          <button
            onClick={onToggleReactionPicker}
            className={`text-sm px-1.5 py-0.5 rounded-full transition-opacity ${hasReactions ? '' : 'opacity-0 group-hover:opacity-100'}`}
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-3)', lineHeight: 1 }}
            title="Add reaction"
          >😊+</button>
        </div>

        {/* Emoji picker for reactions */}
        {reactionPickerOpen && (
          <div
            className="absolute z-50 p-2 rounded-xl shadow-xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', bottom: '100%', [isOwn ? 'right' : 'left']: 0, marginBottom: 2 }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 28px)', gap: 2 }}>
              {EMOJI_SET.map((e) => (
                <button key={e} onClick={() => { onReact(e); onToggleReactionPicker(); }}
                  className="flex items-center justify-center rounded hover:bg-[--surface-2] transition-colors text-base"
                  style={{ width: 28, height: 28 }}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Edit / delete actions */}
        {isOwn && (
          <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canEdit && <button onClick={onEdit} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--text-3)' }}>Edit</button>}
            <button onClick={onDelete} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: '#ef4444' }}>Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}
