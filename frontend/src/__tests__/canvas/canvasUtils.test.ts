/**
 * Unit tests for the pure canvas utilities: graph construction helpers,
 * dagre auto-layout, and ancestor traversal.
 * No React context required - all exports are plain functions.
 */
import { describe, it, expect } from 'vitest';
import { buildGraph, runAutoLayout, getAncestorIds } from '../../components/canvas/canvasUtils';
import type { Task } from '../../types';

// Minimal task factory
function makeTask(id: string, deps: string[] = [], overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: `Task ${id}`,
    status: 'backlog',
    description: null,
    assigneeId: null,
    productId: 'prod-1',
    deadline: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    canvasX: null,
    canvasY: null,
    columnPosition: 0,
    dependsOn: deps.map((prerequisiteId) => ({ prerequisiteId })),
    assignee: null,
    ...overrides,
  } as unknown as Task;
}

const PRODUCT = { id: 'prod-1', name: 'My Product', emoji: '🚀', deadline: '2026-12-31' };

// ── buildGraph ───────────────────────────────────────────────────────────────

describe('buildGraph', () => {
  it('creates a product node', () => {
    const { nodes } = buildGraph([], PRODUCT, new Set(), null, new Map());
    expect(nodes.find((n) => n.id === `product-${PRODUCT.id}`)).toBeDefined();
  });

  it('creates one task node per task', () => {
    const tasks = [makeTask('t1'), makeTask('t2')];
    const { nodes } = buildGraph(tasks, PRODUCT, new Set(), null, new Map());
    expect(nodes.filter((n) => !n.id.startsWith('product-'))).toHaveLength(2);
  });

  it('creates an edge for each dependency', () => {
    const tasks = [makeTask('t1'), makeTask('t2', ['t1'])];
    const { edges } = buildGraph(tasks, PRODUCT, new Set(), null, new Map());
    expect(edges.some((e) => e.source === 't1' && e.target === 't2')).toBe(true);
  });

  it('skips edges whose source is not in the task list (filtered view)', () => {
    // t2 depends on t1, but t1 is not in the visible set
    const tasks = [makeTask('t2', ['t1'])];
    const { edges } = buildGraph(tasks, PRODUCT, new Set(), null, new Map());
    // No dangling edge
    expect(edges.filter((e) => !e.id.includes('product-'))).toHaveLength(0);
  });

  it('creates a product-connection edge for connected tasks', () => {
    const tasks = [makeTask('t1')];
    const { edges } = buildGraph(tasks, PRODUCT, new Set(['t1']), null, new Map());
    expect(edges.some((e) => e.source === 't1' && e.target.startsWith('product-'))).toBe(true);
  });

  it('marks in_progress task edges as animated', () => {
    const tasks = [makeTask('t1'), makeTask('t2', ['t1'], { status: 'in_progress' })];
    const { edges } = buildGraph(tasks, PRODUCT, new Set(), null, new Map());
    const dep = edges.find((e) => e.source === 't1' && e.target === 't2');
    expect(dep?.animated).toBe(true);
  });

  it('marks task node as inActiveSprint when sprint checkbox matches', () => {
    const tasks = [makeTask('t1')];
    const { nodes } = buildGraph(tasks, PRODUCT, new Set(), { sprintId: 's1', taskIds: new Set(['t1']) }, new Map());
    const node = nodes.find((n) => n.id === 't1');
    expect(node?.data.inActiveSprint).toBe(true);
  });

  it('respects saved local positions over canvasX/canvasY', () => {
    const tasks = [makeTask('t1', [], { canvasX: 0, canvasY: 0 } as Partial<Task>)];
    const { nodes } = buildGraph(tasks, PRODUCT, new Set(), null, new Map(), undefined, undefined, {
      t1: { x: 500, y: 300 },
    });
    const node = nodes.find((n) => n.id === 't1');
    expect(node?.position).toEqual({ x: 500, y: 300 });
  });
});

// ── runAutoLayout ────────────────────────────────────────────────────────────

describe('runAutoLayout', () => {
  it('returns the same number of nodes', () => {
    const tasks = [makeTask('t1'), makeTask('t2', ['t1'])];
    const { nodes, edges } = buildGraph(tasks, PRODUCT, new Set(), null, new Map());
    const laid = runAutoLayout(nodes, edges);
    expect(laid).toHaveLength(nodes.length);
  });

  it('assigns numeric x and y to every node', () => {
    const tasks = [makeTask('t1'), makeTask('t2', ['t1'])];
    const { nodes, edges } = buildGraph(tasks, PRODUCT, new Set(), null, new Map());
    const laid = runAutoLayout(nodes, edges);
    for (const n of laid) {
      expect(typeof n.position.x).toBe('number');
      expect(typeof n.position.y).toBe('number');
    }
  });

  it('places the product node to the right of all task nodes', () => {
    const tasks = [makeTask('t1'), makeTask('t2')];
    const { nodes, edges } = buildGraph(tasks, PRODUCT, new Set(), null, new Map());
    const laid = runAutoLayout(nodes, edges);
    const productNode = laid.find((n) => n.id.startsWith('product-'))!;
    const taskMaxX = Math.max(...laid.filter((n) => !n.id.startsWith('product-')).map((n) => n.position.x + 200));
    expect(productNode.position.x).toBeGreaterThanOrEqual(taskMaxX);
  });

  it('works with a single task and no edges', () => {
    const { nodes, edges } = buildGraph([makeTask('t1')], PRODUCT, new Set(), null, new Map());
    expect(() => runAutoLayout(nodes, edges)).not.toThrow();
  });
});

// ── getAncestorIds ───────────────────────────────────────────────────────────

describe('getAncestorIds', () => {
  it('returns an empty set when there are no dependencies', () => {
    const tasks = [makeTask('t1'), makeTask('t2')];
    expect(getAncestorIds(['t1'], tasks).size).toBe(0);
  });

  it('returns direct prerequisite', () => {
    const tasks = [makeTask('t1'), makeTask('t2', ['t1'])];
    expect(getAncestorIds(['t2'], tasks).has('t1')).toBe(true);
  });

  it('traverses transitive prerequisites', () => {
    // t3 → t2 → t1
    const tasks = [makeTask('t1'), makeTask('t2', ['t1']), makeTask('t3', ['t2'])];
    const ancestors = getAncestorIds(['t3'], tasks);
    expect(ancestors.has('t2')).toBe(true);
    expect(ancestors.has('t1')).toBe(true);
  });

  it('handles multiple starting task IDs', () => {
    const tasks = [makeTask('t1'), makeTask('t2', ['t1']), makeTask('t3'), makeTask('t4', ['t3'])];
    const ancestors = getAncestorIds(['t2', 't4'], tasks);
    expect(ancestors.has('t1')).toBe(true);
    expect(ancestors.has('t3')).toBe(true);
  });

  it('handles diamond dependencies without duplicates', () => {
    // t3 → t1, t3 → t2 → t1
    const tasks = [makeTask('t1'), makeTask('t2', ['t1']), makeTask('t3', ['t1', 't2'])];
    const ancestors = getAncestorIds(['t3'], tasks);
    // t1 appears twice in the graph but result set should de-duplicate
    expect(ancestors.size).toBe(2); // t1 and t2
  });
});
