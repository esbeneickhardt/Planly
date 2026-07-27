/**
 * Client-side filter pipeline for the backlog task list (status filter, mine-only, search).
 * Sorting lives in BacklogPage.tsx instead of here, since sorting by milestone name needs
 * `computePrimaryMilestones`, which depends on data BacklogPage already holds.
 * `tabCounts` respects the `mineOnly` toggle, so tab badges only count the current user's tasks when that filter is active.
 * `unassignedCount` and `overdueCount` are raw totals across all tasks, unaffected by the other active filters.
 *
 * Status is a multi-select set (empty = no filter, i.e. "all statuses"), matching Kanban's Status
 * filter. The mobile toolbar's single `<select>` still reads/writes this same set - picking one
 * option there just replaces the whole set with that one status, so mobile stays a single-select
 * experience even though desktop's Filters dropdown can combine several.
 */
import { useState, useMemo } from 'react';
import type { Task } from '../types';
import { isBeforeToday } from '../utils/dates';

export type StatusTab = 'all' | 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done';
export type StatusKey = Exclude<StatusTab, 'all'>;
const STATUS_KEYS: StatusKey[] = ['backlog', 'todo', 'in_progress', 'blocked', 'done'];

export interface BacklogFilters {
  statusFilters: Set<StatusKey>;
  toggleStatusFilter: (s: StatusKey) => void;
  setStatusFilters: (s: Set<StatusKey>) => void;
  mineOnly: boolean;
  setMineOnly: React.Dispatch<React.SetStateAction<boolean>>;
  search: string;
  setSearch: (s: string) => void;
  groupByMilestone: boolean;
  setGroupByMilestone: (v: boolean) => void;
  filteredTasks: Task[];
  tabCounts: Record<string, number>;
  unassignedCount: number;
  overdueCount: number;
}

export function useBacklogFilters(tasks: Task[], userId: string | undefined): BacklogFilters {
  const [statusFilters, setStatusFiltersRaw] = useState<Set<StatusKey>>(() => {
    const saved = localStorage.getItem('planly_backlog_status_tab');
    if (saved === 'all') return new Set();
    if (saved && (STATUS_KEYS as string[]).includes(saved)) return new Set([saved as StatusKey]);
    return new Set(['backlog']);
  });
  const persist = (s: Set<StatusKey>) => {
    try {
      localStorage.setItem('planly_backlog_status_tab', s.size === 0 ? 'all' : Array.from(s).join(','));
    } catch {}
  };
  const setStatusFilters = (s: Set<StatusKey>) => {
    setStatusFiltersRaw(s);
    persist(s);
  };
  const toggleStatusFilter = (key: StatusKey) => {
    setStatusFiltersRaw((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persist(next);
      return next;
    });
  };
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [groupByMilestone, setGroupByMilestoneRaw] = useState(
    () => localStorage.getItem('planly_backlog_group_by_milestone') === 'true',
  );
  const setGroupByMilestone = (v: boolean) => {
    setGroupByMilestoneRaw(v);
    try {
      localStorage.setItem('planly_backlog_group_by_milestone', String(v));
    } catch {}
  };

  const tabCounts = useMemo(() => {
    const base = mineOnly ? tasks.filter((t) => t.ownerId === userId) : tasks;
    const counts: Record<string, number> = { all: base.length };
    base.forEach((t) => {
      counts[t.status] = (counts[t.status] ?? 0) + 1;
    });
    return counts;
  }, [tasks, mineOnly, userId]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilters.size > 0 && !statusFilters.has(t.status as StatusKey)) return false;
      if (mineOnly && t.ownerId !== userId) return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [tasks, statusFilters, mineOnly, search, userId]);

  // Raw badge counts — not filtered by mineOnly/statusFilters/search
  const unassignedCount = tasks.filter((t) => t.status === 'backlog' && !t.ownerId).length;
  const overdueCount = tasks.filter((t) => t.deadline && t.status !== 'done' && isBeforeToday(t.deadline)).length;

  return {
    statusFilters,
    toggleStatusFilter,
    setStatusFilters,
    mineOnly,
    setMineOnly,
    search,
    setSearch,
    groupByMilestone,
    setGroupByMilestone,
    filteredTasks,
    tabCounts,
    unassignedCount,
    overdueCount,
  };
}
