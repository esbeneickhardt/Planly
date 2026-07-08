/**
 * useSprints — manages sprint list state for a project.
 *
 * Provides a sprints array and a refresh() callback. Components call refresh()
 * on mount and after any sprint create/update/delete to keep state current.
 * Returns the latest sprint list from refresh() so callers can act on it immediately.
 */
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
