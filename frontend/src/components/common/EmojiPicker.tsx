import { useState } from 'react';

export const EMOJI_CATEGORIES = [
  {
    label: 'Smileys',
    emojis: [
      '😀','😃','😄','😁','😆','😊','🙂','😎',
      '🥰','😍','🤩','😇','🤗','😌','😉','🫡',
      '😏','🤓','🧐','🥸','🤠','😤','🫠','🤫',
      '😂','🤣','😅','😬','🥹','😔','🙄','😳',
      '🤯','😱','🥶','🥵','😴','🤒','🤑','🤡',
      '👻','💀','☠️','🎭',
    ],
  },
  {
    label: 'People',
    emojis: [
      '👶','🧒','👦','👧','🧑','👩','👨','🧓',
      '🧑‍💻','🧑‍🎨','🧑‍🏫','🧑‍🍳','🧑‍🔧','🧑‍🚀','🧑‍⚕️','🧑‍🎤',
      '🧙','🦸','🦹','🥷','🧛','🧜','🧝','🤖',
      '👽','🫂','👍','👎','👌','✌️','🤞','🤙',
      '👋','🤝','🙏','👏','🫶','❤️','🧠','💪',
    ],
  },
  {
    label: 'Animals',
    emojis: [
      '🐱','🐶','🐭','🐹','🐰','🦊','🐻','🐼',
      '🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔',
      '🐧','🐦','🦆','🦅','🦉','🦇','🐝','🦋',
      '🐢','🦎','🐍','🐠','🐬','🐳','🦈','🦑',
      '🦀','🦞','🐙','🦭','🦓','🦒','🐘','🦏',
    ],
  },
  {
    label: 'Nature',
    emojis: [
      '🌸','🌺','🌻','🌹','🌷','🍀','🌿','🌱',
      '🎋','🍄','🌊','🔥','⚡','❄️','🌈','⭐',
      '🌟','💫','✨','🌙','☀️','🌤️','⛅','🌍',
      '🌋','🏔️','🌲','🌴','🌵','🪸','🌾','🍁',
      '🍂','🪨','💎','🌠','☄️','🌀','🌡️','🌊',
    ],
  },
  {
    label: 'Food & Fun',
    emojis: [
      '🍕','🍔','🌮','🍜','🍣','🍱','🍩','🎂',
      '🍦','🍺','☕','🧃','⚽','🏀','🎮','🎲',
      '🎯','🎸','🎹','🎺','🎻','🥁','🎤','🎬',
      '🏆','🥇','🎖️','🏅','🎪','🎨','🖌️','✏️',
      '🎠','🎡','🎢','🎭','🎉','🎊','🪄','🎁',
    ],
  },
  {
    label: 'Objects',
    emojis: [
      '💡','🔑','🗝️','🔒','🔓','💰','📱','💻',
      '🖥️','⌨️','📚','📖','📝','✉️','📦','🛠️',
      '⚙️','🔭','🔬','🧪','🧲','🚀','✈️','🚗',
      '🚂','⛵','🏠','🏰','🌆','🗺️','🧭','📡',
      '🔮','🪙','📊','📈','🗂️','📋','📌','⚠️',
    ],
  },
];

interface Props {
  value?: string;
  onChange: (emoji: string) => void;
}

export default function EmojiPicker({ value, onChange }: Props) {
  const [page, setPage] = useState(0);
  const category = EMOJI_CATEGORIES[page];
  if (!category) return null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
      {/* Category header */}
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="w-6 h-6 flex items-center justify-center rounded-md text-sm transition-colors disabled:opacity-30"
          style={{ color: 'var(--text-3)' }}
        >‹</button>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>{category.label}</span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(EMOJI_CATEGORIES.length - 1, p + 1))}
          disabled={page === EMOJI_CATEGORIES.length - 1}
          className="w-6 h-6 flex items-center justify-center rounded-md text-sm transition-colors disabled:opacity-30"
          style={{ color: 'var(--text-3)' }}
        >›</button>
      </div>

      {/* Emoji grid */}
      <div className="grid grid-cols-8 gap-0.5 p-2">
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
          >{e}</button>
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
