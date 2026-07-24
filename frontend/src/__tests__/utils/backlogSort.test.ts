/**
 * Unit tests for the Backlog table's column-based sort comparators.
 */
import { describe, it, expect } from 'vitest';
import { sortTasks } from '../../utils/backlogSort';
import { computePrimaryMilestones } from '../../utils/milestones';
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

describe('sortTasks', () => {
  it('sorts by name alphabetically (asc/desc)', () => {
    const tasks = [makeTask({ id: 't1', name: 'Charlie' }), makeTask({ id: 't2', name: 'Alpha' }), makeTask({ id: 't3', name: 'Bravo' })];
    const empty = new Map();
    expect(sortTasks(tasks, 'name', 'asc', empty).map((t) => t.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(sortTasks(tasks, 'name', 'desc', empty).map((t) => t.name)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('sorts by status following the backlog -> todo -> in_progress -> blocked -> done pipeline', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'done' }),
      makeTask({ id: 't2', status: 'backlog' }),
      makeTask({ id: 't3', status: 'in_progress' }),
      makeTask({ id: 't4', status: 'todo' }),
      makeTask({ id: 't5', status: 'blocked' }),
    ];
    const ids = sortTasks(tasks, 'status', 'asc', new Map()).map((t) => t.id);
    expect(ids).toEqual(['t2', 't4', 't3', 't5', 't1']);
  });

  it('sorts by owner with unassigned tasks first in ascending order, last in descending', () => {
    const tasks = [
      makeTask({ id: 't1', owner: { id: 'u2', username: 'zed' } }),
      makeTask({ id: 't2' }), // unassigned
      makeTask({ id: 't3', owner: { id: 'u1', username: 'amy' } }),
    ];
    expect(sortTasks(tasks, 'owner', 'asc', new Map()).map((t) => t.id)).toEqual(['t2', 't3', 't1']);
    expect(sortTasks(tasks, 'owner', 'desc', new Map()).map((t) => t.id)).toEqual(['t1', 't3', 't2']);
  });

  it('sorts by deadline with missing deadlines always last, regardless of direction', () => {
    const tasks = [
      makeTask({ id: 't1', deadline: '2024-06-01' }),
      makeTask({ id: 't2' }), // no deadline
      makeTask({ id: 't3', deadline: '2024-01-01' }),
    ];
    expect(sortTasks(tasks, 'deadline', 'asc', new Map()).map((t) => t.id)).toEqual(['t3', 't1', 't2']);
    expect(sortTasks(tasks, 'deadline', 'desc', new Map()).map((t) => t.id)).toEqual(['t1', 't3', 't2']);
  });

  it('sorts by created date', () => {
    const tasks = [
      makeTask({ id: 't1', createdAt: '2024-01-02T00:00:00Z' }),
      makeTask({ id: 't2', createdAt: '2024-01-01T00:00:00Z' }),
      makeTask({ id: 't3', createdAt: '2024-01-03T00:00:00Z' }),
    ];
    expect(sortTasks(tasks, 'created', 'asc', new Map()).map((t) => t.id)).toEqual(['t2', 't1', 't3']);
  });

  it('sorts non-milestone tasks by the name of the milestone they feed into, unlinked tasks last', () => {
    const milestoneA = makeTask({ id: 'mA', name: 'Zeta milestone', deadline: '2024-03-01' });
    const milestoneB = makeTask({ id: 'mB', name: 'Alpha milestone', deadline: '2024-04-01' });
    const childOfA = makeTask({ id: 'c1', requiredBy: [{ dependentId: 'mA' }] });
    const childOfB = makeTask({ id: 'c2', requiredBy: [{ dependentId: 'mB' }] });
    const unlinked = makeTask({ id: 'c3' });
    const all = [childOfA, childOfB, unlinked, milestoneA, milestoneB];
    const primaryMilestones = computePrimaryMilestones(all);

    const ids = sortTasks([childOfA, childOfB, unlinked], 'milestone', 'asc', primaryMilestones).map((t) => t.id);
    expect(ids).toEqual(['c2', 'c1', 'c3']); // Alpha milestone before Zeta milestone, unlinked last
  });
});
