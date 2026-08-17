/**
 * Full-screen image viewer opened by clicking an attachment thumbnail in the message list or the
 * Files tab. Backdrop click and the ✕ button both dismiss; the download link stops propagation so
 * it doesn't also trigger the backdrop's dismiss-on-click.
 */
interface Props {
  url: string;
  onClose: () => void;
}

export default function ChatLightbox({ url, onClose }: Props) {
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- mouse-only backdrop dismiss; the ✕ button below is the keyboard-accessible equivalent
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white text-xl font-bold transition-colors"
        style={{ background: 'rgba(255,255,255,0.15)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.3)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
      >
        ✕
      </button>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- stopPropagation-only guard against the backdrop's dismiss-on-click */}
      <img
        src={url}
        alt=""
        className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <a
        href={url}
        download
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-6 text-white text-sm px-4 py-2 rounded-xl font-medium transition-colors"
        style={{ background: 'rgba(255,255,255,0.15)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
      >
        ↓ Download
      </a>
    </div>
  );
}
