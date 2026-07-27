/**
 * Project picker dropdown panel — rendered when the project button is clicked in the top bar.
 * The parent (TopBar) owns the isOpen state and the wrapping ref div.
 */
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
  mobileNavPosition,
  onExitAdmin,
  onShowNewProduct,
  onShowDiscover,
  onShowSeedData,
  onClose,
}: Props) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <div
      className={`absolute right-0 w-64 rounded-2xl shadow-2xl overflow-hidden py-1.5 animate-dropdown-in ${
        mobileNavPosition === 'bottom' ? 'bottom-full mb-2 lg:bottom-auto lg:top-full lg:mt-2' : 'top-full mt-2'
      }`}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', zIndex: 50 }}
    >
      {chatIsAdmin && products.length > 0 && (
        <p className="px-4 pt-2 pb-1 text-[10px]" style={{ color: 'var(--text-3)' }}>
          Select a project to leave admin mode
        </p>
      )}

      {products.length > 0 && (
        <>
          <p
            className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-3)' }}
          >
            Projects
          </p>
          {products.map((p) => (
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
                color: !chatIsAdmin && activeProduct?.id === p.id ? 'var(--brand)' : 'var(--text)',
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
              {!chatIsAdmin && activeProduct?.id === p.id && (
                <span className="text-xs font-bold" style={{ color: 'var(--brand)' }}>
                  ✓
                </span>
              )}
            </button>
          ))}
          <div className="mx-4 my-1.5" style={{ height: 1, background: 'var(--border)' }} />
        </>
      )}

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
