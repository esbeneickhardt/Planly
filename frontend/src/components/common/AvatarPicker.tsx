import { useRef, useState } from 'react';

const EMOJIS = [
  '😀','😃','😄','😁','😆','😊','🙂','😎',
  '🥰','😍','🤩','😇','🤗','😌','😉','🫡',
  '😏','🤓','🧐','🥸','🤠','😤','🫠','🤫',
  '👶','🧒','👦','👧','🧑','👩','👨','🧓',
  '🧑‍💻','🧙','🦸','🥷','🤖','👽','🎭','🫂',
  '🐱','🐶','🐭','🐻','🐼','🦊','🐯','🦁',
  '🌟','⭐','🌈','🔥','⚡','🎯','💫','🎪',
];

interface Value { avatarEmoji?: string; avatarUrl?: string | null; }
interface Props {
  current: Value;
  onChange: (v: Value) => void;
}

function resizeToDataUrl(file: File, size = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        // Centre-crop to square
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function AvatarPicker({ current, onChange }: Props) {
  const [tab, setTab] = useState<'emoji' | 'photo'>('emoji');
  const [preview, setPreview] = useState<string | null>(current.avatarUrl ?? null);
  const currentEmoji = current.avatarEmoji;
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await resizeToDataUrl(file);
    setPreview(url);
    onChange({ avatarUrl: url, avatarEmoji: undefined });
  }

  function selectEmoji(emoji: string) {
    onChange({ avatarEmoji: emoji, avatarUrl: null });
  }

  function removePhoto() {
    setPreview(null);
    onChange({ avatarUrl: null });
    if (fileRef.current) fileRef.current.value = '';
  }

  const tabBtn = (t: typeof tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(t)}
      className="flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors"
      style={{
        background: tab === t ? 'var(--brand)' : 'transparent',
        color: tab === t ? 'white' : 'var(--text-3)',
      }}
    >{label}</button>
  );

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
      {/* Tabs */}
      <div className="flex gap-1 p-1" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {tabBtn('emoji', 'Emoji')}
        {tabBtn('photo', 'Photo')}
      </div>

      {tab === 'emoji' && (
        <div className="grid grid-cols-8 gap-0.5 p-2">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => selectEmoji(e)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-lg transition-all hover:scale-110"
              style={{
                background: currentEmoji === e ? 'var(--brand-subtle)' : 'transparent',
                boxShadow: currentEmoji === e ? `0 0 0 2px var(--brand)` : 'none',
              }}
              title={e}
            >{e}</button>
          ))}
        </div>
      )}

      {tab === 'photo' && (
        <div className="flex flex-col items-center gap-3 p-4">
          {/* Preview */}
          <div
            className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center text-4xl cursor-pointer relative group"
            style={{ background: 'var(--surface)', border: '2px dashed var(--border)' }}
            onClick={() => fileRef.current?.click()}
          >
            {preview
              ? <img src={preview} className="w-full h-full object-cover" alt="avatar" />
              : <span style={{ opacity: 0.3 }}>👤</span>
            }
            <div className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium" style={{ background: 'rgba(0,0,0,0.45)' }}>
              {preview ? 'Change' : 'Upload'}
            </div>
          </div>

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            {preview ? 'Change photo' : 'Upload photo'}
          </button>

          {preview && (
            <button
              type="button"
              onClick={removePhoto}
              className="text-xs transition-colors"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
            >
              Remove photo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
