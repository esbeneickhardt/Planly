/**
 * Provides authentication state (current user, loading flag) and auth actions to the app.
 * `login` may return a TOTP challenge object instead of resolving the user when MFA is enabled.
 * Listens for `planly:email-not-verified` and `planly:session-expired` window events to
 * force-logout without a user action (e.g. when another browser logs out and invalidates the session).
 */
import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { api } from '../api/client';
import { clearMembersCache } from '../hooks/useProductMembers';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<{ requiresTOTP: true; mfaToken: string } | void>;
  totpChallenge: (mfaToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // State
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialization: load session user and listen for forced-logout events
  useEffect(() => {
    api.auth
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));

    function handleEmailNotVerified() {
      api.auth.logout().catch(() => {});
      setUser(null);
    }
    // Session was invalidated server-side (e.g. logout in another tab/browser incremented tokenVersion)
    function handleSessionExpired() {
      clearMembersCache();
      setUser(null);
    }
    window.addEventListener('planly:email-not-verified', handleEmailNotVerified);
    window.addEventListener('planly:session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('planly:email-not-verified', handleEmailNotVerified);
      window.removeEventListener('planly:session-expired', handleSessionExpired);
    };
  }, []);

  // Auth actions - wrapped in useCallback (none close over anything but the stable `setUser`
  // setter) so the memoized value below doesn't rebuild on every render.
  const login = useCallback(async (identifier: string, password: string) => {
    const res = await api.auth.login(identifier, password);
    if ('requiresTOTP' in res && res.requiresTOTP) return res;
    // Fetch the full profile so server-config flags like announcementsEnabled are included
    const full = await api.auth.me();
    setUser(full);
  }, []);

  const totpChallenge = useCallback(async (mfaToken: string, code: string) => {
    await api.auth.totpChallenge(mfaToken, code);
    const full = await api.auth.me();
    setUser(full);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      /* ignore network errors */
    }
    clearMembersCache();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await api.auth.me();
    setUser(u);
  }, []);

  // Memoized so consumers only re-render when `user`/`loading` actually change - every one of
  // these action functions is now stable across renders (see above), so this effectively only
  // changes on a real auth state change.
  const value = useMemo(
    () => ({ user, loading, login, totpChallenge, logout, refreshUser }),
    [user, loading, login, totpChallenge, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
