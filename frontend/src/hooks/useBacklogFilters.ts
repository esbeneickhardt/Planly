/**
 * Client-side filter pipeline for the backlog task list (status tab, mine-only, search).
 * Sorting lives in BacklogPage.tsx instead of here, since sorting by milestone name needs
 * `computePrimaryMilestones`, which depends on data BacklogPage already holds.
 * `tabCounts` respects the `mineOnly` toggle, so tab badges only count the current user's tasks when that filter is active.
 * `unassignedCount` and `overdueCount` are raw totals across all tasks, unaffected by the other active filters.
 */
import { useState, useMemo } from 'react';
import type { Task } from '../types';
import { isBeforeToday } from '../utils/dates';

export type StatusTab = 'all' | 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done';

export interface BacklogFilters {
  statusTab: StatusTab;
  setStatusTab: (t: StatusTab) => void;
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
  const [statusTab, setStatusTab] = useState<StatusTab>('backlog');
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
      if (statusTab !== 'all' && t.status !== statusTab) return false;
      if (mineOnly && t.ownerId !== userId) return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [tasks, statusTab, mineOnly, search, userId]);

  // Raw badge counts — not filtered by mineOnly/statusTab/search
  const unassignedCount = tasks.filter((t) => t.status === 'backlog' && !t.ownerId).length;
  const overdueCount = tasks.filter((t) => t.deadline && t.status !== 'done' && isBeforeToday(t.deadline)).length;

  return {
    statusTab,
    setStatusTab,
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
