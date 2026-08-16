/**
 * Fetches the current user's per-tab permission rows and team role for the active product.
 * Default context value grants full write access so components don't flash as restricted before the first fetch.
 * `permissionsLoaded` lets UI code gate rendering until the real permissions arrive.
 */
import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { api } from '../api/client';
import { useProduct } from './ProductContext';
import { useAuth } from './AuthContext';

type Level = 'none' | 'read' | 'write';

interface PermissionContextValue {
  canRead: (tab: string) => boolean;
  canWrite: (tab: string) => boolean;
  levelFor: (tab: string) => Level;
  refresh: () => Promise<void>;
  isOwner: boolean;
  isCoOwner: boolean;
  canManage: boolean; // isOwner || isCoOwner
  permissionsLoaded: boolean;
}

const PermissionContext = createContext<PermissionContextValue>({
  canRead: () => true,
  canWrite: () => true,
  levelFor: () => 'write',
  refresh: async () => {},
  isOwner: false,
  isCoOwner: false,
  canManage: false,
  permissionsLoaded: false,
});

export function PermissionProvider({ children }: { children: ReactNode }) {
  // State
  const { activeProduct, productsLoaded } = useProduct();
  const { user } = useAuth();
  const [myPerms, setMyPerms] = useState<Record<string, Level>>({});
  const [myRole, setMyRole] = useState<string>('member');
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  // Fetches current user's permissions for the active product via the /api/me/permissions endpoint,
  // which is accessible to all roles (unlike the co-owner-only /api/products/:id/permissions endpoint).
  const refresh = useCallback(async () => {
    if (!activeProduct || !user) {
      // Only mark loaded once we know the product list is final. If user is set but
      // products haven't been fetched yet, stay in the loading state so guards don't
      // redirect prematurely (race between ProductContext and PermissionContext init).
      if (!user || productsLoaded) {
        setMyPerms({});
        setMyRole('member');
        setPermissionsLoaded(true);
      }
      return;
    }
    try {
      const all = await api.me.permissions();
      const entry = all.find((e) => e.productId === activeProduct.id);
      const perms: Record<string, Level> = {};
      if (entry) {
        Object.entries(entry.permissions).forEach(([tab, level]) => {
          perms[tab] = level as Level;
        });
      }
      setMyPerms(perms);
      setMyRole(entry?.role ?? 'member');
    } catch {
      setMyPerms({});
      setMyRole('member');
    } finally {
      setPermissionsLoaded(true);
    }
  }, [activeProduct?.id, user?.id, productsLoaded]);

  // Re-fetch whenever product or user changes; reset loaded flag first to block stale UI
  useEffect(() => {
    setPermissionsLoaded(false);
    refresh();
  }, [refresh]);

  // Derived helpers: missing entry defaults to 'write' (matches default context value above).
  // Wrapped in useCallback (keyed on `myPerms`, their only real input) rather than plain functions
  // so the memoized value below can tell when they've actually changed.
  const levelFor = useCallback((tab: string): Level => myPerms[tab] ?? 'write', [myPerms]);
  const canRead = useCallback((tab: string) => levelFor(tab) !== 'none', [levelFor]);
  const canWrite = useCallback((tab: string) => levelFor(tab) === 'write', [levelFor]);

  const isOwner = !!(user && activeProduct?.ownerId === user.id);
  const isCoOwner = myRole === 'co_owner';
  const canManage = isOwner || isCoOwner;

  // Memoized so consumers (most components in the app read this context) only re-render when a
  // field they actually use changes, not on every PermissionProvider render.
  const value = useMemo(
    () => ({ canRead, canWrite, levelFor, refresh, isOwner, isCoOwner, canManage, permissionsLoaded }),
    [canRead, canWrite, levelFor, refresh, isOwner, isCoOwner, canManage, permissionsLoaded],
  );

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermission() {
  return useContext(PermissionContext);
}
