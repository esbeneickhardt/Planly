/**
 * Root layout that wraps every authenticated page with TopBar, ChatPanel, and SearchModal.
 * Provides `ChatContext` so any component can call `openChat` to open the product or admin chat.
 * `adminMode` persists across navigation once activated; `PermissionGuard` redirects when the current tab becomes inaccessible.
 */
import { ReactNode, useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopBar from './TopBar';
import SearchModal from './SearchModal';
import AdminSearchModal from './AdminSearchModal';
import PlanlyVisionModal, { shouldShowWelcome } from './PlanlyVisionModal';
import NoProjectsWelcome from './NoProjectsWelcome';
import { usePermission } from '../../context/PermissionContext';
import { useProduct } from '../../context/ProductContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ChatContext } from '../../context/ChatContext';
import { ProfileModalsContext, type ProfileModalKey } from '../../context/ProfileModalsContext';

// Lazy-loaded (not a static import) so ChatPanel's own import chain - which pulls in the `mermaid`
// package via MermaidBlock.tsx for rendering ```mermaid code fences - doesn't ship in the main
// bundle. AppLayout is part of the always-mounted app shell, but the panel itself is already only
// ever rendered behind `showProductChat`/`showAdminChat` below, so this costs nothing extra when
// chat is never opened and only defers the download to the moment it first is.
const ChatPanel = lazy(() => import('./ChatPanel'));

// Minimal, self-contained loading indicator for the lazy ChatPanel chunk - deliberately doesn't try
// to mimic the panel's own floating position/size (that layout logic lives entirely inside
// ChatPanel itself), just gives some feedback that the click registered while the chunk downloads.
function ChatPanelFallback() {
  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center justify-center rounded-full shadow-xl"
      style={{ width: 56, height: 56, background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div
        className="w-5 h-5 border-2 rounded-full animate-spin"
        style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }}
      />
    </div>
  );
}

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
  // Set alongside chatInitialTask when opening chat targeted at one specific message (e.g. from a
  // reaction notification) - passed through to ChatPanel, which scrolls to and briefly highlights
  // it once that message's thread has loaded. Independent of chatInitialTask since the target
  // message might be in the general project channel (no task at all).
  const [chatScrollToMessageId, setChatScrollToMessageId] = useState<string | undefined>();
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

  const openProductChat = useCallback((taskId?: string, taskName?: string, messageId?: string) => {
    setChatInitialTask(taskId ? { id: taskId, name: taskName! } : undefined);
    setChatScrollToMessageId(messageId);
    setShowProductChat(true);
  }, []);
  // Stable so it can be reused directly as ChatContext's `openChat` in admin mode below, instead of
  // a fresh inline arrow function on every render.
  const toggleAdminChat = useCallback(() => setShowAdminChat((v) => !v), []);
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

  // Memoized so consumers of each context (e.g. TopBar, SearchModal) don't re-render on every
  // AppLayout render for unrelated reasons - only when a field they actually read changes.
  const profileModalsValue = useMemo(
    () => ({
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
    }),
    [
      showThemePicker,
      showMemberships,
      showIntegrations,
      showNotifPrefs,
      showPrivacy,
      showTotp,
      showChangePassword,
      openProfileModal,
    ],
  );

  const chatContextValue = useMemo(
    () => ({
      openChat: activeAdminMode ? toggleAdminChat : openProductChat,
      chatOpen: activeAdminMode ? showAdminChat : showProductChat,
      chatTaskId: chatInitialTask?.id,
      adminMode: activeAdminMode,
    }),
    [activeAdminMode, toggleAdminChat, openProductChat, showAdminChat, showProductChat, chatInitialTask],
  );

  return (
    <ProfileModalsContext.Provider value={profileModalsValue}>
    <ChatContext.Provider value={chatContextValue}>
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
          onOpenChat={activeAdminMode ? toggleAdminChat : () => openProductChat()}
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
        {(showProductChat || showAdminChat) && (
          <Suspense fallback={<ChatPanelFallback />}>
            {showProductChat && (
              <ChatPanel
                initialTask={chatInitialTask}
                scrollToMessageId={chatScrollToMessageId}
                onClose={() => {
                  setShowProductChat(false);
                  setChatInitialTask(undefined);
                  setChatScrollToMessageId(undefined);
                }}
              />
            )}
            {showAdminChat && <ChatPanel isAdminChat onClose={() => setShowAdminChat(false)} />}
          </Suspense>
        )}
        {showVision && <PlanlyVisionModal onClose={() => setShowVision(false)} />}
      </div>
    </ChatContext.Provider>
    </ProfileModalsContext.Provider>
  );
}
