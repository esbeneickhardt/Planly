import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import AvatarPicker from './AvatarPicker';
import { useAuth } from '../../context/AuthContext';
import { useProduct } from '../../context/ProductContext';
import { usePermission } from '../../context/PermissionContext';
import { useTheme } from '../../context/ThemeContext';
import { api } from '../../api/client';
import Modal from './Modal';
import DiscoverProjectsModal from './DiscoverProjectsModal';
import type { Product } from '../../types';

// ── Icons ──────────────────────────────────────────────────────────────────

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ChevronDown = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
);

const PlanIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" />
    <line x1="8.09" y1="13.51" x2="15.91" y2="17.49" /><line x1="15.91" y1="6.51" x2="8.09" y2="10.49" />
  </svg>
);

const ExecuteIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
    <rect x="3" y="3" width="5" height="18" rx="1" /><rect x="10" y="3" width="5" height="13" rx="1" /><rect x="17" y="3" width="5" height="16" rx="1" />
  </svg>
);

const ProgressIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="4" width="14" height="4" rx="2" opacity="0.9" /><rect x="3" y="10" width="9" height="4" rx="2" opacity="0.65" /><rect x="3" y="16" width="17" height="4" rx="2" opacity="0.4" />
    <rect x="3" y="16" width="11" height="4" rx="2" opacity="0.65" />
  </svg>
);

const TasksIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <line x1="9" y1="6" x2="21" y2="6" /><line x1="9" y1="12" x2="21" y2="12" /><line x1="9" y1="18" x2="21" y2="18" />
    <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

const CategoriesIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="2" y="2" width="9.5" height="9.5" rx="2" opacity="0.85" />
    <rect x="12.5" y="2" width="9.5" height="9.5" rx="2" opacity="0.55" />
    <rect x="2" y="12.5" width="9.5" height="9.5" rx="2" opacity="0.55" />
    <rect x="12.5" y="12.5" width="9.5" height="9.5" rx="2" opacity="0.3" />
  </svg>
);

const ChatIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
  </svg>
);

// ── Nav config ─────────────────────────────────────────────────────────────

const NAV = [
  { to: '/canvas',  label: 'Plan',     Icon: PlanIcon,     tab: 'canvas' },
  { to: '/kanban',  label: 'Execute',  Icon: ExecuteIcon,  tab: 'kanban' },
  { to: '/gantt',   label: 'Progress', Icon: ProgressIcon, tab: 'gantt' },
  { to: '/backlog', label: 'Tasks',    Icon: TasksIcon,    tab: 'backlog' },
];

interface NewProductForm { name: string; emoji: string; description: string; deadline: string; }

// ── Component ──────────────────────────────────────────────────────────────

export default function TopBar({ onOpenSearch, onOpenChat, chatOpen }: { onOpenSearch: () => void; onOpenChat: () => void; chatOpen?: boolean }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { products, activeProduct, setActiveProduct, tasks, createProduct, refreshProducts } = useProduct();
  const { canRead, canManage } = usePermission();
  const { theme, toggle } = useTheme();
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showProjectDd, setShowProjectDd] = useState(false);
  const [showAccountDd, setShowAccountDd] = useState(false);
  const [productForm, setProductForm] = useState<NewProductForm>({ name: '', emoji: '', description: '', deadline: '' });
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [productError, setProductError] = useState('');
  const [profileForm, setProfileForm] = useState({ realName: user?.realName ?? '', avatarEmoji: user?.avatarEmoji ?? '', avatarUrl: user?.avatarUrl ?? null as string | null });
  const [savingProfile, setSavingProfile] = useState(false);

  const projectRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (projectRef.current && !projectRef.current.contains(e.target as Node)) setShowProjectDd(false);
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setShowAccountDd(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const overdueCount = tasks.filter((t) => t.deadline && t.status !== 'done' && new Date(t.deadline) < new Date()).length;
  const unassignedCount = tasks.filter((t) => t.status !== 'done' && !t.ownerId).length;

  function setField(f: keyof NewProductForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setProductForm((prev) => ({ ...prev, [f]: e.target.value }));
  }

  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    setProductError('');
    setCreating(true);
    try {
      await createProduct({ name: productForm.name, emoji: productForm.emoji || undefined, description: productForm.description || undefined, deadline: productForm.deadline });
      setShowNewProduct(false);
      setProductForm({ name: '', emoji: '', description: '', deadline: '' });
    } catch (err) { setProductError((err as Error).message); }
    finally { setCreating(false); }
  }

  async function handleLoadExamples() {
    if (!confirm('This will add 2 example products to your workspace. Continue?')) return;
    setSeeding(true);
    try { await api.seed.examples(); await refreshProducts(); }
    catch (err) { alert((err as Error).message); }
    finally { setSeeding(false); }
  }

  async function handleDeleteProduct(p: Product, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${p.name}"? All tasks will be permanently deleted.`)) return;
    try { await api.products.delete(p.id); await refreshProducts(); }
    catch (err) { alert((err as Error).message); }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    try {
      await api.users.update(user.id, {
        realName: profileForm.realName || undefined,
        avatarEmoji: profileForm.avatarUrl ? undefined : (profileForm.avatarEmoji || undefined),
        avatarUrl: profileForm.avatarUrl ?? undefined,
      });
      window.location.reload();
    } catch (err) { alert((err as Error).message); }
    finally { setSavingProfile(false); }
  }

  return (
    <>
      <header
        className="flex-shrink-0 flex items-center h-14 px-3 gap-2"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', zIndex: 40 }}
      >
        {/* ── LEFT: logo + search ── */}
        <div className="flex items-center gap-2.5 flex-shrink-0" style={{ width: 288 }}>
          <button
            onClick={() => navigate('/kanban')}
            className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0 transition-opacity hover:opacity-80"
            title="Go to Kanban"
          >
            <img src="/icons/icon.jpg" alt="Planly" className="w-full h-full object-cover" style={{ transform: 'scale(1.25)', transformOrigin: 'center' }} />
          </button>
          <button
            onClick={onOpenSearch}
            className="flex items-center gap-2 flex-1 h-9 px-3 rounded-full text-sm transition-all"
            style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--brand)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <SearchIcon />
            <span className="flex-1 text-left text-xs">Search in Planly</span>
            <kbd className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>⌘K</kbd>
          </button>
        </div>

        {/* ── CENTER: nav tabs ── */}
        <nav className="flex-1 flex items-stretch justify-center h-full">
          {NAV.filter(({ tab }) => !activeProduct || canRead(tab)).map(({ to, label, Icon }) => {
            const badge = label === 'Tasks' ? unassignedCount : label === 'Progress' ? overdueCount : 0;
            return (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `relative flex flex-col items-center justify-center gap-0.5 w-24 text-[11px] font-medium tracking-wide transition-colors rounded-none ${
                    isActive
                      ? 'text-[var(--brand)]'
                      : 'text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="relative">
                      <Icon />
                      {badge > 0 && (
                        <span
                          className="absolute -top-1.5 -right-2.5 text-white rounded-full text-[9px] font-bold leading-none flex items-center justify-center"
                          style={{ background: '#ef4444', minWidth: 14, height: 14, padding: '0 3px' }}
                        >
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </div>
                    <span>{label}</span>
                    {isActive && (
                      <div className="absolute bottom-0 left-6 right-6 h-[3px] rounded-t-full" style={{ background: 'var(--brand)' }} />
                    )}
                  </>
                )}
              </NavLink>
            );
          })}

          {/* Settings — only for owners/co-owners */}
          {(!activeProduct || canManage) && <NavLink
            to="/settings"
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center gap-0.5 w-24 text-[11px] font-medium tracking-wide transition-colors ${isActive ? 'text-[var(--text)]' : 'text-[var(--text-3)]'}`
            }
            style={({ isActive }) => ({ color: isActive ? 'var(--text)' : undefined })}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--surface-2)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = ''; e.currentTarget.style.background = 'transparent'; }}
          >
            {({ isActive }) => (
              <>
                <CategoriesIcon />
                <span>Settings</span>
                {isActive && (
                  <div className="absolute bottom-0 left-6 right-6 h-[3px] rounded-t-full" style={{ background: 'var(--brand)' }} />
                )}
              </>
            )}
          </NavLink>}
        </nav>

        {/* ── RIGHT: chat + project + account ── */}
        <div className="flex items-center gap-1.5 flex-shrink-0" style={{ width: 288, justifyContent: 'flex-end' }}>

          {/* Project chat */}
          <button
            onClick={onOpenChat}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
            style={{
              color: chatOpen ? 'var(--brand)' : 'var(--text-3)',
              background: chatOpen ? 'var(--brand-subtle)' : 'var(--surface-2)',
              border: chatOpen ? '1px solid var(--brand)' : '1px solid transparent',
            }}
            title="Project chat"
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = chatOpen ? 'var(--brand)' : 'var(--text-3)')}
          >
            <ChatIcon />
          </button>

          {/* Project picker */}
          <div ref={projectRef} className="relative">
            <button
              onClick={() => { setShowProjectDd((v) => !v); setShowAccountDd(false); }}
              className="flex items-center gap-1.5 h-9 px-2.5 rounded-full transition-all text-sm flex-shrink-0"
              style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--brand)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <span className="text-lg leading-none">{activeProduct?.emoji ?? '📁'}</span>
              <span className="text-xs font-medium max-w-[72px] truncate">{activeProduct?.name ?? 'Project'}</span>
              <ChevronDown />
            </button>

            {showProjectDd && (
              <div
                className="absolute right-0 top-full mt-2 w-64 rounded-2xl shadow-2xl overflow-hidden py-1.5"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', zIndex: 50 }}
              >
                {products.length > 0 && (
                  <>
                    <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Projects</p>
                    {products.map((p) => (
                      <div key={p.id} className="group relative flex items-center">
                        <button
                          onClick={() => { setActiveProduct(p); setShowProjectDd(false); }}
                          className="flex-1 flex items-center gap-2.5 px-4 py-2 text-sm text-left transition-colors"
                          style={{
                            background: activeProduct?.id === p.id ? 'var(--brand-subtle)' : 'transparent',
                            color: activeProduct?.id === p.id ? 'var(--brand)' : 'var(--text)',
                          }}
                          onMouseEnter={(e) => { if (activeProduct?.id !== p.id) e.currentTarget.style.background = 'var(--surface-2)'; }}
                          onMouseLeave={(e) => { if (activeProduct?.id !== p.id) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <span className="text-base">{p.emoji ?? '📁'}</span>
                          <span className="flex-1 truncate font-medium">{p.name}</span>
                          {activeProduct?.id === p.id && <span className="text-xs font-bold" style={{ color: 'var(--brand)' }}>✓</span>}
                        </button>
                        {p.ownerId === user?.id && (
                          <button
                            onClick={(e) => handleDeleteProduct(p, e)}
                            className="absolute right-3 opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center transition-all text-xs"
                            style={{ color: 'var(--text-3)' }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                            title={`Delete ${p.name}`}
                          >✕</button>
                        )}
                      </div>
                    ))}
                    <div className="mx-4 my-1.5" style={{ height: 1, background: 'var(--border)' }} />
                  </>
                )}
                <button
                  onClick={() => { setShowNewProduct(true); setShowProjectDd(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors"
                  style={{ color: 'var(--text-2)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: 'var(--brand)', color: 'white' }}>+</span>
                  New project
                </button>
                <button
                  onClick={() => { setShowDiscover(true); setShowProjectDd(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors"
                  style={{ color: 'var(--text-2)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="text-base leading-none">🔭</span>
                  Find projects
                </button>
                {products.length === 0 && (
                  <button
                    onClick={() => { handleLoadExamples(); setShowProjectDd(false); }}
                    disabled={seeding}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors"
                    style={{ color: 'var(--text-2)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span>✦</span> {seeding ? 'Loading…' : 'Load examples'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Account */}
          <div ref={accountRef} className="relative">
            <button
              onClick={() => { setShowAccountDd((v) => !v); setShowProjectDd(false); }}
              className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-base transition-all flex-shrink-0"
              style={{ background: 'var(--surface-2)', border: '2px solid var(--border)' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--brand)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              title={user?.realName ?? user?.username}
            >
              {user?.avatarUrl
                ? <img src={user.avatarUrl} className="w-full h-full object-cover" alt="" />
                : (user?.avatarEmoji ?? '👤')}
            </button>

            {showAccountDd && (
              <div
                className="absolute right-0 top-full mt-2 w-56 rounded-2xl shadow-2xl overflow-hidden py-1.5"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', zIndex: 50 }}
              >
                {/* User info — click avatar to edit profile */}
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { setShowProfile(true); setShowAccountDd(false); }}
                      className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-2xl flex-shrink-0 relative group transition-opacity hover:opacity-80"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                      title="Edit profile"
                    >
                      {user?.avatarUrl
                        ? <img src={user.avatarUrl} className="w-full h-full object-cover" alt="" />
                        : (user?.avatarEmoji ?? '👤')}
                      <div className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.35)', fontSize: 11, color: 'white', fontWeight: 600 }}>Edit</div>
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{user?.realName ?? user?.username}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>@{user?.username}</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={toggle}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                  style={{ color: 'var(--text-2)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="w-5 text-center flex-shrink-0">{theme === 'dark' ? '☀️' : '🌙'}</span>
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>
                <button
                  onClick={() => { setShowProfile(true); setShowAccountDd(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                  style={{ color: 'var(--text-2)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="w-5 text-center flex-shrink-0">✏️</span>
                  Edit profile
                </button>
                <div className="mx-4 my-1" style={{ height: 1, background: 'var(--border)' }} />
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                  style={{ color: '#ef4444' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="w-5 text-center flex-shrink-0">⏻</span>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Modals ── */}

      {showNewProduct && (
        <Modal title="New project" onClose={() => setShowNewProduct(false)}>
          <form onSubmit={handleCreateProduct} className="space-y-4">
            <div className="flex gap-3">
              <div className="w-20">
                <label className="label">Emoji</label>
                <input type="text" maxLength={2} value={productForm.emoji} onChange={setField('emoji')} className="input text-center text-xl" placeholder="🚀" />
              </div>
              <div className="flex-1">
                <label className="label">Name</label>
                <input type="text" required value={productForm.name} onChange={setField('name')} className="input" placeholder="My Project" autoFocus />
              </div>
            </div>
            <div>
              <label className="label">Description</label>
              <input type="text" value={productForm.description} onChange={setField('description')} className="input" placeholder="What's the vision?" />
            </div>
            <div>
              <label className="label">Target deadline</label>
              <input type="date" required value={productForm.deadline} onChange={setField('deadline')} className="input" />
            </div>
            {productError && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{productError}</div>}
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={creating} className="btn-primary flex-1 flex justify-center">
                {creating ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Create project'}
              </button>
              <button type="button" onClick={() => setShowNewProduct(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {showDiscover && <DiscoverProjectsModal onClose={() => setShowDiscover(false)} />}

      {showProfile && (
        <Modal title="Edit profile" onClose={() => setShowProfile(false)} width="max-w-sm">
          <form onSubmit={handleSaveProfile} className="space-y-4">
            {/* Avatar preview */}
            <div className="flex flex-col items-center gap-1 pb-1">
              <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-4xl flex-shrink-0" style={{ background: 'var(--surface-2)', border: '2px solid var(--border)' }}>
                {profileForm.avatarUrl
                  ? <img src={profileForm.avatarUrl} className="w-full h-full object-cover" alt="" />
                  : (profileForm.avatarEmoji || '👤')}
              </div>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>Pick an avatar below</p>
            </div>

            {/* Avatar picker */}
            <AvatarPicker
              current={{ avatarEmoji: profileForm.avatarEmoji, avatarUrl: profileForm.avatarUrl }}
              onChange={(v) => setProfileForm((p) => ({ ...p, avatarEmoji: v.avatarEmoji ?? (v.avatarUrl ? '' : p.avatarEmoji), avatarUrl: v.avatarUrl ?? null }))}
            />

            <div>
              <label className="label">Full name</label>
              <input type="text" value={profileForm.realName} onChange={(e) => setProfileForm((p) => ({ ...p, realName: e.target.value }))} className="input" placeholder="Your name" />
            </div>
            <div>
              <label className="label">Username</label>
              <input type="text" className="input opacity-50" value={user?.username ?? ''} disabled />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input opacity-50" value={user?.email ?? ''} disabled />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={savingProfile} className="btn-primary flex-1 flex justify-center">
                {savingProfile ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Save changes'}
              </button>
              <button type="button" onClick={() => setShowProfile(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
