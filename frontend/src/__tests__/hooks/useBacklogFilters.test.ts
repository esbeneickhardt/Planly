/**
 * Unit tests for the useBacklogFilters hook.
 *
 * The hook drives the backlog list view: it filters tasks by status tab,
 * owner (mineOnly), free-text search, and sort order. It also computes
 * per-tab counts, unassignedCount, and overdueCount for the summary badges.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBacklogFilters } from '../../hooks/useBacklogFilters';
import type { Task } from '../../types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: Math.random().toString(36).slice(2),
    productId: 'prod-1',
    name: 'Test task',
    status: 'backlog',
    kanbanOrder: 0,
    createdBy: 'user-1',
    createdAt: new Date('2024-01-15').toISOString(),
    subtasks: [],
    dependsOn: [],
    requiredBy: [],
    ...overrides,
  };
}

const TASKS: Task[] = [
  makeTask({ id: 't1', name: 'Alpha', status: 'backlog',     ownerId: 'user-1', createdAt: '2024-01-01T00:00:00Z' }),
  makeTask({ id: 't2', name: 'Beta',  status: 'todo',        ownerId: 'user-2', createdAt: '2024-01-02T00:00:00Z' }),
  makeTask({ id: 't3', name: 'Gamma', status: 'in_progress', ownerId: 'user-1', createdAt: '2024-01-03T00:00:00Z', deadline: '2020-01-01' /* overdue */ }),
  makeTask({ id: 't4', name: 'Delta', status: 'done',        ownerId: undefined, createdAt: '2024-01-04T00:00:00Z' }),
  makeTask({ id: 't5', name: 'Epsilon', status: 'blocked',   ownerId: undefined, createdAt: '2024-01-05T00:00:00Z' }),
];

describe('useBacklogFilters', () => {
  // Initial state: only backlog tasks are shown; the tab is pre-selected
  it('defaults to statusTab=backlog, showing only backlog tasks', () => {
    const { result } = renderHook(() => useBacklogFilters(TASKS, 'user-1'));
    expect(result.current.statusTab).toBe('backlog');
    expect(result.current.filteredTasks.map((t) => t.id)).toEqual(['t1']);
  });

  // Counts are calculated across ALL tasks regardless of the active tab (for badge display)
  it('tab counts cover all statuses', () => {
    const { result } = renderHook(() => useBacklogFilters(TASKS, 'user-1'));
    expect(result.current.tabCounts['all']).toBe(5);
    expect(result.current.tabCounts['backlog']).toBe(1);
    expect(result.current.tabCounts['todo']).toBe(1);
    expect(result.current.tabCounts['in_progress']).toBe(1);
    expect(result.current.tabCounts['done']).toBe(1);
    expect(result.current.tabCounts['blocked']).toBe(1);
  });

  // "All" tab must include every status, not just active ones
  it('setStatusTab("all") shows every task', () => {
    const { result } = renderHook(() => useBacklogFilters(TASKS, 'user-1'));
    act(() => result.current.setStatusTab('all'));
    expect(result.current.filteredTasks).toHaveLength(5);
  });

  // Status tab filters are mutually exclusive; switching tabs replaces the previous filter
  it('setStatusTab("done") shows only done tasks', () => {
    const { result } = renderHook(() => useBacklogFilters(TASKS, 'user-1'));
    act(() => result.current.setStatusTab('done'));
    expect(result.current.filteredTasks.map((t) => t.id)).toEqual(['t4']);
  });

  // mineOnly stacks with the active status tab; here "all" + mineOnly = user-1's tasks only
  it('mineOnly filters to tasks owned by the current user', () => {
    const { result } = renderHook(() => useBacklogFilters(TASKS, 'user-1'));
    act(() => { result.current.setStatusTab('all'); result.current.setMineOnly(true); });
    const ids = result.current.filteredTasks.map((t) => t.id);
    expect(ids).toContain('t1');
    expect(ids).toContain('t3');
    expect(ids).not.toContain('t2');
    expect(ids).not.toContain('t4');
  });

  // Tab counts update reactively when mineOnly changes (used to keep badges in sync)
  it("mineOnly tab counts only count the current user's tasks", () => {
    const { result } = renderHook(() => useBacklogFilters(TASKS, 'user-1'));
    act(() => result.current.setMineOnly(true));
    expect(result.current.tabCounts['all']).toBe(2); // t1 + t3 owned by user-1
  });

  // Search is case-insensitive so "gam" matches "Gamma"
  it('search filters by task name (case-insensitive)', () => {
    const { result } = renderHook(() => useBacklogFilters(TASKS, 'user-1'));
    act(() => { result.current.setStatusTab('all'); result.current.setSearch('gam'); });
    expect(result.current.filteredTasks.map((t) => t.id)).toEqual(['t3']);
  });

  // No results is a valid state, not an error — the list should be empty not undefined
  it('search with no match returns empty list', () => {
    const { result } = renderHook(() => useBacklogFilters(TASKS, 'user-1'));
    act(() => { result.current.setStatusTab('all'); result.current.setSearch('zzznomatch'); });
    expect(result.current.filteredTasks).toHaveLength(0);
  });

  // Alpha sort uses localeCompare so accented characters sort correctly
  it('sortKey=alpha sorts tasks alphabetically', () => {
    const { result } = renderHook(() => useBacklogFilters(TASKS, 'user-1'));
    act(() => { result.current.setStatusTab('all'); result.current.setSortKey('alpha'); });
    const names = result.current.filteredTasks.map((t) => t.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  // Newest-first descending by createdAt; most recently created appears at top of list
  it('sortKey=newest sorts newest first', () => {
    const { result } = renderHook(() => useBacklogFilters(TASKS, 'user-1'));
    act(() => { result.current.setStatusTab('all'); result.current.setSortKey('newest'); });
    const dates = result.current.filteredTasks.map((t) => new Date(t.createdAt).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  // Unassigned sort helps triage: tasks with no owner bubble to the top
  it('sortKey=unassigned puts tasks without ownerId first', () => {
    const { result } = renderHook(() => useBacklogFilters(TASKS, 'user-1'));
    act(() => { result.current.setStatusTab('all'); result.current.setSortKey('unassigned'); });
    const tasks = result.current.filteredTasks;
    const firstAssigned = tasks.findIndex((t) => t.ownerId);
    const lastUnassigned = tasks.map((t) => !t.ownerId).lastIndexOf(true);
    expect(lastUnassigned).toBeLessThan(firstAssigned === -1 ? tasks.length : firstAssigned);
  });

  // Tasks without a deadline go to the bottom so upcoming deadlines stay visible
  it('sortKey=deadline sorts tasks with nearest deadline first, no-deadline last', () => {
    const { result } = renderHook(() => useBacklogFilters(TASKS, 'user-1'));
    act(() => { result.current.setStatusTab('all'); result.current.setSortKey('deadline'); });
    const tasks = result.current.filteredTasks;
    const withDeadline = tasks.filter((t) => t.deadline);
    const withoutDeadline = tasks.filter((t) => !t.deadline);
    // tasks with deadline should come before tasks without
    if (withDeadline.length > 0 && withoutDeadline.length > 0) {
      const lastWithIdx = tasks.indexOf(withDeadline[withDeadline.length - 1]!);
      const firstWithoutIdx = tasks.indexOf(withoutDeadline[0]!);
      expect(lastWithIdx).toBeLessThan(firstWithoutIdx);
    }
  });

  // unassignedCount drives the badge on the backlog tab; only counts backlog status rows
  it('unassignedCount counts backlog tasks with no owner', () => {
    const { result } = renderHook(() => useBacklogFilters(TASKS, 'user-1'));
    // t1 is backlog + has owner, t4/t5 are done/blocked (not backlog)
    // No task in TASKS is backlog + unassigned
    expect(result.current.unassignedCount).toBe(0);

    const withUnassigned = [...TASKS, makeTask({ id: 't6', status: 'backlog', ownerId: undefined })];
    const { result: r2 } = renderHook(() => useBacklogFilters(withUnassigned, 'user-1'));
    expect(r2.current.unassignedCount).toBe(1);
  });

  // overdueCount excludes done tasks; a completed task is never overdue regardless of deadline
  it('overdueCount counts non-done tasks with a past deadline', () => {
    const { result } = renderHook(() => useBacklogFilters(TASKS, 'user-1'));
    // t3 has deadline 2020-01-01 and is in_progress (not done)
    expect(result.current.overdueCount).toBe(1);
  });
});
