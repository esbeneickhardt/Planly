/**
 * Root layout that wraps every authenticated page with TopBar, Sidebar, ChatPanel, and SearchModal.
 * Provides `ChatContext` so any component can call `openChat` to open the product or admin chat.
 * `adminMode` persists across navigation once activated; `PermissionGuard` redirects when the current tab becomes inaccessible.
 */
import { ReactNode, useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopBar from './TopBar';
import SearchModal from './SearchModal';
import AdminSearchModal from './AdminSearchModal';
import ChatPanel from './ChatPanel';
import PlanlyVisionModal, { shouldShowWelcome } from './PlanlyVisionModal';
import NoProjectsWelcome from './NoProjectsWelcome';
import { usePermission } from '../../context/PermissionContext';
import { useProduct } from '../../context/ProductContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ChatContext } from '../../context/ChatContext';
import { ProfileModalsContext, type ProfileModalKey } from '../../context/ProfileModalsContext';

const TAB_ROUTES: { path: string; tab: string }[] = [
  { path: '/canvas', tab: 'canvas' },
  { path: '/kanban', tab: 'kanban' },
  { path: '/gantt', tab: 'gantt' },
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

  // Personal/profile modals - state lives here (not TopBar) so SearchModal, a sibling of TopBar,
  // can also open them (e.g. "Appearance" or "Notification settings" as a search result).
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showMemberships, setShowMemberships] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [showNotifPrefs, setShowNotifPrefs] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTotp, setShowTotp] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const openProfileModal = useCallback((key: ProfileModalKey) => {
    if (key === 'theme') setShowThemePicker(true);
    else if (key === 'memberships') setShowMemberships(true);
    else if (key === 'integrations') setShowIntegrations(true);
    else if (key === 'notifications') setShowNotifPrefs(true);
    else if (key === 'privacy') setShowPrivacy(true);
    else if (key === 'security') setShowTotp(true);
    else if (key === 'changePassword') setShowChangePassword(true);
  }, []);

  const openProductChat = useCallback((taskId?: string, taskName?: string) => {
    setChatInitialTask(taskId ? { id: taskId, name: taskName! } : undefined);
    setShowProductChat(true);
  }, []);
  const { products, productsLoaded } = useProduct();
  const { user } = useAuth();
  const { mobileNavPosition } = useTheme();
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
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === 'Escape') setShowSearch(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const activeAdminMode = adminMode && !!user?.isAdmin;

  function handleToggleAdmin() {
    const isProjectTab = TAB_ROUTES.some((r) => location.pathname.startsWith(r.path));
    if (activeAdminMode) {
      setAdminMode(false);
      if (location.pathname === '/admin') navigate('/kanban');
      // neutral pages (announcements, about, settings…) — stay put
    } else {
      setAdminMode(true);
      if (isProjectTab) navigate('/admin');
      // neutral pages — stay put
    }
  }

  return (
    <ProfileModalsContext.Provider
      value={{
        showThemePicker,
        setShowThemePicker,
        showMemberships,
        setShowMemberships,
        showIntegrations,
        setShowIntegrations,
        showNotifPrefs,
        setShowNotifPrefs,
        showPrivacy,
        setShowPrivacy,
        showTotp,
        setShowTotp,
        showChangePassword,
        setShowChangePassword,
        openProfileModal,
      }}
    >
    <ChatContext.Provider
      value={{
        openChat: activeAdminMode ? () => setShowAdminChat((v) => !v) : openProductChat,
        chatOpen: activeAdminMode ? showAdminChat : showProductChat,
        chatTaskId: chatInitialTask?.id,
        adminMode: activeAdminMode,
      }}
    >
      <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
        {/* Skip navigation link - visually hidden until focused by keyboard */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-medium"
          style={{ background: 'var(--brand)', color: 'white' }}
        >
          Skip to main content
        </a>
        <TopBar
          onOpenSearch={() => setShowSearch(true)}
          onOpenChat={activeAdminMode ? () => setShowAdminChat((v) => !v) : () => openProductChat()}
          onOpenVision={() => setShowVision(true)}
          chatOpen={activeAdminMode ? showAdminChat : showProductChat}
          chatIsAdmin={activeAdminMode}
          onToggleAdmin={handleToggleAdmin}
          onExitAdmin={() => setAdminMode(false)}
        />
        <PermissionGuard>
          <main
            id="main-content"
            className={`flex-1 overflow-auto min-w-0 ${mobileNavPosition === 'bottom' ? 'pb-14 lg:pb-0' : ''}`}
          >
            {productsLoaded && products.length === 0 && !activeAdminMode ? <NoProjectsWelcome /> : children}
          </main>
        </PermissionGuard>
        {showSearch &&
          (activeAdminMode ? (
            <AdminSearchModal onClose={() => setShowSearch(false)} />
          ) : (
            <SearchModal onClose={() => setShowSearch(false)} />
          ))}
        {showProductChat && (
          <ChatPanel
            initialTask={chatInitialTask}
            onClose={() => {
              setShowProductChat(false);
              setChatInitialTask(undefined);
            }}
          />
        )}
        {showAdminChat && <ChatPanel isAdminChat onClose={() => setShowAdminChat(false)} />}
        {showVision && <PlanlyVisionModal onClose={() => setShowVision(false)} />}
      </div>
    </ChatContext.Provider>
    </ProfileModalsContext.Provider>
  );
}
