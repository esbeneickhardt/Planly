/**
 * Fetches the current user's per-tab permission rows and team role for the active product.
 * Default context value grants full write access so components don't flash as restricted before the first fetch.
 * `permissionsLoaded` lets UI code gate rendering until the real permissions arrive.
 */
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
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
  const { activeProduct } = useProduct();
  const { user } = useAuth();
  const [myPerms, setMyPerms] = useState<Record<string, Level>>({});
  const [myRole, setMyRole] = useState<string>('member');
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  // Fetches current user's permissions for the active product via the /api/me/permissions endpoint,
  // which is accessible to all roles (unlike the co-owner-only /api/products/:id/permissions endpoint).
  const refresh = useCallback(async () => {
    if (!activeProduct || !user) {
      setMyPerms({});
      setMyRole('member');
      setPermissionsLoaded(true);
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
  }, [activeProduct?.id, user?.id]);

  // Re-fetch whenever product or user changes; reset loaded flag first to block stale UI
  useEffect(() => {
    setPermissionsLoaded(false);
    refresh();
  }, [refresh]);

  // Derived helpers: missing entry defaults to 'write' (matches default context value above)
  const levelFor = (tab: string): Level => myPerms[tab] ?? 'write';
  const canRead = (tab: string) => levelFor(tab) !== 'none';
  const canWrite = (tab: string) => levelFor(tab) === 'write';

  const isOwner = !!(user && activeProduct?.ownerId === user.id);
  const isCoOwner = myRole === 'co_owner';
  const canManage = isOwner || isCoOwner;

  return (
    <PermissionContext.Provider
      value={{ canRead, canWrite, levelFor, refresh, isOwner, isCoOwner, canManage, permissionsLoaded }}
    >
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermission() {
  return useContext(PermissionContext);
}
