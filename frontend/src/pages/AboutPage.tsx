import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { MermaidBlock } from '../components/common/MermaidBlock';
import UserProfileModal from '../components/common/UserProfileModal';
import { isBeforeToday } from '../utils/dates';
import { useProduct } from '../context/ProductContext';
import { usePermission } from '../context/PermissionContext';
import { useNavigate } from 'react-router-dom';
import { api, displayName } from '../api/client';

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', co_owner: 'Co-owner', member: 'Member' };
const ROLE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  owner: { bg: 'var(--brand-subtle)', color: 'var(--brand)', border: 'var(--brand)' },
  co_owner: { bg: 'rgba(139,92,246,0.1)', color: '#8b5cf6', border: 'rgba(139,92,246,0.3)' },
  member: { bg: 'var(--surface)', color: 'var(--text-3)', border: 'var(--border)' },
};

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

export default function AboutPage() {
  const { activeProduct } = useProduct();
  const { canManage } = usePermission();
  const navigate = useNavigate();
  const [members, setMembers] = useState<Awaited<ReturnType<typeof api.products.getAbout>>['members']>([]);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<'description' | 'members'>('description');

  useEffect(() => {
    if (!activeProduct) return;
    api.products
      .getAbout(activeProduct.id)
      .then((data) => setMembers(data.members))
      .catch(() => {});
  }, [activeProduct?.id]);

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
          {activeProduct.emoji && <span className="text-5xl leading-none flex-shrink-0">{activeProduct.emoji}</span>}
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
                {isOverdue ? 'Overdue · ' : 'Deadline · '}
                {deadlineStr}
              </span>
            </div>
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
              {t === 'description' ? 'Description' : `Members (${members.length})`}
            </button>
          ))}
        </div>

        {/* Tab: Description */}
        {tab === 'description' && (
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
                    style={{
                      background: 'var(--brand-subtle)',
                      color: 'var(--brand)',
                      border: '1px solid var(--brand)',
                    }}
                  >
                    Add one in Settings →
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab: Members */}
        {tab === 'members' && (
          <div className="grid grid-cols-1 gap-2">
            {members.map((m) => {
              const style = ROLE_STYLE[m.role] ?? ROLE_STYLE['member']!;
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => setProfileUserId(m.userId)}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-colors w-full"
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
