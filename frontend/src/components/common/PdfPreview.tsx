/**
 * "Preview" button for a PDF attachment - opens the PDF in a large in-app modal (native browser
 * `<embed>` viewer) instead of navigating away or forcing a download. Routed through the shared
 * `Modal` component so it gets Escape-to-close, a focus trap, and ARIA dialog semantics for free,
 * same as every other modal in the app.
 */
import { useState } from 'react';
import Modal from './Modal';

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
        style={{
          background: 'var(--brand-subtle)',
          color: 'var(--brand)',
          border: '1px solid var(--border)',
        }}
        title={`Preview ${name}`}
      >
        👁 Preview
      </button>

      {open && (
        <Modal title={`📄 ${name}`} onClose={() => setOpen(false)} width="max-w-4xl" mobileFullscreen>
          <div className="flex flex-col gap-2" style={{ height: '70vh' }}>
            <div className="flex justify-end flex-shrink-0">
              <a
                href={url}
                download={name}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{
                  background: 'var(--surface-2)',
                  color: 'var(--text-2)',
                  border: '1px solid var(--border)',
                }}
              >
                ↓ Download
              </a>
            </div>
            <embed
              src={url}
              type="application/pdf"
              className="flex-1 w-full rounded-lg"
              style={{ border: '1px solid var(--border)' }}
            />
          </div>
        </Modal>
      )}
    </>
  );
}
