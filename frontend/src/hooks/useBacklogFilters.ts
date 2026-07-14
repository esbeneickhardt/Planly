/**
 * Client-side filter and sort pipeline for the backlog task list.
 * `tabCounts` respects the `mineOnly` toggle, so tab badges only count the current user's tasks when that filter is active.
 * `unassignedCount` and `overdueCount` are raw totals across all tasks, unaffected by the other active filters.
 */
import { useState, useMemo } from 'react';
import type { Task } from '../types';
import { isBeforeToday } from '../utils/dates';

export type SortKey = 'oldest' | 'newest' | 'alpha' | 'unassigned' | 'deadline';
export type StatusTab = 'all' | 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done';

export interface BacklogFilters {
  sortKey: SortKey;
  setSortKey: (k: SortKey) => void;
  statusTab: StatusTab;
  setStatusTab: (t: StatusTab) => void;
  mineOnly: boolean;
  setMineOnly: React.Dispatch<React.SetStateAction<boolean>>;
  search: string;
  setSearch: (s: string) => void;
  filteredTasks: Task[];
  tabCounts: Record<string, number>;
  unassignedCount: number;
  overdueCount: number;
}

export function useBacklogFilters(tasks: Task[], userId: string | undefined): BacklogFilters {
  // Filter + sort state
  const [sortKey, setSortKey] = useState<SortKey>('oldest');
  const [statusTab, setStatusTab] = useState<StatusTab>('backlog');
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState('');

  const tabCounts = useMemo(() => {
    const base = mineOnly ? tasks.filter((t) => t.ownerId === userId) : tasks;
    const counts: Record<string, number> = { all: base.length };
    base.forEach((t) => { counts[t.status] = (counts[t.status] ?? 0) + 1; });
    return counts;
  }, [tasks, mineOnly, userId]);

  const filteredTasks = useMemo(() => {
    const bt = tasks.filter((t) => {
      if (statusTab !== 'all' && t.status !== statusTab) return false;
      if (mineOnly && t.ownerId !== userId) return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    return [...bt].sort((a, b) => {
      if (sortKey === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortKey === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortKey === 'alpha') return a.name.localeCompare(b.name);
      if (sortKey === 'deadline') {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      return (a.ownerId ? 1 : 0) - (b.ownerId ? 1 : 0);
    });
  }, [tasks, statusTab, mineOnly, sortKey, search, userId]);

  // Raw badge counts — not filtered by mineOnly/statusTab/search
  const unassignedCount = tasks.filter((t) => t.status === 'backlog' && !t.ownerId).length;
  const overdueCount = tasks.filter((t) => t.deadline && t.status !== 'done' && isBeforeToday(t.deadline)).length;

  return { sortKey, setSortKey, statusTab, setStatusTab, mineOnly, setMineOnly, search, setSearch, filteredTasks, tabCounts, unassignedCount, overdueCount };
}
