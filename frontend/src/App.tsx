import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProductProvider, useProduct } from './context/ProductContext';
import { PermissionProvider, usePermission } from './context/PermissionContext';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider } from './context/ConfirmContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import InvitePage from './pages/InvitePage';
import AppLayout from './components/common/AppLayout';
import KanbanPage from './pages/KanbanPage';
import BacklogPage from './pages/BacklogPage';
import CanvasPage from './pages/CanvasPage';
import GanttPage from './pages/GanttPage';
import SettingsPage from './pages/SettingsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AboutPage from './pages/AboutPage';
import AdminPage from './pages/AdminPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';

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
  return children;
}

function PermSpinner() {
  return (
    <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }} />
    </div>
  );
}

function RequireTab({ tab, children }: { tab: string; children: JSX.Element }) {
  const { canRead, canManage, permissionsLoaded } = usePermission();
  if (!permissionsLoaded) return <PermSpinner />;
  if (!canManage && !canRead(tab)) return <Navigate to="/about" replace />;
  return children;
}

function RequireManage({ children }: { children: JSX.Element }) {
  const { canManage, permissionsLoaded } = usePermission();
  if (!permissionsLoaded) return <PermSpinner />;
  if (!canManage) return <Navigate to="/about" replace />;
  return children;
}

function DefaultRoute() {
  const { user } = useAuth();
  const { products, tasksLoaded } = useProduct();
  if (!tasksLoaded && products.length === 0) return null;
  if (user?.isAdmin && products.length === 0) return <Navigate to="/admin" replace />;
  return <Navigate to="/kanban" replace />;
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
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/invite/:token" element={<InvitePage />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />
                <Route path="/change-password" element={<ChangePasswordPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route
                  path="/*"
                  element={
                    <RequireAuth>
                      <ProductProvider>
                        <PermissionProvider>
                          <AppLayout>
                            <Routes>
                              <Route path="/" element={<DefaultRoute />} />
                              <Route path="/kanban" element={<RequireTab tab="kanban"><KanbanPage /></RequireTab>} />
                              <Route path="/backlog" element={<RequireTab tab="backlog"><BacklogPage /></RequireTab>} />
                              <Route path="/canvas" element={<RequireTab tab="canvas"><CanvasPage /></RequireTab>} />
                              <Route path="/gantt" element={<RequireTab tab="gantt"><GanttPage /></RequireTab>} />
                              <Route path="/analytics" element={<AnalyticsPage />} />
                              <Route path="/about" element={<AboutPage />} />
                              <Route path="/admin" element={<AdminPage />} />
                              <Route path="/announcements" element={<AnnouncementsPage />} />
                              <Route path="/categories" element={<Navigate to="/settings" replace />} />
                              <Route path="/settings" element={<RequireManage><SettingsPage /></RequireManage>} />
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
