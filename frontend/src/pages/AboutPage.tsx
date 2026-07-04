import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useProduct } from '../context/ProductContext';
import { usePermission } from '../context/PermissionContext';
import { useNavigate } from 'react-router-dom';

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
  const isOverdue = deadline < new Date();
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
            <div style={{ color: 'var(--text)', fontSize: 14, lineHeight: 1.75 }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 12px', color: 'var(--text)' }}>{children}</h1>,
                  h2: ({ children }) => <h2 style={{ fontSize: 16, fontWeight: 600, margin: '20px 0 8px', color: 'var(--text)' }}>{children}</h2>,
                  h3: ({ children }) => <h3 style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 6px', color: 'var(--text)' }}>{children}</h3>,
                  p: ({ children }) => <p style={{ margin: '0 0 10px' }}>{children}</p>,
                  a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)', textDecoration: 'underline' }}>{children}</a>,
                  ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: '0 0 10px' }}>{children}</ul>,
                  ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: '0 0 10px' }}>{children}</ol>,
                  li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
                  strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
                  em: ({ children }) => <em style={{ fontStyle: 'italic', opacity: 0.85 }}>{children}</em>,
                  blockquote: ({ children }) => (
                    <blockquote style={{ borderLeft: '3px solid var(--brand)', paddingLeft: 12, margin: '0 0 10px', opacity: 0.8 }}>{children}</blockquote>
                  ),
                  code: ({ children, className }) => {
                    const isBlock = !!className;
                    return isBlock
                      ? <pre style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px', overflow: 'auto', fontSize: 13, margin: '0 0 10px' }}><code>{children}</code></pre>
                      : <code style={{ background: 'var(--surface-2)', padding: '2px 5px', borderRadius: 4, fontSize: 13 }}>{children}</code>;
                  },
                  hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />,
                }}
              >
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
