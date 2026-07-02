import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../api/client';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth.me().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));

    function handleEmailNotVerified() {
      api.auth.logout().catch(() => {});
      setUser(null);
    }
    window.addEventListener('planly:email-not-verified', handleEmailNotVerified);
    return () => window.removeEventListener('planly:email-not-verified', handleEmailNotVerified);
  }, []);

  async function login(email: string, password: string) {
    const u = await api.auth.login(email, password);
    setUser(u);
  }

  async function logout() {
    try { await api.auth.logout(); } catch { /* ignore network errors */ }
    setUser(null);
  }

  async function refreshUser() {
    const u = await api.auth.me();
    setUser(u);
  }

  return <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
