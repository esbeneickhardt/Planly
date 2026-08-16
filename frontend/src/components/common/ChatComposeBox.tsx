/**
 * ChatPanel's compose box: reply-preview bar, @ mention dropdown, emoji picker, markdown
 * cheatsheet, and the mobile-compact vs. desktop-toolbar text input + Send button. Split out of
 * ChatPanel.tsx - every prop here was already fully shared across every thread ChatPanel can show
 * (project/task/DM/group/admin-project), so this component takes no per-call-site variation.
 */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { MermaidBlock } from './MermaidBlock';
import { displayName } from '../../api/client';
import type { MessageAttachment } from '../../api/client';
import EmojiPicker from './EmojiPicker';

export interface ReplyingTo {
  id: string;
  content: string;
  attachments: MessageAttachment[];
  author: { username: string; realName: string | null; avatarEmoji: string | null };
}

export interface TeamMemberEntry {
  id: string;
  username: string;
  realName?: string | null;
  avatarEmoji?: string | null;
  isAdmin?: boolean;
  role?: string;
}

// ReactMarkdown `components` for the compose-box draft preview (mobile + desktop share this one
// pane via markdownPreviewPane below). Defined at module scope, not inline in the component body -
// nothing here is instance-specific (no theme/`isOwn`-style styling like MessageBubble.tsx's own
// mdComponents needs), so a fresh object per render would only ever cost an unnecessary remount of
// the preview's markdown tree with no upside. See MessageBubble.tsx's mdComponents for why a fresh
// object here is a real bug (component-identity remount), not just a wasted allocation.
const PREVIEW_MD_COMPONENTS = {
  pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
    if (className?.includes('language-mermaid')) return <MermaidBlock code={String(children).trimEnd()} />;
    if (String(children).includes('\n'))
      return (
        <pre>
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      );
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

export interface ChatComposeBoxProps {
  isMobile: boolean;
  chatWritable: boolean;
  draft: string;
  onDraftChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  textRef: React.RefObject<HTMLTextAreaElement>;
  fileRef: React.RefObject<HTMLInputElement>;
  uploading: boolean;
  sending: boolean;
  onSend: () => void;
  preview: boolean;
  setPreview: React.Dispatch<React.SetStateAction<boolean>>;
  composeMultiline: boolean;
  attachments: MessageAttachment[];
  setAttachments: React.Dispatch<React.SetStateAction<MessageAttachment[]>>;
  replyingTo: ReplyingTo | null;
  setReplyingTo: React.Dispatch<React.SetStateAction<ReplyingTo | null>>;
  mentionSearch: string | null;
  mentionCandidates: TeamMemberEntry[];
  mentionHighlight: number;
  setMentionHighlight: React.Dispatch<React.SetStateAction<number>>;
  insertMention: (username: string) => void;
  showComposePicker: boolean;
  setShowComposePicker: React.Dispatch<React.SetStateAction<boolean>>;
  showMarkdownHelp: boolean;
  setShowMarkdownHelp: React.Dispatch<React.SetStateAction<boolean>>;
  showMoreTools: boolean;
  setShowMoreTools: React.Dispatch<React.SetStateAction<boolean>>;
  setDraft: React.Dispatch<React.SetStateAction<string>>;
}

export default function ChatComposeBox({
  isMobile,
  chatWritable,
  draft,
  onDraftChange,
  onKeyDown,
  onPaste,
  textRef,
  fileRef,
  uploading,
  sending,
  onSend,
  preview,
  setPreview,
  composeMultiline,
  attachments,
  setAttachments,
  replyingTo,
  setReplyingTo,
  mentionSearch,
  mentionCandidates,
  mentionHighlight,
  setMentionHighlight,
  insertMention,
  showComposePicker,
  setShowComposePicker,
  showMarkdownHelp,
  setShowMarkdownHelp,
  showMoreTools,
  setShowMoreTools,
  setDraft,
}: ChatComposeBoxProps) {
  // Rendered markdown preview of the current draft - shared by mobile and desktop's compose areas.
  function markdownPreviewPane() {
    return (
      <div
        className="min-h-[80px] max-h-40 overflow-y-auto px-3 py-2 rounded-lg mb-2 text-sm"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
          components={PREVIEW_MD_COMPONENTS}
        >
          {draft || '*Nothing to preview*'}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    // pb-4 (16px) used to be exactly double pt-2 (8px) here - fine on desktop where more rows
    // (attachments, mention footer) usually sit between the last input row and this padding,
    // but on mobile the compact row is always the very last thing in flow, so that doubled
    // bottom padding read as a lopsided gap instead of the row sitting centered in its box.
    <div
      className={`px-4 flex-shrink-0 relative ${isMobile ? 'pt-2 pb-2' : 'pt-2 pb-4'}`}
      style={{ borderTop: '1px solid var(--border)' }}
    >
      {/* Reply-to preview bar */}
      {replyingTo && (
        <div
          className="flex items-center gap-2 mb-2 px-2.5 py-1.5 rounded-lg"
          style={{ background: 'var(--surface-2)', borderLeft: '2px solid var(--brand)' }}
        >
          {(() => {
            const img = replyingTo.attachments.find((a) => a.type?.startsWith('image/'));
            return img ? (
              <img src={img.thumbnailUrl ?? img.url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
            ) : null;
          })()}
          <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--brand)' }}>
            ↩ {displayName(replyingTo.author)}
          </span>
          <span className="text-[10px] flex-1 truncate" style={{ color: 'var(--text-3)' }}>
            {replyingTo.content ? replyingTo.content.slice(0, 80) : replyingTo.attachments.length > 0 ? '📷 Photo' : ''}
          </span>
          <button
            onClick={() => setReplyingTo(null)}
            className="flex-shrink-0 text-[10px] px-1 rounded"
            style={{ color: 'var(--text-3)' }}
          >
            ✕
          </button>
        </div>
      )}
      {/* @ mention dropdown */}
      {mentionSearch !== null && mentionCandidates.length > 0 && (
        <div
          className="absolute left-4 right-4 bottom-full mb-1 rounded-xl overflow-hidden shadow-xl z-10"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
              Mention a member
            </span>
          </div>
          {mentionCandidates.map((m, i) => (
            <button
              key={m.id}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(m.username);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
              style={{ background: i === mentionHighlight ? 'var(--surface-2)' : 'transparent' }}
              onMouseEnter={() => setMentionHighlight(i)}
            >
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                {m.avatarEmoji ?? '👤'}
              </span>
              <div className="flex flex-col min-w-0">
                {m.realName?.trim() && (
                  <span className="text-sm font-medium leading-tight" style={{ color: 'var(--text)' }}>
                    {m.realName.trim()}
                  </span>
                )}
                <span
                  className={m.realName?.trim() ? 'text-xs leading-tight' : 'text-sm font-medium'}
                  style={{ color: m.realName?.trim() ? 'var(--text-3)' : 'var(--text)' }}
                >
                  @{m.username}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Compose emoji picker - fixed near the bottom of the viewport on mobile so it never
          renders off-screen; anchored precisely above the toolbar at md: and up. */}
      {showComposePicker && (
        <div
          data-emoji-picker
          className="fixed left-2 right-2 bottom-4 md:absolute md:left-4 md:right-auto md:bottom-full md:mb-1 z-50 p-2 rounded-xl shadow-xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {/* onMouseDown+preventDefault here (not inside EmojiPicker itself) keeps the textarea
              focused through the tap, same fix as the Send button - otherwise the click steals
              focus first, closing the mobile keyboard, then the refocus below reopens it. */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- onMouseDown here only preventDefaults to keep the textarea focused through the tap; not a user-facing action, no keyboard equivalent applies */}
          <div onMouseDown={(ev) => ev.preventDefault()}>
            <EmojiPicker
              onChange={(e) => {
                const ta = textRef.current;
                if (ta) {
                  const start = ta.selectionStart ?? draft.length;
                  const end = ta.selectionEnd ?? draft.length;
                  const next = draft.slice(0, start) + e + draft.slice(end);
                  setDraft(next);
                  requestAnimationFrame(() => {
                    ta.focus();
                    ta.setSelectionRange(start + e.length, start + e.length);
                  });
                } else {
                  setDraft((d) => d + e);
                }
                setShowComposePicker(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Markdown cheatsheet */}
      {showMarkdownHelp && (
        <div
          className="absolute left-0 right-0 bottom-full mb-1 z-50 rounded-xl shadow-xl overflow-y-auto"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: 380 }}
        >
          <div
            className="flex items-center justify-between px-4 py-2.5 sticky top-0"
            style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
          >
            <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
              Markdown reference
            </span>
            <button onClick={() => setShowMarkdownHelp(false)} className="text-xs" style={{ color: 'var(--text-3)' }}>
              ✕
            </button>
          </div>
          <div className="p-4 space-y-4">
            {(
              [
                ['Headings', '# H1\n## H2\n### H3'],
                ['Bold / Italic / Strike', '**bold**   *italic*   ~~strike~~'],
                ['Inline code', '`code here`'],
                ['Code block', '```python\ndef hello():\n    return "world"\n```'],
                ['Link', '[link text](https://example.com)'],
                ['Image', '![alt text](https://example.com/img.png)'],
                ['Unordered list', '- Item one\n- Item two\n  - Nested'],
                ['Ordered list', '1. First\n2. Second\n3. Third'],
                ['Blockquote', '> This is a quote\n> spanning two lines'],
                ['Table', '| Name   | Value |\n|--------|-------|\n| Alpha  | 1     |\n| Beta   | 2     |'],
                ['Horizontal rule', '---'],
              ] as [string, string][]
            ).map(([label, syntax]) => (
              <div key={label}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-3)' }}>
                  {label}
                </p>
                {/* div, not <pre> - jsx-a11y disallows an interactive role on <pre>; the
                    monospace/preformatted look comes entirely from the inline styles below */}
                <div
                  role="button"
                  tabIndex={0}
                  className="text-xs rounded-lg px-3 py-2 select-all cursor-pointer"
                  style={{
                    background: 'var(--surface-2)',
                    color: 'var(--text-2)',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6,
                  }}
                  onClick={() => {
                    const ta = textRef.current;
                    if (!ta) return;
                    const ins = '\n' + syntax;
                    const pos = ta.selectionEnd ?? draft.length;
                    setDraft((d) => d.slice(0, pos) + ins + d.slice(pos));
                    setShowMarkdownHelp(false);
                    requestAnimationFrame(() => {
                      ta.focus();
                      ta.setSelectionRange(pos + ins.length, pos + ins.length);
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    const ta = textRef.current;
                    if (!ta) return;
                    const ins = '\n' + syntax;
                    const pos = ta.selectionEnd ?? draft.length;
                    setDraft((d) => d.slice(0, pos) + ins + d.slice(pos));
                    setShowMarkdownHelp(false);
                    requestAnimationFrame(() => {
                      ta.focus();
                      ta.setSelectionRange(pos + ins.length, pos + ins.length);
                    });
                  }}
                  title="Click to insert"
                >
                  {syntax}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isMobile ? (
        <>
          {/* Attachment previews sit above the composer row on mobile (no separate row to put
              them below, since the compact bar's Send is already inline). */}
          {attachments.length > 0 && (
            <div className="pb-2 flex gap-2 flex-wrap">
              {attachments.map((att, i) => (
                <div key={i} className="relative">
                  {att.type?.startsWith('image/') ? (
                    <img src={att.thumbnailUrl ?? att.url} alt={att.name} className="h-14 w-14 rounded-lg object-cover" />
                  ) : (
                    <div
                      className="h-14 px-3 flex items-center text-xs rounded-lg"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
                    >
                      📎 {att.name}
                    </div>
                  )}
                  <button
                    onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px]"
                    style={{ background: '#ef4444', color: 'white' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Mobile compact bar - Messenger-style: one "+" tray replaces the whole desktop
              toolbar row, a single-line textarea grows in place, Send sits at the end. Hidden
              while previewing markdown (falls through to the shared preview pane below instead,
              with its own Send row, same as desktop). */}
          {!preview && (
            // No trailing margin here - this row is always the last thing in flow in this branch
            // (the container's own pb-4 already provides bottom spacing), so an mb-2 here was
            // pure extra dead space stacking on top of that padding - "two boxes" worth of bottom
            // spacing for what should have been one, pushing the row up off-center inside the
            // bordered compose box.
            <div className={`flex ${composeMultiline ? 'items-end' : 'items-center'} gap-2`}>
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setShowMoreTools((v) => !v)}
                  aria-label="More options"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xl transition-colors flex-shrink-0"
                  style={{
                    background: showMoreTools ? 'var(--brand-subtle)' : 'var(--surface-2)',
                    color: showMoreTools ? 'var(--brand)' : 'var(--text-2)',
                  }}
                >
                  {showMoreTools ? '✕' : '+'}
                </button>
                {showMoreTools && (
                  <>
                    <button
                      className="fixed inset-0 z-10"
                      style={{ background: 'transparent' }}
                      aria-label="Close more options"
                      onClick={() => setShowMoreTools(false)}
                    />
                    <div
                      className="absolute left-0 bottom-full mb-2 z-20 rounded-2xl shadow-xl p-3 grid grid-cols-4 gap-3 animate-dropdown-in"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 236 }}
                    >
                      {[
                        {
                          icon: uploading ? '⏳' : '📎',
                          label: 'Attach',
                          active: false,
                          onClick: () => {
                            fileRef.current?.click();
                            setShowMoreTools(false);
                          },
                        },
                        {
                          icon: '😊',
                          label: 'Emoji',
                          active: showComposePicker,
                          onClick: () => {
                            setShowComposePicker((v) => !v);
                            setShowMoreTools(false);
                          },
                          dataAttr: true,
                        },
                        {
                          icon: 'ℹ',
                          label: 'Markdown',
                          active: showMarkdownHelp,
                          onClick: () => {
                            setShowMarkdownHelp((v) => !v);
                            setShowMoreTools(false);
                          },
                        },
                        {
                          icon: '👁',
                          label: preview ? 'Edit' : 'Preview',
                          active: preview as boolean,
                          onClick: () => {
                            setPreview((v) => !v);
                            setShowMoreTools(false);
                          },
                        },
                      ].map((item) => (
                        <button
                          key={item.label}
                          {...(item.dataAttr ? { 'data-emoji-picker': true } : {})}
                          onClick={item.onClick}
                          className="flex flex-col items-center gap-1"
                        >
                          <span
                            className="w-11 h-11 rounded-full flex items-center justify-center text-lg transition-colors"
                            style={{
                              background: item.active ? 'var(--brand-subtle)' : 'var(--surface-2)',
                              color: item.active ? 'var(--brand)' : 'var(--text-2)',
                            }}
                          >
                            {item.icon}
                          </span>
                          <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                            {item.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <textarea
                ref={textRef}
                rows={1}
                value={draft}
                onChange={onDraftChange}
                onPaste={onPaste}
                onKeyDown={onKeyDown}
                readOnly={!chatWritable}
                placeholder={chatWritable ? 'Message…' : 'This project is read-only'}
                className="input text-sm flex-1 resize-none rounded-full py-2"
                style={{ maxHeight: 100, overflowY: 'auto', boxSizing: 'border-box', lineHeight: '20px' }}
              />
              <button
                onClick={onSend}
                onMouseDown={(e) => e.preventDefault()}
                disabled={sending || !chatWritable || (!draft.trim() && attachments.length === 0)}
                aria-label="Send"
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-opacity disabled:opacity-40"
                style={{ background: 'var(--brand)', color: 'white' }}
              >
                {sending ? '…' : '➤'}
              </button>
            </div>
          )}

          {preview && (
            <>
              {markdownPreviewPane()}
              <div className="flex justify-between items-center">
                <button
                  onClick={() => setPreview(false)}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
                >
                  ✎ Edit
                </button>
                <button
                  onClick={onSend}
                  onMouseDown={(e) => e.preventDefault()}
                  disabled={sending || !chatWritable || (!draft.trim() && attachments.length === 0)}
                  className="btn-primary text-xs px-4"
                >
                  {sending ? '…' : 'Send'}
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {/* Desktop toolbar - order: 😊 Emoji | 📎 Attach | ℹ Markdown | Preview, all inline */}
          <div className="flex items-center gap-1 mb-2">
            <button
              data-emoji-picker
              onClick={() => setShowComposePicker((v) => !v)}
              className="text-xs px-2 py-0.5 rounded-md transition-colors"
              style={{
                background: showComposePicker ? 'var(--brand-subtle)' : 'var(--surface-2)',
                color: showComposePicker ? 'var(--brand)' : 'var(--text-2)',
              }}
              title="Insert emoji"
            >
              😊
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading || !chatWritable}
              className="text-xs px-2 py-0.5 rounded-md transition-colors"
              style={{ background: 'var(--surface-2)', color: uploading ? 'var(--text-3)' : 'var(--text-2)' }}
            >
              {uploading ? '⏳' : '📎'} Attach
            </button>
            <button
              onClick={() => setShowMarkdownHelp((v) => !v)}
              className="text-xs px-2 py-0.5 rounded-md transition-colors font-medium"
              style={{
                background: showMarkdownHelp ? 'var(--brand-subtle)' : 'var(--surface-2)',
                color: showMarkdownHelp ? 'var(--brand)' : 'var(--text-3)',
              }}
              title="Markdown reference"
            >
              ℹ Markdown
            </button>
            <button
              onClick={() => setPreview((v) => !v)}
              className="text-xs px-2 py-0.5 rounded-md transition-colors"
              style={{
                background: preview ? 'var(--brand-subtle)' : 'var(--surface-2)',
                color: preview ? 'var(--brand)' : 'var(--text-3)',
              }}
            >
              {preview ? 'Edit' : 'Preview'}
            </button>
          </div>

          {preview ? (
            markdownPreviewPane()
          ) : (
            <textarea
              ref={textRef}
              rows={3}
              value={draft}
              onChange={onDraftChange}
              onPaste={onPaste}
              onKeyDown={onKeyDown}
              readOnly={!chatWritable}
              placeholder={chatWritable ? 'Write a message… type @ to mention · ⌘↵ send' : 'This project is read-only'}
              className="input text-sm w-full resize-none mb-2"
            />
          )}

          {attachments.length > 0 && (
            <div className="pb-2 flex gap-2 flex-wrap">
              {attachments.map((att, i) => (
                <div key={i} className="relative group/att">
                  {att.type?.startsWith('image/') ? (
                    <img src={att.thumbnailUrl ?? att.url} alt={att.name} className="h-14 w-14 rounded-lg object-cover" />
                  ) : (
                    <div
                      className="h-14 px-3 flex items-center text-xs rounded-lg"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
                    >
                      📎 {att.name}
                    </div>
                  )}
                  <button
                    onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover/att:opacity-100"
                    style={{ background: '#ef4444', color: 'white' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
              @ mention · ```python · ⌘↵ send
            </span>
            <button
              onClick={onSend}
              onMouseDown={(e) => e.preventDefault()}
              disabled={sending || !chatWritable || (!draft.trim() && attachments.length === 0)}
              className="btn-primary text-xs px-4"
            >
              {sending ? '…' : 'Send'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
