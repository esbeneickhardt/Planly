/**
 * Public project overview page — accessible to any authenticated user via /project/:productId/about.
 * Does not require project membership; used from the Discover Projects modal.
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { MermaidBlock } from '../components/common/MermaidBlock';
import UserProfileModal from '../components/common/UserProfileModal';
import StatusPill from '../components/common/StatusPill';
import { isBeforeToday } from '../utils/dates';
import { api, displayName } from '../api/client';

type PublicProduct = Awaited<ReturnType<typeof api.products.getAbout>>;

const MD = {
  h1: ({ children }: any) => <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>{children}</h1>,
  h2: ({ children }: any) => <h2 style={{ fontSize: 16, fontWeight: 600, margin: '12px 0 6px' }}>{children}</h2>,
  h3: ({ children }: any) => <h3 style={{ fontSize: 14, fontWeight: 600, margin: '10px 0 4px' }}>{children}</h3>,
  p: ({ children }: any) => <p style={{ margin: '0 0 8px', lineHeight: 1.7 }}>{children}</p>,
  a: ({ children, href }: any) => (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)', textDecoration: 'underline' }}>
      {children}
    </a>
  ),
  ul: ({ children }: any) => <ul style={{ paddingLeft: 18, margin: '0 0 8px' }}>{children}</ul>,
  ol: ({ children }: any) => <ol style={{ paddingLeft: 18, margin: '0 0 8px' }}>{children}</ol>,
  li: ({ children }: any) => <li style={{ marginBottom: 3, lineHeight: 1.6 }}>{children}</li>,
  table: ({ children }: any) => (
    <div style={{ overflowX: 'auto', marginBottom: 8 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>{children}</table>
    </div>
  ),
  th: ({ children }: any) => (
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
  td: ({ children }: any) => <td style={{ border: '1px solid var(--border)', padding: '4px 8px' }}>{children}</td>,
  blockquote: ({ children }: any) => (
    <blockquote style={{ borderLeft: '3px solid var(--brand)', paddingLeft: 10, margin: '0 0 8px', opacity: 0.8 }}>
      {children}
    </blockquote>
  ),
  pre: ({ children }: any) => <>{children}</>,
  code: ({ children, className }: any) => {
    if (className?.includes('language-mermaid')) return <MermaidBlock code={String(children).trimEnd()} />;
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
  img: ({ src, alt }: any) => (
    <img src={src} alt={alt} style={{ maxWidth: '100%', borderRadius: 6, margin: '4px 0' }} />
  ),
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />,
};

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', co_owner: 'Co-owner', member: 'Member' };
const ROLE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  owner: { bg: 'var(--brand-subtle)', color: 'var(--brand)', border: 'var(--brand)' },
  co_owner: { bg: 'rgba(139,92,246,0.1)', color: '#8b5cf6', border: 'rgba(139,92,246,0.3)' },
  member: { bg: 'var(--surface)', color: 'var(--text-3)', border: 'var(--border)' },
};

export default function ProjectAboutPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<'description' | 'members'>('description');

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    api.products
      .getAbout(productId)
      .then(setProduct)
      .catch(() => setError('Project not found.'))
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div
          className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3" style={{ color: 'var(--text-3)' }}>
        <span className="text-4xl opacity-30">🔍</span>
        <p className="text-sm">{error || 'Project not found.'}</p>
        <button
          onClick={() => navigate(-1)}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
        >
          ← Back
        </button>
      </div>
    );
  }

  const deadline = new Date(product.deadline);
  const isOverdue = isBeforeToday(deadline);
  const deadlineStr = deadline.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="h-full overflow-auto" style={{ background: 'var(--bg)' }}>
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-10 space-y-8">
        {/* Hero */}
        <div className="space-y-2">
          <div className="flex items-start gap-4">
            {product.emoji && <span className="text-5xl leading-none flex-shrink-0">{product.emoji}</span>}
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight" style={{ color: 'var(--text)' }}>
                {product.name}
              </h1>
            </div>
          </div>

          {/* A direct child of this space-y-2 wrapper, not nested inside the emoji-indented title
              column - so it left-aligns with the tabs/box below instead of sitting pushed right
              under the emoji. */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill tone={isOverdue ? 'danger' : 'success'} size="pill">
              {isOverdue ? 'Overdue · ' : 'Deadline · '}
              {deadlineStr}
            </StatusPill>
            {product.status === 'completed' && (
              <StatusPill tone="success" size="pill">
                ✓ Completed
              </StatusPill>
            )}
            {product.status === 'archived' && (
              <StatusPill tone="neutral" size="pill">
                📦 Archived
              </StatusPill>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div
          className="flex gap-1 p-1 rounded-xl"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', width: 'fit-content' }}
        >
          {(['description', 'members'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="text-sm px-4 py-1.5 rounded-lg transition-colors font-medium"
              style={{
                background: tab === t ? 'var(--surface)' : 'transparent',
                color: tab === t ? 'var(--text)' : 'var(--text-3)',
                boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {t === 'description' ? 'Description' : `Members (${product.members.length})`}
            </button>
          ))}
        </div>

        {/* Tab: Description */}
        {tab === 'description' && (
          <div className="rounded-xl p-6 shadow-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {product.description ? (
              <div style={{ color: 'var(--text)', fontSize: 14 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={MD}>
                  {product.description}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-3" style={{ color: 'var(--text-3)' }}>
                <span className="text-4xl opacity-30">📝</span>
                <p className="text-sm">No description yet.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab: Members */}
        {tab === 'members' && (
          <div className="grid grid-cols-1 gap-2">
            {product.members.map((m) => {
              const style = ROLE_STYLE[m.role] ?? ROLE_STYLE['member']!;
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => setProfileUserId(m.userId)}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-colors w-full shadow-sm"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--brand)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <span className="text-xl flex-shrink-0">{m.user.avatarEmoji ?? '👤'}</span>
                  <span className="text-sm font-medium flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>
                    {displayName(m.user)}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium"
                    style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
                  >
                    {ROLE_LABEL[m.role] ?? m.role}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {profileUserId && <UserProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />}
    </div>
  );
}
