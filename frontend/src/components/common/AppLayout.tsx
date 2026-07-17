/**
 * Root layout that wraps every authenticated page with TopBar, Sidebar, ChatPanel, and SearchModal.
 * Provides `ChatContext` so any component can call `openChat` to open the product or admin chat.
 * `adminMode` persists across navigation once activated; `PermissionGuard` redirects when the current tab becomes inaccessible.
 */
import { ReactNode, useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopBar from './TopBar';
import SearchModal from './SearchModal';
import ChatPanel from './ChatPanel';
import PlanlyVisionModal, { shouldShowWelcome } from './PlanlyVisionModal';
import { usePermission } from '../../context/PermissionContext';
import { useProduct } from '../../context/ProductContext';
import { useAuth } from '../../context/AuthContext';
import { ChatContext } from '../../context/ChatContext';

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
    const fallback = TAB_ROUTES.find((r) => canRead(r.tab));
    if (fallback) navigate(fallback.path, { replace: true });
  }, [location.pathname, activeProduct?.id, canRead]);

  return <>{children}</>;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  // State
  const [showSearch, setShowSearch] = useState(false);
  const [showProductChat, setShowProductChat] = useState(false);
  const [chatInitialTask, setChatInitialTask] = useState<{ id: string; name: string } | undefined>();
  const [showAdminChat, setShowAdminChat] = useState(false);
  const [showVision, setShowVision] = useState(false);
  // adminMode persists across navigation away from /admin
  const [adminMode, setAdminMode] = useState(false);

  const openProductChat = useCallback((taskId?: string, taskName?: string) => {
    setChatInitialTask(taskId ? { id: taskId, name: taskName! } : undefined);
    setShowProductChat(true);
  }, []);
  const { products } = useProduct();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Sync adminMode with the current route: activate on /admin; deactivate on non-admin pages
  // Announcements is a neutral page — keep adminMode while navigating to/from it
  const isAdminPage = location.pathname === '/admin';
  const isAdminNeutralPage = location.pathname === '/announcements';
  useEffect(() => {
    if (isAdminPage && user?.isAdmin) setAdminMode(true);
    else if (!isAdminPage && !isAdminNeutralPage) setAdminMode(false);
  }, [isAdminPage, isAdminNeutralPage, user?.isAdmin]);

  // Auto-show vision modal for first-time users with no projects
  useEffect(() => {
    if (products !== undefined && shouldShowWelcome(products.length === 0)) {
      setShowVision(true);
    }
  }, [products?.length]);

  // Keyboard shortcuts: Ctrl+K opens search; Escape closes it
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setShowSearch(true); }
      if (e.key === 'Escape') setShowSearch(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const activeAdminMode = adminMode && !!user?.isAdmin;

  function handleToggleAdmin() {
    if (activeAdminMode) {
      setAdminMode(false);
      navigate('/kanban');
    } else {
      setAdminMode(true);
      navigate('/admin');
    }
  }

  return (
    <ChatContext.Provider value={{
      openChat: activeAdminMode ? () => setShowAdminChat((v) => !v) : openProductChat,
      chatOpen: activeAdminMode ? showAdminChat : showProductChat,
      chatTaskId: chatInitialTask?.id,
      adminMode: activeAdminMode,
    }}>
      <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
        <TopBar
          onOpenSearch={() => setShowSearch(true)}
          onOpenChat={activeAdminMode
            ? () => setShowAdminChat((v) => !v)
            : () => openProductChat()}
          onOpenVision={() => setShowVision(true)}
          chatOpen={activeAdminMode ? showAdminChat : showProductChat}
          chatIsAdmin={activeAdminMode}
          onToggleAdmin={handleToggleAdmin}
          onExitAdmin={() => setAdminMode(false)}
        />
        <PermissionGuard>
          <main className="flex-1 overflow-auto min-w-0">{children}</main>
        </PermissionGuard>
        {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
        {showProductChat && (
          <ChatPanel
            initialTask={chatInitialTask}
            onClose={() => { setShowProductChat(false); setChatInitialTask(undefined); }}
          />
        )}
        {showAdminChat && (
          <ChatPanel isAdminChat onClose={() => setShowAdminChat(false)} />
        )}
        {showVision && <PlanlyVisionModal onClose={() => setShowVision(false)} />}
      </div>
    </ChatContext.Provider>
  );
}
