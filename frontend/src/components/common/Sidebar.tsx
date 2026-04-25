import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useProduct } from '../../context/ProductContext';
import { useTheme } from '../../context/ThemeContext';
import { useColorLegend } from '../../hooks/useColorLegend';
import { api } from '../../api/client';
import Modal from './Modal';
import type { Product } from '../../types';

const NAV = [
  { to: '/kanban', label: 'Kanban',  icon: '▦' },
  { to: '/backlog', label: 'Backlog', icon: '☰' },
  { to: '/canvas',  label: 'Canvas',  icon: '◈' },
  { to: '/gantt',   label: 'Gantt',   icon: '📅' },
];

interface NewProductForm { name: string; emoji: string; description: string; deadline: string; }

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { products, activeProduct, setActiveProduct, tasks, createProduct, refreshProducts } = useProduct();
  const { theme, toggle } = useTheme();
  const { legend, update: updateLegend, toggleEnabled, colors, enabledColors } = useColorLegend(activeProduct?.id ?? '');

  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showColorLegend, setShowColorLegend] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [productsOpen, setProductsOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [productForm, setProductForm] = useState<NewProductForm>({ name: '', emoji: '', description: '', deadline: '' });
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [productError, setProductError] = useState('');
  const [profileForm, setProfileForm] = useState({ realName: user?.realName ?? '', avatarEmoji: user?.avatarEmoji ?? '' });
  const [savingProfile, setSavingProfile] = useState(false);

  const unassignedCount = tasks.filter((t) => t.status === 'backlog' && !t.ownerId).length;

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
    try {
      await api.seed.examples();
      await refreshProducts();
    } catch (err) { alert((err as Error).message); }
    finally { setSeeding(false); }
  }

  async function handleDeleteProduct(p: Product) {
    if (!confirm(`Delete "${p.name}"? All tasks will be permanently deleted.`)) return;
    try {
      await api.products.delete(p.id);
      await refreshProducts();
    } catch (err) { alert((err as Error).message); }
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
            onClick={() => setCollapsed(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold mb-2 flex-shrink-0 transition-opacity hover:opacity-80"
            style={{ background: 'var(--brand)' }}
            title="Expand sidebar"
          >P</button>

          {/* Nav icons */}
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                `w-8 h-8 flex items-center justify-center rounded-lg text-base transition-all ${
                  isActive ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
                }`
              }
            >
              {icon}
            </NavLink>
          ))}

          <div className="flex-1" />

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
      </>
    );
  }

  return (
    <>
      <aside className="w-56 flex-shrink-0 flex flex-col" style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>
        {/* Brand */}
        <div className="px-4 py-3.5 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ background: 'var(--brand)' }}>P</div>
          <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Planly</span>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={toggle} className="text-base opacity-50 hover:opacity-100 transition-opacity" title="Toggle theme">
              {theme === 'dark' ? '☀️' : '🌙'}
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
              </div>
            ) : (
              <div className="space-y-0.5">
                {products.map((p) => (
                  <div key={p.id} className="group relative flex items-center">
                    <button
                      onClick={() => setActiveProduct(p)}
                      className="w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2"
                      style={{
                        background: activeProduct?.id === p.id ? 'var(--brand-subtle)' : 'transparent',
                        color: activeProduct?.id === p.id ? 'var(--brand)' : 'var(--text-2)',
                        fontWeight: activeProduct?.id === p.id ? 500 : 400,
                      }}
                      onMouseEnter={(e) => { if (activeProduct?.id !== p.id) e.currentTarget.style.background = 'var(--surface-2)'; }}
                      onMouseLeave={(e) => { if (activeProduct?.id !== p.id) e.currentTarget.style.background = 'transparent'; }}
                    >
                      {p.emoji && <span className="flex-shrink-0">{p.emoji}</span>}
                      <span className="truncate">{p.name}</span>
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(p)}
                      className="absolute right-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded text-xs flex-shrink-0"
                      style={{ color: 'var(--text-3)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                      title={`Delete ${p.name}`}
                    >✕</button>
                  </div>
                ))}
                <button onClick={handleLoadExamples} disabled={seeding} className="w-full text-left text-xs px-2 py-1 transition-colors" style={{ color: 'var(--text-3)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                >
                  {seeding ? '⏳ Loading…' : '✦ Load examples'}
                </button>
              </div>
            )
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {NAV.map(({ to, label, icon }) => (
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
              </span>
              {label === 'Backlog' && unassignedCount > 0 && (
                <span className="text-xs text-white rounded-full px-1.5 py-0.5 leading-none font-medium" style={{ background: '#ef4444' }}>
                  {unassignedCount}
                </span>
              )}
            </NavLink>
          ))}

          {/* Color legend */}
          {activeProduct && (
            <button onClick={() => setShowColorLegend(true)}
              className="w-full text-left px-2 py-1.5 rounded-lg text-sm flex items-center gap-2.5 mt-2 transition-colors"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)'; }}
            >
              <span className="text-sm opacity-60">🎨</span>
              Color legend
            </button>
          )}
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
              <div className="w-20">
                <label className="label">Emoji</label>
                <input type="text" maxLength={2} value={productForm.emoji} onChange={setField('emoji')} className="input text-center text-xl" placeholder="🚀" />
              </div>
              <div className="flex-1">
                <label className="label">Name</label>
                <input type="text" required value={productForm.name} onChange={setField('name')} className="input" placeholder="My Product" autoFocus />
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
                {creating ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Create product'}
              </button>
              <button type="button" onClick={() => setShowNewProduct(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Color legend modal */}
      {showColorLegend && (
        <Modal title="Color legend" onClose={() => setShowColorLegend(false)}>
          <div className="space-y-3">
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              Toggle which colors are available in this project and give them a label.
            </p>
            {colors.map((color) => {
              const on = enabledColors.includes(color);
              return (
                <div key={color} className="flex items-center gap-3">
                  <button
                    onClick={() => toggleEnabled(color)}
                    title={on ? 'Disable color' : 'Enable color'}
                    className="w-6 h-6 rounded-full flex-shrink-0 transition-all"
                    style={{
                      background: color,
                      opacity: on ? 1 : 0.25,
                      boxShadow: on ? `0 0 0 2px var(--surface), 0 0 0 3px ${color}` : 'none',
                    }}
                  />
                  <input
                    type="text"
                    value={legend[color] ?? ''}
                    onChange={(e) => updateLegend(color, e.target.value)}
                    className="input flex-1"
                    placeholder="e.g. Bug, Feature, Design…"
                    style={{ opacity: on ? 1 : 0.4 }}
                  />
                </div>
              );
            })}
            <p className="text-xs pt-2" style={{ color: 'var(--text-3)' }}>Click a dot to toggle it on/off. Saved automatically.</p>
          </div>
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
    </>
  );
}
