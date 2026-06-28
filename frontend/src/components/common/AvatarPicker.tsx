import { useRef, useState, useEffect } from 'react';

const EMOJIS = [
  '😀','😃','😄','😁','😆','😊','🙂','😎',
  '🥰','😍','🤩','😇','🤗','😌','😉','🫡',
  '😏','🤓','🧐','🥸','🤠','😤','🫠','🤫',
  '👶','🧒','👦','👧','🧑','👩','👨','🧓',
  '🧑‍💻','🧙','🦸','🥷','🤖','👽','🎭','🫂',
  '🐱','🐶','🐭','🐻','🐼','🦊','🐯','🦁',
  '🌟','⭐','🌈','🔥','⚡','🎯','💫','🎪',
];

const PREVIEW = 200; // px — the crop circle diameter

interface Value { avatarEmoji?: string; avatarUrl?: string | null; }
interface Props {
  current: Value;
  onChange: (v: Value) => void;
}

export default function AvatarPicker({ current, onChange }: Props) {
  const [tab, setTab] = useState<'emoji' | 'photo'>('emoji');
  const [preview, setPreview] = useState<string | null>(current.avatarUrl ?? null);
  const currentEmoji = current.avatarEmoji;
  const fileRef = useRef<HTMLInputElement>(null);

  // Crop editor state
  const [cropImg, setCropImg] = useState<HTMLImageElement | null>(null);
  const [cropObjectUrl, setCropObjectUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  // Rendered scale of the image inside the PREVIEW circle
  const scale = cropImg
    ? (PREVIEW / Math.min(cropImg.naturalWidth, cropImg.naturalHeight)) * zoom
    : 1;

  // Clamp offset so image always covers the circle
  function clamp(ox: number, oy: number, img: HTMLImageElement, s: number) {
    const hw = (img.naturalWidth * s) / 2;
    const hh = (img.naturalHeight * s) / 2;
    const half = PREVIEW / 2;
    return {
      x: Math.min(hw - half, Math.max(-(hw - half), ox)),
      y: Math.min(hh - half, Math.max(-(hh - half), oy)),
    };
  }

  // Pointer drag handlers
  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
    setDragging(true);
  }

  useEffect(() => {
    if (!dragging || !cropImg) return;
    function onMove(e: PointerEvent) {
      if (!dragRef.current || !cropImg) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setOffset(clamp(dragRef.current.ox + dx, dragRef.current.oy + dy, cropImg, scale));
    }
    function onUp() { setDragging(false); }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, cropImg, scale]);

  // Re-clamp when zoom changes
  useEffect(() => {
    if (cropImg) setOffset((o) => clamp(o.x, o.y, cropImg, scale));
  }, [zoom]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (cropObjectUrl) URL.revokeObjectURL(cropObjectUrl);
      setCropObjectUrl(url);
      setCropImg(img);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.src = url;
    if (fileRef.current) fileRef.current.value = '';
  }

  function applyAndConfirm() {
    if (!cropImg) return;
    const canvas = document.createElement('canvas');
    const OUT = 128;
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(OUT / 2, OUT / 2, OUT / 2, 0, Math.PI * 2);
    ctx.clip();

    // Map from canvas (128×128) back to source image coords
    // Preview center of image = (PREVIEW/2 + offset.x, PREVIEW/2 + offset.y)
    const cx = PREVIEW / 2 + offset.x;
    const cy = PREVIEW / 2 + offset.y;
    // At preview pixel (0,0): source pixel = (imgW/2 - cx/scale, imgH/2 - cy/scale)
    const sx = cropImg.naturalWidth / 2 - cx / scale;
    const sy = cropImg.naturalHeight / 2 - cy / scale;
    const sw = PREVIEW / scale;
    const sh = PREVIEW / scale;
    ctx.drawImage(cropImg, sx, sy, sw, sh, 0, 0, OUT, OUT);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    onChange({ avatarUrl: dataUrl, avatarEmoji: undefined });
    setPreview(dataUrl);
    setCropImg(null);
    if (cropObjectUrl) { URL.revokeObjectURL(cropObjectUrl); setCropObjectUrl(null); }
  }

  function cancelCrop() {
    setCropImg(null);
    if (cropObjectUrl) { URL.revokeObjectURL(cropObjectUrl); setCropObjectUrl(null); }
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
              onClick={() => onChange({ avatarEmoji: e, avatarUrl: null })}
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
          {cropImg ? (
            /* ── Crop editor ── */
            <>
              <p className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Drag to reposition · scroll or use slider to zoom</p>

              {/* Crop circle */}
              <div
                style={{
                  width: PREVIEW, height: PREVIEW,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  position: 'relative',
                  cursor: dragging ? 'grabbing' : 'grab',
                  border: '2px solid var(--brand)',
                  flexShrink: 0,
                  userSelect: 'none',
                }}
                onPointerDown={onPointerDown}
                onWheel={(e) => {
                  e.preventDefault();
                  setZoom((z) => Math.min(4, Math.max(1, z - e.deltaY * 0.002)));
                }}
              >
                <img
                  src={cropObjectUrl!}
                  alt=""
                  draggable={false}
                  style={{
                    position: 'absolute',
                    width: cropImg.naturalWidth * scale,
                    height: cropImg.naturalHeight * scale,
                    left: PREVIEW / 2 + offset.x - (cropImg.naturalWidth * scale) / 2,
                    top: PREVIEW / 2 + offset.y - (cropImg.naturalHeight * scale) / 2,
                    pointerEvents: 'none',
                  }}
                />
              </div>

              {/* Zoom slider */}
              <div className="w-full flex items-center gap-3">
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>1×</span>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="flex-1 accent-[var(--brand)]"
                />
                <span className="text-xs w-8 text-right" style={{ color: 'var(--text-3)' }}>{zoom.toFixed(1)}×</span>
              </div>

              <div className="flex gap-2 w-full">
                <button type="button" onClick={cancelCrop} className="btn-secondary text-xs flex-1">Cancel</button>
                <button type="button" onClick={applyAndConfirm} className="btn-primary text-xs flex-1">Apply</button>
              </div>
            </>
          ) : (
            /* ── Upload / preview ── */
            <>
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
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>
      )}
    </div>
  );
}
