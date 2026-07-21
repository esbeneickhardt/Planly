/**
 * Root component that wires up all context providers, React Router routes, and access-control guards.
 * Every page is lazy-loaded to keep the initial bundle small; auth-protected routes are wrapped by
 * RequireAuth (checks session) and RequireTab/RequireManage (checks per-tab permissions from the API).
 */
import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProductProvider, useProduct } from './context/ProductContext';
import { PermissionProvider, usePermission } from './context/PermissionContext';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider } from './context/ConfirmContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import AppLayout from './components/common/AppLayout';

// Auth pages — lazy to avoid bundling them with the authenticated app shell
const LoginPage         = lazy(() => import('./pages/LoginPage'));
const RegisterPage      = lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const InvitePage        = lazy(() => import('./pages/InvitePage'));
const VerifyEmailPage   = lazy(() => import('./pages/VerifyEmailPage'));
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'));
const SetupMfaPage      = lazy(() => import('./pages/SetupMfaPage'));
const TermsPage         = lazy(() => import('./pages/TermsPage'));
const PrivacyPage       = lazy(() => import('./pages/PrivacyPage'));

// App pages - lazy-loaded once user is authenticated
const KanbanPage       = lazy(() => import('./pages/KanbanPage'));
const BacklogPage      = lazy(() => import('./pages/BacklogPage'));
const CanvasPage       = lazy(() => import('./pages/CanvasPage'));
const GanttPage        = lazy(() => import('./pages/GanttPage'));
const SettingsPage     = lazy(() => import('./pages/SettingsPage'));
const AnalyticsPage    = lazy(() => import('./pages/AnalyticsPage'));
const AboutPage        = lazy(() => import('./pages/AboutPage'));
const ProjectAboutPage = lazy(() => import('./pages/ProjectAboutPage'));
const AdminPage        = lazy(() => import('./pages/AdminPage'));
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage'));

// Redirects unauthenticated visitors to /login; blocks users who must change their password
function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (user.mustSetupMfa) return <Navigate to="/setup-mfa" replace />;
  return children;
}

function PermSpinner() {
  return (
    <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }} />
    </div>
  );
}

// Blocks access to a specific tab unless the user has at least read permission; canManage bypasses all tab checks
function RequireTab({ tab, children }: { tab: string; children: JSX.Element }) {
  const { canRead, canManage, permissionsLoaded } = usePermission();
  if (!permissionsLoaded) return <PermSpinner />;
  if (!canManage && !canRead(tab)) return <Navigate to="/about" replace />;
  return children;
}

// Restricts a route to owners and co-owners only (e.g. Settings)
function RequireManage({ children }: { children: JSX.Element }) {
  const { canManage, permissionsLoaded } = usePermission();
  if (!permissionsLoaded) return <PermSpinner />;
  if (!canManage) return <Navigate to="/about" replace />;
  return children;
}

// Sends admins with no projects to /admin, everyone else to /kanban
function DefaultRoute() {
  const { user } = useAuth();
  const { products, tasksLoaded } = useProduct();
  if (!tasksLoaded && products.length === 0) return null;
  if (user?.isAdmin && products.length === 0) return <Navigate to="/admin" replace />;
  return <Navigate to="/kanban" replace />;
}

function PageBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PermSpinner />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <ConfirmProvider>
              <Routes>
                <Route path="/login"            element={<PageBoundary><LoginPage /></PageBoundary>} />
                <Route path="/register"         element={<PageBoundary><RegisterPage /></PageBoundary>} />
                <Route path="/forgot-password"  element={<PageBoundary><ForgotPasswordPage /></PageBoundary>} />
                <Route path="/reset-password"   element={<PageBoundary><ResetPasswordPage /></PageBoundary>} />
                <Route path="/invite/:token"    element={<PageBoundary><InvitePage /></PageBoundary>} />
                <Route path="/verify-email"     element={<PageBoundary><VerifyEmailPage /></PageBoundary>} />
                <Route path="/change-password"  element={<PageBoundary><ChangePasswordPage /></PageBoundary>} />
                <Route path="/setup-mfa"        element={<PageBoundary><SetupMfaPage /></PageBoundary>} />
                <Route path="/terms"            element={<PageBoundary><TermsPage /></PageBoundary>} />
                <Route path="/privacy"          element={<PageBoundary><PrivacyPage /></PageBoundary>} />
                <Route
                  path="/*"
                  element={
                    <RequireAuth>
                      <ProductProvider>
                        <PermissionProvider>
                          <AppLayout>
                            <Routes>
                              <Route path="/" element={<DefaultRoute />} />
                              <Route path="/kanban"        element={<RequireTab tab="kanban"><PageBoundary><KanbanPage /></PageBoundary></RequireTab>} />
                              <Route path="/backlog"       element={<RequireTab tab="backlog"><PageBoundary><BacklogPage /></PageBoundary></RequireTab>} />
                              <Route path="/canvas"        element={<RequireTab tab="canvas"><PageBoundary><CanvasPage /></PageBoundary></RequireTab>} />
                              <Route path="/gantt"         element={<RequireTab tab="gantt"><PageBoundary><GanttPage /></PageBoundary></RequireTab>} />
                              <Route path="/analytics"     element={<PageBoundary><AnalyticsPage /></PageBoundary>} />
                              <Route path="/about"         element={<PageBoundary><AboutPage /></PageBoundary>} />
                              <Route path="/project/:productId/about" element={<PageBoundary><ProjectAboutPage /></PageBoundary>} />
                              <Route path="/admin"         element={<PageBoundary><AdminPage /></PageBoundary>} />
                              <Route path="/announcements" element={<PageBoundary><AnnouncementsPage /></PageBoundary>} />
                              <Route path="/categories"    element={<Navigate to="/settings" replace />} />
                              <Route path="/settings"      element={<RequireManage><PageBoundary><SettingsPage /></PageBoundary></RequireManage>} />
                            </Routes>
                          </AppLayout>
                        </PermissionProvider>
                      </ProductProvider>
                    </RequireAuth>
                  }
                />
              </Routes>
              </ConfirmProvider>
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
