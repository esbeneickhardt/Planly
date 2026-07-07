import { useState, useCallback } from 'react';
import { api } from '../api/client';
import type { Sprint } from '../api/client';

export function useSprints(productId: string | undefined) {
  const [sprints, setSprints] = useState<Sprint[]>([]);

  const refresh = useCallback(async (): Promise<Sprint[]> => {
    if (!productId) return [];
    const ss = await api.sprints.list(productId).catch(() => [] as Sprint[]);
    setSprints(ss);
    return ss;
  }, [productId]);

  return { sprints, setSprints, refresh };
}
