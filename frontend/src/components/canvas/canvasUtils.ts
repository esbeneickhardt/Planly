/**
 * Pure utilities for the Canvas dependency graph.
 * Extracted from CanvasView.tsx to keep the component manageable.
 * Includes: shared types, localStorage helpers, graph construction, dagre layout, ancestor traversal.
 */
import { createContext } from 'react';
import type { CSSProperties } from 'react';
import type { Node, Edge } from 'reactflow';
import { MarkerType } from 'reactflow';
import dagre from '@dagrejs/dagre';
import type { Task } from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

export const SPRINT_PALETTE = [
  '#7c3aed',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#06b6d4',
  '#f97316',
] as const;

export const STATUS_OPTIONS = [
  { key: 'backlog', label: 'Not started', color: '#64748b' },
  { key: 'todo', label: 'To Do', color: '#3b82f6' },
  { key: 'in_progress', label: 'In Progress', color: '#f59e0b' },
  { key: 'blocked', label: 'Blocked', color: '#ef4444' },
  { key: 'done', label: 'Done', color: '#10b981' },
] as const;

// ─── Shared context (consumed by TaskNode via useContext) ──────────────────────

export interface CanvasCtx {
  showSprintAura: boolean;
  simpleMode: boolean;
}
export const CanvasContext = createContext<CanvasCtx>({ showSprintAura: false, simpleMode: false });

// ─── Types ────────────────────────────────────────────────────────────────────

export type ViewMode = 'all' | 'active' | 'milestones' | 'sprint';

export interface CanvasState {
  viewport?: { x: number; y: number; zoom: number };
  viewMode?: ViewMode;
  statusFilter?: string | null;
  selectedSprintFilter?: string | null;
  selectedMilestoneIds?: string[];
  autoLayoutEnabled?: boolean;
  showSprintAura?: boolean;
  simpleMode?: boolean;
  productNodePosition?: { x: number; y: number };
  // Per-user task positions - never shared across users; each user arranges their own canvas
  positions?: Record<string, { x: number; y: number }>;
}

// ─── Shared control-panel style helpers ───────────────────────────────────────
// Used by CanvasControlPanel and its Filters/Display/Layouts dropdowns to render pill-style
// toggle chips and the view-mode segmented control consistently.

export function chip(active: boolean, accentColor?: string): CSSProperties {
  return {
    background: active ? (accentColor ? `${accentColor}20` : 'var(--brand-subtle)') : 'var(--surface)',
    color: active ? (accentColor ?? 'var(--brand)') : 'var(--text-3)',
    border: `1px solid ${active ? (accentColor ? `${accentColor}55` : 'var(--brand)') : 'var(--border)'}`,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  };
}

export function segBtn(viewMode: ViewMode, key: ViewMode): CSSProperties {
  return {
    background: viewMode === key ? 'var(--surface)' : 'transparent',
    color: viewMode === key ? 'var(--text)' : 'var(--text-3)',
    boxShadow: viewMode === key ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
  };
}

export interface CtxMenu {
  x: number;
  y: number;
  type: 'edge' | 'node';
  edgeId?: string;
  srcId?: string;
  tgtId?: string;
  taskId?: string;
}

// ─── LocalStorage helpers ─────────────────────────────────────────────────────

export function loadState(id: string): CanvasState {
  try {
    return JSON.parse(localStorage.getItem(`planly-canvas-${id}`) ?? '{}') as CanvasState;
  } catch {
    return {};
  }
}

export function patchState(id: string, p: Partial<CanvasState>) {
  try {
    localStorage.setItem(`planly-canvas-${id}`, JSON.stringify({ ...loadState(id), ...p }));
  } catch {}
}

// ─── Graph construction ───────────────────────────────────────────────────────

export function buildGraph(
  tasks: Task[],
  product: { id: string; name: string; emoji?: string; deadline: string },
  productConnections: Set<string>,
  sprintCheckbox: { sprintId: string; taskIds: Set<string> } | null,
  sprintColorsMap: Map<string, string[]>,
  productNodePos?: { x: number; y: number },
  columnLabelMap?: Map<string, string>,
  localPositions: Record<string, { x: number; y: number }> = {},
) {
  const nodeIds = new Set(tasks.map((t) => t.id));
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  nodes.push({
    id: `product-${product.id}`,
    type: 'product',
    position: productNodePos ?? { x: 900, y: 300 },
    data: { name: product.name, emoji: product.emoji, deadline: product.deadline },
    deletable: false,
  });

  tasks.forEach((t) => {
    nodes.push({
      id: t.id,
      type: 'task',
      position: localPositions[t.id] ?? { x: t.canvasX ?? 0, y: t.canvasY ?? 0 },
      data: {
        ...t,
        selectedSprintId: sprintCheckbox?.sprintId ?? null,
        inActiveSprint: sprintCheckbox ? sprintCheckbox.taskIds.has(t.id) : false,
        sprintColors: sprintColorsMap.get(t.id) ?? [],
        statusLabel: columnLabelMap?.get(t.status),
      },
    });
    t.dependsOn.forEach((dep) => {
      if (!nodeIds.has(dep.prerequisiteId)) return;
      edges.push({
        id: `${dep.prerequisiteId}->${t.id}`,
        source: dep.prerequisiteId,
        target: t.id,
        type: 'smoothstep',
        animated: t.status === 'in_progress',
        style: { stroke: 'var(--border-2)', strokeWidth: 2 },
        markerEnd: { type: MarkerType.Arrow, width: 16, height: 16, color: 'var(--border-2)' },
      });
    });
  });

  productConnections.forEach((taskId) => {
    if (nodeIds.has(taskId)) {
      edges.push({
        id: `${taskId}->product-${product.id}`,
        source: taskId,
        target: `product-${product.id}`,
        type: 'smoothstep',
        style: { stroke: 'var(--brand)', strokeWidth: 2, strokeDasharray: '5 3' },
        markerEnd: { type: MarkerType.Arrow, width: 16, height: 16, color: 'var(--brand)' },
      });
    }
  });

  return { nodes, edges };
}

// ─── Dagre auto-layout ────────────────────────────────────────────────────────
// Sugiyama layered layout (left-to-right, ranked by dependency depth).
// dagre returns centre coordinates; ReactFlow nodes are top-left anchored - subtract half the
// node's width/height to convert. `nodeHeights` lets callers pass a real per-task height estimate
// instead of the flat default, so dagre doesn't reserve identical vertical space for every node
// regardless of how much content it actually renders (e.g. simple-mode nodes are much shorter).
// The product-deadline node is placed right of all task nodes, centred vertically.
export function runAutoLayout(nodes: Node[], edges: Edge[], nodeHeights?: Map<string, number>): Node[] {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', ranksep: 100, nodesep: 50 });
  nodes.forEach((n) => g.setNode(n.id, { width: 200, height: nodeHeights?.get(n.id) ?? 80 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  const laid = nodes.map((n) => {
    const pos = g.node(n.id);
    const height = nodeHeights?.get(n.id) ?? 80;
    return { ...n, position: { x: pos.x - 100, y: pos.y - height / 2 } };
  });
  const nonProduct = laid.filter((n) => !n.id.startsWith('product-'));
  if (nonProduct.length > 0) {
    const maxRight = Math.max(...nonProduct.map((n) => n.position.x + 200));
    const midY = nonProduct.reduce((s, n) => s + n.position.y, 0) / nonProduct.length;
    return laid.map((n) => (n.id.startsWith('product-') ? { ...n, position: { x: maxRight + 80, y: midY - 40 } } : n));
  }
  return laid;
}

// ─── Graph traversal ──────────────────────────────────────────────────────────
// Moved to ../../utils/milestones.ts so non-canvas pages (e.g. Backlog) can reuse it too;
// re-exported here so existing imports from canvasUtils keep working unchanged.
export { getAncestorIds } from '../../utils/milestones';
