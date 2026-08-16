/**
 * Shared ReactMarkdown `components` config for the app's long-form description renderers
 * (AboutPage, AnnouncementsPage, ProjectAboutPage) - larger type scale and spacing than
 * MessageBubble.tsx's own chat-bubble renderer, plus Mermaid diagram support via MermaidBlock.
 * A plain module-level constant (not a hook/useMemo) is intentional: every usage passes it straight
 * to ReactMarkdown's `components` prop as-is, with nothing instance-specific baked in (unlike
 * MessageBubble.tsx's own mdComponents, which needs isMobile/isOwn-dependent styling and is
 * therefore memoized per-instance instead) - so there's nothing to memoize here, it only ever needs
 * to exist once per app load.
 */
import { MermaidBlock } from './MermaidBlock';

export const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 style={{ fontSize: 16, fontWeight: 600, margin: '12px 0 6px' }}>{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 style={{ fontSize: 14, fontWeight: 600, margin: '10px 0 4px' }}>{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => <p style={{ margin: '0 0 8px', lineHeight: 1.7 }}>{children}</p>,
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)', textDecoration: 'underline' }}>
      {children}
    </a>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => <ul style={{ paddingLeft: 18, margin: '0 0 8px' }}>{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol style={{ paddingLeft: 18, margin: '0 0 8px' }}>{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li style={{ marginBottom: 3, lineHeight: 1.6 }}>{children}</li>,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th
      style={{
        border: '1px solid var(--border)',
        padding: '4px 8px',
        background: 'var(--surface)',
        fontWeight: 600,
        textAlign: 'left',
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td style={{ border: '1px solid var(--border)', padding: '4px 8px' }}>{children}</td>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote style={{ borderLeft: '3px solid var(--brand)', paddingLeft: 10, margin: '0 0 8px', opacity: 0.8 }}>
      {children}
    </blockquote>
  ),
  // pre is always transparent — the code renderer below owns the block wrapper, to avoid double-<pre>
  pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    if (className?.includes('language-mermaid')) return <MermaidBlock code={String(children).trimEnd()} />;
    // react-markdown appends a trailing \n to all fenced code content; inline code never contains \n
    if (String(children).includes('\n'))
      return (
        <pre
          style={{
            background: 'var(--surface)',
            borderRadius: 6,
            padding: '8px 10px',
            overflow: 'auto',
            fontSize: 12,
            margin: '0 0 8px',
            whiteSpace: 'pre',
          }}
        >
          <code className={className}>{children}</code>
        </pre>
      );
    return (
      <code style={{ background: 'var(--surface)', padding: '1px 4px', borderRadius: 4, fontSize: 12 }}>
        {children}
      </code>
    );
  },
  img: ({ src, alt }: { src?: string; alt?: string }) => (
    <img src={src} alt={alt} style={{ maxWidth: '100%', borderRadius: 6, margin: '4px 0' }} />
  ),
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />,
};
