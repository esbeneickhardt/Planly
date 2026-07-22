import { useState } from 'react';

interface Props {
  url: string;
  name: string;
}

export default function PdfPreview({ url, name }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
        style={{ background: 'var(--brand-subtle)', color: 'var(--brand)', border: '1px solid var(--border)' }}
        title={`Preview ${name}`}
      >
        👁 Preview
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="relative flex flex-col rounded-xl overflow-hidden"
            style={{
              width: '90vw',
              height: '90vh',
              maxWidth: 900,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-4 py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                📄 {name}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={url}
                  download={name}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
                >
                  ↓ Download
                </a>
                <button
                  onClick={() => setOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-lg"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}
                >
                  ×
                </button>
              </div>
            </div>
            <embed src={url} type="application/pdf" className="flex-1 w-full" />
          </div>
        </div>
      )}
    </>
  );
}
