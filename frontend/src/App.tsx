import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProductProvider } from './context/ProductContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AppLayout from './components/common/AppLayout';
import KanbanPage from './pages/KanbanPage';
import BacklogPage from './pages/BacklogPage';
import CanvasPage from './pages/CanvasPage';
import GanttPage from './pages/GanttPage';

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
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/*"
              element={
                <RequireAuth>
                  <ProductProvider>
                    <AppLayout>
                      <Routes>
                        <Route path="/" element={<Navigate to="/kanban" replace />} />
                        <Route path="/kanban" element={<KanbanPage />} />
                        <Route path="/backlog" element={<BacklogPage />} />
                        <Route path="/canvas" element={<CanvasPage />} />
                        <Route path="/gantt" element={<GanttPage />} />
                      </Routes>
                    </AppLayout>
                  </ProductProvider>
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
