import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { MermaidBlock } from '../components/common/MermaidBlock';
import { isBeforeToday } from '../utils/dates';
import { useProduct } from '../context/ProductContext';
import { usePermission } from '../context/PermissionContext';
import { useNavigate } from 'react-router-dom';

const MD = {
  h1: ({ children }: any) => <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>{children}</h1>,
  h2: ({ children }: any) => <h2 style={{ fontSize: 16, fontWeight: 600, margin: '12px 0 6px' }}>{children}</h2>,
  h3: ({ children }: any) => <h3 style={{ fontSize: 14, fontWeight: 600, margin: '10px 0 4px' }}>{children}</h3>,
  p:  ({ children }: any) => <p style={{ margin: '0 0 8px', lineHeight: 1.7 }}>{children}</p>,
  a:  ({ children, href }: any) => <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)', textDecoration: 'underline' }}>{children}</a>,
  ul: ({ children }: any) => <ul style={{ paddingLeft: 18, margin: '0 0 8px' }}>{children}</ul>,
  ol: ({ children }: any) => <ol style={{ paddingLeft: 18, margin: '0 0 8px' }}>{children}</ol>,
  li: ({ children }: any) => <li style={{ marginBottom: 3, lineHeight: 1.6 }}>{children}</li>,
  table: ({ children }: any) => <div style={{ overflowX: 'auto', marginBottom: 8 }}><table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>{children}</table></div>,
  th: ({ children }: any) => <th style={{ border: '1px solid var(--border)', padding: '4px 8px', background: 'var(--surface)', fontWeight: 600, textAlign: 'left' }}>{children}</th>,
  td: ({ children }: any) => <td style={{ border: '1px solid var(--border)', padding: '4px 8px' }}>{children}</td>,
  blockquote: ({ children }: any) => <blockquote style={{ borderLeft: '3px solid var(--brand)', paddingLeft: 10, margin: '0 0 8px', opacity: 0.8 }}>{children}</blockquote>,
  pre: ({ children }: any) => <>{children}</>,
  code: ({ children, className }: any) => {
    if (className?.includes('language-mermaid')) return <MermaidBlock code={String(children).trimEnd()} />;
    if (String(children).includes('\n')) return (
      <pre style={{ background: 'var(--surface)', borderRadius: 6, padding: '8px 10px', overflow: 'auto', fontSize: 12, margin: '0 0 8px', whiteSpace: 'pre' }}>
        <code className={className}>{children}</code>
      </pre>
    );
    return <code style={{ background: 'var(--surface)', padding: '1px 4px', borderRadius: 4, fontSize: 12 }}>{children}</code>;
  },
  img: ({ src, alt }: any) => <img src={src} alt={alt} style={{ maxWidth: '100%', borderRadius: 6, margin: '4px 0' }} />,
  hr:  () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />,
};

export default function AboutPage() {
  const { activeProduct } = useProduct();
  const { canManage } = usePermission();
  const navigate = useNavigate();

  if (!activeProduct) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ color: 'var(--text-3)' }}>
        <div className="text-5xl opacity-30">📋</div>
        <p className="text-sm">Select a project to view its overview</p>
      </div>
    );
  }

  const deadline = new Date(activeProduct.deadline);
  const isOverdue = isBeforeToday(deadline);
  const deadlineStr = deadline.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="h-full overflow-auto" style={{ background: 'var(--bg)' }}>
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">

        {/* Hero */}
        <div className="flex items-start gap-4">
          {activeProduct.emoji && (
            <span className="text-5xl leading-none flex-shrink-0">{activeProduct.emoji}</span>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight" style={{ color: 'var(--text)' }}>
              {activeProduct.name}
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: isOverdue ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                  color: isOverdue ? '#ef4444' : '#10b981',
                  border: `1px solid ${isOverdue ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                }}
              >
                {isOverdue ? 'Overdue · ' : 'Deadline · '}{deadlineStr}
              </span>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {activeProduct.description ? (
            <div style={{ color: 'var(--text)', fontSize: 14 }}>
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={MD}>
                {activeProduct.description}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 gap-3" style={{ color: 'var(--text-3)' }}>
              <span className="text-4xl opacity-30">📝</span>
              <p className="text-sm">No description yet.</p>
              {canManage && (
                <button
                  onClick={() => navigate('/settings')}
                  className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: 'var(--brand-subtle)', color: 'var(--brand)', border: '1px solid var(--brand)' }}
                >
                  Add one in Settings →
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
