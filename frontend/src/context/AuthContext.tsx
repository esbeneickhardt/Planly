import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../api/client';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth.me().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const u = await api.auth.login(email, password);
    setUser(u);
  }

  async function logout() {
    try { await api.auth.logout(); } catch { /* ignore network errors */ }
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
