import { ReactNode, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopBar from './TopBar';
import SearchModal from './SearchModal';
import ChatPanel from './ChatPanel';
import PlanlyVisionModal, { shouldShowWelcome } from './PlanlyVisionModal';
import { usePermission } from '../../context/PermissionContext';
import { useProduct } from '../../context/ProductContext';

const TAB_ROUTES: { path: string; tab: string }[] = [
  { path: '/canvas',  tab: 'canvas' },
  { path: '/kanban',  tab: 'kanban' },
  { path: '/gantt',   tab: 'gantt' },
  { path: '/backlog', tab: 'backlog' },
];

function PermissionGuard({ children }: { children: ReactNode }) {
  const { canRead } = usePermission();
  const { activeProduct } = useProduct();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!activeProduct) return;
    const current = TAB_ROUTES.find((r) => location.pathname.startsWith(r.path));
    if (!current) return;
    if (canRead(current.tab)) return;
    // Redirect to the first tab they can access
    const fallback = TAB_ROUTES.find((r) => canRead(r.tab));
    if (fallback) navigate(fallback.path, { replace: true });
  }, [location.pathname, activeProduct?.id, canRead]);

  return <>{children}</>;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const [showSearch, setShowSearch] = useState(false);
  const [showProductChat, setShowProductChat] = useState(false);
  const [showVision, setShowVision] = useState(false);
  const { products } = useProduct();

  // Auto-show vision modal for first-time users with no projects
  useEffect(() => {
    if (products !== undefined && shouldShowWelcome(products.length === 0)) {
      setShowVision(true);
    }
  }, [products?.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setShowSearch(true); }
      if (e.key === 'Escape') setShowSearch(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <TopBar
        onOpenSearch={() => setShowSearch(true)}
        onOpenChat={() => setShowProductChat((v) => !v)}
        onOpenVision={() => setShowVision(true)}
        chatOpen={showProductChat}
      />
      <PermissionGuard>
        <main className="flex-1 overflow-auto min-w-0">{children}</main>
      </PermissionGuard>
      {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
      {showProductChat && (
        <>
          <div
            className="fixed inset-0 z-[59]"
            onClick={() => setShowProductChat(false)}
          />
          <ChatPanel onClose={() => setShowProductChat(false)} />
        </>
      )}
      {showVision && <PlanlyVisionModal onClose={() => setShowVision(false)} />}
    </div>
  );
}
