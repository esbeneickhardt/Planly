/**
 * ChatPanel's Files tab: an image grid + document list built from every attachment across the
 * currently-displayed messages. Split out of ChatPanel.tsx (which still owns deriving the flattened
 * `attachments` list via its `allAttachments` useMemo) since, unlike the People/Groups/Projects
 * tabs, this view needs nothing from the shared compose bar or message-list renderer - just the
 * attachment list itself, the in-flight delete url, and two callbacks.
 */
import type { Message } from '../../api/client';
import { displayName } from '../../api/client';
import { formatTime } from './MessageBubble';
import PdfPreview from './PdfPreview';

interface Props {
  attachments: { att: Message['attachments'][number]; msg: Message }[];
  /** URL of the attachment currently being deleted, if any - disables its own delete button only. */
  deletingFile: string | null;
  onDeleteFile: (url: string) => void;
  onImageClick: (url: string) => void;
}

export default function ChatFilesTab({ attachments, deletingFile, onDeleteFile, onImageClick }: Props) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {attachments.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 gap-2" style={{ color: 'var(--text-3)' }}>
          <span className="text-3xl opacity-30">📎</span>
          <p className="text-sm">No attachments yet.</p>
        </div>
      ) : (
        (() => {
          const images = attachments.filter((x) => x.att.type?.startsWith('image/'));
          const docs = attachments.filter((x) => !x.att.type?.startsWith('image/'));
          return (
            <div className="space-y-4">
              {images.length > 0 && (
                <div>
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--text-3)' }}
                  >
                    Images ({images.length})
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {images.map(({ att, msg }, i) => (
                      <div key={i} className="relative group/img aspect-square">
                        <button
                          type="button"
                          className="contents"
                          onClick={() => onImageClick(att.url)}
                          aria-label={`View ${att.name}`}
                        >
                          <img
                            src={att.thumbnailUrl ?? att.url}
                            alt={att.name}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover rounded-lg cursor-zoom-in"
                          />
                        </button>
                        <div
                          className="absolute inset-0 rounded-lg flex flex-col items-center justify-center gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-none"
                          style={{ background: 'rgba(0,0,0,0.55)' }}
                        >
                          <span
                            className="text-white text-[10px] px-2 py-1 rounded font-medium"
                            style={{ background: 'rgba(255,255,255,0.15)' }}
                          >
                            Click to view
                          </span>
                          <a
                            href={att.url}
                            download={att.name}
                            onClick={(e) => e.stopPropagation()}
                            className="text-white text-[10px] px-2 py-1 rounded font-medium pointer-events-auto"
                            style={{ background: 'rgba(255,255,255,0.15)' }}
                          >
                            Download
                          </a>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteFile(att.url);
                          }}
                          disabled={deletingFile === att.url}
                          title="Delete file"
                          className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-auto"
                          style={{
                            background: 'rgba(239,68,68,0.9)',
                            color: 'white',
                          }}
                        >
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 10 10"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          >
                            <line x1="2" y1="2" x2="8" y2="8" />
                            <line x1="8" y1="2" x2="2" y2="8" />
                          </svg>
                        </button>
                        <div className="absolute bottom-1 left-1 right-1 text-[9px] truncate text-white opacity-0 group-hover/img:opacity-70 px-1">
                          {formatTime(msg.createdAt)} · {displayName(msg.author)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {docs.length > 0 && (
                <div>
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--text-3)' }}
                  >
                    Documents ({docs.length})
                  </p>
                  <div className="space-y-1.5">
                    {docs.map(({ att, msg }, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg group/doc"
                        style={{
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <span className="text-lg flex-shrink-0">{att.type === 'application/pdf' ? '📄' : '📁'}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                            {att.name}
                          </p>
                          <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                            {displayName(msg.author)} · {formatTime(msg.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 opacity-0 group-hover/doc:opacity-100 transition-opacity flex-shrink-0">
                          {att.type === 'application/pdf' && <PdfPreview url={att.url} name={att.name} />}
                          <a
                            href={att.url}
                            download={att.name}
                            className="text-xs px-2 py-1 rounded-lg"
                            style={{
                              background: 'var(--brand-subtle)',
                              color: 'var(--brand)',
                            }}
                          >
                            ↓
                          </a>
                          <button
                            onClick={() => onDeleteFile(att.url)}
                            disabled={deletingFile === att.url}
                            title="Delete file"
                            className="text-xs px-2 py-1 rounded-lg transition-colors"
                            style={{
                              background: 'rgba(239,68,68,0.1)',
                              color: '#ef4444',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.2)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                          >
                            {deletingFile === att.url ? '…' : '🗑'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()
      )}
    </div>
  );
}
