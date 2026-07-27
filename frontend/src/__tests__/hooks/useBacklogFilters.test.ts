/**
 * Unit tests for the useBacklogFilters hook.
 *
 * The hook drives the backlog list view: it filters tasks by status tab,
 * owner (mineOnly), and free-text search. It also computes per-tab counts,
 * unassignedCount, and overdueCount for the summary badges. Sorting lives in
 * BacklogPage.tsx/utils/backlogSort.ts instead (see backlogSort.test.ts).
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
    milestoneOrder: 0,
    createdBy: 'user-1',
    createdAt: new Date('2024-01-15').toISOString(),
    subtasks: [],
    dependsOn: [],
    requiredBy: [],
    ...overrides,
  };
}

const TASKS: Task[] = [
  makeTask({ id: 't1', name: 'Alpha', status: 'backlog', ownerId: 'user-1', createdAt: '2024-01-01T00:00:00Z' }),
  makeTask({ id: 't2', name: 'Beta', status: 'todo', ownerId: 'user-2', createdAt: '2024-01-02T00:00:00Z' }),
  makeTask({
    id: 't3',
    name: 'Gamma',
    status: 'in_progress',
    ownerId: 'user-1',
    createdAt: '2024-01-03T00:00:00Z',
    deadline: '2020-01-01' /* overdue */,
  }),
  makeTask({ id: 't4', name: 'Delta', status: 'done', ownerId: undefined, createdAt: '2024-01-04T00:00:00Z' }),
  makeTask({ id: 't5', name: 'Epsilon', status: 'blocked', ownerId: undefined, createdAt: '2024-01-05T00:00:00Z' }),
];

describe('useBacklogFilters', () => {
  // Initial state: only backlog tasks are shown; the status filter is pre-selected
  it('defaults to statusFilters={backlog}, showing only backlog tasks', () => {
    const { result } = renderHook(() => useBacklogFilters(TASKS, 'user-1'));
    expect(Array.from(result.current.statusFilters)).toEqual(['backlog']);
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

  // An empty status filter set must include every status, not just active ones
  it('clearing statusFilters shows every task', () => {
    const { result } = renderHook(() => useBacklogFilters(TASKS, 'user-1'));
    act(() => result.current.setStatusFilters(new Set()));
    expect(result.current.filteredTasks).toHaveLength(5);
  });

  // Replacing the whole set (mobile's single-select convenience) swaps which status is shown
  it('setStatusFilters(new Set(["done"])) shows only done tasks', () => {
    const { result } = renderHook(() => useBacklogFilters(TASKS, 'user-1'));
    act(() => result.current.setStatusFilters(new Set(['done'])));
    expect(result.current.filteredTasks.map((t) => t.id)).toEqual(['t4']);
  });

  // toggleStatusFilter can combine multiple statuses at once (desktop's multi-select Filters menu)
  it('toggleStatusFilter combines multiple statuses', () => {
    const { result } = renderHook(() => useBacklogFilters(TASKS, 'user-1'));
    act(() => {
      result.current.setStatusFilters(new Set());
      result.current.toggleStatusFilter('todo');
      result.current.toggleStatusFilter('done');
    });
    const ids = result.current.filteredTasks.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(['t2', 't4']));
    expect(ids).toHaveLength(2);
  });

  // mineOnly stacks with the active status filter; here "all statuses" + mineOnly = user-1's tasks only
  it('mineOnly filters to tasks owned by the current user', () => {
    const { result } = renderHook(() => useBacklogFilters(TASKS, 'user-1'));
    act(() => {
      result.current.setStatusFilters(new Set());
      result.current.setMineOnly(true);
    });
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
    act(() => {
      result.current.setStatusFilters(new Set());
      result.current.setSearch('gam');
    });
    expect(result.current.filteredTasks.map((t) => t.id)).toEqual(['t3']);
  });

  // No results is a valid state, not an error — the list should be empty not undefined
  it('search with no match returns empty list', () => {
    const { result } = renderHook(() => useBacklogFilters(TASKS, 'user-1'));
    act(() => {
      result.current.setStatusFilters(new Set());
      result.current.setSearch('zzznomatch');
    });
    expect(result.current.filteredTasks).toHaveLength(0);
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
