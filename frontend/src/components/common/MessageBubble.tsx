/**
 * Renders a single chat message bubble with markdown content, image/file attachments, emoji reactions, and edit/delete controls.
 * Reactions are grouped by emoji with the current user's own reaction highlighted; `reactionPickerOpen` state is lifted to the parent.
 * Edit and delete controls are only shown on hover for the message author; `formatTime` is exported for reuse in task list timestamps.
 */
import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import { MermaidBlock } from './MermaidBlock';
import { displayName } from '../../api/client';
import type { Message } from '../../api/client';
import { EMOJI_SET } from './MarkdownEditor';

// Swipe-right-to-reply thresholds (mirrors Messenger/WhatsApp-style chat gestures)
const SWIPE_MAX = 60;
const SWIPE_THRESHOLD = 40;
// Movement below this is treated as a tap (not a swipe) - above it, the tap-to-reveal-actions
// click that the browser may still fire on touchend is suppressed so the two gestures don't fight.
const SWIPE_TAP_TOLERANCE = 6;
// Total movement (either axis) required before classifying the gesture as horizontal or vertical.
// Every touch starts with a few pixels of diagonal noise - deciding from the very first sample (as
// opposed to accumulating a bit of distance first) is what made the swipe fire inconsistently.
const DIRECTION_LOCK_DISTANCE = 10;
// Swipe is the priority gesture here (tap-to-open-menu is the fallback), so an ambiguous diagonal
// drag should still commit to "horizontal" unless it's clearly more vertical than horizontal.
const VERTICAL_BIAS = 1.5;

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
  /** Whether the reply/edit/delete overlay is showing for this message - tap-toggled so it works
   * on touch devices, not just desktop hover (see onToggleActions). */
  actionsOpen: boolean;
  onToggleActions: () => void;
  onReply?: () => void;
  onScrollToReply?: (id: string) => void;
  authorRole?: string | null;
}

const ROLE_STYLE: Record<string, { background: string; color: string }> = {
  'Server Owner': { background: 'rgba(245,158,11,0.15)', color: '#d97706' },
  'Server Admin': { background: 'rgba(99,102,241,0.12)', color: '#6366f1' },
  'Project Owner': { background: 'rgba(22,163,74,0.12)', color: '#16a34a' },
  'Project Co-Owner': { background: 'rgba(13,148,136,0.12)', color: '#0d9488' },
};

export default function MessageBubble({
  msg,
  isOwn,
  onEdit,
  onDelete,
  onImageClick,
  canEdit,
  onReact,
  currentUserId,
  reactionPickerOpen,
  onToggleReactionPicker,
  actionsOpen,
  onToggleActions,
  onReply,
  onScrollToReply,
  authorRole,
}: Props) {
  const renderContent = (content: string, own: boolean) => (
    <div className="chat-markdown" style={{ fontSize: 13, lineHeight: 1.5 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }) => {
            if (className?.includes('language-mermaid')) return <MermaidBlock code={String(children).trimEnd()} />;
            if (String(children).includes('\n'))
              return (
                <pre style={{ margin: '6px -4px', borderRadius: 6, overflow: 'auto', fontSize: 12 }}>
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              );
            return (
              <code
                style={{
                  background: own ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
                  padding: '1px 4px',
                  borderRadius: 3,
                  fontSize: '0.88em',
                  fontFamily: 'monospace',
                }}
                {...props}
              >
                {children}
              </code>
            );
          },
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              style={{ color: own ? 'rgba(255,255,255,0.85)' : 'var(--brand)', textDecoration: 'underline' }}
            >
              {children}
            </a>
          ),
          p: ({ children }) => <p style={{ margin: '2px 0' }}>{children}</p>,
          h1: ({ children }) => (
            <h1 style={{ margin: '6px 0 2px', fontSize: '1.3em', fontWeight: 700, lineHeight: 1.3 }}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ margin: '5px 0 2px', fontSize: '1.15em', fontWeight: 700, lineHeight: 1.3 }}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ margin: '4px 0 2px', fontSize: '1.05em', fontWeight: 600, lineHeight: 1.3 }}>{children}</h3>
          ),
          h4: ({ children }) => <h4 style={{ margin: '3px 0 2px', fontSize: '1em', fontWeight: 600 }}>{children}</h4>,
          ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 16 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: 16 }}>{children}</ol>,
          li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: '4px 0',
                paddingLeft: 10,
                borderLeft: `3px solid ${own ? 'rgba(255,255,255,0.4)' : 'var(--brand)'}`,
                opacity: 0.8,
              }}
            >
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );

  // Group reactions by emoji to show counts and highlight current user's own reactions
  const reactionGroups: Record<string, string[]> = {};
  for (const r of msg.reactions ?? []) {
    if (!reactionGroups[r.emoji]) reactionGroups[r.emoji] = [];
    reactionGroups[r.emoji]!.push(r.userId);
  }
  const hasReactions = Object.keys(reactionGroups).length > 0;

  // Swipe-right-to-reply: drags the whole row right as feedback, reveals a reply icon behind it,
  // and fires onReply once released past SWIPE_THRESHOLD. The gesture's direction is classified
  // ONCE, after DIRECTION_LOCK_DISTANCE of total movement (not on every touchmove tick from the
  // first pixel) - deciding too early made the swipe randomly abandon itself on the small diagonal
  // wobble every touch gesture starts with. Once locked, the classification doesn't change for the
  // rest of the gesture, and ties are biased toward horizontal since swipe is the priority gesture
  // here (tap-to-open-menu is the fallback for anything that isn't a clear swipe).
  // `touchAction: 'pan-y'` below tells the browser to keep handling vertical scroll natively while
  // leaving horizontal movement to this handler, so the two don't fight over the same touch.
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const directionRef = useRef<'unknown' | 'horizontal' | 'vertical'>('unknown');
  // True for the brief window after a real swipe (meaningful horizontal movement) ends - the
  // browser can still fire a synthetic "click" on release even after a drag, which would otherwise
  // also toggle the tap-to-reveal actions overlay right as (or instead of) the swipe fires onReply.
  const suppressNextClickRef = useRef(false);

  function handleTouchStart(e: React.TouchEvent) {
    if (!onReply) return;
    const t = e.touches[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    directionRef.current = 'unknown';
    setDragging(true);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchStartRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;

    if (directionRef.current === 'unknown') {
      if (Math.abs(dx) < DIRECTION_LOCK_DISTANCE && Math.abs(dy) < DIRECTION_LOCK_DISTANCE) return;
      directionRef.current = Math.abs(dy) > Math.abs(dx) * VERTICAL_BIAS ? 'vertical' : 'horizontal';
      if (directionRef.current === 'vertical') {
        touchStartRef.current = null;
        setDragging(false);
        setDragX(0);
        return;
      }
    }

    if (directionRef.current === 'horizontal') setDragX(Math.max(0, Math.min(dx, SWIPE_MAX)));
  }

  function handleTouchEnd() {
    if (!touchStartRef.current) return;
    touchStartRef.current = null;
    setDragging(false);
    if (dragX > SWIPE_TAP_TOLERANCE) suppressNextClickRef.current = true;
    if (dragX >= SWIPE_THRESHOLD) onReply?.();
    setDragX(0);
  }

  function handleBubbleClick() {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    onToggleActions();
  }

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={`relative flex gap-2.5 group ${isOwn ? 'flex-row-reverse' : ''}`}
      style={{
        transform: `translateX(${dragX}px)`,
        transition: dragging ? 'none' : 'transform 200ms ease',
        touchAction: 'pan-y',
      }}
    >
      {onReply && (
        <div
          className="absolute top-1/2 -translate-y-1/2 left-0 flex items-center justify-center rounded-full transition-opacity"
          style={{
            width: 28,
            height: 28,
            marginLeft: -36,
            background: 'var(--surface-2)',
            color: 'var(--brand)',
            opacity: dragX > 8 ? Math.min(dragX / SWIPE_THRESHOLD, 1) : 0,
          }}
          aria-hidden="true"
        >
          ↩
        </div>
      )}
      <div
        className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-sm"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      >
        {msg.author.avatarEmoji ?? '👤'}
      </div>
      <div
        onClick={handleBubbleClick}
        className={`flex-1 min-w-0 ${isOwn ? 'items-end' : 'items-start'} flex flex-col relative cursor-pointer ${hasReactions ? 'pb-3' : ''}`}
      >
        <div className={`flex items-baseline gap-2 mb-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
          <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
            {displayName(msg.author)}
          </span>
          {authorRole && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ ...(ROLE_STYLE[authorRole] ?? ROLE_STYLE['Server Admin']), lineHeight: 1.2 }}
            >
              {authorRole}
            </span>
          )}
          <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
            {formatTime(msg.createdAt)}
            {msg.editedAt ? ' (edited)' : ''}
          </span>
        </div>
        {/* Wraps the bubble + attachments (not the name/timestamp row above) so reactions can
            overlap the bottom corner of whichever is last, instead of taking a full row below -
            same "badge hangs off the message" pattern most chat apps use. */}
        <div className="relative">
        {(msg.content || msg.replyTo) && (
          <div
            className={`px-3 py-2 rounded-2xl text-sm max-w-[280px] ${isOwn ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
            style={{
              background: isOwn ? 'var(--brand)' : 'var(--surface-2)',
              color: isOwn ? 'white' : 'var(--text)',
              border: isOwn ? 'none' : '1px solid var(--border)',
              wordBreak: 'break-word',
            }}
          >
            {/* Quote block inside the bubble, clicking jumps to original (not the tap-for-actions
                toggle above - this is specifically about the quote, not the message itself) */}
            {msg.replyTo && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onScrollToReply?.(msg.replyTo!.id);
                }}
                className="w-full text-left mb-2 px-2 py-1.5 rounded-lg flex items-center gap-2"
                style={{
                  background: isOwn ? 'rgba(0,0,0,0.15)' : 'var(--surface)',
                  borderLeft: `3px solid ${isOwn ? 'rgba(255,255,255,0.5)' : 'var(--brand)'}`,
                }}
                title="Jump to original message"
              >
                {(() => {
                  const img = msg.replyTo!.attachments.find((a) => a.type?.startsWith('image/'));
                  return img ? (
                    <img
                      src={img.thumbnailUrl ?? img.url}
                      alt=""
                      className="w-8 h-8 rounded object-cover flex-shrink-0"
                    />
                  ) : null;
                })()}
                <div className="min-w-0">
                  <span
                    className="text-[10px] font-semibold block"
                    style={{ color: isOwn ? 'rgba(255,255,255,0.85)' : 'var(--brand)' }}
                  >
                    {displayName(msg.replyTo.author)}
                  </span>
                  <span
                    className="text-[10px] block truncate"
                    style={{ color: isOwn ? 'rgba(255,255,255,0.65)' : 'var(--text-3)', maxWidth: 220 }}
                  >
                    {msg.replyTo.content
                      ? msg.replyTo.content.slice(0, 120)
                      : msg.replyTo.attachments.length > 0
                        ? '📷 Photo'
                        : ''}
                  </span>
                </div>
              </button>
            )}
            {msg.content && renderContent(msg.content, isOwn)}
          </div>
        )}
        {msg.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {msg.attachments.map((att, i) =>
              att.type?.startsWith('image/') ? (
                <button key={i} onClick={() => onImageClick(att.url)} className="block">
                  <img
                    src={att.thumbnailUrl ?? att.url}
                    alt={att.name}
                    loading="lazy"
                    decoding="async"
                    className="rounded-lg object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
                    style={{ maxWidth: 200, maxHeight: 160 }}
                  />
                </button>
              ) : (
                <a
                  key={i}
                  href={att.url}
                  download={att.name}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs"
                  style={{ background: 'var(--surface-2)', color: 'var(--brand)', border: '1px solid var(--border)' }}
                >
                  📎 {att.name}
                </a>
              ),
            )}
          </div>
        )}

        {/* Reactions - overlap the bottom corner of the bubble/attachments above (like Messenger,
            WhatsApp, etc.) instead of taking a full row below, so a reacted-to message costs no
            extra vertical space beyond the badge peeking over the corner. Only rendered once at
            least one exists (adding a reaction is done from the action menu, not from here). */}
        {hasReactions && (
          <div className={`absolute -bottom-2.5 flex items-center gap-1 ${isOwn ? 'right-1' : 'left-1'}`}>
            {Object.entries(reactionGroups).map(([emoji, userIds]) => {
              const mine = currentUserId ? userIds.includes(currentUserId) : false;
              return (
                <button
                  key={emoji}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReact(emoji);
                  }}
                  title={userIds.length > 3 ? userIds.join(', ') : undefined}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs shadow-sm transition-colors"
                  style={{
                    background: mine ? 'var(--brand-subtle)' : 'var(--surface-2)',
                    border: `1px solid ${mine ? 'var(--brand)' : 'var(--border)'}`,
                    color: mine ? 'var(--brand)' : 'var(--text-2)',
                  }}
                >
                  {emoji} <span>{userIds.length}</span>
                </button>
              );
            })}
          </div>
        )}
        </div>

        {/* Emoji picker for reactions - fixed near the bottom of the viewport on mobile so it can
            never render off-screen regardless of which message it was opened from; anchored
            precisely next to the message bubble at md: and up. */}
        {reactionPickerOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={`fixed left-2 right-2 bottom-4 md:absolute md:left-auto md:right-auto md:bottom-full md:mb-0.5 z-50 p-2 rounded-xl shadow-xl ${
              isOwn ? 'md:right-0' : 'md:left-0'
            }`}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 28px)', gap: 2 }}>
              {EMOJI_SET.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    onReact(e);
                    onToggleReactionPicker();
                  }}
                  className="flex items-center justify-center rounded hover:bg-[--surface-2] transition-colors text-base"
                  style={{ width: 28, height: 28 }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message actions: reply, react, edit/delete (own only) - one menu, icon-only (Teams-style).
            Absolutely positioned (floats just above the whole message, like the reaction picker
            above) so it takes zero layout space when hidden - unlike the old in-flow opacity-0 row,
            which reserved height for every message regardless of whether it was ever revealed.
            Shown on desktop hover (group-hover) or tap-toggled via actionsOpen (touch devices have
            no real :hover state). Reply is hover-only (.hover-only, desktop mouse only) since touch
            devices use swipe-to-reply instead - showing it here too would just duplicate that. */}
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute bottom-full mb-1 flex gap-0.5 p-1 rounded-lg shadow-lg transition-opacity z-10 ${
            isOwn ? 'right-0 flex-row-reverse' : 'left-0'
          } ${actionsOpen ? 'opacity-100' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'}`}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {onReply && (
            <button
              onClick={onReply}
              title="Reply"
              aria-label="Reply"
              className="hover-only items-center justify-center w-7 h-7 rounded text-sm"
              style={{ color: 'var(--text-3)' }}
            >
              ↩
            </button>
          )}
          <button
            onClick={onToggleReactionPicker}
            title="React"
            aria-label="React"
            className="flex items-center justify-center w-7 h-7 rounded text-sm"
            style={{ color: 'var(--text-3)' }}
          >
            😊
          </button>
          {isOwn && canEdit && (
            <button
              onClick={onEdit}
              title="Edit"
              aria-label="Edit"
              className="flex items-center justify-center w-7 h-7 rounded text-sm"
              style={{ color: 'var(--text-3)' }}
            >
              ✎
            </button>
          )}
          {isOwn && (
            <button
              onClick={onDelete}
              title="Delete"
              aria-label="Delete"
              className="flex items-center justify-center w-7 h-7 rounded text-sm"
              style={{ color: '#ef4444' }}
            >
              🗑
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
