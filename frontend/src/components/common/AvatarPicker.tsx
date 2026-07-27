import { useRef, useState, useEffect } from 'react';
import { EMOJI_CATEGORIES } from './EmojiPicker';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';

// ── EXIF orientation normalizer ───────────────────────────────────────────────

async function readJpegOrientation(file: File): Promise<number> {
  try {
    const buf = await file.slice(0, 65536).arrayBuffer();
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0, false) !== 0xffd8) return 1;
    let off = 2;
    while (off + 4 <= v.byteLength) {
      const marker = v.getUint16(off, false);
      if (marker === 0xffda) break;
      const segLen = v.getUint16(off + 2, false);
      if (marker === 0xffe1 && segLen > 10 && off + 4 + segLen <= v.byteLength) {
        if (v.getUint32(off + 4, false) === 0x45786966) {
          const tiff = off + 10;
          if (tiff + 8 > v.byteLength) break;
          const le = v.getUint16(tiff, false) === 0x4949;
          const ifdOff = v.getUint32(tiff + 4, le);
          const ifd = tiff + ifdOff;
          if (ifd + 2 > v.byteLength) break;
          const count = v.getUint16(ifd, le);
          for (let i = 0; i < count; i++) {
            const e = ifd + 2 + i * 12;
            if (e + 12 > v.byteLength) break;
            if (v.getUint16(e, le) === 0x0112) return v.getUint16(e + 8, le);
          }
        }
      }
      if (segLen < 2) break;
      off += 2 + segLen;
    }
  } catch {}
  return 1;
}

// Returns a blob URL of the image with EXIF rotation baked in as pixel data.
async function normalizeImageOrientation(file: File): Promise<{ url: string; img: HTMLImageElement }> {
  const rawUrl = URL.createObjectURL(file);
  const raw = await new Promise<HTMLImageElement>((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.src = rawUrl;
  });

  const orientation = await readJpegOrientation(file);

  if (orientation <= 1) {
    // No rotation needed - use original
    return { url: rawUrl, img: raw };
  }

  URL.revokeObjectURL(rawUrl);

  const sw = raw.naturalWidth;
  const sh = raw.naturalHeight;
  const swap = orientation >= 5; // 90° or 270° rotation swaps width/height
  const cw = swap ? sh : sw;
  const ch = swap ? sw : sh;

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;

  // Apply the EXIF-specified transform before drawing
  switch (orientation) {
    case 2:
      ctx.transform(-1, 0, 0, 1, sw, 0);
      break;
    case 3:
      ctx.transform(-1, 0, 0, -1, sw, sh);
      break;
    case 4:
      ctx.transform(1, 0, 0, -1, 0, sh);
      break;
    case 5:
      ctx.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      ctx.transform(0, 1, -1, 0, sh, 0);
      break;
    case 7:
      ctx.transform(0, -1, -1, 0, sh, sw);
      break;
    case 8:
      ctx.transform(0, -1, 1, 0, 0, sw);
      break;
  }
  ctx.drawImage(raw, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('toBlob failed'));
          return;
        }
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => resolve({ url, img });
        img.src = url;
      },
      'image/jpeg',
      0.92,
    );
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

const PREVIEW = 200; // px - the crop circle diameter

interface Value {
  avatarEmoji?: string;
  avatarUrl?: string | null;
}
interface Props {
  current: Value;
  onChange: (v: Value) => void;
}

export default function AvatarPicker({ current, onChange }: Props) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'emoji' | 'photo'>('emoji');
  const [emojiPage, setEmojiPage] = useState(0);
  const [preview, setPreview] = useState<string | null>(current.avatarUrl ?? null);
  const [uploading, setUploading] = useState(false);
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
  const scale = cropImg ? (PREVIEW / Math.min(cropImg.naturalWidth, cropImg.naturalHeight)) * zoom : 1;

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
    function onUp() {
      setDragging(false);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, cropImg, scale]);

  useEffect(() => {
    if (cropImg) setOffset((o) => clamp(o.x, o.y, cropImg, scale));
  }, [zoom]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';

    try {
      const { url, img } = await normalizeImageOrientation(file);
      if (cropObjectUrl) URL.revokeObjectURL(cropObjectUrl);
      setCropObjectUrl(url);
      setCropImg(img);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    } catch {
      // Fallback: load directly without normalization
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
    }
  }

  async function applyAndConfirm() {
    if (!cropImg || uploading) return;
    const canvas = document.createElement('canvas');
    const OUT = 128;
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(OUT / 2, OUT / 2, OUT / 2, 0, Math.PI * 2);
    ctx.clip();

    const cx = PREVIEW / 2 + offset.x;
    const cy = PREVIEW / 2 + offset.y;
    const sx = cropImg.naturalWidth / 2 - cx / scale;
    const sy = cropImg.naturalHeight / 2 - cy / scale;
    const sw = PREVIEW / scale;
    const sh = PREVIEW / scale;
    ctx.drawImage(cropImg, sx, sy, sw, sh, 0, 0, OUT, OUT);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob) {
      showToast('Could not process image', 'error');
      return;
    }

    setUploading(true);
    try {
      const { url } = await api.upload(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
      onChange({ avatarUrl: url, avatarEmoji: undefined });
      setPreview(url);
      setCropImg(null);
      if (cropObjectUrl) {
        URL.revokeObjectURL(cropObjectUrl);
        setCropObjectUrl(null);
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setUploading(false);
    }
  }

  function cancelCrop() {
    setCropImg(null);
    if (cropObjectUrl) {
      URL.revokeObjectURL(cropObjectUrl);
      setCropObjectUrl(null);
    }
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
    >
      {label}
    </button>
  );

  const category = EMOJI_CATEGORIES[emojiPage];
  if (!category) return null;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border)', background: 'var(--surface-2)' }}
    >
      {/* Tabs */}
      <div className="flex gap-1 p-1" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {tabBtn('emoji', 'Emoji')}
        {tabBtn('photo', 'Photo')}
      </div>

      {tab === 'emoji' && (
        <div>
          {/* Category header with prev/next arrows */}
          <div
            className="flex items-center justify-between px-3 py-2"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <button
              type="button"
              onClick={() => setEmojiPage((p) => Math.max(0, p - 1))}
              disabled={emojiPage === 0}
              className="w-6 h-6 flex items-center justify-center rounded-md text-sm transition-colors disabled:opacity-30"
              style={{ color: 'var(--text-3)', background: 'var(--surface)' }}
            >
              ‹
            </button>
            <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
              {category.label}
            </span>
            <button
              type="button"
              onClick={() => setEmojiPage((p) => Math.min(EMOJI_CATEGORIES.length - 1, p + 1))}
              disabled={emojiPage === EMOJI_CATEGORIES.length - 1}
              className="w-6 h-6 flex items-center justify-center rounded-md text-sm transition-colors disabled:opacity-30"
              style={{ color: 'var(--text-3)', background: 'var(--surface)' }}
            >
              ›
            </button>
          </div>

          {/* Emoji grid */}
          <div className="grid grid-cols-8 gap-0.5 p-2">
            {category.emojis.map((e) => (
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
                onClick={() => setEmojiPage(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === emojiPage ? 16 : 5,
                  height: 5,
                  background: i === emojiPage ? 'var(--brand)' : 'var(--border)',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {tab === 'photo' && (
        <div className="flex flex-col items-center gap-3 p-4">
          {cropImg ? (
            <>
              <p className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                Drag to reposition · scroll or use slider to zoom
              </p>

              {/* Crop circle */}
              <div
                style={{
                  width: PREVIEW,
                  height: PREVIEW,
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
                    maxWidth: 'none',
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
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                  1×
                </span>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="flex-1 accent-[var(--brand)]"
                />
                <span className="text-xs w-8 text-right" style={{ color: 'var(--text-3)' }}>
                  {zoom.toFixed(1)}×
                </span>
              </div>

              <div className="flex gap-2 w-full">
                <button type="button" onClick={cancelCrop} disabled={uploading} className="btn-secondary text-xs flex-1">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyAndConfirm}
                  disabled={uploading}
                  className="btn-primary text-xs flex-1 disabled:opacity-60"
                >
                  {uploading ? 'Uploading…' : 'Apply'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div
                className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center text-4xl cursor-pointer relative group"
                style={{ background: 'var(--surface)', border: '2px dashed var(--border)' }}
                onClick={() => fileRef.current?.click()}
              >
                {preview ? (
                  <img src={preview} className="w-full h-full object-cover" alt="avatar" />
                ) : (
                  <span style={{ opacity: 0.3 }}>👤</span>
                )}
                <div
                  className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium"
                  style={{ background: 'rgba(0,0,0,0.45)' }}
                >
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
