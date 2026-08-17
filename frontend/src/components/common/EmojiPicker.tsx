/**
 * Categorized emoji grid with a swipeable (touch) or arrow-button (desktop) category pager.
 * `EMOJI_CATEGORIES` is exported so `MarkdownEditor.tsx` can render the same category/emoji set
 * in its own toolbar picker without duplicating the list.
 * A vertical scroll/tap is distinguished from a horizontal category swipe via a direction lock,
 * the same pattern used elsewhere in the app for touch gestures (e.g. MessageBubble.tsx's swipe-to-reply).
 */
import { useRef, useState } from 'react';

export const EMOJI_CATEGORIES = [
  {
    label: 'Smileys',
    emojis: [
      '😀',
      '😃',
      '😄',
      '😁',
      '😆',
      '😊',
      '🙂',
      '😎',
      '🥰',
      '😍',
      '🤩',
      '😇',
      '🤗',
      '😌',
      '😉',
      '🫡',
      '😏',
      '🤓',
      '🧐',
      '🥸',
      '🤠',
      '😤',
      '🫠',
      '🤫',
      '😂',
      '🤣',
      '😅',
      '😬',
      '🥹',
      '😔',
      '🙄',
      '😳',
      '🤯',
      '😱',
      '🥶',
      '🥵',
      '😴',
      '🤒',
      '🤑',
      '🤡',
      '👻',
      '💀',
      '☠️',
      '🎭',
    ],
  },
  {
    label: 'People',
    emojis: [
      '👶',
      '🧒',
      '👦',
      '👧',
      '🧑',
      '👩',
      '👨',
      '🧓',
      '🧑‍💻',
      '🧑‍🎨',
      '🧑‍🏫',
      '🧑‍🍳',
      '🧑‍🔧',
      '🧑‍🚀',
      '🧑‍⚕️',
      '🧑‍🎤',
      '🧙',
      '🦸',
      '🦹',
      '🥷',
      '🧛',
      '🧜',
      '🧝',
      '🤖',
      '👽',
      '🫂',
      '👍',
      '👎',
      '👌',
      '✌️',
      '🤞',
      '🤙',
      '👋',
      '🤝',
      '🙏',
      '👏',
      '🫶',
      '❤️',
      '🧠',
      '💪',
    ],
  },
  {
    label: 'Animals',
    emojis: [
      '🐱',
      '🐶',
      '🐭',
      '🐹',
      '🐰',
      '🦊',
      '🐻',
      '🐼',
      '🐨',
      '🐯',
      '🦁',
      '🐮',
      '🐷',
      '🐸',
      '🐵',
      '🐔',
      '🐧',
      '🐦',
      '🦆',
      '🦅',
      '🦉',
      '🦇',
      '🐝',
      '🦋',
      '🐢',
      '🦎',
      '🐍',
      '🐠',
      '🐬',
      '🐳',
      '🦈',
      '🦑',
      '🦀',
      '🦞',
      '🐙',
      '🦭',
      '🦓',
      '🦒',
      '🐘',
      '🦏',
    ],
  },
  {
    label: 'Nature',
    emojis: [
      '🌸',
      '🌺',
      '🌻',
      '🌹',
      '🌷',
      '🍀',
      '🌿',
      '🌱',
      '🎋',
      '🍄',
      '🌊',
      '🔥',
      '⚡',
      '❄️',
      '🌈',
      '⭐',
      '🌟',
      '💫',
      '✨',
      '🌙',
      '☀️',
      '🌤️',
      '⛅',
      '🌍',
      '🌋',
      '🏔️',
      '🌲',
      '🌴',
      '🌵',
      '🪸',
      '🌾',
      '🍁',
      '🍂',
      '🪨',
      '💎',
      '🌠',
      '☄️',
      '🌀',
      '🌡️',
      '🌊',
    ],
  },
  {
    label: 'Food & Fun',
    emojis: [
      '🍕',
      '🍔',
      '🌮',
      '🍜',
      '🍣',
      '🍱',
      '🍩',
      '🎂',
      '🍦',
      '🍺',
      '☕',
      '🧃',
      '⚽',
      '🏀',
      '🎮',
      '🎲',
      '🎯',
      '🎸',
      '🎹',
      '🎺',
      '🎻',
      '🥁',
      '🎤',
      '🎬',
      '🏆',
      '🥇',
      '🎖️',
      '🏅',
      '🎪',
      '🎨',
      '🖌️',
      '✏️',
      '🎠',
      '🎡',
      '🎢',
      '🎭',
      '🎉',
      '🎊',
      '🪄',
      '🎁',
    ],
  },
  {
    label: 'Objects',
    emojis: [
      '💡',
      '🔑',
      '🗝️',
      '🔒',
      '🔓',
      '💰',
      '📱',
      '💻',
      '🖥️',
      '⌨️',
      '📚',
      '📖',
      '📝',
      '✉️',
      '📦',
      '🛠️',
      '⚙️',
      '🔭',
      '🔬',
      '🧪',
      '🧲',
      '🚀',
      '✈️',
      '🚗',
      '🚂',
      '⛵',
      '🏠',
      '🏰',
      '🌆',
      '🗺️',
      '🧭',
      '📡',
      '🔮',
      '🪙',
      '📊',
      '📈',
      '🗂️',
      '📋',
      '📌',
      '⚠️',
    ],
  },
];

interface Props {
  value?: string;
  onChange: (emoji: string) => void;
}

// Swipe-to-change-page tuning (mirrors the drag-with-live-feedback-then-snap pattern used
// elsewhere for touch gestures in this app, e.g. MessageBubble.tsx's swipe-to-reply).
const SWIPE_THRESHOLD = 40;

export default function EmojiPicker({ value, onChange }: Props) {
  const [page, setPage] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const horizontalRef = useRef(false);
  const category = EMOJI_CATEGORIES[page];

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    horizontalRef.current = false;
    setDragging(true);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchStartRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    // Lock to horizontal only once movement is clearly sideways, so a vertical scroll/tap on the
    // grid doesn't get misread as a page swipe (same direction-lock idea as the message swipe).
    if (!horizontalRef.current) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      horizontalRef.current = Math.abs(dx) > Math.abs(dy);
      if (!horizontalRef.current) return;
    }
    e.preventDefault();
    // Rubber-band at the first/last page instead of dragging past where there's nothing to reveal.
    const atStart = page === 0 && dx > 0;
    const atEnd = page === EMOJI_CATEGORIES.length - 1 && dx < 0;
    setDragX(atStart || atEnd ? dx / 3 : dx);
  }

  function handleTouchEnd() {
    if (!touchStartRef.current) return;
    touchStartRef.current = null;
    setDragging(false);
    if (horizontalRef.current) {
      if (dragX <= -SWIPE_THRESHOLD) setPage((p) => Math.min(EMOJI_CATEGORIES.length - 1, p + 1));
      else if (dragX >= SWIPE_THRESHOLD) setPage((p) => Math.max(0, p - 1));
    }
    setDragX(0);
  }

  if (!category) return null;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        border: '1px solid var(--border)',
        background: 'var(--surface-2)',
      }}
    >
      {/* Category header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
      >
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="w-6 h-6 flex items-center justify-center rounded-md text-sm transition-colors disabled:opacity-30"
          style={{ color: 'var(--text-3)' }}
        >
          ‹
        </button>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
          {category.label}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(EMOJI_CATEGORIES.length - 1, p + 1))}
          disabled={page === EMOJI_CATEGORIES.length - 1}
          className="w-6 h-6 flex items-center justify-center rounded-md text-sm transition-colors disabled:opacity-30"
          style={{ color: 'var(--text-3)' }}
        >
          ›
        </button>
      </div>

      {/* Emoji grid - swipeable on touch devices to move between pages, like the app's other
          emoji pickers. */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className="grid grid-cols-8 gap-0.5 p-2"
        style={{
          touchAction: 'pan-y',
          transform: dragX ? `translateX(${dragX}px)` : undefined,
          transition: dragging ? 'none' : 'transform 200ms ease',
        }}
      >
        {category.emojis.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onChange(e)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-lg transition-all hover:scale-110"
            style={{
              background: value === e ? 'var(--brand-subtle)' : 'transparent',
              boxShadow: value === e ? '0 0 0 2px var(--brand)' : 'none',
            }}
          >
            {e}
          </button>
        ))}
      </div>

      {/* Page dots */}
      <div className="flex justify-center gap-1 pb-2">
        {EMOJI_CATEGORIES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setPage(i)}
            className="rounded-full transition-all"
            style={{
              width: i === page ? 16 : 5,
              height: 5,
              background: i === page ? 'var(--brand)' : 'var(--border)',
            }}
          />
        ))}
      </div>
    </div>
  );
}
