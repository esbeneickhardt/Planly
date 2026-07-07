import { useState } from 'react';
import { NavLink, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useProduct } from '../../context/ProductContext';
import { usePermission } from '../../context/PermissionContext';
import { useConfirm } from '../../context/ConfirmContext';
import { api } from '../../api/client';
import Modal from './Modal';
import DiscoverProjectsModal from './DiscoverProjectsModal';
import EmojiPicker from './EmojiPicker';
import ThemePickerModal from './ThemePickerModal';
import { ADMIN_TABS } from '../../pages/AdminPage';

const NAV = [
  { to: '/kanban',    label: 'Kanban',    icon: '▦',  tab: 'kanban' },
  { to: '/backlog',   label: 'Tasks',     icon: '☰',  tab: 'backlog' },
  { to: '/canvas',    label: 'Plan',      icon: '◈',  tab: 'canvas' },
  { to: '/gantt',     label: 'Gantt',     icon: '📅', tab: 'gantt' },
  { to: '/analytics', label: 'Analytics', icon: '📊', tab: 'analytics' },
  { to: '/settings',  label: 'Settings',  icon: '⚙',  tab: 'categories' },
];

interface NewProductForm { name: string; emoji: string; description: string; deadline: string; }

export default function Sidebar({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const { user, logout } = useAuth();
  const { products, activeProduct, setActiveProduct, tasks, createProduct, refreshProducts } = useProduct();
  const { canRead, levelFor, canManage } = usePermission();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdminPage = location.pathname === '/admin';
  const adminTab = searchParams.get('tab') ?? 'ownership';
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [productsOpen, setProductsOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [productForm, setProductForm] = useState<NewProductForm>({ name: '', emoji: '', description: '', deadline: '' });
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [productError, setProductError] = useState('');
  const [profileForm, setProfileForm] = useState({ realName: user?.realName ?? '', avatarEmoji: user?.avatarEmoji ?? '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [showProductEmojiPicker, setShowProductEmojiPicker] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);

  const unassignedCount = tasks.filter((t) => t.status === 'backlog' && !t.ownerId).length;
  const overdueCount = tasks.filter((t) => t.deadline && t.status !== 'done' && new Date(t.deadline) < new Date()).length;

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
      setShowProductEmojiPicker(false);
      setProductForm({ name: '', emoji: '', description: '', deadline: '' });
    } catch (err) { setProductError((err as Error).message); }
    finally { setCreating(false); }
  }

  async function handleLoadExamples() {
    if (!await confirm('This will add 2 example products to your workspace. Continue?')) return;
    setSeeding(true);
    try {
      await api.seed.examples();
      await refreshProducts();
    } catch (err) { alert((err as Error).message); }
    finally { setSeeding(false); }
  }


  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    try {
      await api.users.update(user.id, { realName: profileForm.realName || undefined, avatarEmoji: profileForm.avatarEmoji || undefined });
      window.location.reload();
    } catch (err) { alert((err as Error).message); }
    finally { setSavingProfile(false); }
  }

  if (collapsed) {
    return (
      <>
        <aside className="w-12 flex-shrink-0 flex flex-col items-center py-3 gap-1" style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>
          {/* Brand / expand */}
          <button
            onClick={() => { setCollapsed(false); navigate('/kanban'); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold mb-2 flex-shrink-0 transition-opacity hover:opacity-80"
            style={{ background: 'var(--brand)' }}
            title="Go to Kanban"
          >P</button>

          {/* Nav icons */}
          {isAdminPage ? (
            ADMIN_TABS.map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setSearchParams({ tab: key })}
                title={label}
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-base transition-all ${
                  adminTab === key ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
                }`}
              >
                {icon}
              </button>
            ))
          ) : (
            activeProduct && NAV.filter(({ tab }) => tab === 'categories' ? canManage : canRead(tab)).map(({ to, label, icon, tab }) => (
              <NavLink
                key={to}
                to={to}
                title={levelFor(tab) === 'read' ? `${label} (read-only)` : label}
                className={({ isActive }) =>
                  `w-8 h-8 flex items-center justify-center rounded-lg text-base transition-all relative ${
                    isActive ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
                  }`
                }
              >
                {icon}
                {levelFor(tab) === 'read' && <span style={{ position: 'absolute', top: 0, right: 0, fontSize: 8 }}>🔒</span>}
              </NavLink>
            ))
          )}
          <div className="flex-1" />

          {user?.announcementsEnabled && (
            <NavLink
              to="/announcements"
              state={{ adminContext: isAdminPage }}
              title="Announcements"
              className={({ isActive }) =>
                `w-8 h-8 flex items-center justify-center rounded-lg text-base transition-all ${
                  isActive ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
                }`
              }
            >
              📢
            </NavLink>
          )}

          {/* Admin icon - only shown when NOT already on admin page */}
          {user?.isAdmin && !isAdminPage && (
            <NavLink
              to="/admin"
              title="Admin"
              className={({ isActive }) =>
                `w-8 h-8 flex items-center justify-center rounded-lg text-base transition-all ${
                  isActive ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
                }`
              }
            >
              🛡️
            </NavLink>
          )}

          {/* Find projects icon */}
          <button
            onClick={() => setShowDiscover(true)}
            title="Find projects"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-base transition-all text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            🔭
          </button>

          {/* Appearance */}
          <button
            onClick={() => setShowThemePicker(true)}
            title="Appearance"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-base transition-all text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            🎨
          </button>

          {/* Avatar */}
          <button
            onClick={() => { setCollapsed(false); setShowProfile(true); }}
            title={user?.realName ?? user?.username}
            className="w-8 h-8 rounded-full flex items-center justify-center text-base transition-opacity hover:opacity-80"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            {user?.avatarEmoji ?? '👤'}
          </button>
        </aside>
        {showDiscover && <DiscoverProjectsModal onClose={() => setShowDiscover(false)} />}
        {showThemePicker && <ThemePickerModal onClose={() => setShowThemePicker(false)} />}
      </>
    );
  }

  return (
    <>
      <aside className="w-56 flex-shrink-0 flex flex-col" style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>
        {/* Brand */}
        <div className="px-4 py-3.5 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <button onClick={() => navigate('/kanban')} className="flex items-center gap-2 flex-shrink-0 transition-opacity hover:opacity-80" title="Go to Kanban">
            <div className="w-7 h-7 rounded-lg flex-shrink-0 overflow-hidden">
              <img src="/icons/icon.jpg" alt="Planly" className="w-[125%] h-[125%] object-cover" style={{ margin: '-12.5%' }} />
            </div>
            <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Planly</span>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setShowThemePicker(true)} className="text-base opacity-50 hover:opacity-100 transition-opacity" title="Appearance">
              🎨
            </button>
            <button
              onClick={() => setCollapsed(true)}
              className="text-xs opacity-40 hover:opacity-100 transition-opacity px-1"
              style={{ color: 'var(--text-3)' }}
              title="Collapse sidebar"
            >‹</button>
          </div>
        </div>


        {/* Products */}
        <div className="px-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-2 px-1">
            <button
              onClick={() => setProductsOpen((v) => !v)}
              className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest transition-opacity hover:opacity-75"
              style={{ color: 'var(--text-3)' }}
            >
              <span className="text-[9px] leading-none">{productsOpen ? '▾' : '▸'}</span>
              Products
            </button>
            <button
              onClick={() => setShowNewProduct(true)}
              className="w-5 h-5 rounded flex items-center justify-center text-sm font-bold transition-colors"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
              title="New product"
            >+</button>
          </div>

          {productsOpen && (
            products.length === 0 ? (
              <div className="space-y-1">
                <button onClick={() => setShowNewProduct(true)} className="w-full text-left text-xs px-2 py-2 rounded-lg border border-dashed transition-colors" style={{ color: 'var(--text-3)', borderColor: 'var(--border)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                >
                  + Create first product
                </button>
                <button onClick={handleLoadExamples} disabled={seeding} className="w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                >
                  {seeding ? '⏳' : '✦'} Load example projects
                </button>
                <button onClick={() => setShowDiscover(true)} className="w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                >
                  🔭 Find projects
                </button>
              </div>
            ) : (
              <div className="space-y-0.5">
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActiveProduct(p)}
                    className="w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2 min-w-0"
                    style={{
                      background: activeProduct?.id === p.id ? 'var(--brand-subtle)' : 'transparent',
                      color: activeProduct?.id === p.id ? 'var(--brand)' : 'var(--text-2)',
                      fontWeight: activeProduct?.id === p.id ? 500 : 400,
                    }}
                    onMouseEnter={(e) => { if (activeProduct?.id !== p.id) e.currentTarget.style.background = 'var(--surface-2)'; }}
                    onMouseLeave={(e) => { if (activeProduct?.id !== p.id) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {p.emoji && <span className="flex-shrink-0">{p.emoji}</span>}
                    <span className="truncate min-w-0">{p.name}</span>
                  </button>
                ))}
                <button onClick={handleLoadExamples} disabled={seeding} className="w-full text-left text-xs px-2 py-1 transition-colors" style={{ color: 'var(--text-3)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                >
                  {seeding ? '⏳ Loading…' : '✦ Load examples'}
                </button>
                <button onClick={() => setShowDiscover(true)} className="w-full text-left text-xs px-2 py-1 transition-colors" style={{ color: 'var(--text-3)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                >
                  🔭 Find projects
                </button>
              </div>
            )
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {isAdminPage ? (
            <>
              <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Admin Panel</p>
              {ADMIN_TABS.map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => setSearchParams({ tab: key })}
                  className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm text-left transition-all ${
                    adminTab === key
                      ? 'bg-[var(--surface-2)] text-[var(--text)] font-medium'
                      : 'text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
                  }`}
                >
                  <span className="text-sm opacity-60">{icon}</span>
                  {label}
                </button>
              ))}
            </>
          ) : (
            <>
              {activeProduct && NAV.filter(({ tab }) => tab === 'categories' ? canManage : canRead(tab)).map(({ to, label, icon, tab }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-2 py-1.5 rounded-lg text-sm transition-all ${
                      isActive
                        ? 'bg-[var(--surface-2)] text-[var(--text)] font-medium'
                        : 'text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
                    }`
                  }
                >
                  <span className="flex items-center gap-2.5">
                    <span className="text-sm opacity-60">{icon}</span>
                    {label}
                    {levelFor(tab) === 'read' && <span className="text-[10px] opacity-50">🔒</span>}
                  </span>
                  {tab === 'backlog' && unassignedCount > 0 && (
                    <span className="text-xs text-white rounded-full px-1.5 py-0.5 leading-none font-medium" style={{ background: '#ef4444' }}>
                      {unassignedCount}
                    </span>
                  )}
                  {tab === 'gantt' && overdueCount > 0 && (
                    <span className="text-xs text-white rounded-full px-1.5 py-0.5 leading-none font-medium" style={{ background: '#ef4444' }}>
                      {overdueCount}
                    </span>
                  )}
                </NavLink>
              ))}

              {user?.announcementsEnabled && (
                <NavLink
                  to="/announcements"
                  state={{ adminContext: isAdminPage }}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-all ${
                      isActive
                        ? 'bg-[var(--surface-2)] text-[var(--text)] font-medium'
                        : 'text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
                    }`
                  }
                >
                  <span className="text-sm opacity-60">📢</span>
                  Announcements
                </NavLink>
              )}

              {/* Admin panel link - only shown when not already on admin page */}
              {user?.isAdmin && (
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-all ${
                      isActive
                        ? 'bg-[var(--surface-2)] text-[var(--text)] font-medium'
                        : 'text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
                    }`
                  }
                >
                  <span className="text-sm opacity-60">🛡️</span>
                  Admin
                  {user?.isFoundingAdmin && <span className="ml-auto text-xs">👑</span>}
                </NavLink>
              )}
            </>
          )}

          {/* Search */}
          <button onClick={onOpenSearch}
            className="w-full text-left px-2 py-1.5 rounded-lg text-sm flex items-center justify-between gap-2.5 mt-2 transition-colors"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)'; }}
          >
            <span className="flex items-center gap-2.5">
              <span className="text-sm opacity-60">🔍</span>
              Search
            </span>
            <kbd className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>⌘K</kbd>
          </button>

        </nav>

        {/* User section */}
        <div className="px-3 py-3" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setShowProfile(true)}
            className="w-full flex items-center gap-2.5 px-1 py-1 rounded-lg transition-colors text-left"
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-base flex-shrink-0" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              {user?.avatarEmoji ?? '👤'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{user?.realName ?? user?.username}</p>
              <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>Edit profile</p>
            </div>
          </button>
          <button
            onClick={logout}
            className="w-full mt-1 text-left text-xs px-2 py-1.5 rounded-lg flex items-center gap-2 transition-colors"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <span>⏻</span> Sign out
          </button>
        </div>
      </aside>

      {/* New product modal */}
      {showNewProduct && (
        <Modal title="New product" onClose={() => setShowNewProduct(false)}>
          <form onSubmit={handleCreateProduct} className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <label className="label">Icon</label>
                <button
                  type="button"
                  onClick={() => setShowProductEmojiPicker((v) => !v)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-colors"
                  style={{ background: showProductEmojiPicker ? 'var(--brand-subtle)' : 'var(--surface-2)', border: `1px solid ${showProductEmojiPicker ? 'var(--brand)' : 'var(--border)'}` }}
                  title="Pick an icon"
                >
                  {productForm.emoji || '🎯'}
                </button>
              </div>
              <div className="flex-1">
                <label className="label">Name</label>
                <input type="text" required value={productForm.name} onChange={setField('name')} className="input" placeholder="My Product" autoFocus />
              </div>
            </div>

            {showProductEmojiPicker && (
              <div>
                <EmojiPicker
                  value={productForm.emoji}
                  onChange={(e) => { setProductForm((f) => ({ ...f, emoji: e })); setShowProductEmojiPicker(false); }}
                />
                {productForm.emoji && (
                  <button
                    type="button"
                    onClick={() => { setProductForm((f) => ({ ...f, emoji: '' })); setShowProductEmojiPicker(false); }}
                    className="mt-1 w-full text-xs py-1 rounded-lg"
                    style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}
                  >Remove icon</button>
                )}
              </div>
            )}

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
                {creating ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Create product'}
              </button>
              <button type="button" onClick={() => setShowNewProduct(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Profile modal */}
      {showProfile && (
        <Modal title="Edit profile" onClose={() => setShowProfile(false)} width="max-w-sm">
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-3xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                {profileForm.avatarEmoji || '👤'}
              </div>
              <div className="flex-1">
                <label className="label">Avatar emoji</label>
                <input type="text" maxLength={2} value={profileForm.avatarEmoji} onChange={(e) => setProfileForm((p) => ({ ...p, avatarEmoji: e.target.value }))} className="input" placeholder="👤" />
              </div>
            </div>
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

      {/* Discover projects modal */}
      {showDiscover && <DiscoverProjectsModal onClose={() => setShowDiscover(false)} />}
      {showThemePicker && <ThemePickerModal onClose={() => setShowThemePicker(false)} />}
    </>
  );
}
