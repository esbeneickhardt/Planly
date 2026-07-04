import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../../api/client';

export const EMOJI_SET = [
  '👍','👎','❤️','😂','🎉','🔥','👀','💯','✅','⭐',
  '😀','😊','😍','🥰','😎','🤔','😅','😮','😢','🤩',
  '👋','🤝','👏','🙏','💪','🫡','✌️','👌','🤙','🤗',
  '🚀','⚡','🎯','🏆','💎','📌','💡','⚠️','📝','🔍',
];

const SNIPPETS: [string, string][] = [
  ['Headings',        '# Heading 1\n## Heading 2\n### Heading 3'],
  ['Bold / Italic',   '**bold**   *italic*   ~~strikethrough~~'],
  ['Link',            '[link text](https://example.com)'],
  ['Image',           '![alt text](https://example.com/image.png)'],
  ['Unordered list',  '- Item one\n- Item two\n  - Nested item'],
  ['Ordered list',    '1. First\n2. Second\n3. Third'],
  ['Table',           '| Column A | Column B |\n|----------|----------|\n| Cell 1   | Cell 2   |'],
  ['Code (inline)',   '`inline code`'],
  ['Code block',      '```\ncode here\n```'],
  ['Blockquote',      '> Quoted text here'],
  ['Horizontal rule', '---'],
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
}

export default function MarkdownEditor({ value, onChange, rows = 6, placeholder = 'Write in markdown…', disabled = false }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);

  function insertAtCursor(text: string) {
    const ta = taRef.current;
    if (!ta) { onChange(value + text); return; }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + text.length, start + text.length);
    });
  }

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const { url, name, type } = await api.upload(file);
        const md = type.startsWith('image/') ? `![${name}](${url})` : `[${name}](${url})`;
        insertAtCursor(md);
      }
    } catch (err) {
      alert((err as Error).message ?? 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageItems = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith('image/'));
    if (!imageItems.length) return;
    e.preventDefault();
    const files = imageItems.map((i) => i.getAsFile()).filter(Boolean) as File[];
    await uploadFiles(files);
  }

  return (
    <div className="space-y-1.5">
      {/* Toolbar — order: 😊 Emoji | 📎 Attach | ℹ Markdown | Preview */}
      <div className="flex items-center gap-1.5 flex-wrap relative">

        {/* Emoji */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setShowEmoji((v) => !v); setShowHelp(false); }}
            className="text-xs px-2 py-0.5 rounded-md transition-colors"
            style={{ background: showEmoji ? 'var(--brand-subtle)' : 'var(--surface-2)', color: showEmoji ? 'var(--brand)' : 'var(--text-2)' }}
            title="Insert emoji"
          >😊</button>
          {showEmoji && (
            <div className="absolute left-0 top-full mt-1 z-50 p-2 rounded-xl shadow-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 28px)', gap: 2 }}>
                {EMOJI_SET.map((e) => (
                  <button
                    key={e} type="button"
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      insertAtCursor(e);
                      setShowEmoji(false);
                    }}
                    className="flex items-center justify-center rounded text-base"
                    style={{ width: 28, height: 28 }}
                  >{e}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Attach */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading}
          className="text-xs px-2 py-0.5 rounded-md transition-colors"
          style={{ background: 'var(--surface-2)', color: uploading ? 'var(--text-3)' : 'var(--text-2)' }}
          title="Attach file or image — also supports paste"
        >{uploading ? '⏳ Uploading…' : '📎 Attach'}</button>

        {/* Markdown reference */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setShowHelp((v) => !v); setShowEmoji(false); }}
            className="text-xs px-2 py-0.5 rounded-md transition-colors font-medium"
            style={{ background: showHelp ? 'var(--brand-subtle)' : 'var(--surface-2)', color: showHelp ? 'var(--brand)' : 'var(--text-3)' }}
            title="Markdown snippets"
          >ℹ Markdown</button>
          {showHelp && (
            <div className="absolute left-0 top-full mt-1 z-50 rounded-xl shadow-xl overflow-y-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 280, maxHeight: 360 }}>
              <div className="flex items-center justify-between px-3 py-2 sticky top-0" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Click to insert</span>
                <button type="button" onClick={() => setShowHelp(false)} className="text-xs" style={{ color: 'var(--text-3)' }}>✕</button>
              </div>
              <div className="p-3 space-y-3">
                {SNIPPETS.map(([label, syntax]) => (
                  <div key={label}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>{label}</p>
                    <pre
                      className="text-xs rounded-lg px-2.5 py-1.5 cursor-pointer hover:opacity-80"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-2)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}
                      title="Click to insert"
                      onClick={() => { insertAtCursor((value.length > 0 ? '\n' : '') + syntax); setShowHelp(false); }}
                    >{syntax}</pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Preview */}
        <button
          type="button"
          onClick={() => setPreview((v) => !v)}
          className="text-xs px-2 py-0.5 rounded-md transition-colors"
          style={{ background: preview ? 'var(--brand-subtle)' : 'var(--surface-2)', color: preview ? 'var(--brand)' : 'var(--text-3)' }}
        >{preview ? 'Edit' : 'Preview'}</button>

      </div>

      {/* Editor / preview */}
      {preview ? (
        <div
          className="rounded-lg px-3 py-2.5 overflow-y-auto"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            minHeight: `${rows * 1.6}em`,
            fontSize: 13,
            color: 'var(--text)',
            lineHeight: 1.7,
          }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px' }}>{children}</h1>,
              h2: ({ children }) => <h2 style={{ fontSize: 15, fontWeight: 600, margin: '14px 0 6px' }}>{children}</h2>,
              h3: ({ children }) => <h3 style={{ fontSize: 13, fontWeight: 600, margin: '12px 0 4px' }}>{children}</h3>,
              p: ({ children }) => <p style={{ margin: '0 0 8px' }}>{children}</p>,
              a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)', textDecoration: 'underline' }}>{children}</a>,
              ul: ({ children }) => <ul style={{ paddingLeft: 18, margin: '0 0 8px' }}>{children}</ul>,
              ol: ({ children }) => <ol style={{ paddingLeft: 18, margin: '0 0 8px' }}>{children}</ol>,
              li: ({ children }) => <li style={{ marginBottom: 3 }}>{children}</li>,
              table: ({ children }) => <div style={{ overflowX: 'auto', marginBottom: 8 }}><table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>{children}</table></div>,
              th: ({ children }) => <th style={{ border: '1px solid var(--border)', padding: '4px 8px', background: 'var(--surface)', fontWeight: 600, textAlign: 'left' }}>{children}</th>,
              td: ({ children }) => <td style={{ border: '1px solid var(--border)', padding: '4px 8px' }}>{children}</td>,
              blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--brand)', paddingLeft: 10, margin: '0 0 8px', opacity: 0.8 }}>{children}</blockquote>,
              code: ({ children, className }) => className
                ? <pre style={{ background: 'var(--surface)', borderRadius: 6, padding: '8px 10px', overflow: 'auto', fontSize: 12, margin: '0 0 8px' }}><code>{children}</code></pre>
                : <code style={{ background: 'var(--surface)', padding: '1px 4px', borderRadius: 4, fontSize: 12 }}>{children}</code>,
              img: ({ src, alt }) => <img src={src} alt={alt} style={{ maxWidth: '100%', borderRadius: 6, margin: '4px 0' }} />,
              hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' }} />,
            }}
          >
            {value || '*Nothing to preview*'}
          </ReactMarkdown>
        </div>
      ) : (
        <textarea
          ref={taRef}
          className="input text-sm w-full font-mono"
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          style={{ resize: 'vertical', lineHeight: 1.6 }}
        />
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf,.txt,.csv,.md"
        multiple
        className="hidden"
        onChange={(e) => uploadFiles(Array.from(e.target.files ?? []))}
      />
    </div>
  );
}
