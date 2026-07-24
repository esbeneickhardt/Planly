/**
 * Unit tests for assignMilestoneColors (getAncestorIds is covered in canvasUtils.test.ts via its
 * re-export; computePrimaryMilestones is covered indirectly in backlogSort.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { assignMilestoneColors } from '../../utils/milestones';
import { PRESET_COLORS } from '../../hooks/useColorLegend';
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

describe('assignMilestoneColors', () => {
  it('assigns distinct preset colors to milestones without an explicit color, in deadline order', () => {
    const m1 = makeTask({ id: 'm1', deadline: '2024-06-01' });
    const m2 = makeTask({ id: 'm2', deadline: '2024-01-01' });
    const colors = assignMilestoneColors([m1, m2]);
    expect(colors.get('m2')).toBe(PRESET_COLORS[0]); // earliest deadline gets the first color
    expect(colors.get('m1')).toBe(PRESET_COLORS[1]);
  });

  it('ignores non-milestone tasks', () => {
    const milestone = makeTask({ id: 'm1', deadline: '2024-06-01' });
    const regular = makeTask({ id: 't1' });
    const colors = assignMilestoneColors([milestone, regular]);
    expect(colors.has('t1')).toBe(false);
    expect(colors.size).toBe(1);
  });

  it('keeps an explicit task.color instead of overriding it, and does not consume a cycle slot', () => {
    const explicit = makeTask({ id: 'm1', deadline: '2024-01-01', color: '#123456' });
    const auto = makeTask({ id: 'm2', deadline: '2024-02-01' });
    const colors = assignMilestoneColors([explicit, auto]);
    expect(colors.get('m1')).toBe('#123456');
    expect(colors.get('m2')).toBe(PRESET_COLORS[0]);
  });

  it('cycles through the palette when there are more milestones than preset colors', () => {
    const milestones = Array.from({ length: PRESET_COLORS.length + 2 }, (_, i) =>
      makeTask({ id: `m${i}`, deadline: new Date(2024, 0, i + 1).toISOString() }),
    );
    const colors = assignMilestoneColors(milestones);
    expect(colors.get(`m${PRESET_COLORS.length}`)).toBe(PRESET_COLORS[0]);
    expect(colors.get(`m${PRESET_COLORS.length + 1}`)).toBe(PRESET_COLORS[1]);
  });
});
