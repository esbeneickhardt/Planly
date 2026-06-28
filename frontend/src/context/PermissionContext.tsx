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
}

const PermissionContext = createContext<PermissionContextValue>({
  canRead: () => true,
  canWrite: () => true,
  levelFor: () => 'write',
  refresh: async () => {},
  isOwner: false,
  isCoOwner: false,
  canManage: false,
});

export function PermissionProvider({ children }: { children: ReactNode }) {
  const { activeProduct } = useProduct();
  const { user } = useAuth();
  const [myPerms, setMyPerms] = useState<Record<string, Level>>({});
  const [myRole, setMyRole] = useState<string>('member');

  const refresh = useCallback(async () => {
    if (!activeProduct || !user) { setMyPerms({}); setMyRole('member'); return; }
    try {
      const [rows, team] = await Promise.all([
        api.permissions.list(activeProduct.id),
        api.teams.get(activeProduct.teamId),
      ]);
      const mine: Record<string, Level> = {};
      rows.filter((r) => r.userId === user.id).forEach((r) => { mine[r.tab] = r.level as Level; });
      setMyPerms(mine);
      const member = team.members.find(m => m.userId === user.id);
      setMyRole(member?.role ?? 'member');

    } catch {
      setMyPerms({});
      setMyRole('member');
    }
  }, [activeProduct?.id, user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const levelFor = (tab: string): Level => myPerms[tab] ?? 'write';
  const canRead  = (tab: string) => levelFor(tab) !== 'none';
  const canWrite = (tab: string) => levelFor(tab) === 'write';

  const isOwner = !!(user && activeProduct?.ownerId === user.id);
  const isCoOwner = myRole === 'co_owner';
  const canManage = isOwner || isCoOwner;

  return (
    <PermissionContext.Provider value={{ canRead, canWrite, levelFor, refresh, isOwner, isCoOwner, canManage }}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermission() {
  return useContext(PermissionContext);
}
