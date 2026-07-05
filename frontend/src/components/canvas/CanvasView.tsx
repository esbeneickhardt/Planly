import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap, Node, Edge, addEdge,
  useNodesState, useEdgesState, Connection, BackgroundVariant,
  ReactFlowProvider, Panel, useReactFlow, MarkerType,
} from 'reactflow';
import dagre from '@dagrejs/dagre';
import 'reactflow/dist/style.css';
import { useProduct } from '../../context/ProductContext';
import { useAuth } from '../../context/AuthContext';
import { usePermission } from '../../context/PermissionContext';
import { useToast } from '../../context/ToastContext';
import { api, displayName } from '../../api/client';
import type { CanvasSnapshot } from '../../api/client';
import type { Task, Sprint } from '../../types';
import TaskNode from './nodes/TaskNode';
import ProductNode from './nodes/ProductNode';
import TaskDetailPanel from '../common/TaskDetailPanel';
import Modal from '../common/Modal';

// ─── Sprint colour palette ────────────────────────────────────────────────────
const SPRINT_PALETTE = [
  '#7c3aed', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#06b6d4', '#f97316',
];

// ─── Canvas context ───────────────────────────────────────────────────────────
interface CanvasCtx { showSprintAura: boolean; simpleMode: boolean; }
export const CanvasContext = createContext<CanvasCtx>({ showSprintAura: false, simpleMode: false });

// ─── Persistence ──────────────────────────────────────────────────────────────
type ViewMode = 'all' | 'active' | 'milestones' | 'sprint';

interface CanvasState {
  viewport?: { x: number; y: number; zoom: number };
  viewMode?: ViewMode;
  statusFilter?: string | null;
  selectedSprintFilter?: string | null;
  selectedMilestoneIds?: string[];
  autoLayoutEnabled?: boolean;
  showSprintAura?: boolean;
  simpleMode?: boolean;
  productNodePosition?: { x: number; y: number };
}

function loadState(id: string): CanvasState {
  try { return JSON.parse(localStorage.getItem(`planly-canvas-${id}`) ?? '{}'); } catch { return {}; }
}
function patchState(id: string, p: Partial<CanvasState>) {
  try { localStorage.setItem(`planly-canvas-${id}`, JSON.stringify({ ...loadState(id), ...p })); } catch {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const nodeTypes = { task: TaskNode, product: ProductNode };

interface CtxMenu { x: number; y: number; type: 'edge' | 'node'; edgeId?: string; srcId?: string; tgtId?: string; taskId?: string; }

const STATUS_OPTIONS = [
  { key: 'backlog',     label: 'Not started',  color: '#64748b' },
  { key: 'todo',        label: 'To Do',        color: '#3b82f6' },
  { key: 'in_progress', label: 'In Progress',  color: '#f59e0b' },
  { key: 'blocked',     label: 'Blocked',      color: '#ef4444' },
  { key: 'done',        label: 'Done',         color: '#10b981' },
];

function buildGraph(
  tasks: Task[],
  product: { id: string; name: string; emoji?: string; deadline: string },
  productConnections: Set<string>,
  sprintCheckbox: { sprintId: string; taskIds: Set<string> } | null,
  sprintColorsMap: Map<string, string[]>,
  productNodePos?: { x: number; y: number },
  columnLabelMap?: Map<string, string>,
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
      position: { x: t.canvasX ?? 0, y: t.canvasY ?? 0 },
      data: {
        ...t,
        selectedSprintId: sprintCheckbox?.sprintId ?? null,
        inActiveSprint: sprintCheckbox ? sprintCheckbox.taskIds.has(t.id) : false,
        sprintColors: sprintColorsMap.get(t.id) ?? [],
        statusLabel: columnLabelMap?.get(t.status),
      },
    });
    t.dependsOn.forEach((dep) => {
      if (!nodeIds.has(dep.prerequisiteId)) return; // source not in visible set
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

function runAutoLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', ranksep: 120, nodesep: 70 });
  nodes.forEach((n) => g.setNode(n.id, { width: 200, height: 80 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  const laid = nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 100, y: pos.y - 40 } };
  });
  const nonProduct = laid.filter((n) => !n.id.startsWith('product-'));
  if (nonProduct.length > 0) {
    const maxRight = Math.max(...nonProduct.map((n) => n.position.x + 200));
    const midY = nonProduct.reduce((s, n) => s + n.position.y, 0) / nonProduct.length;
    return laid.map((n) => n.id.startsWith('product-') ? { ...n, position: { x: maxRight + 80, y: midY - 40 } } : n);
  }
  return laid;
}

function getAncestorIds(taskIds: string[], allTasks: Task[]): Set<string> {
  const result = new Set<string>();
  const queue = [...taskIds];
  while (queue.length) {
    const id = queue.shift()!;
    const task = allTasks.find((t) => t.id === id);
    if (!task) continue;
    for (const dep of task.dependsOn) {
      if (!result.has(dep.prerequisiteId)) { result.add(dep.prerequisiteId); queue.push(dep.prerequisiteId); }
    }
  }
  return result;
}

// ─── Legend modal ─────────────────────────────────────────────────────────────
function LegendModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Canvas visual guide" onClose={onClose} width="max-w-md">
      <div className="space-y-4 text-sm" style={{ color: 'var(--text-2)' }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-3)' }}>Nodes</p>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <div style={{ width: 52, height: 30, borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid #3b82f6', flexShrink: 0 }} />
              <span>Regular task - left border shows status or custom colour</span>
            </div>
            <div className="flex items-center gap-3">
              <div style={{ width: 52, height: 30, borderRadius: 6, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderLeft: '3px solid #f59e0b', flexShrink: 0 }} />
              <span>Milestone - task with a deadline (amber tint)</span>
            </div>
            <div className="flex items-center gap-3">
              <div style={{ width: 52, height: 30, borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderLeft: '3px solid #ef4444', flexShrink: 0 }} />
              <span>Overdue milestone - deadline has passed</span>
            </div>
            <div className="flex items-center gap-3">
              <div style={{ width: 52, height: 30, borderRadius: 8, background: 'var(--brand)', flexShrink: 0 }} />
              <span>Product node - final deliverable all tasks lead to</span>
            </div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-3)' }}>Edges</p>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <svg width="52" height="16" style={{ flexShrink: 0 }}><line x1="0" y1="8" x2="52" y2="8" stroke="var(--border-2)" strokeWidth="2" /></svg>
              <span>Dependency - source must complete before target</span>
            </div>
            <div className="flex items-center gap-3">
              <svg width="52" height="16" style={{ flexShrink: 0 }}>
                <line x1="0" y1="8" x2="52" y2="8" stroke="var(--border-2)" strokeWidth="2" strokeDasharray="4 3">
                  <animate attributeName="stroke-dashoffset" from="0" to="-14" dur="0.6s" repeatCount="indefinite" />
                </line>
              </svg>
              <span>Animated - target task is currently In Progress</span>
            </div>
            <div className="flex items-center gap-3">
              <svg width="52" height="16" style={{ flexShrink: 0 }}><line x1="0" y1="8" x2="52" y2="8" stroke="var(--brand)" strokeWidth="2" strokeDasharray="5 3" /></svg>
              <span>Dashed purple - task feeds directly into the product</span>
            </div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-3)' }}>Interactions</p>
          <ul className="space-y-1 text-xs list-disc list-inside" style={{ color: 'var(--text-3)' }}>
            <li>Drag from a handle to another node to create a dependency</li>
            <li>Click an edge then press Delete / Backspace to remove it</li>
            <li>Right-click a task to quickly change its status</li>
            <li>Click a task to select it - double-click to open its detail panel</li>
            <li>Select a task and press Delete / Backspace to delete it</li>
            <li>When a sub-plan is selected the checkbox on each task adds / removes it</li>
            <li>Sub-plan map mode colours each task by which sub-plan(s) it belongs to</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main canvas ──────────────────────────────────────────────────────────────
function CanvasInner() {
  const { activeProduct, tasks, tasksLoaded, refreshTasks, patchTaskPositions } = useProduct();
  const { user: currentUser } = useAuth();
  const { canWrite } = usePermission();
  const canWriteCanvas = canWrite('canvas');
  const { showToast } = useToast();
  const { getViewport, setViewport, fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskPos, setNewTaskPos] = useState<{ x: number; y: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [showLegend, setShowLegend] = useState(false);

  // View mode + secondary filters
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selectedSprintFilter, setSelectedSprintFilter] = useState<string | null>(null);
  const [selectedMilestoneIds, setSelectedMilestoneIds] = useState<string[]>([]);
  const [autoLayoutEnabled, setAutoLayoutEnabled] = useState(false);
  const [showSprintAura, setShowSprintAura] = useState(false);
  const [simpleMode, setSimpleMode] = useState(false);

  // Canvas snapshots (layout sharing)
  const [showShareModal, setShowShareModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [snapshots, setSnapshots] = useState<CanvasSnapshot[]>([]);
  const [snapshotName, setSnapshotName] = useState('');
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  // Dropdown open states (not persisted)
  const [showFiltersDropdown, setShowFiltersDropdown] = useState(false);
  const [showDisplayDropdown, setShowDisplayDropdown] = useState(false);
  const [showLayoutDropdown, setShowLayoutDropdown] = useState(false);
  const [showSprintPicker, setShowSprintPicker] = useState(false);
  const [showNewSprint, setShowNewSprint] = useState(false);
  const [sprintForm, setSprintForm] = useState({ name: '', startDate: '', endDate: '', color: SPRINT_PALETTE[0] });
  const [editingSprint, setEditingSprint] = useState<import('../../api/client').Sprint | null>(null);
  const [editSprintForm, setEditSprintForm] = useState({ name: '', color: SPRINT_PALETTE[0] });

  // Columns (for label resolution of custom statusKeys)
  const [columnLabelMap, setColumnLabelMap] = useState<Map<string, string>>(new Map());

  // Sprints
  const [sprints, setSprints] = useState<Sprint[]>([]);

  // Optimistic sprint membership - updated synchronously on click, synced async to backend
  const [localSprintMemberIds, setLocalSprintMemberIds] = useState<Set<string>>(new Set());
  const sprintInitRef = useRef<string | null>(null);

  const [layoutReady, setLayoutReady] = useState(false);
  const [connectionsVersion, setConnectionsVersion] = useState(0);
  const initializedRef = useRef<string | null>(null);
  const productConnectionsRef = useRef<Set<string>>(new Set());
  const activeProductRef = useRef(activeProduct);
  activeProductRef.current = activeProduct;
  const savedViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  // Always-current ref so onNodeClick never reads stale sprint state from a closure
  const sprintClickRef = useRef<{ filter: string | null; toggle: (id: string) => Promise<void> }>({ filter: null, toggle: async () => {} });

  const save = (p: Partial<CanvasState>) => { const prod = activeProductRef.current; if (prod) patchState(prod.id, p); };

  // Load persisted state on product change
  useEffect(() => {
    if (!activeProduct) return;
    initializedRef.current = null;
    sprintInitRef.current = null;
    setLayoutReady(false);
    productConnectionsRef.current = new Set();
    const s = loadState(activeProduct.id);
    setViewMode(s.viewMode ?? 'all');
    setStatusFilter(s.statusFilter ?? null);
    setSelectedSprintFilter(s.selectedSprintFilter ?? null);
    setSelectedMilestoneIds(s.selectedMilestoneIds ?? []);
    setAutoLayoutEnabled(s.autoLayoutEnabled ?? false);
    setShowSprintAura(s.showSprintAura ?? false);
    setSimpleMode(s.simpleMode ?? false);
    savedViewportRef.current = s.viewport ?? null;
  }, [activeProduct?.id]);

  const onMoveEnd = useCallback((_: unknown, vp: { x: number; y: number; zoom: number }) => {
    save({ viewport: vp });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync local sprint membership when sprint selection or loaded sprint data changes
  useEffect(() => {
    if (!selectedSprintFilter) { setLocalSprintMemberIds(new Set()); sprintInitRef.current = null; return; }
    const sprint = sprints.find((s) => s.id === selectedSprintFilter);
    if (sprint && sprintInitRef.current !== selectedSprintFilter) {
      setLocalSprintMemberIds(new Set(sprint.taskIds));
      sprintInitRef.current = selectedSprintFilter;
    }
  }, [selectedSprintFilter, sprints]);

  // Load sprints + product connections
  async function loadSprints() {
    if (!activeProduct) return;
    setSprints(await api.sprints.list(activeProduct.id).catch(() => [] as Sprint[]));
  }
  async function loadConnections() {
    if (!activeProduct) return;
    productConnectionsRef.current = new Set(await api.connections.list(activeProduct.id).catch(() => []));
    setConnectionsVersion((v) => v + 1);
  }
  useEffect(() => {
    if (!activeProduct) return;
    loadSprints();
    loadConnections();
    api.columns.list(activeProduct.id)
      .then((cols) => setColumnLabelMap(new Map(cols.map((c) => [c.statusKey, c.label]))))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProduct?.id]);

  // Sorted sprints + color mapping
  const sortedSprints = useMemo(() => [...sprints].sort((a, b) => a.startDate.localeCompare(b.startDate)), [sprints]);

  const sprintColorsMap = useMemo<Map<string, string[]>>(() => {
    const map = new Map<string, string[]>();
    sortedSprints.forEach((s) => {
      s.taskIds.forEach((tid) => { map.set(tid, [...(map.get(tid) ?? []), s.color]); });
    });
    return map;
  }, [sortedSprints]);

  // Milestone tasks
  const milestoneTasks = useMemo(() => tasks.filter((t) => !!t.deadline), [tasks]);

  // Filtered task set
  const filteredTasks = useMemo(() => {
    let base = tasks;

    if (viewMode === 'active') {
      base = base.filter((t) => t.status !== 'done');
    } else if (viewMode === 'milestones') {
      base = base.filter((t) => !!t.deadline);
    }
    // sprint mode shows ALL tasks - checkboxes on each node handle assignment

    if (statusFilter) base = base.filter((t) => t.status === statusFilter);

    // Milestone focus: selected milestone(s) + their full dependency chain + tasks with no edges at all
    if (selectedMilestoneIds.length > 0) {
      const ancestors = getAncestorIds(selectedMilestoneIds, tasks);
      const allPrerequisiteIds = new Set(tasks.flatMap((t) => t.dependsOn.map((d) => d.prerequisiteId)));
      base = base.filter((t) =>
        selectedMilestoneIds.includes(t.id) ||
        ancestors.has(t.id) ||
        (t.dependsOn.length === 0 && !allPrerequisiteIds.has(t.id))
      );
    }

    return base;
  }, [tasks, viewMode, statusFilter, selectedSprintFilter, selectedMilestoneIds, sprints]);

  // Build + layout nodes
  useEffect(() => {
    if (!activeProduct) return;

    const sprintCheckbox = selectedSprintFilter
      ? { sprintId: selectedSprintFilter, taskIds: localSprintMemberIds }
      : null;
    const auraCols = showSprintAura ? sprintColorsMap : new Map<string, string[]>();

    const savedProductPos = loadState(activeProduct.id).productNodePosition;
    const { nodes: n, edges: e } = buildGraph(filteredTasks, activeProduct, productConnectionsRef.current, sprintCheckbox, auraCols, savedProductPos, columnLabelMap);
    setEdges(e);

    if (initializedRef.current !== activeProduct.id) {
      // Wait until tasks have been fetched before locking in initialization.
      // Without this guard, the effect fires with an empty task list (tasks still
      // loading), locks initializedRef, and subsequent task arrivals hit the
      // merge branch - leaving every node at position (0,0).
      if (!tasksLoaded) {
        setNodes(n); // show the product node while loading
        return;
      }

      initializedRef.current = activeProduct.id;
      const unpositioned = filteredTasks.filter((t) => t.canvasX == null);
      const allUnpositioned = unpositioned.length === filteredTasks.length && filteredTasks.length > 0;

      if (allUnpositioned) {
        // First time on a fresh board - auto-layout once and persist positions
        const laid = runAutoLayout(n, e);
        setNodes(laid);
        const allUpdates = laid
          .filter((node) => !node.id.startsWith('product-'))
          .map((node) => ({ taskId: node.id, canvasX: node.position.x, canvasY: node.position.y }));
        patchTaskPositions(allUpdates);
        allUpdates.forEach(async ({ taskId, canvasX, canvasY }) => {
          await fetch(`/api/products/${activeProduct.id}/tasks/${taskId}/position`, {
            method: 'PATCH', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x: canvasX, y: canvasY }),
          });
        });
      } else if (unpositioned.length > 0) {
        // Some tasks lack positions (created outside canvas): auto-layout the unpositioned
        // ones relative to the existing cluster rather than stacking at (0,0).
        const positioned = n.filter((nd) => !unpositioned.find((t) => t.id === nd.id) && !nd.id.startsWith('product-'));
        const maxX = positioned.length > 0 ? Math.max(...positioned.map((nd) => nd.position.x)) : 0;
        const midY = positioned.length > 0 ? positioned.reduce((s, nd) => s + nd.position.y, 0) / positioned.length : 200;
        let col = 0;
        const laid = n.map((node) => {
          if (!unpositioned.find((t) => t.id === node.id)) return node;
          const pos = { x: maxX + 260 + col * 220, y: midY + (col % 2 === 0 ? -60 : 60) };
          col++;
          return { ...node, position: pos };
        });
        setNodes(laid);
        const newUpdates = unpositioned
          .map((task) => {
            const node = laid.find((nd) => nd.id === task.id);
            return node ? { taskId: task.id, canvasX: node.position.x, canvasY: node.position.y } : null;
          })
          .filter(Boolean) as { taskId: string; canvasX: number; canvasY: number }[];
        patchTaskPositions(newUpdates);
        newUpdates.forEach(async ({ taskId, canvasX, canvasY }) => {
          await fetch(`/api/products/${activeProduct.id}/tasks/${taskId}/position`, {
            method: 'PATCH', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x: canvasX, y: canvasY }),
          });
        });
      } else {
        // First visit for this user/browser: no saved viewport → run auto-layout once for a clean first impression
        const hasVisited = !!loadState(activeProduct.id).viewport;
        if (!hasVisited && filteredTasks.length > 0) {
          const laid = runAutoLayout(n, e);
          setNodes(laid);
          const updates = laid
            .filter((nd) => !nd.id.startsWith('product-'))
            .map((nd) => ({ taskId: nd.id, canvasX: nd.position.x, canvasY: nd.position.y }));
          const productNode = laid.find((nd) => nd.id.startsWith('product-'));
          if (productNode) save({ productNodePosition: { x: productNode.position.x, y: productNode.position.y } });
          patchTaskPositions(updates);
          updates.forEach(async ({ taskId, canvasX, canvasY }) => {
            await fetch(`/api/products/${activeProduct.id}/tasks/${taskId}/position`, {
              method: 'PATCH', credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ x: canvasX, y: canvasY }),
            });
          });
        } else {
          setNodes(n);
        }
      }

      setTimeout(() => {
        const vp = loadState(activeProduct.id).viewport;
        if (vp) setViewport(vp);
        else {
          fitView({ padding: 0.2 });
          // Save viewport so subsequent visits restore this fit-view instead of re-layout
          setTimeout(() => save({ viewport: getViewport() }), 60);
        }
        setLayoutReady(true);
      }, 80);
    } else {
      setLayoutReady(true);
      setNodes((curr) => {
        const byId = new Map(curr.map((nd) => [nd.id, nd]));
        return n.map((nn) => { const ex = byId.get(nn.id); return ex ? { ...ex, data: nn.data } : nn; });
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTasks, activeProduct, autoLayoutEnabled, sprints, selectedSprintFilter, showSprintAura, sprintColorsMap, localSprintMemberIds, tasksLoaded, connectionsVersion, columnLabelMap]);

  // Sprint membership toggle - optimistic: updates local Set immediately, syncs to backend async
  const toggleSprintMembership = useCallback(async (taskId: string) => {
    if (!activeProduct || !selectedSprintFilter || !canWriteCanvas) return;
    const isIn = localSprintMemberIds.has(taskId);
    // Synchronous optimistic update
    setLocalSprintMemberIds((prev) => {
      const next = new Set(prev);
      if (isIn) next.delete(taskId); else next.add(taskId);
      return next;
    });
    try {
      if (isIn) {
        await api.sprints.removeTask(activeProduct.id, selectedSprintFilter, taskId);
        setSprints((prev) => prev.map((s) => s.id === selectedSprintFilter ? { ...s, taskIds: s.taskIds.filter((id) => id !== taskId) } : s));
      } else {
        await api.sprints.addTasks(activeProduct.id, selectedSprintFilter, [taskId]);
        setSprints((prev) => prev.map((s) => s.id === selectedSprintFilter ? { ...s, taskIds: [...s.taskIds, taskId] } : s));
      }
    } catch (err) {
      // Revert on failure
      setLocalSprintMemberIds((prev) => {
        const next = new Set(prev);
        if (isIn) next.add(taskId); else next.delete(taskId);
        return next;
      });
      showToast((err as Error).message, 'error');
    }
  }, [activeProduct, selectedSprintFilter, localSprintMemberIds, showToast]);

  // Keep ref current so onNodeClick always reads latest values without stale closures
  sprintClickRef.current = { filter: selectedSprintFilter, toggle: toggleSprintMembership };

  // Setters that also persist
  const setViewModeSave = (v: ViewMode) => { setViewMode(v); save({ viewMode: v }); };
  const setStatusFilterSave = (v: string | null) => { setStatusFilter(v); save({ statusFilter: v }); };
  const setSprintFilterSave = (v: string | null) => { setSelectedSprintFilter(v); save({ selectedSprintFilter: v }); };
  const setMilestoneIdsSave = (v: string[]) => { setSelectedMilestoneIds(v); save({ selectedMilestoneIds: v }); };
  const setAutoLayoutSave = (v: boolean) => {
    setAutoLayoutEnabled(v);
    save({ autoLayoutEnabled: v });
    if (v && activeProduct) {
      const prod = activeProduct;
      const laid = runAutoLayout(nodes, edges);
      setNodes(laid);
      const updates = laid
        .filter((nd) => !nd.id.startsWith('product-'))
        .map((nd) => ({ taskId: nd.id, canvasX: nd.position.x, canvasY: nd.position.y }));
      // Save product node position so it persists across reloads
      const productNode = laid.find((nd) => nd.id.startsWith('product-'));
      if (productNode) save({ productNodePosition: { x: productNode.position.x, y: productNode.position.y } });
      // Sync in-memory cache so next tab-switch sees the new positions
      patchTaskPositions(updates);
      // Persist to DB
      updates.forEach(async ({ taskId, canvasX, canvasY }) => {
        await fetch(`/api/products/${prod.id}/tasks/${taskId}/position`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x: canvasX, y: canvasY }),
        });
      });
      // Fit the new layout and immediately save the resulting viewport to localStorage
      // (fitView bypasses d3-zoom so onMoveEnd never fires - we must save manually)
      setTimeout(() => {
        fitView({ padding: 0.15 });
        save({ viewport: getViewport() });
      }, 50);
    }
  };
  const setSprintAuraSave = (v: boolean) => { setShowSprintAura(v); save({ showSprintAura: v }); };
  const setSimpleModeSave = (v: boolean) => { setSimpleMode(v); save({ simpleMode: v }); };

  // ── Canvas snapshot helpers ──────────────────────────────────────────────────
  async function openShareModal() {
    setSnapshotName('');
    setShowShareModal(true);
  }

  async function openLoadModal() {
    if (!activeProduct) return;
    const snaps = await api.canvasSnapshots.list(activeProduct.id).catch(() => []);
    setSnapshots(snaps);
    setShowLoadModal(true);
  }

  async function saveSnapshot() {
    if (!activeProduct || !snapshotName.trim()) return;
    setSavingSnapshot(true);
    try {
      const positions: Record<string, { x: number; y: number }> = {};
      nodes.forEach((n) => { positions[n.id] = { x: n.position.x, y: n.position.y }; });
      const vp = getViewport();
      await api.canvasSnapshots.create(activeProduct.id, {
        name: snapshotName.trim(),
        positions,
        viewport: { ...vp, viewMode, simpleMode },
      });
      showToast('Layout saved', 'success');
      setShowShareModal(false);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingSnapshot(false);
    }
  }

  function applySnapshot(snap: CanvasSnapshot) {
    if (!activeProduct) return;
    // Apply positions to canvas nodes
    setNodes((prev) => prev.map((n) => {
      const pos = snap.positions[n.id];
      return pos ? { ...n, position: pos } : n;
    }));
    // Apply positions to in-memory task cache
    const updates = Object.entries(snap.positions)
      .filter(([id]) => !id.startsWith('product-'))
      .map(([taskId, { x, y }]) => ({ taskId, canvasX: x, canvasY: y }));
    patchTaskPositions(updates);
    // Apply viewport (x/y/zoom)
    const { x, y, zoom } = snap.viewport as { x: number; y: number; zoom: number; viewMode?: ViewMode; simpleMode?: boolean };
    setViewport({ x, y, zoom });
    // Apply display mode and simple mode if saved with snapshot
    const snapVp = snap.viewport as { viewMode?: ViewMode; simpleMode?: boolean };
    if (snapVp.viewMode) { setViewMode(snapVp.viewMode); save({ viewport: { x, y, zoom }, viewMode: snapVp.viewMode }); }
    else { save({ viewport: { x, y, zoom } }); }
    if (snapVp.simpleMode !== undefined) setSimpleMode(snapVp.simpleMode);
    setShowLoadModal(false);
    showToast(`Layout "${snap.name}" applied`, 'success');
  }

  async function deleteSnapshot(snap: CanvasSnapshot) {
    if (!activeProduct) return;
    await api.canvasSnapshots.delete(activeProduct.id, snap.id).catch(() => {});
    setSnapshots((prev) => prev.filter((s) => s.id !== snap.id));
  }

  // ReactFlow callbacks
  const onPaneClick = useCallback(() => {
    setCtxMenu(null);
    setShowFiltersDropdown(false);
    setShowDisplayDropdown(false);
    setShowLayoutDropdown(false);
    setShowSprintPicker(false);
  }, []);

  const onCanvasDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!canWriteCanvas) return;
    const target = e.target as HTMLElement;
    if (!target.classList.contains('react-flow__pane')) return;
    const vp = getViewport();
    const canvasX = Math.round((e.clientX - vp.x) / vp.zoom) - 100;
    const canvasY = Math.round((e.clientY - vp.y) / vp.zoom) - 40;
    setNewTaskPos({ x: canvasX, y: canvasY });
    setShowNewTask(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWriteCanvas]);

  const onConnect = useCallback(async (connection: Connection) => {
    setCtxMenu(null);
    if (!activeProduct || !connection.source || !connection.target || !canWriteCanvas) return;
    const src = connection.source, tgt = connection.target;
    if (src.startsWith('product-') || tgt.startsWith('product-')) {
      const taskId = src.startsWith('product-') ? tgt : src;
      await api.connections.add(activeProduct.id, taskId).catch(() => {});
      productConnectionsRef.current.add(taskId);
      setEdges((eds) => addEdge({ id: `${taskId}->product-${activeProduct.id}`, source: taskId, target: `product-${activeProduct.id}`, type: 'smoothstep', style: { stroke: 'var(--brand)', strokeWidth: 2, strokeDasharray: '5 3' }, markerEnd: { type: MarkerType.Arrow, width: 16, height: 16, color: 'var(--brand)' } }, eds));
      return;
    }
    try {
      const res = await fetch(`/api/products/${activeProduct.id}/tasks/${tgt}/dependencies`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prerequisiteId: src }),
      });
      if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? 'Failed'); }
      const isIP = tasks.find((t) => t.id === tgt)?.status === 'in_progress';
      setEdges((eds) => addEdge({ ...connection, id: `${src}->${tgt}`, type: 'smoothstep', animated: isIP, style: { stroke: 'var(--border-2)', strokeWidth: 2 }, markerEnd: { type: MarkerType.Arrow, width: 16, height: 16, color: 'var(--border-2)' } }, eds));
      await refreshTasks();
    } catch (err) { showToast((err as Error).message, 'error'); }
  }, [activeProduct, setEdges, refreshTasks, tasks, showToast]);

  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: Edge) => {
    e.preventDefault();
    const parts = edge.id.split('->');
    const srcId = parts[0], tgtId = parts.slice(1).join('->');
    if (srcId && tgtId) setCtxMenu({ x: e.clientX, y: e.clientY, type: 'edge', edgeId: edge.id, srcId, tgtId });
  }, []);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    if (!node.id.startsWith('product-')) setCtxMenu({ x: e.clientX, y: e.clientY, type: 'node', taskId: node.id });
  }, []);

  async function deleteEdge(srcId: string, tgtId: string, edgeId: string) {
    setCtxMenu(null);
    if (!canWriteCanvas) return;
    if (tgtId.startsWith('product-') || srcId.startsWith('product-')) {
      const taskId = tgtId.startsWith('product-') ? srcId : tgtId;
      await api.connections.remove(activeProduct?.id ?? '', taskId).catch(() => {});
      productConnectionsRef.current.delete(taskId);
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      return;
    }
    if (!activeProduct) return;
    try {
      const res = await fetch(`/api/products/${activeProduct.id}/tasks/${tgtId}/dependencies/${srcId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      await refreshTasks();
    } catch (err) { showToast((err as Error).message, 'error'); }
  }

  const onEdgesDelete = useCallback(async (del: Edge[]) => {
    if (!canWriteCanvas) return;
    for (const edge of del) {
      const parts = edge.id.split('->');
      const srcId = parts[0], tgtId = parts.slice(1).join('->');
      if (!srcId || !tgtId || !activeProduct) continue;
      if (tgtId.startsWith('product-') || srcId.startsWith('product-')) {
        const taskId = tgtId.startsWith('product-') ? srcId : tgtId;
        await api.connections.remove(activeProduct.id, taskId).catch(() => {});
        productConnectionsRef.current.delete(taskId);
      } else {
        const res = await fetch(`/api/products/${activeProduct.id}/tasks/${tgtId}/dependencies/${srcId}`, { method: 'DELETE', credentials: 'include' });
        if (res.ok) await refreshTasks();
      }
    }
  }, [activeProduct, refreshTasks]);

  async function quickSetStatus(taskId: string, status: string) {
    if (!activeProduct || !canWriteCanvas) return;
    setCtxMenu(null);
    try { await api.tasks.update(activeProduct.id, taskId, { status }); await refreshTasks(); showToast('Status updated', 'success'); }
    catch (err) { showToast((err as Error).message, 'error'); }
  }

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setCtxMenu(null);
    if (node.id.startsWith('product-')) return;
    // In sub-plan-filter mode a click toggles membership; otherwise just select the node
    const { filter, toggle } = sprintClickRef.current;
    if (filter) toggle(node.id);
  }, []); // stable reference - sprint state always fresh via sprintClickRef

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id.startsWith('product-')) return;
    const task = tasks.find((t) => t.id === node.id);
    if (task) setSelectedTask(task);
  }, [tasks]);

  const onNodesDelete = useCallback(async (deleted: Node[]) => {
    if (!activeProduct || !canWriteCanvas) return;
    const taskNodes = deleted.filter((n) => !n.id.startsWith('product-'));
    for (const node of taskNodes) {
      try {
        await api.tasks.delete(activeProduct.id, node.id);
      } catch (err) {
        showToast((err as Error).message, 'error');
      }
    }
    if (taskNodes.length > 0) await refreshTasks();
  }, [activeProduct, refreshTasks, showToast]);

  const onNodeDragStop = useCallback(async (_: React.MouseEvent, node: Node) => {
    if (!activeProduct || (!canWriteCanvas && !node.id.startsWith('product-'))) return;
    if (node.id.startsWith('product-')) {
      save({ productNodePosition: { x: node.position.x, y: node.position.y } });
      return;
    }
    const { x, y } = node.position;
    // Update the in-memory task cache so tab switches see the correct position
    patchTaskPositions([{ taskId: node.id, canvasX: x, canvasY: y }]);
    await fetch(`/api/products/${activeProduct.id}/tasks/${node.id}/position`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x, y }),
    });
  }, [activeProduct, patchTaskPositions]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskName.trim() || !activeProduct) return;
    setCreating(true);
    try {
      let canvasX: number, canvasY: number;
      if (newTaskPos) {
        canvasX = newTaskPos.x;
        canvasY = newTaskPos.y;
      } else {
        const vp = getViewport();
        canvasX = Math.round((-vp.x + window.innerWidth / 2) / vp.zoom) - 100;
        canvasY = Math.round((-vp.y + window.innerHeight / 2) / vp.zoom) - 40;
      }
      await api.tasks.create(activeProduct.id, { name: newTaskName.trim(), canvasX, canvasY });
      await refreshTasks();
      setNewTaskName(''); setNewTaskPos(null); setShowNewTask(false);
    } finally { setCreating(false); }
  }

  async function handleEditSprint(e: React.FormEvent) {
    e.preventDefault();
    if (!activeProduct || !editingSprint) return;
    try {
      const updated = await api.sprints.update(activeProduct.id, editingSprint.id, { name: editSprintForm.name, color: editSprintForm.color });
      setSprints((prev) => prev.map((s) => s.id === updated.id ? { ...updated, taskIds: s.taskIds } : s));
      setEditingSprint(null);
      showToast(`Sub-plan updated`, 'success');
    } catch (err) { showToast((err as Error).message, 'error'); }
  }

  async function handleCreateSprint(e: React.FormEvent) {
    e.preventDefault();
    if (!activeProduct) return;
    try {
      const s = await api.sprints.create(activeProduct.id, { name: sprintForm.name, startDate: sprintForm.startDate, endDate: sprintForm.endDate, color: sprintForm.color });
      setSprints((prev) => {
        const next = [...prev, s].sort((a, b) => a.startDate.localeCompare(b.startDate));
        const nextColor = SPRINT_PALETTE[next.length % SPRINT_PALETTE.length];
        setSprintForm({ name: '', startDate: '', endDate: '', color: nextColor });
        return next;
      });
      setShowNewSprint(false);
      showToast(`Sub-plan "${s.name}" created`, 'success');
    } catch (err) { showToast((err as Error).message, 'error'); }
  }

  async function deleteSprint(sprintId: string) {
    if (!activeProduct) return;
    await api.sprints.delete(activeProduct.id, sprintId).catch(() => {});
    setSprints((prev) => prev.filter((s) => s.id !== sprintId));
    if (selectedSprintFilter === sprintId) setSprintFilterSave(null);
    showToast('Sprint deleted', 'info');
  }

  if (!activeProduct) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ color: 'var(--text-3)' }}>
        <div className="text-5xl opacity-30">◈</div>
        <p className="text-sm">Create a product to get started</p>
      </div>
    );
  }

  const isProductEdge = (s: string, t: string) => s.startsWith('product-') || t.startsWith('product-');
  const ctxTask = ctxMenu?.type === 'node' && ctxMenu.taskId ? tasks.find((t) => t.id === ctxMenu.taskId) : null;
  const activeSprint = sortedSprints.find((s) => s.id === selectedSprintFilter);

  // Style helpers
  const chip = (active: boolean, accentColor?: string) => ({
    background: active ? (accentColor ? `${accentColor}20` : 'var(--brand-subtle)') : 'var(--surface)',
    color: active ? (accentColor ?? 'var(--brand)') : 'var(--text-3)',
    border: `1px solid ${active ? (accentColor ? `${accentColor}55` : 'var(--brand)') : 'var(--border)'}`,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  } as React.CSSProperties);

  const segBtn = (key: ViewMode) => ({
    background: viewMode === key ? 'var(--surface)' : 'transparent',
    color: viewMode === key ? 'var(--text)' : 'var(--text-3)',
    boxShadow: viewMode === key ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
  } as React.CSSProperties);

  return (
    <CanvasContext.Provider value={{ showSprintAura, simpleMode }}>
      <style>{`.react-flow__edge.selected .react-flow__edge-path { stroke: var(--brand) !important; stroke-width: 3px !important; } .react-flow__edge.selected .react-flow__edge-interaction { stroke: var(--brand) !important; }`}</style>
      <div style={{ width: '100%', height: '100%', position: 'relative' }} onClick={() => setCtxMenu(null)} onDoubleClick={onCanvasDoubleClick}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect} onNodeClick={onNodeClick} onNodeDoubleClick={onNodeDoubleClick}
          onNodeDragStop={onNodeDragStop} onEdgeContextMenu={onEdgeContextMenu}
          onNodeContextMenu={onNodeContextMenu} onPaneClick={onPaneClick}
          onMoveEnd={onMoveEnd} nodeTypes={nodeTypes}
          nodesDraggable={canWriteCanvas}
          nodesConnectable={canWriteCanvas}
          defaultViewport={activeProduct ? loadState(activeProduct.id).viewport ?? undefined : undefined}
          defaultEdgeOptions={{ type: 'smoothstep', style: { stroke: 'var(--border-2)', strokeWidth: 2 } }}
          zoomOnDoubleClick={false} deleteKeyCode={canWriteCanvas ? ['Delete', 'Backspace'] : []} onEdgesDelete={onEdgesDelete} onNodesDelete={onNodesDelete}
          multiSelectionKeyCode="Shift"
        >
          <Background variant={BackgroundVariant.Dots} color="var(--border)" gap={24} size={1.5} />
          <Controls style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
          <MiniMap nodeColor={(n) => n.id.startsWith('product-') ? 'var(--brand)' : 'var(--surface-2)'} maskColor="rgba(0,0,0,0.25)" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} zoomable pannable />

          {/* ── Top-left ────────────────────────────────────────────────── */}
          <Panel position="top-left">
            <div className="flex flex-col gap-2">

              {/* Row 1 - view mode segmented control */}
              <div className="flex items-center p-1 gap-0.5 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
                {(['all', 'active', 'milestones'] as ViewMode[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setViewModeSave(key)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all capitalize"
                    style={segBtn(key)}
                  >
                    {key === 'milestones' ? '⭐ Milestones' : key === 'active' ? 'Active' : 'All'}
                  </button>
                ))}

                {/* Sprint view mode - picker + management in one place */}
                <div className="relative">
                  <button
                    onClick={() => { setViewModeSave('sprint'); setShowSprintPicker((v) => !v); }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                    style={segBtn('sprint')}
                  >
                    ⚡ {viewMode === 'sprint' && activeSprint ? activeSprint.name : 'Sub-plan'}
                    <span className="text-[10px] opacity-50">▾</span>
                  </button>
                  {showSprintPicker && (
                    <div
                      className="absolute left-0 top-full mt-1 rounded-xl shadow-xl z-50 overflow-hidden"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 260 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Header */}
                      <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Sub-plans</span>
                        {canWriteCanvas && (
                          <button
                            onClick={() => { setShowSprintPicker(false); setShowNewSprint(true); }}
                            className="text-xs font-medium px-2 py-0.5 rounded-lg transition-colors"
                            style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                          >+ New</button>
                        )}
                      </div>

                      {/* No sprint option */}
                      <button
                        onClick={() => { setSprintFilterSave(null); setViewModeSave('all'); setShowSprintPicker(false); }}
                        className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2 transition-colors"
                        style={{ borderBottom: sortedSprints.length > 0 ? '1px solid var(--border)' : 'none' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />
                        <span style={{ color: !selectedSprintFilter ? 'var(--brand)' : 'var(--text-2)' }}>No sub-plan (exit sub-plan mode)</span>
                        {!selectedSprintFilter && <span className="ml-auto" style={{ color: 'var(--brand)' }}>✓</span>}
                      </button>

                      {/* Sprint list with select + delete */}
                      {sortedSprints.length === 0 && (
                        <p className="px-3 py-3 text-xs" style={{ color: 'var(--text-3)' }}>No sub-plans yet - create one to start planning.</p>
                      )}
                      {sortedSprints.map((s) => {
                        const isActive = selectedSprintFilter === s.id;
                        return (
                          <div
                            key={s.id}
                            className="flex items-center gap-2 px-3 py-2.5 group transition-colors cursor-pointer"
                            style={{ background: isActive ? 'var(--brand-subtle)' : 'transparent' }}
                            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--surface-2)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? 'var(--brand-subtle)' : 'transparent'; }}
                            onClick={() => { setSprintFilterSave(isActive ? null : s.id); setShowSprintPicker(false); }}
                          >
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate" style={{ color: isActive ? 'var(--brand)' : 'var(--text)' }}>{s.name}</p>
                              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                                {new Date(s.startDate).toLocaleDateString()} → {new Date(s.endDate).toLocaleDateString()} · {s.taskIds.length} tasks
                              </p>
                            </div>
                            {isActive && <span style={{ color: 'var(--brand)', fontSize: 11, flexShrink: 0 }}>✓</span>}
                            {canWriteCanvas && (
                              <>
                                <button
                                  className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-xs flex-shrink-0 transition-opacity"
                                  style={{ color: 'var(--text-3)' }}
                                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--surface-2)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'transparent'; }}
                                  onClick={(e) => { e.stopPropagation(); setEditingSprint(s); setEditSprintForm({ name: s.name, color: s.color }); setShowSprintPicker(false); }}
                                  title="Edit sub-plan"
                                >✎</button>
                                <button
                                  className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-xs flex-shrink-0 transition-opacity"
                                  style={{ color: 'var(--text-3)' }}
                                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'transparent'; }}
                                  onClick={(e) => { e.stopPropagation(); deleteSprint(s.id); }}
                                  title="Delete sub-plan"
                                >✕</button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2 - grouped control dropdowns */}
              <div className="flex items-center gap-1.5">

                {/* Filters dropdown - status + milestone focus */}
                <div className="relative">
                  <button
                    onClick={() => { setShowFiltersDropdown((v) => !v); setShowDisplayDropdown(false); setShowLayoutDropdown(false); }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                    style={chip(!!statusFilter || selectedMilestoneIds.length > 0)}
                  >
                    {statusFilter
                      ? <><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_OPTIONS.find((s) => s.key === statusFilter)?.color }} />{STATUS_OPTIONS.find((s) => s.key === statusFilter)?.label}</>
                      : selectedMilestoneIds.length > 0
                      ? `⭐ ${selectedMilestoneIds.length} milestone${selectedMilestoneIds.length > 1 ? 's' : ''}`
                      : 'Filters'}
                    <span className="text-[10px] opacity-50">▾</span>
                  </button>
                  {showFiltersDropdown && (
                    <div className="absolute left-0 top-full mt-1 rounded-xl shadow-xl z-50 overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 220 }} onClick={(e) => e.stopPropagation()}>
                      {/* Status section */}
                      <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Status</div>
                      <button onClick={() => { setStatusFilterSave(null); }} className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors" style={{ color: !statusFilter ? 'var(--brand)' : 'var(--text-2)' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                        All statuses {!statusFilter && <span className="ml-auto">✓</span>}
                      </button>
                      {STATUS_OPTIONS.map((s) => (
                        <button key={s.key} onClick={() => { setStatusFilterSave(statusFilter === s.key ? null : s.key); }} className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors" style={{ color: statusFilter === s.key ? 'var(--brand)' : 'var(--text-2)' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />{s.label} {statusFilter === s.key && <span className="ml-auto">✓</span>}
                        </button>
                      ))}
                      {/* Milestone focus section */}
                      {milestoneTasks.length > 0 && (
                        <>
                          <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>Milestone focus</div>
                          <button onClick={() => { setMilestoneIdsSave([]); }} className="w-full text-left px-3 py-1.5 text-xs transition-colors" style={{ color: selectedMilestoneIds.length === 0 ? '#f59e0b' : 'var(--text-2)' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                            Show all {selectedMilestoneIds.length === 0 && '✓'}
                          </button>
                          {milestoneTasks.map((t) => {
                            const sel = selectedMilestoneIds.includes(t.id);
                            const overdue = new Date(t.deadline!) < new Date() && t.status !== 'done';
                            return (
                              <button key={t.id} onClick={() => { setMilestoneIdsSave(sel ? selectedMilestoneIds.filter((id) => id !== t.id) : [...selectedMilestoneIds, t.id]); }} className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors" style={{ color: 'var(--text-2)' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                <span style={{ width: 12, height: 12, borderRadius: 3, flexShrink: 0, background: sel ? (overdue ? '#ef4444' : '#f59e0b') : 'transparent', border: `1.5px solid ${overdue ? 'rgba(239,68,68,0.5)' : 'rgba(245,158,11,0.5)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {sel && <span style={{ color: 'white', fontSize: 8 }}>✓</span>}
                                </span>
                                <span className="flex-1 truncate">{t.name}</span>
                                <span style={{ color: overdue ? '#ef4444' : 'var(--text-3)', flexShrink: 0, fontSize: 10 }}>{new Date(t.deadline!).toLocaleDateString()}</span>
                              </button>
                            );
                          })}
                        </>
                      )}
                      {(statusFilter || selectedMilestoneIds.length > 0) && (
                        <div style={{ borderTop: '1px solid var(--border)' }}>
                          <button onClick={() => { setStatusFilterSave(null); setMilestoneIdsSave([]); setShowFiltersDropdown(false); }} className="w-full text-left px-3 py-2 text-xs font-medium transition-colors" style={{ color: '#ef4444' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                            Clear all filters
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Display dropdown - layout, sprint map, simple mode */}
                <div className="relative">
                  <button
                    onClick={() => { setShowDisplayDropdown((v) => !v); setShowFiltersDropdown(false); setShowLayoutDropdown(false); }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                    style={chip(showSprintAura || simpleMode)}
                  >
                    Display{showSprintAura || simpleMode ? ' ●' : ''}
                    <span className="text-[10px] opacity-50">▾</span>
                  </button>
                  {showDisplayDropdown && (
                    <div className="absolute left-0 top-full mt-1 rounded-xl shadow-xl z-50 overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 200 }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { setAutoLayoutSave(true); setShowDisplayDropdown(false); }} className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2.5 transition-colors" onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                        <span style={{ fontSize: 15 }}>◫</span>
                        <div>
                          <p style={{ color: 'var(--text)', fontWeight: 500 }}>Re-layout graph</p>
                          <p style={{ color: 'var(--text-3)', fontSize: 10, marginTop: 1 }}>Auto-arrange using DAG layout</p>
                        </div>
                      </button>
                      <div style={{ borderTop: '1px solid var(--border)' }} />
                      <button onClick={() => setSprintAuraSave(!showSprintAura)} className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2.5 transition-colors" onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                        <span style={{ fontSize: 15 }}>🎨</span>
                        <div className="flex-1">
                          <p style={{ color: 'var(--text)', fontWeight: 500 }}>Sub-plan colour map</p>
                          <p style={{ color: 'var(--text-3)', fontSize: 10, marginTop: 1 }}>Colour tasks by sub-plan membership</p>
                        </div>
                        {showSprintAura && <span style={{ color: 'var(--brand)', fontSize: 12 }}>✓</span>}
                      </button>
                      <button onClick={() => setSimpleModeSave(!simpleMode)} className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2.5 transition-colors" onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                        <span style={{ fontSize: 15 }}>◻</span>
                        <div className="flex-1">
                          <p style={{ color: 'var(--text)', fontWeight: 500 }}>Simple mode</p>
                          <p style={{ color: 'var(--text-3)', fontSize: 10, marginTop: 1 }}>Show task names only</p>
                        </div>
                        {simpleMode && <span style={{ color: 'var(--brand)', fontSize: 12 }}>✓</span>}
                      </button>
                    </div>
                  )}
                </div>

                {/* Layouts dropdown - save / load snapshots */}
                <div className="relative">
                  <button
                    onClick={() => { setShowLayoutDropdown((v) => !v); setShowFiltersDropdown(false); setShowDisplayDropdown(false); }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                    style={chip(false)}
                  >
                    Layouts <span className="text-[10px] opacity-50">▾</span>
                  </button>
                  {showLayoutDropdown && (
                    <div className="absolute left-0 top-full mt-1 rounded-xl shadow-xl z-50 overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 200 }} onClick={(e) => e.stopPropagation()}>
                      {canWriteCanvas && (
                        <button onClick={() => { openShareModal(); setShowLayoutDropdown(false); }} className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2.5 transition-colors" onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                          <span style={{ fontSize: 15 }}>↑</span>
                          <div>
                            <p style={{ color: 'var(--text)', fontWeight: 500 }}>Save layout</p>
                            <p style={{ color: 'var(--text-3)', fontSize: 10, marginTop: 1 }}>Share current positions with team</p>
                          </div>
                        </button>
                      )}
                      <button onClick={() => { openLoadModal(); setShowLayoutDropdown(false); }} className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2.5 transition-colors" onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                        <span style={{ fontSize: 15 }}>↓</span>
                        <div>
                          <p style={{ color: 'var(--text)', fontWeight: 500 }}>Load layout</p>
                          <p style={{ color: 'var(--text-3)', fontSize: 10, marginTop: 1 }}>Apply a saved team snapshot</p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                {/* Legend */}
                <button onClick={() => setShowLegend(true)} title="Visual guide" className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold" style={chip(false)}>?</button>
              </div>
            </div>
          </Panel>

          {/* ── Sprint mode banner ─────────────────────────────────────── */}
          {selectedSprintFilter && activeSprint && (
            <Panel position="top-center">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid rgba(16,185,129,0.4)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{activeSprint.name}</span>
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>· click tasks to add / remove</span>
                <button
                  onClick={() => { setSprintFilterSave(null); setViewModeSave('all'); }}
                  className="ml-1 text-xs font-semibold px-2 py-0.5 rounded-lg transition-colors"
                  style={{ background: '#10b981', color: 'white' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#059669'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#10b981'; }}
                >
                  Done
                </button>
              </div>
            </Panel>
          )}

          {/* ── Top-right ───────────────────────────────────────────────── */}
          <Panel position="top-right">
            <div className="flex flex-col items-end gap-2">
              {/* New task - hidden for read-only users */}
              {canWriteCanvas && (
                <button
                  onClick={() => setShowNewTask(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: 'var(--brand)', color: 'white', border: '1px solid transparent', boxShadow: '0 1px 4px rgba(124,58,237,0.35)' }}
                >
                  + New task
                </button>
              )}

              {/* Sub-plan map legend - only when sprint aura is on */}
              {showSprintAura && sortedSprints.length > 0 && (
                <div className="rounded-xl px-3 py-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-3)' }}>Sub-plan map</p>
                  {sortedSprints.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 mb-1 last:mb-0">
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                      <span className="text-xs" style={{ color: 'var(--text-2)' }}>{s.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>

        </ReactFlow>

        {/* Empty-state onboarding */}
        {tasksLoaded && tasks.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 5 }}>
            <div className="flex flex-col items-center gap-2 px-5 py-4 rounded-2xl text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', maxWidth: 320, pointerEvents: 'auto' }}>
              <div className="text-3xl opacity-60">📐</div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Start building your canvas</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                Add tasks and connect them to show dependencies. Tasks with deadlines become milestones.
              </p>
              <div className="flex flex-col gap-1.5 w-full">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                  <span className="font-mono text-[10px] px-1 py-0.5 rounded" style={{ background: 'var(--border)', color: 'var(--text-2)' }}>dbl-click</span>
                  <span>canvas to create a task</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                  <span className="font-mono text-[10px] px-1 py-0.5 rounded" style={{ background: 'var(--border)', color: 'var(--text-2)' }}>drag</span>
                  <span>between tasks to add dependencies</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Context menu */}
        {ctxMenu && (
          <div className="fixed rounded-xl shadow-xl z-50 py-1 overflow-hidden" style={{ left: ctxMenu.x, top: ctxMenu.y, background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 180 }} onClick={(e) => e.stopPropagation()}>
            {ctxMenu.type === 'edge' && canWriteCanvas && (
              <>
                <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
                  {isProductEdge(ctxMenu.srcId!, ctxMenu.tgtId!) ? 'Product link' : 'Dependency'}
                </div>
                <button className="w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2" style={{ color: '#ef4444' }} onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')} onClick={() => deleteEdge(ctxMenu.srcId!, ctxMenu.tgtId!, ctxMenu.edgeId!)}>
                  ✕ Remove {isProductEdge(ctxMenu.srcId!, ctxMenu.tgtId!) ? 'link' : 'dependency'}
                </button>
              </>
            )}
            {ctxMenu.type === 'node' && ctxTask && (
              <>
                {canWriteCanvas && (
                  <>
                    <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>Set status</div>
                    {STATUS_OPTIONS.map((s) => (
                      <button key={s.key} onClick={() => quickSetStatus(ctxTask.id, s.key)} className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors" style={{ color: ctxTask.status === s.key ? 'var(--brand)' : 'var(--text)' }} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />{s.label}
                        {ctxTask.status === s.key && <span className="ml-auto" style={{ color: 'var(--brand)' }}>✓</span>}
                      </button>
                    ))}
                  </>
                )}
                <div style={{ borderTop: canWriteCanvas ? '1px solid var(--border)' : undefined }}>
                  <button className="w-full text-left px-3 py-2 text-sm transition-colors" style={{ color: 'var(--text-2)' }} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')} onClick={() => { setCtxMenu(null); const t = tasks.find((x) => x.id === ctxTask.id); if (t) setSelectedTask(t); }}>Open detail…</button>
                </div>
              </>
            )}
            <button className="w-full text-left px-3 py-1.5 text-xs transition-colors" style={{ color: 'var(--text-3)', borderTop: '1px solid var(--border)' }} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')} onClick={() => setCtxMenu(null)}>Cancel</button>
          </div>
        )}

        {selectedTask && (
          <TaskDetailPanel
            task={selectedTask}
            readOnly={!canWriteCanvas}
            onClose={() => setSelectedTask(null)}
            onUpdated={async (u) => { setSelectedTask(u); await refreshTasks(); }}
            onDeleted={async () => { setSelectedTask(null); await refreshTasks(); }}
          />
        )}

        {showNewTask && (
          <Modal title="New task" onClose={() => setShowNewTask(false)} width="max-w-sm">
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="label">Task name</label>
                <input autoFocus required type="text" value={newTaskName} onChange={(e) => setNewTaskName(e.target.value)} className="input" placeholder="What needs to be done?" />
              </div>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>Task appears at the centre of your viewport. Drag it into position then connect edges to link dependencies.</p>
              <div className="flex gap-3">
                <button type="submit" disabled={creating} className="btn-primary flex-1 flex justify-center">
                  {creating ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Create task'}
                </button>
                <button type="button" onClick={() => setShowNewTask(false)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </Modal>
        )}

        {showNewSprint && (
          <Modal title="New sub-plan" onClose={() => setShowNewSprint(false)} width="max-w-sm">
            <form onSubmit={handleCreateSprint} className="space-y-4">
              <div>
                <label className="label">Sub-plan name</label>
                <input autoFocus required type="text" value={sprintForm.name} onChange={(e) => setSprintForm((p) => ({ ...p, name: e.target.value }))} className="input" placeholder="e.g. Sub-plan 1, MVP, Beta…" />
              </div>
              <div>
                <label className="label">Colour</label>
                <div className="flex gap-2 flex-wrap mt-1">
                  {SPRINT_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSprintForm((p) => ({ ...p, color: c }))}
                      style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: sprintForm.color === c ? '3px solid var(--text)' : '2px solid transparent', outline: sprintForm.color === c ? '2px solid ' + c : 'none', outlineOffset: 2 }}
                    />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Start date</label><input required type="date" value={sprintForm.startDate} onChange={(e) => setSprintForm((p) => ({ ...p, startDate: e.target.value }))} className="input" /></div>
                <div><label className="label">End date</label><input required type="date" value={sprintForm.endDate} onChange={(e) => setSprintForm((p) => ({ ...p, endDate: e.target.value }))} className="input" /></div>
              </div>
              <div className="flex gap-3">
                <button type="submit" className="btn-primary flex-1">Create sub-plan</button>
                <button type="button" onClick={() => setShowNewSprint(false)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </Modal>
        )}

        {editingSprint && (
          <Modal title="Edit sub-plan" onClose={() => setEditingSprint(null)} width="max-w-sm">
            <form onSubmit={handleEditSprint} className="space-y-4">
              <div>
                <label className="label">Sub-plan name</label>
                <input autoFocus required type="text" value={editSprintForm.name} onChange={(e) => setEditSprintForm((p) => ({ ...p, name: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">Colour</label>
                <div className="flex gap-2 flex-wrap mt-1">
                  {SPRINT_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditSprintForm((p) => ({ ...p, color: c }))}
                      style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: editSprintForm.color === c ? '3px solid var(--text)' : '2px solid transparent', outline: editSprintForm.color === c ? '2px solid ' + c : 'none', outlineOffset: 2 }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button type="submit" className="btn-primary flex-1">Save changes</button>
                <button type="button" onClick={() => setEditingSprint(null)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </Modal>
        )}

        {showLegend && <LegendModal onClose={() => setShowLegend(false)} />}

        {/* Loading overlay - shown until initial layout is computed */}
        {!layoutReady && (
          <div
            className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none"
            style={{ background: 'var(--bg)', transition: 'opacity 0.2s' }}
          >
            <div className="flex flex-col items-center gap-3" style={{ color: 'var(--text-3)' }}>
              <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--brand)' }} />
              <span className="text-xs">Loading canvas…</span>
            </div>
          </div>
        )}

        {/* ── Share layout modal ─────────────────────────────────────── */}
        {showShareModal && (
          <Modal title="Share layout" onClose={() => setShowShareModal(false)} width="max-w-sm">
            <div className="space-y-4">
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                Save the current node positions and zoom level so teammates can apply the same view.
              </p>
              <div>
                <label className="label">Snapshot name</label>
                <input
                  autoFocus
                  type="text"
                  value={snapshotName}
                  onChange={(e) => setSnapshotName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveSnapshot(); }}
                  className="input"
                  placeholder="e.g. Sub-plan 1 kickoff, QA review…"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={saveSnapshot} disabled={savingSnapshot || !snapshotName.trim()} className="btn-primary flex-1 flex justify-center">
                  {savingSnapshot ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Save snapshot'}
                </button>
                <button onClick={() => setShowShareModal(false)} className="btn-secondary">Cancel</button>
              </div>
            </div>
          </Modal>
        )}

        {/* ── Load layout modal ──────────────────────────────────────── */}
        {showLoadModal && (
          <Modal title="Load layout" onClose={() => setShowLoadModal(false)} width="max-w-md">
            <div className="space-y-3">
              {snapshots.length === 0 ? (
                <p className="text-sm py-4 text-center" style={{ color: 'var(--text-3)' }}>
                  No saved layouts yet. Use "Share layout" to create one.
                </p>
              ) : (
                <div className="divide-y rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', borderColor: 'var(--border)' }}>
                  {snapshots.map((snap) => (
                    <div key={snap.id} className="flex items-center gap-3 px-4 py-3" style={{ background: 'var(--surface)' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{snap.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                          {snap.user.avatarEmoji ?? '👤'} {displayName(snap.user)} · {new Date(snap.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => applySnapshot(snap)}
                        className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                        style={{ background: 'var(--brand)', color: 'white' }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                      >Apply</button>
                      {snap.userId === currentUser?.id && (
                        <button
                          onClick={() => deleteSnapshot(snap)}
                          className="flex-shrink-0 text-xs transition-colors"
                          style={{ color: 'var(--text-3)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                          title="Delete snapshot"
                        >✕</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => setShowLoadModal(false)} className="btn-secondary w-full">Close</button>
            </div>
          </Modal>
        )}
      </div>
    </CanvasContext.Provider>
  );
}

export default function CanvasView() {
  return (
    <>
      {/* Mobile notice */}
      <div className="md:hidden h-full flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-5xl opacity-40">◈</div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>Canvas view is optimised for desktop</p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          The canvas planning view works best with a mouse and a larger screen.
          Try the Kanban or Tasks view for a great mobile experience.
        </p>
      </div>
      {/* Desktop */}
      <div className="hidden md:block h-full">
        <ReactFlowProvider><CanvasInner /></ReactFlowProvider>
      </div>
    </>
  );
}
