/**
 * Public project overview page - accessible to any authenticated user via /project/:productId/about.
 * Does not require project membership; used from the Discover Projects modal.
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { markdownComponents } from '../components/common/markdownComponents';
import UserProfileModal from '../components/common/UserProfileModal';
import ProjectHeader from '../components/common/ProjectHeader';
import { api, displayName } from '../api/client';

type PublicProduct = Awaited<ReturnType<typeof api.products.getAbout>>;

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

  const owner = product.members.find((m) => m.role === 'owner');

  return (
    <div className="h-full overflow-auto" style={{ background: 'var(--bg)' }}>
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-10 space-y-4">
        {/* Shared header (ProjectHeader) - same component used on Settings and Analytics. This
            is the public, no-membership variant, so unlike the in-app tabs this page has no
            navbar chrome at all - owner and deadline genuinely need to live here. */}
        <ProjectHeader
          emoji={product.emoji}
          name={product.name}
          deadline={product.deadline}
          status={product.status}
          owner={owner?.user}
        />

        {/* Tabs - width is intentionally fit-content (not a full-width flex row like the hero rows
            above), so centering it means centering the fit-content BOX itself via mx-auto rather
            than justify-content on its own children. */}
        <div
          className="flex gap-1 p-1 rounded-xl mx-auto"
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
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
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
