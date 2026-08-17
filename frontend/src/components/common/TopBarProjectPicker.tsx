/**
 * Project picker dropdown panel - rendered when the project button is clicked in the top bar.
 * The parent (TopBar) owns the isOpen state and the wrapping ref div.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Product } from '../../types';
import type { MobileNavPosition } from '../../context/ThemeContext';

interface Props {
  products: Product[];
  activeProduct: Product | null;
  setActiveProduct: (p: Product) => void;
  chatIsAdmin: boolean;
  isAdmin: boolean;
  isOpen: boolean;
  /** Unread notification count per project id, shown as a small badge on each row. */
  unreadByProduct?: Record<string, number>;
  /** When the mobile nav bar sits at the bottom, the panel opens upward instead of downward so it
   * doesn't render off the bottom edge of the viewport. No effect at `lg:` and up (desktop is
   * always top-anchored regardless of this preference). */
  mobileNavPosition: MobileNavPosition;
  onExitAdmin: () => void;
  onShowNewProduct: () => void;
  onShowDiscover: () => void;
  onShowSeedData: () => void;
  onClose: () => void;
}

export default function TopBarProjectPicker({
  products,
  activeProduct,
  setActiveProduct,
  chatIsAdmin,
  isAdmin,
  isOpen,
  unreadByProduct,
  mobileNavPosition,
  onExitAdmin,
  onShowNewProduct,
  onShowDiscover,
  onShowSeedData,
  onClose,
}: Props) {
  const navigate = useNavigate();
  // Completed/archived projects are collapsed by default so they don't crowd out the projects
  // someone actually works in day to day - but if the currently active project IS one of them
  // (the user is mid-session inside a project they just archived, say), auto-expand so they're
  // not left wondering where their own current context went.
  const [showInactive, setShowInactive] = useState(() => !!activeProduct && activeProduct.status !== 'active');

  if (!isOpen) return null;

  const activeProjects = products.filter((p) => p.status === 'active');
  const inactiveProjects = products.filter((p) => p.status !== 'active');

  function renderRow(p: Product, dimmed: boolean) {
    return (
      <button
        key={p.id}
        onClick={() => {
          setActiveProduct(p);
          onClose();
          if (chatIsAdmin) {
            onExitAdmin();
            navigate('/kanban');
          }
        }}
        className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left transition-colors"
        style={{
          background: !chatIsAdmin && activeProduct?.id === p.id ? 'var(--brand-subtle)' : 'transparent',
          color: !chatIsAdmin && activeProduct?.id === p.id ? 'var(--brand)' : dimmed ? 'var(--text-3)' : 'var(--text)',
          opacity: dimmed && !(!chatIsAdmin && activeProduct?.id === p.id) ? 0.7 : 1,
        }}
        onMouseEnter={(e) => {
          if (chatIsAdmin || activeProduct?.id !== p.id) e.currentTarget.style.background = 'var(--surface-2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background =
            !chatIsAdmin && activeProduct?.id === p.id ? 'var(--brand-subtle)' : 'transparent';
        }}
      >
        <span className="text-base">{p.emoji ?? '🎯'}</span>
        <span className="flex-1 truncate font-medium">{p.name}</span>
        {p.status !== 'active' && (
          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{
              background: p.status === 'completed' ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)',
              color: p.status === 'completed' ? '#10b981' : 'var(--text-3)',
            }}
          >
            {p.status === 'completed' ? 'Completed' : 'Archived'}
          </span>
        )}
        {!!unreadByProduct?.[p.id] && (
          <span
            className="flex items-center justify-center rounded-full text-white text-[10px] font-bold flex-shrink-0"
            style={{
              background: '#ef4444',
              minWidth: 16,
              height: 16,
              padding: '0 4px',
            }}
          >
            {unreadByProduct[p.id]! > 99 ? '99+' : unreadByProduct[p.id]}
          </span>
        )}
        {!chatIsAdmin && activeProduct?.id === p.id && (
          <span className="text-xs font-bold" style={{ color: 'var(--brand)' }}>
            ✓
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className={`absolute right-0 w-64 rounded-2xl shadow-2xl overflow-hidden py-1.5 animate-dropdown-in ${
        mobileNavPosition === 'bottom' ? 'bottom-full mb-2 lg:bottom-auto lg:top-full lg:mt-2' : 'top-full mt-2'
      }`}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        zIndex: 50,
      }}
    >
      {chatIsAdmin && products.length > 0 && (
        <p className="px-4 pt-2 pb-1 text-[10px]" style={{ color: 'var(--text-3)' }}>
          Select a project to leave admin mode
        </p>
      )}

      {activeProjects.length > 0 && (
        <>
          <p
            className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-3)' }}
          >
            Projects
          </p>
          {activeProjects.map((p) => renderRow(p, false))}
        </>
      )}

      {inactiveProjects.length > 0 && (
        <>
          <button
            onClick={() => setShowInactive((v) => !v)}
            className="w-full flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors"
            style={{ color: 'var(--text-3)' }}
          >
            <span className="transition-transform" style={{ transform: showInactive ? 'rotate(90deg)' : 'none' }}>
              ▸
            </span>
            Completed &amp; archived ({inactiveProjects.length})
          </button>
          {showInactive && inactiveProjects.map((p) => renderRow(p, true))}
        </>
      )}

      {products.length > 0 && <div className="mx-4 my-1.5" style={{ height: 1, background: 'var(--border)' }} />}

      <button
        onClick={() => {
          onShowNewProduct();
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors"
        style={{ color: 'var(--text-2)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ background: 'var(--brand)', color: 'white' }}
        >
          +
        </span>
        New project
      </button>
      <button
        onClick={() => {
          onShowDiscover();
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors"
        style={{ color: 'var(--text-2)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <span className="text-base leading-none">🔭</span>
        Find projects
      </button>
      {isAdmin && (
        <>
          <div className="mx-4 my-1.5" style={{ height: 1, background: 'var(--border)' }} />
          <button
            onClick={() => {
              onShowSeedData();
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors"
            style={{ color: 'var(--text-2)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span>✦</span> Load examples
          </button>
        </>
      )}
    </div>
  );
}
