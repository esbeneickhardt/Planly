/**
 * Member-facing "About" tab for the active project: renders its Markdown description
 * (with Mermaid diagram support) and lists its members with role badges. Requires the
 * viewer to already have a membership in `activeProduct` from ProductContext.
 *
 * Not to be confused with `ProjectAboutPage.tsx`, the separate public overview page at
 * /project/:productId/about that does NOT require membership and is reached from the
 * Discover Projects modal - the two pages render similar content but serve different
 * audiences and are not interchangeable.
 */
import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { markdownComponents } from '../components/common/markdownComponents';
import UserProfileModal from '../components/common/UserProfileModal';
import ProjectHeader from '../components/common/ProjectHeader';
import EmptyState from '../components/common/EmptyState';
import { useProduct } from '../context/ProductContext';
import { usePermission } from '../context/PermissionContext';
import { useNavigate } from 'react-router-dom';
import { api, displayName } from '../api/client';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  co_owner: 'Co-owner',
  member: 'Member',
};
const ROLE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  owner: {
    bg: 'var(--brand-subtle)',
    color: 'var(--brand)',
    border: 'var(--brand)',
  },
  co_owner: {
    bg: 'rgba(139,92,246,0.1)',
    color: '#8b5cf6',
    border: 'rgba(139,92,246,0.3)',
  },
  member: {
    bg: 'var(--surface)',
    color: 'var(--text-3)',
    border: 'var(--border)',
  },
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
    // activeProduct: only `.id` drives this effect; object identity changes on every context
    // re-render regardless of which product is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProduct?.id]);

  if (!activeProduct) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ color: 'var(--text-3)' }}>
        <div className="text-5xl opacity-30">📋</div>
        <p className="text-sm">Select a project to view its overview</p>
      </div>
    );
  }

  const owner = members.find((m) => m.role === 'owner');

  return (
    <div className="h-full overflow-auto" style={{ background: 'var(--bg)' }}>
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-5 md:py-10 space-y-4">
        {/* Shared header (ProjectHeader) - same component used on Settings and Analytics so all
            three pages present the same project identity block. The navbar already shows the
            active project and tab, so this only needs to carry info that's NOT already visible
            in the chrome: owner and deadline. */}
        <ProjectHeader
          emoji={activeProduct.emoji}
          name={activeProduct.name}
          deadline={activeProduct.deadline}
          status={activeProduct.status}
          owner={owner?.user}
        />

        {/* Tabs - width is intentionally fit-content (not a full-width flex row like the hero rows
            above), so centering it means centering the fit-content BOX itself via mx-auto rather
            than justify-content on its own children. */}
        <div
          className="flex gap-1 p-1 rounded-xl mx-auto"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            width: 'fit-content',
          }}
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
          <div
            className="rounded-xl p-4 md:p-6 shadow-sm"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            {activeProduct.description ? (
              <div style={{ color: 'var(--text)', fontSize: 14 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                  {activeProduct.description}
                </ReactMarkdown>
              </div>
            ) : (
              <EmptyState
                icon="📝"
                description="No description yet."
                className="py-10"
                action={
                  canManage ? (
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
                  ) : undefined
                }
              />
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
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-colors w-full shadow-sm"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--brand)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <span className="text-xl flex-shrink-0">{m.user.avatarEmoji ?? '👤'}</span>
                  <span className="text-sm font-medium flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>
                    {displayName(m.user)}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium"
                    style={{
                      background: style.bg,
                      color: style.color,
                      border: `1px solid ${style.border}`,
                    }}
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
