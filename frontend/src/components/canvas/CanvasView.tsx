/**
 * ReactFlow-based dependency canvas that visualises tasks and their prerequisite relationships as a directed graph.
 * Pure graph utilities live in canvasUtils.ts; sprint state lives in useCanvasSprints.ts.
 * `buildGraph` converts tasks to nodes+edges; `runAutoLayout` arranges them with dagre LR layout.
 * All view options (viewMode, simpleMode, sprint filter, viewport) are persisted per product to localStorage via `loadState`/`patchState`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  BackgroundVariant,
  ReactFlowProvider,
  Panel,
  useReactFlow,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useProduct } from '../../context/ProductContext';
import { useAuth } from '../../context/AuthContext';
import { usePermission } from '../../context/PermissionContext';
import { useToast } from '../../context/ToastContext';
import { api, displayName } from '../../api/client';
import { useColorLegend } from '../../hooks/useColorLegend';
import type { Task } from '../../types';
import TaskNode from './nodes/TaskNode';
import ProductNode from './nodes/ProductNode';
import TaskDetailPanel from '../common/TaskDetailPanel';
import Modal from '../common/Modal';
import EmptyState from '../common/EmptyState';
import LegendModal from './LegendModal';
import { useCanvasSnapshots } from '../../hooks/useCanvasSnapshots';
import { useCanvasSprints } from './useCanvasSprints';
import {
  CanvasContext,
  STATUS_OPTIONS,
  SPRINT_PALETTE,
  loadState,
  patchState,
  buildGraph,
  runAutoLayout,
  getAncestorIds,
} from './canvasUtils';
import type { ViewMode, CanvasState, CtxMenu } from './canvasUtils';

// nodeTypes must be defined outside the component to avoid ReactFlow re-mounting nodes on every render
const nodeTypes = { task: TaskNode, product: ProductNode };

// Re-export CanvasContext so existing imports from this file keep working
export { CanvasContext };

// ─── Main canvas ──────────────────────────────────────────────────────────────
function CanvasInner() {
  const { activeProduct, tasks, tasksLoaded, refreshTasks } = useProduct();
  const { user: currentUser } = useAuth();
  const { canWrite } = usePermission();
  const canWriteCanvas = canWrite('canvas');
  const { showToast } = useToast();
  const { getViewport, setViewport, fitView } = useReactFlow();

  // ReactFlow node + edge state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskPos, setNewTaskPos] = useState<{ x: number; y: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [showLegend, setShowLegend] = useState(false);

  // View mode + secondary filters (all persisted to localStorage)
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selectedSprintFilter, setSelectedSprintFilter] = useState<string | null>(null);
  const [selectedMilestoneIds, setSelectedMilestoneIds] = useState<string[]>([]);
  const [autoLayoutEnabled, setAutoLayoutEnabled] = useState(false);
  const [showSprintAura, setShowSprintAura] = useState(false);
  const [simpleMode, setSimpleMode] = useState(false);

  // Dropdown open states (not persisted)
  const [showFiltersDropdown, setShowFiltersDropdown] = useState(false);
  const [showDisplayDropdown, setShowDisplayDropdown] = useState(false);
  const [showLayoutDropdown, setShowLayoutDropdown] = useState(false);
  // Client-side search text for the "Milestone focus" checklist (not persisted)
  const [milestoneSearch, setMilestoneSearch] = useState('');

  // Columns (for label resolution of custom statusKeys)
  const [columnLabelMap, setColumnLabelMap] = useState<Map<string, string>>(new Map());

  const [layoutReady, setLayoutReady] = useState(false);
  // Guards the "build + layout nodes" effect against running its once-per-product first-load
  // logic against default filter values. Loading persisted viewMode/filters is itself an async
  // state update (applies on the NEXT render), so without this the layout effect's first pass -
  // in the SAME commit, before that render happens - sees `filteredTasks` computed from the
  // pre-persisted defaults. Existing manually-positioned tasks are unaffected (their saved
  // position is read straight from localStorage, not from filteredTasks), but a genuinely new,
  // never-positioned task can get placed using the wrong filtered set and have that wrong
  // position persisted. Mirrors the existing !tasksLoaded guard just below.
  const [filtersReady, setFiltersReady] = useState(false);
  const [connectionsVersion, setConnectionsVersion] = useState(0);
  // Undo stack for accidental canvas deletions (last 10 ops)
  type DeletedSnapshot = { name: string; description: string | null; status: string; ownerId: string | null; color: string | null; deadline: string | null; position: { x: number; y: number } }[];
  const [undoStack, setUndoStack] = useState<DeletedSnapshot[]>([]);
  // IDs of task nodes currently selected via Shift-click multi-select
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  // Members cached for the bulk-assign dropdowns
  const [canvasMembers, setCanvasMembers] = useState<{ userId: string; user: { id: string; username: string; realName: string | null; avatarEmoji: string | null } }[]>([]);
  const [showBulkOwner, setShowBulkOwner] = useState(false);
  const [showBulkReviewer, setShowBulkReviewer] = useState(false);
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [showBulkColor, setShowBulkColor] = useState(false);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const { legend: bulkColorLegend, enabledColors: bulkEnabledColors } = useColorLegend(activeProduct?.id ?? '');

  const initializedRef = useRef<string | null>(null);
  // Set right before a programmatic (not user-picked) change to viewMode/selectedSprintFilter -
  // e.g. entering "add tasks to this sub-plan" mode after creating one - so the filter-relayout
  // effect further down treats that one change as a no-op instead of scheduling a relayout.
  const skipNextFilterRelayoutRef = useRef(false);
  const suppressNextFilterRelayout = useCallback(() => {
    skipNextFilterRelayoutRef.current = true;
  }, []);
  // Guards the filter-relayout effect against firing right after (re)initializing this product -
  // e.g. leaving the Canvas and coming back remounts this component, and restoring the persisted
  // viewMode/statusFilter/etc from localStorage changes those exact same state values that effect
  // watches, even though the user didn't touch anything. Reset to false alongside initializedRef
  // whenever the product changes; the first time the filter-relayout effect observes the board as
  // initialized for this product, it just arms this flag instead of relaying out - only a LATER
  // filter change (a real one, made after that point) goes on to trigger the actual relayout.
  const filterEffectPrimedRef = useRef(false);
  const productConnectionsRef = useRef<Set<string>>(new Set());
  const activeProductRef = useRef(activeProduct);
  activeProductRef.current = activeProduct;
  const savedViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  // Always-current ref so onNodeClick never reads stale sprint state from a closure
  const sprintClickRef = useRef<{ filter: string | null; toggle: (id: string) => Promise<void> }>({
    filter: null,
    toggle: async () => {},
  });
  // Always-current tasks ref so onNodesDelete captures latest task data without stale closure
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  // Always-current node/edge refs so the debounced auto-relayout effect (below) never relays out
  // a render-stale snapshot of the graph once its timer actually fires
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  // Stable ref so the Ctrl+Z keydown handler always calls the latest undoDelete without re-registering
  const undoRef = useRef<() => void>(() => {});
  const bulkOwnerRef = useRef<HTMLDivElement>(null);
  const bulkReviewerRef = useRef<HTMLDivElement>(null);
  const bulkStatusRef = useRef<HTMLDivElement>(null);
  const bulkColorRef = useRef<HTMLDivElement>(null);

  const save = (p: Partial<CanvasState>) => {
    const prod = activeProductRef.current;
    if (prod) patchState(prod.id, p);
  };

  // Persist-aware setters
  const setViewModeSave = (v: ViewMode) => {
    setViewMode(v);
    save({ viewMode: v });
  };
  const setStatusFilterSave = (v: string | null) => {
    setStatusFilter(v);
    save({ statusFilter: v });
  };
  const setSprintFilterSave = (v: string | null) => {
    setSelectedSprintFilter(v);
    save({ selectedSprintFilter: v });
  };
  const setMilestoneIdsSave = (v: string[]) => {
    setSelectedMilestoneIds(v);
    save({ selectedMilestoneIds: v });
  };
  const setSprintAuraSave = (v: boolean) => {
    setShowSprintAura(v);
    save({ showSprintAura: v });
  };
  const setSimpleModeSave = (v: boolean) => {
    setSimpleMode(v);
    save({ simpleMode: v });
  };

  // ── Sprint management (extracted hook) ────────────────────────────────────
  const {
    sprints,
    localSprintMemberIds,
    showSprintPicker,
    setShowSprintPicker,
    showNewSprint,
    setShowNewSprint,
    sprintForm,
    setSprintForm,
    editingSprint,
    setEditingSprint,
    editSprintForm,
    setEditSprintForm,
    loadSprints,
    toggleSprintMembership,
    handleCreateSprint,
    handleEditSprint,
    deleteSprint,
  } = useCanvasSprints({
    activeProductId: activeProduct?.id,
    selectedSprintFilter,
    canWriteCanvas,
    onSetSprintFilter: setSprintFilterSave,
    onSetViewMode: setViewModeSave,
    suppressNextFilterRelayout,
  });

  // Bundles the three filter setters so a saved layout can restore all of them in one call
  function setFiltersSave(f: { statusFilter: string | null; selectedSprintFilter: string | null; selectedMilestoneIds: string[] }) {
    setStatusFilterSave(f.statusFilter);
    setSprintFilterSave(f.selectedSprintFilter);
    setMilestoneIdsSave(f.selectedMilestoneIds);
  }

  const {
    showShareModal,
    setShowShareModal,
    showLoadModal,
    setShowLoadModal,
    snapshots,
    totalSnapshotCount,
    snapshotName,
    setSnapshotName,
    snapshotSearch,
    setSnapshotSearch,
    savingSnapshot,
    openShareModal,
    openLoadModal,
    saveSnapshot,
    updateSnapshot,
    applySnapshot,
    deleteSnapshot,
  } = useCanvasSnapshots({
    activeProduct,
    nodes,
    getViewport,
    setViewport,
    setNodes,
    viewMode,
    simpleMode,
    setViewMode,
    setSimpleMode,
    filters: { statusFilter, selectedSprintFilter, selectedMilestoneIds },
    setFilters: setFiltersSave,
    currentUserId: currentUser?.id,
    save,
    showToast,
  });

  // Load persisted state on product change
  useEffect(() => {
    if (!activeProduct) return;
    initializedRef.current = null;
    filterEffectPrimedRef.current = false;
    setLayoutReady(false);
    setFiltersReady(false);
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
    setFiltersReady(true);
  }, [activeProduct?.id]);

  const onMoveEnd = useCallback((_: unknown, vp: { x: number; y: number; zoom: number }) => {
    save({ viewport: vp });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load sprints + product connections + column labels
  async function loadConnections() {
    if (!activeProduct) return;
    productConnectionsRef.current = new Set(await api.connections.list(activeProduct.id).catch(() => []));
    setConnectionsVersion((v) => v + 1);
  }
  useEffect(() => {
    if (!activeProduct) return;
    loadSprints();
    loadConnections();
    api.columns
      .list(activeProduct.id)
      .then((cols) => setColumnLabelMap(new Map(cols.map((c) => [c.statusKey, c.label]))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProduct?.id]);

  // Sorted sprints + color mapping
  const sortedSprints = useMemo(() => [...sprints].sort((a, b) => a.startDate.localeCompare(b.startDate)), [sprints]);

  const sprintColorsMap = useMemo<Map<string, string[]>>(() => {
    const map = new Map<string, string[]>();
    sortedSprints.forEach((s) => {
      s.taskIds.forEach((tid) => {
        map.set(tid, [...(map.get(tid) ?? []), s.color]);
      });
    });
    return map;
  }, [sortedSprints]);

  const milestoneTasks = useMemo(() => tasks.filter((t) => !!t.deadline), [tasks]);
  const filteredMilestoneTasks = useMemo(() => {
    const q = milestoneSearch.trim().toLowerCase();
    return q ? milestoneTasks.filter((t) => t.name.toLowerCase().includes(q)) : milestoneTasks;
  }, [milestoneTasks, milestoneSearch]);

  const filteredTasks = useMemo(() => {
    let base = tasks;
    if (viewMode === 'active') base = base.filter((t) => t.status !== 'done');
    else if (viewMode === 'milestones') base = base.filter((t) => !!t.deadline);
    if (statusFilter) base = base.filter((t) => t.status === statusFilter);
    if (selectedMilestoneIds.length > 0) {
      const ancestors = getAncestorIds(selectedMilestoneIds, tasks);
      const allPrerequisiteIds = new Set(tasks.flatMap((t) => t.dependsOn.map((d) => d.prerequisiteId)));
      base = base.filter(
        (t) =>
          selectedMilestoneIds.includes(t.id) ||
          ancestors.has(t.id) ||
          (t.dependsOn.length === 0 && !allPrerequisiteIds.has(t.id)),
      );
    }
    return base;
  }, [tasks, viewMode, statusFilter, selectedSprintFilter, selectedMilestoneIds, sprints]);

  // Estimated real render height per task, mirroring TaskNode's own conditional rows (status,
  // milestone deadline, and owner/reviewer are all hidden in simple mode; the subtask bar isn't) -
  // dagre otherwise reserves a flat 80px for every node regardless of how much it actually renders,
  // wasting vertical space especially in simple mode.
  const nodeHeights = useMemo(() => {
    const heights = new Map<string, number>();
    for (const t of filteredTasks) {
      let h = 20 + 18; // padding + task name (always rendered)
      if (!simpleMode) {
        h += 17; // status row
        if (t.deadline) h += 18; // milestone deadline row
        if (t.owner || t.reviewer) h += 24; // owner/reviewer row
      }
      if (t.subtasks && t.subtasks.length > 0) h += 15; // subtask progress bar, not simple-mode-gated
      heights.set(t.id, h);
    }
    return heights;
  }, [filteredTasks, simpleMode]);
  const nodeHeightsRef = useRef(nodeHeights);
  nodeHeightsRef.current = nodeHeights;

  // Build + layout nodes
  useEffect(() => {
    if (!activeProduct) return;
    const lp = loadState(activeProduct.id).positions ?? {};
    const sprintCheckbox = selectedSprintFilter
      ? { sprintId: selectedSprintFilter, taskIds: localSprintMemberIds }
      : null;
    const auraCols = showSprintAura ? sprintColorsMap : new Map<string, string[]>();
    const savedProductPos = loadState(activeProduct.id).productNodePosition;
    const { nodes: n, edges: e } = buildGraph(
      filteredTasks,
      activeProduct,
      productConnectionsRef.current,
      sprintCheckbox,
      auraCols,
      savedProductPos,
      columnLabelMap,
      lp,
    );
    setEdges(e);

    if (initializedRef.current !== activeProduct.id) {
      if (!tasksLoaded || !filtersReady) {
        setNodes(n);
        return;
      }
      initializedRef.current = activeProduct.id;
      const unpositioned = filteredTasks.filter((t) => !lp[t.id] && t.canvasX == null);
      const allUnpositioned = unpositioned.length === filteredTasks.length && filteredTasks.length > 0;

      const savePositions = (nodes: { id: string; position: { x: number; y: number } }[]) => {
        const next = { ...lp };
        nodes
          .filter((nd) => !nd.id.startsWith('product-'))
          .forEach((nd) => {
            next[nd.id] = { x: nd.position.x, y: nd.position.y };
          });
        patchState(activeProduct.id, { positions: next });
      };

      if (allUnpositioned) {
        const laid = runAutoLayout(n, e, nodeHeights);
        setNodes(laid);
        savePositions(laid);
      } else if (unpositioned.length > 0) {
        const positioned = n.filter((nd) => !unpositioned.find((t) => t.id === nd.id) && !nd.id.startsWith('product-'));
        const maxX = positioned.length > 0 ? Math.max(...positioned.map((nd) => nd.position.x)) : 0;
        const midY =
          positioned.length > 0 ? positioned.reduce((s, nd) => s + nd.position.y, 0) / positioned.length : 200;
        let col = 0;
        const laid = n.map((node) => {
          if (!unpositioned.find((t) => t.id === node.id)) return node;
          const pos = { x: maxX + 260 + col * 220, y: midY + (col % 2 === 0 ? -60 : 60) };
          col++;
          return { ...node, position: pos };
        });
        setNodes(laid);
        savePositions(laid);
      } else {
        const hasLocalPositions = Object.keys(lp).length > 0;
        const hasVisited = !!loadState(activeProduct.id).viewport;
        if (!hasVisited && !hasLocalPositions && filteredTasks.length > 0) {
          const laid = runAutoLayout(n, e, nodeHeights);
          setNodes(laid);
          const productNode = laid.find((nd) => nd.id.startsWith('product-'));
          if (productNode) save({ productNodePosition: { x: productNode.position.x, y: productNode.position.y } });
          savePositions(laid);
        } else {
          setNodes(n);
        }
      }

      setTimeout(() => {
        const vp = loadState(activeProduct.id).viewport;
        if (vp) setViewport(vp);
        else {
          fitView({ padding: 0.2 });
          setTimeout(() => save({ viewport: getViewport() }), 60);
        }
        setLayoutReady(true);
      }, 80);
    } else {
      setLayoutReady(true);
      setNodes((curr) => {
        const byId = new Map(curr.map((nd) => [nd.id, nd]));
        return n.map((nn) => {
          const ex = byId.get(nn.id);
          return ex ? { ...ex, data: nn.data } : nn;
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filteredTasks,
    activeProduct,
    autoLayoutEnabled,
    sprints,
    selectedSprintFilter,
    showSprintAura,
    sprintColorsMap,
    localSprintMemberIds,
    tasksLoaded,
    filtersReady,
    connectionsVersion,
    columnLabelMap,
  ]);

  // Keep ref current so onNodeClick always reads latest sprint state without stale closures
  sprintClickRef.current = { filter: selectedSprintFilter, toggle: toggleSprintMembership };

  // Shared by the manual "Re-layout graph" button and the debounced auto-relayout effect below -
  // runs dagre against the given node/edge/height snapshot, persists the new positions, and refits
  // the viewport. Takes explicit snapshots rather than reading state/refs itself so both callers
  // control exactly which product/graph state it applies to.
  const relayoutGraph = (prod: NonNullable<typeof activeProduct>, curNodes: Node[], curEdges: Edge[], heights: Map<string, number>) => {
    const laid = runAutoLayout(curNodes, curEdges, heights);
    setNodes(laid);
    const productNode = laid.find((nd) => nd.id.startsWith('product-'));
    if (productNode) save({ productNodePosition: { x: productNode.position.x, y: productNode.position.y } });
    const newLp: Record<string, { x: number; y: number }> = { ...(loadState(prod.id).positions ?? {}) };
    laid
      .filter((nd) => !nd.id.startsWith('product-'))
      .forEach((nd) => {
        newLp[nd.id] = { x: nd.position.x, y: nd.position.y };
      });
    patchState(prod.id, { positions: newLp });
    setTimeout(() => {
      fitView({ padding: 0.15 });
      save({ viewport: getViewport() });
    }, 50);
  };

  const setAutoLayoutSave = (v: boolean) => {
    setAutoLayoutEnabled(v);
    save({ autoLayoutEnabled: v });
    if (v && activeProduct) {
      relayoutGraph(activeProduct, nodes, edges, nodeHeights);
    }
  };

  // Auto re-layout shortly after any filter changes, so users don't have to remember to click
  // "Re-layout graph" every time. Deliberately scoped to ONLY the filter values below - not
  // tasks/sprints/other realtime-driven state - so a teammate's unrelated edit elsewhere never
  // triggers an unwanted relayout here. Debounced so toggling several milestone checkboxes in a
  // row only relays out once, after the user stops.
  //
  // viewMode/selectedSprintFilter are also set programmatically (not by the user picking a
  // filter) when creating or deleting a sub-plan, to land in/out of "add tasks to this sub-plan"
  // mode - see useCanvasSprints' handleCreateSprint/deleteSprint. Those callers call
  // suppressNextFilterRelayout() first so that mode switch doesn't masquerade as a filter change.
  const filterRelayoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (skipNextFilterRelayoutRef.current) {
      skipNextFilterRelayoutRef.current = false;
      return;
    }
    const prod = activeProduct;
    if (!prod || initializedRef.current !== prod.id) return; // skip initial load for this product
    if (!filterEffectPrimedRef.current) {
      // First time this effect sees the board as initialized for this product - this fires either
      // on a genuine first-ever visit, or right after restoring the persisted viewMode/filters on
      // a remount (leaving Canvas and coming back), both of which change these same state values
      // without the user actually touching a filter. Arm the guard instead of relaying out now; a
      // later change made after this point is a real one and should go on to relayout as normal.
      filterEffectPrimedRef.current = true;
      return;
    }
    if (filterRelayoutTimerRef.current) clearTimeout(filterRelayoutTimerRef.current);
    filterRelayoutTimerRef.current = setTimeout(() => {
      const currentProd = activeProductRef.current;
      // Bail if the product changed (or hasn't finished initializing) during the wait, so a
      // relayout meant for the old product/filters never lands on whatever's showing now.
      if (!currentProd || currentProd.id !== prod.id || initializedRef.current !== currentProd.id) return;
      relayoutGraph(currentProd, nodesRef.current, edgesRef.current, nodeHeightsRef.current);
    }, 500);
    return () => {
      if (filterRelayoutTimerRef.current) clearTimeout(filterRelayoutTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, statusFilter, selectedSprintFilter, selectedMilestoneIds]);

  // ReactFlow callbacks
  const onPaneClick = useCallback(() => {
    setCtxMenu(null);
    setShowFiltersDropdown(false);
    setShowDisplayDropdown(false);
    setShowLayoutDropdown(false);
    setShowSprintPicker(false);
    setMilestoneSearch('');
  }, [setShowSprintPicker]);

  const onCanvasDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!canWriteCanvas) return;
      const target = e.target as HTMLElement;
      if (!target.classList.contains('react-flow__pane')) return;
      const vp = getViewport();
      const canvasX = Math.round((e.clientX - vp.x) / vp.zoom) - 100;
      const canvasY = Math.round((e.clientY - vp.y) / vp.zoom) - 40;
      setNewTaskPos({ x: canvasX, y: canvasY });
      setShowNewTask(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [canWriteCanvas],
  );

  const onConnect = useCallback(
    async (connection: Connection) => {
      setCtxMenu(null);
      if (!activeProduct || !connection.source || !connection.target || !canWriteCanvas) return;
      const src = connection.source,
        tgt = connection.target;
      if (src.startsWith('product-') || tgt.startsWith('product-')) {
        const taskId = src.startsWith('product-') ? tgt : src;
        await api.connections.add(activeProduct.id, taskId).catch(() => {});
        productConnectionsRef.current.add(taskId);
        setEdges((eds) =>
          addEdge(
            {
              id: `${taskId}->product-${activeProduct.id}`,
              source: taskId,
              target: `product-${activeProduct.id}`,
              type: 'smoothstep',
              style: { stroke: 'var(--brand)', strokeWidth: 2, strokeDasharray: '5 3' },
              markerEnd: { type: MarkerType.Arrow, width: 16, height: 16, color: 'var(--brand)' },
            },
            eds,
          ),
        );
        return;
      }
      try {
        const res = await fetch(`/api/products/${activeProduct.id}/tasks/${tgt}/dependencies`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prerequisiteId: src }),
        });
        if (!res.ok) {
          const b = (await res.json()) as { error?: string };
          throw new Error(b.error ?? 'Failed');
        }
        const isIP = tasks.find((t) => t.id === tgt)?.status === 'in_progress';
        setEdges((eds) =>
          addEdge(
            {
              ...connection,
              id: `${src}->${tgt}`,
              type: 'smoothstep',
              animated: isIP,
              style: { stroke: 'var(--border-2)', strokeWidth: 2 },
              markerEnd: { type: MarkerType.Arrow, width: 16, height: 16, color: 'var(--border-2)' },
            },
            eds,
          ),
        );
        await refreshTasks();
      } catch (err) {
        showToast((err as Error).message, 'error');
      }
    },
    [activeProduct, setEdges, refreshTasks, tasks, showToast, canWriteCanvas],
  );

  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: Edge) => {
    e.preventDefault();
    const parts = edge.id.split('->');
    const srcId = parts[0],
      tgtId = parts.slice(1).join('->');
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
      const res = await fetch(`/api/products/${activeProduct.id}/tasks/${tgtId}/dependencies/${srcId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed');
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      await refreshTasks();
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }

  const onEdgesDelete = useCallback(
    async (del: Edge[]) => {
      if (!canWriteCanvas) return;
      for (const edge of del) {
        const parts = edge.id.split('->');
        const srcId = parts[0],
          tgtId = parts.slice(1).join('->');
        if (!srcId || !tgtId || !activeProduct) continue;
        if (tgtId.startsWith('product-') || srcId.startsWith('product-')) {
          const taskId = tgtId.startsWith('product-') ? srcId : tgtId;
          await api.connections.remove(activeProduct.id, taskId).catch(() => {});
          productConnectionsRef.current.delete(taskId);
        } else {
          const res = await fetch(`/api/products/${activeProduct.id}/tasks/${tgtId}/dependencies/${srcId}`, {
            method: 'DELETE',
            credentials: 'include',
          });
          if (res.ok) await refreshTasks();
        }
      }
    },
    [activeProduct, refreshTasks, canWriteCanvas],
  );

  async function quickSetStatus(taskId: string, status: string) {
    if (!activeProduct || !canWriteCanvas) return;
    setCtxMenu(null);
    try {
      // When right-clicking a task that's part of a multi-selection, apply to all selected tasks
      const targets = selectedNodeIds.length >= 2 && selectedNodeIds.includes(taskId)
        ? selectedNodeIds
        : [taskId];
      await Promise.all(targets.map((id) => api.tasks.update(activeProduct.id, id, { status })));
      await refreshTasks();
      showToast(targets.length > 1 ? `Updated ${targets.length} tasks` : 'Status updated', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setCtxMenu(null);
    if (node.id.startsWith('product-')) return;
    const { filter, toggle } = sprintClickRef.current;
    if (filter) toggle(node.id);
  }, []);

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.id.startsWith('product-')) return;
      const task = tasks.find((t) => t.id === node.id);
      if (task) setSelectedTask(task);
    },
    [tasks],
  );

  const onNodesDelete = useCallback(
    async (deleted: Node[]) => {
      if (!activeProduct || !canWriteCanvas) return;
      const taskNodes = deleted.filter((n) => !n.id.startsWith('product-'));
      if (taskNodes.length === 0) return;

      // Snapshot full task data for undo before the API calls
      const snapshot: DeletedSnapshot = taskNodes
        .map((n) => {
          const t = tasksRef.current.find((t) => t.id === n.id);
          if (!t) return null;
          return { name: t.name, description: t.description, status: t.status, ownerId: t.ownerId, color: t.color, deadline: t.deadline, position: n.position };
        })
        .filter(Boolean) as DeletedSnapshot;
      setUndoStack((s) => [...s.slice(-9), snapshot]);

      try {
        await api.tasks.bulkDelete(activeProduct.id, taskNodes.map((n) => n.id));
        await refreshTasks();
        showToast(
          `${taskNodes.length} task${taskNodes.length > 1 ? 's' : ''} deleted — press Ctrl+Z to undo`,
          'info',
        );
      } catch (err) {
        showToast((err as Error).message, 'error');
      }
    },
    [activeProduct, refreshTasks, showToast, canWriteCanvas],
  );

  // Recreate the last batch of deleted tasks (Ctrl+Z)
  const undoDelete = useCallback(async () => {
    const snapshot = undoStack[undoStack.length - 1];
    if (!snapshot || !activeProduct) return;
    setUndoStack((s) => s.slice(0, -1));
    for (const t of snapshot) {
      await api.tasks.create(activeProduct.id, {
        name: t.name,
        description: t.description ?? undefined,
        status: t.status,
        ownerId: t.ownerId ?? undefined,
        color: t.color ?? undefined,
        deadline: t.deadline ?? undefined,
        canvasX: t.position.x,
        canvasY: t.position.y,
      });
    }
    await refreshTasks();
    showToast(`Restored ${snapshot.length} task${snapshot.length > 1 ? 's' : ''}`, 'success');
  }, [undoStack, activeProduct, refreshTasks, showToast]);

  undoRef.current = undoDelete;

  // Ctrl+Z — only fires when focus is outside an input/textarea
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey)) return;
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      undoRef.current();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Track multi-selected task nodes for the bulk action bar
  const onSelectionChange = useCallback(({ nodes: sel }: { nodes: Node[] }) => {
    setSelectedNodeIds(sel.filter((n) => !n.id.startsWith('product-')).map((n) => n.id));
  }, []);

  // Fetch members once when the bulk bar first appears; reset when project changes
  useEffect(() => { setCanvasMembers([]); }, [activeProduct?.id]);
  useEffect(() => {
    if (selectedNodeIds.length < 2 || !activeProduct || canvasMembers.length > 0) return;
    api.products
      .getAbout(activeProduct.id)
      .then((d) => setCanvasMembers(d.members))
      .catch(() => showToast('Failed to load members - please try again', 'error'));
  }, [selectedNodeIds.length, activeProduct, canvasMembers.length, showToast]);

  // Close bulk dropdowns on outside click (cast via HTMLElement to avoid collision with ReactFlow's Node import)
  useEffect(() => {
    if (!showBulkOwner) return;
    const h = (e: MouseEvent) => { if (bulkOwnerRef.current && !bulkOwnerRef.current.contains(e.target as HTMLElement)) setShowBulkOwner(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showBulkOwner]);
  useEffect(() => {
    if (!showBulkStatus) return;
    const h = (e: MouseEvent) => { if (bulkStatusRef.current && !bulkStatusRef.current.contains(e.target as HTMLElement)) setShowBulkStatus(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showBulkStatus]);
  useEffect(() => {
    if (!showBulkReviewer) return;
    const h = (e: MouseEvent) => { if (bulkReviewerRef.current && !bulkReviewerRef.current.contains(e.target as HTMLElement)) setShowBulkReviewer(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showBulkReviewer]);
  useEffect(() => {
    if (!showBulkColor) return;
    const h = (e: MouseEvent) => { if (bulkColorRef.current && !bulkColorRef.current.contains(e.target as HTMLElement)) setShowBulkColor(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showBulkColor]);

  // Assign a single owner to all selected canvas tasks in one bulk request
  async function bulkCanvasAssignOwner(userId: string) {
    if (!activeProduct) return;
    setBulkAssigning(true);
    setShowBulkOwner(false);
    const count = selectedNodeIds.length;
    try {
      await api.tasks.bulkUpdate(activeProduct.id, selectedNodeIds, { ownerId: userId });
      await refreshTasks();
      showToast(`Assigned owner to ${count} tasks`, 'success');
    } catch {
      showToast('Failed to assign owner - please try again', 'error');
    } finally {
      setBulkAssigning(false);
    }
  }

  // Assign a single reviewer to all selected canvas tasks in one bulk request
  async function bulkCanvasAssignReviewer(userId: string) {
    if (!activeProduct) return;
    setBulkAssigning(true);
    setShowBulkReviewer(false);
    const count = selectedNodeIds.length;
    try {
      await api.tasks.bulkUpdate(activeProduct.id, selectedNodeIds, { reviewerId: userId });
      await refreshTasks();
      showToast(`Assigned reviewer to ${count} tasks`, 'success');
    } catch {
      showToast('Failed to assign reviewer - please try again', 'error');
    } finally {
      setBulkAssigning(false);
    }
  }

  // Set status on all selected canvas tasks in one bulk request
  async function bulkCanvasSetStatus(status: string) {
    if (!activeProduct) return;
    setBulkAssigning(true);
    setShowBulkStatus(false);
    const count = selectedNodeIds.length;
    try {
      await api.tasks.bulkUpdate(activeProduct.id, selectedNodeIds, { status: status as Task['status'] });
      await refreshTasks();
      showToast(`Updated status for ${count} tasks`, 'success');
    } catch {
      showToast('Failed to update status - please try again', 'error');
    } finally {
      setBulkAssigning(false);
    }
  }

  // Set (or clear, with color: null) the color tag on all selected canvas tasks in one bulk request
  async function bulkCanvasSetColor(color: string | null) {
    if (!activeProduct) return;
    setBulkAssigning(true);
    setShowBulkColor(false);
    const count = selectedNodeIds.length;
    try {
      await api.tasks.bulkUpdate(activeProduct.id, selectedNodeIds, { color });
      await refreshTasks();
      showToast(`Updated color for ${count} tasks`, 'success');
    } catch {
      showToast('Failed to update color - please try again', 'error');
    } finally {
      setBulkAssigning(false);
    }
  }

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (!activeProduct) return;
      if (node.id.startsWith('product-')) {
        save({ productNodePosition: { x: node.position.x, y: node.position.y } });
        return;
      }
      const { x, y } = node.position;
      const curr = loadState(activeProduct.id).positions ?? {};
      patchState(activeProduct.id, { positions: { ...curr, [node.id]: { x, y } } });
    },
    [activeProduct],
  ); // eslint-disable-line react-hooks/exhaustive-deps

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
      setNewTaskName('');
      setNewTaskPos(null);
      setShowNewTask(false);
    } finally {
      setCreating(false);
    }
  }

  if (!activeProduct) {
    return <EmptyState icon="◈" size="lg" description="Create a product to get started" className="h-full" />;
  }

  const isProductEdge = (s: string, t: string) => s.startsWith('product-') || t.startsWith('product-');
  const ctxTask = ctxMenu?.type === 'node' && ctxMenu.taskId ? tasks.find((t) => t.id === ctxMenu.taskId) : null;
  const activeSprint = sortedSprints.find((s) => s.id === selectedSprintFilter);

  const chip = (active: boolean, accentColor?: string) =>
    ({
      background: active ? (accentColor ? `${accentColor}20` : 'var(--brand-subtle)') : 'var(--surface)',
      color: active ? (accentColor ?? 'var(--brand)') : 'var(--text-3)',
      border: `1px solid ${active ? (accentColor ? `${accentColor}55` : 'var(--brand)') : 'var(--border)'}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    }) as React.CSSProperties;

  const segBtn = (key: ViewMode) =>
    ({
      background: viewMode === key ? 'var(--surface)' : 'transparent',
      color: viewMode === key ? 'var(--text)' : 'var(--text-3)',
      boxShadow: viewMode === key ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
    }) as React.CSSProperties;

  return (
    <CanvasContext.Provider value={{ showSprintAura, simpleMode }}>
      <style>{`.react-flow__edge.selected .react-flow__edge-path { stroke: var(--brand) !important; stroke-width: 3px !important; } .react-flow__edge.selected .react-flow__edge-interaction { stroke: var(--brand) !important; }`}</style>
      <div
        style={{ width: '100%', height: '100%', position: 'relative' }}
        onClick={() => setCtxMenu(null)}
        onDoubleClick={onCanvasDoubleClick}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeDragStop={onNodeDragStop}
          onEdgeContextMenu={onEdgeContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          onPaneClick={onPaneClick}
          onMoveEnd={onMoveEnd}
          nodeTypes={nodeTypes}
          nodesDraggable={canWriteCanvas}
          nodesConnectable={canWriteCanvas}
          defaultViewport={activeProduct ? (loadState(activeProduct.id).viewport ?? undefined) : undefined}
          defaultEdgeOptions={{ type: 'smoothstep', style: { stroke: 'var(--border-2)', strokeWidth: 2 } }}
          zoomOnDoubleClick={false}
          deleteKeyCode={canWriteCanvas ? ['Delete', 'Backspace'] : []}
          onEdgesDelete={onEdgesDelete}
          onNodesDelete={onNodesDelete}
          onSelectionChange={onSelectionChange}
          multiSelectionKeyCode="Shift"
        >
          <Background variant={BackgroundVariant.Dots} color="var(--border)" gap={24} size={1.5} />
          <Controls
            className="hidden md:block"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          />
          <MiniMap
            className="hidden md:block"
            nodeColor={(n) => (n.id.startsWith('product-') ? 'var(--brand)' : 'var(--surface-2)')}
            maskColor="rgba(0,0,0,0.25)"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            zoomable
            pannable
          />

          {/* ── Top-left ────────────────────────────────────────────────── */}
          <Panel position="top-left">
            <div className="flex flex-col gap-2">
              {/* Row 1 - view mode segmented control */}
              <div
                className="flex items-center p-1 gap-0.5 rounded-xl"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                }}
              >
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

                {/* Sprint view mode + picker */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setViewModeSave('sprint');
                      setShowSprintPicker((v) => !v);
                    }}
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
                      <div
                        className="px-3 py-2 flex items-center justify-between"
                        style={{ borderBottom: '1px solid var(--border)' }}
                      >
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wide"
                          style={{ color: 'var(--text-3)' }}
                        >
                          Sub-plans
                        </span>
                        {canWriteCanvas && (
                          <button
                            onClick={() => {
                              setShowSprintPicker(false);
                              setShowNewSprint(true);
                            }}
                            className="text-xs font-medium px-2 py-0.5 rounded-lg transition-colors"
                            style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.opacity = '0.8';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.opacity = '1';
                            }}
                          >
                            + New
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setSprintFilterSave(null);
                          setViewModeSave('all');
                          setShowSprintPicker(false);
                        }}
                        className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2 transition-colors"
                        style={{ borderBottom: sortedSprints.length > 0 ? '1px solid var(--border)' : 'none' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--surface-2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: 'var(--border)',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ color: !selectedSprintFilter ? 'var(--brand)' : 'var(--text-2)' }}>
                          No sub-plan (exit sub-plan mode)
                        </span>
                        {!selectedSprintFilter && (
                          <span className="ml-auto" style={{ color: 'var(--brand)' }}>
                            ✓
                          </span>
                        )}
                      </button>
                      {sortedSprints.length === 0 && (
                        <p className="px-3 py-3 text-xs" style={{ color: 'var(--text-3)' }}>
                          No sub-plans yet - create one to start planning.
                        </p>
                      )}
                      {sortedSprints.map((s) => {
                        const isActive = selectedSprintFilter === s.id;
                        return (
                          <div
                            key={s.id}
                            className="flex items-center gap-2 px-3 py-2.5 group transition-colors cursor-pointer"
                            style={{ background: isActive ? 'var(--brand-subtle)' : 'transparent' }}
                            onMouseEnter={(e) => {
                              if (!isActive) e.currentTarget.style.background = 'var(--surface-2)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = isActive ? 'var(--brand-subtle)' : 'transparent';
                            }}
                            onClick={() => {
                              setSprintFilterSave(isActive ? null : s.id);
                              setShowSprintPicker(false);
                            }}
                          >
                            <span
                              style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }}
                            />
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-xs font-semibold truncate"
                                style={{ color: isActive ? 'var(--brand)' : 'var(--text)' }}
                              >
                                {s.name}
                              </p>
                              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                                {new Date(s.startDate).toLocaleDateString()} →{' '}
                                {new Date(s.endDate).toLocaleDateString()} · {s.taskIds.length} tasks
                              </p>
                            </div>
                            {isActive && <span style={{ color: 'var(--brand)', fontSize: 11, flexShrink: 0 }}>✓</span>}
                            {canWriteCanvas && (
                              <>
                                <button
                                  className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-xs flex-shrink-0 transition-opacity"
                                  style={{ color: 'var(--text-3)' }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.color = 'var(--text)';
                                    e.currentTarget.style.background = 'var(--surface-2)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.color = 'var(--text-3)';
                                    e.currentTarget.style.background = 'transparent';
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingSprint(s);
                                    setEditSprintForm({ name: s.name, color: s.color });
                                    setShowSprintPicker(false);
                                  }}
                                  title="Edit sub-plan"
                                >
                                  ✎
                                </button>
                                <button
                                  className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-xs flex-shrink-0 transition-opacity"
                                  style={{ color: 'var(--text-3)' }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.color = '#ef4444';
                                    e.currentTarget.style.background = 'rgba(239,68,68,0.1)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.color = 'var(--text-3)';
                                    e.currentTarget.style.background = 'transparent';
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteSprint(s.id);
                                  }}
                                  title="Delete sub-plan"
                                >
                                  ✕
                                </button>
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
              <div className="flex items-center gap-1.5 flex-wrap" style={{ maxWidth: 'calc(100vw - 2rem)' }}>
                {/* Filters dropdown */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowFiltersDropdown((v) => !v);
                      setShowDisplayDropdown(false);
                      setShowLayoutDropdown(false);
                      setMilestoneSearch('');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                    style={chip(!!statusFilter || selectedMilestoneIds.length > 0)}
                  >
                    {statusFilter ? (
                      <>
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: STATUS_OPTIONS.find((s) => s.key === statusFilter)?.color }}
                        />
                        {STATUS_OPTIONS.find((s) => s.key === statusFilter)?.label}
                      </>
                    ) : selectedMilestoneIds.length > 0 ? (
                      `⭐ ${selectedMilestoneIds.length} milestone${selectedMilestoneIds.length > 1 ? 's' : ''}`
                    ) : (
                      'Filters'
                    )}
                    <span className="text-[10px] opacity-50">▾</span>
                  </button>
                  {showFiltersDropdown && (
                    <div
                      className="absolute left-0 top-full mt-1 rounded-xl shadow-xl z-50 overflow-hidden"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 220 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div
                        className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: 'var(--text-3)' }}
                      >
                        Status
                      </div>
                      <button
                        onClick={() => setStatusFilterSave(null)}
                        className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors"
                        style={{ color: !statusFilter ? 'var(--brand)' : 'var(--text-2)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--surface-2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        All statuses {!statusFilter && <span className="ml-auto">✓</span>}
                      </button>
                      {STATUS_OPTIONS.map((s) => (
                        <button
                          key={s.key}
                          onClick={() => setStatusFilterSave(statusFilter === s.key ? null : s.key)}
                          className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors"
                          style={{ color: statusFilter === s.key ? 'var(--brand)' : 'var(--text-2)' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--surface-2)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                          {s.label} {statusFilter === s.key && <span className="ml-auto">✓</span>}
                        </button>
                      ))}
                      {milestoneTasks.length > 0 && (
                        <>
                          <div
                            className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide"
                            style={{ color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}
                          >
                            Milestone focus
                          </div>
                          {milestoneTasks.length > 5 && (
                            <div className="px-3 pb-1.5">
                              <input
                                type="text"
                                value={milestoneSearch}
                                onChange={(e) => setMilestoneSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="Search milestones…"
                                className="w-full text-xs px-2 py-1 rounded outline-none"
                                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                              />
                            </div>
                          )}
                          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                            <button
                              onClick={() => setMilestoneIdsSave([])}
                              className="w-full text-left px-3 py-1.5 text-xs transition-colors"
                              style={{ color: selectedMilestoneIds.length === 0 ? '#f59e0b' : 'var(--text-2)' }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--surface-2)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                              }}
                            >
                              Show all {selectedMilestoneIds.length === 0 && '✓'}
                            </button>
                            {filteredMilestoneTasks.length === 0 && (
                              <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>
                                No matches
                              </p>
                            )}
                            {filteredMilestoneTasks.map((t) => {
                              const sel = selectedMilestoneIds.includes(t.id);
                              const overdue = new Date(t.deadline!) < new Date() && t.status !== 'done';
                              return (
                                <button
                                  key={t.id}
                                  onClick={() =>
                                    setMilestoneIdsSave(
                                      sel
                                        ? selectedMilestoneIds.filter((id) => id !== t.id)
                                        : [...selectedMilestoneIds, t.id],
                                    )
                                  }
                                  className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors"
                                  style={{ color: 'var(--text-2)' }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'var(--surface-2)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent';
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 12,
                                      height: 12,
                                      borderRadius: 3,
                                      flexShrink: 0,
                                      background: sel ? (overdue ? '#ef4444' : '#f59e0b') : 'transparent',
                                      border: `1.5px solid ${overdue ? 'rgba(239,68,68,0.5)' : 'rgba(245,158,11,0.5)'}`,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    {sel && <span style={{ color: 'white', fontSize: 8 }}>✓</span>}
                                  </span>
                                  <span className="flex-1 truncate">{t.name}</span>
                                  <span
                                    style={{ color: overdue ? '#ef4444' : 'var(--text-3)', flexShrink: 0, fontSize: 10 }}
                                  >
                                    {new Date(t.deadline!).toLocaleDateString()}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                      {(statusFilter || selectedMilestoneIds.length > 0) && (
                        <div style={{ borderTop: '1px solid var(--border)' }}>
                          <button
                            onClick={() => {
                              setStatusFilterSave(null);
                              setMilestoneIdsSave([]);
                              setShowFiltersDropdown(false);
                              setMilestoneSearch('');
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                            style={{ color: '#ef4444' }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'var(--surface-2)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            Clear all filters
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Display dropdown */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowDisplayDropdown((v) => !v);
                      setShowFiltersDropdown(false);
                      setShowLayoutDropdown(false);
                      setMilestoneSearch('');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                    style={chip(showSprintAura || simpleMode)}
                  >
                    Display{showSprintAura || simpleMode ? ' ●' : ''}
                    <span className="text-[10px] opacity-50">▾</span>
                  </button>
                  {showDisplayDropdown && (
                    <div
                      className="absolute left-0 top-full mt-1 rounded-xl shadow-xl z-50 overflow-hidden"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 200 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          setAutoLayoutSave(true);
                          setShowDisplayDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2.5 transition-colors"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--surface-2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span style={{ width: 20, textAlign: 'center', flexShrink: 0, fontSize: 14 }}>◫</span>
                        <div className="flex-1">
                          <p style={{ color: 'var(--text)', fontWeight: 500 }}>Re-layout graph</p>
                          <p style={{ color: 'var(--text-3)', fontSize: 10, marginTop: 1 }}>
                            Auto-arrange using DAG layout
                          </p>
                        </div>
                      </button>
                      <div style={{ borderTop: '1px solid var(--border)' }} />
                      <button
                        onClick={() => setSprintAuraSave(!showSprintAura)}
                        className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2.5 transition-colors"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--surface-2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span style={{ width: 20, textAlign: 'center', flexShrink: 0, fontSize: 14 }}>🎨</span>
                        <div className="flex-1">
                          <p style={{ color: 'var(--text)', fontWeight: 500 }}>Sub-plan colour map</p>
                          <p style={{ color: 'var(--text-3)', fontSize: 10, marginTop: 1 }}>
                            Colour tasks by sub-plan membership
                          </p>
                        </div>
                        {showSprintAura && <span style={{ color: 'var(--brand)', fontSize: 12 }}>✓</span>}
                      </button>
                      <button
                        onClick={() => setSimpleModeSave(!simpleMode)}
                        className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2.5 transition-colors"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--surface-2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span style={{ width: 20, textAlign: 'center', flexShrink: 0, fontSize: 14 }}>◻</span>
                        <div className="flex-1">
                          <p style={{ color: 'var(--text)', fontWeight: 500 }}>Simple mode</p>
                          <p style={{ color: 'var(--text-3)', fontSize: 10, marginTop: 1 }}>Show task names only</p>
                        </div>
                        {simpleMode && <span style={{ color: 'var(--brand)', fontSize: 12 }}>✓</span>}
                      </button>
                    </div>
                  )}
                </div>

                {/* Layouts dropdown */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowLayoutDropdown((v) => !v);
                      setShowFiltersDropdown(false);
                      setShowDisplayDropdown(false);
                      setMilestoneSearch('');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                    style={chip(false)}
                  >
                    Layouts <span className="text-[10px] opacity-50">▾</span>
                  </button>
                  {showLayoutDropdown && (
                    <div
                      className="absolute left-0 top-full mt-1 rounded-xl shadow-xl z-50 overflow-hidden"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 200 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {canWriteCanvas && (
                        <button
                          onClick={() => {
                            openShareModal();
                            setShowLayoutDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2.5 transition-colors"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--surface-2)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <span style={{ fontSize: 15 }}>↑</span>
                          <div>
                            <p style={{ color: 'var(--text)', fontWeight: 500 }}>Save layout</p>
                            <p style={{ color: 'var(--text-3)', fontSize: 10, marginTop: 1 }}>
                              Share current positions with team
                            </p>
                          </div>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          openLoadModal();
                          setShowLayoutDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2.5 transition-colors"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--surface-2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span style={{ fontSize: 15 }}>↓</span>
                        <div>
                          <p style={{ color: 'var(--text)', fontWeight: 500 }}>Load layout</p>
                          <p style={{ color: 'var(--text-3)', fontSize: 10, marginTop: 1 }}>
                            Apply a saved team snapshot
                          </p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setShowLegend(true)}
                  title="Visual guide"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                  style={chip(false)}
                >
                  ?
                </button>
              </div>
            </div>
          </Panel>

          {/* ── Sprint mode banner ─────────────────────────────────────── */}
          {selectedSprintFilter && activeSprint && (
            <Panel position="top-center">
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid rgba(16,185,129,0.4)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                  {activeSprint.name}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                  · click tasks to add / remove
                </span>
                <button
                  onClick={() => {
                    setSprintFilterSave(null);
                    setViewModeSave('all');
                  }}
                  className="ml-1 text-xs font-semibold px-2 py-0.5 rounded-lg transition-colors"
                  style={{ background: '#10b981', color: 'white' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#059669';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#10b981';
                  }}
                >
                  Done
                </button>
              </div>
            </Panel>
          )}

          {/* ── Top-right ───────────────────────────────────────────────── */}
          <Panel position="top-right">
            <div className="flex flex-col items-end gap-2">
              {canWriteCanvas && (
                <button
                  onClick={() => setShowNewTask(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: 'var(--brand)',
                    color: 'white',
                    border: '1px solid transparent',
                    boxShadow: '0 1px 4px rgba(124,58,237,0.35)',
                  }}
                >
                  + New task
                </button>
              )}
              {showSprintAura && sortedSprints.length > 0 && (
                <div
                  className="rounded-xl px-3 py-2"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                  }}
                >
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wide mb-1.5"
                    style={{ color: 'var(--text-3)' }}
                  >
                    Sub-plan map
                  </p>
                  {sortedSprints.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 mb-1 last:mb-0">
                      <span
                        style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }}
                      />
                      <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                        {s.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          {/* ── Bulk action bar — appears when 2+ task nodes are selected ──── */}
          {selectedNodeIds.length >= 2 && canWriteCanvas && (
            <Panel position="bottom-center">
              <div
                className="flex items-center gap-4 px-4 py-2.5 rounded-xl text-xs"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
                  marginBottom: 12,
                }}
              >
                <span style={{ color: 'var(--text-3)' }}>{selectedNodeIds.length} selected</span>

                {/* Assign owner */}
                <div ref={bulkOwnerRef} style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowBulkOwner((v) => !v)}
                    disabled={bulkAssigning}
                    className="font-medium transition-opacity"
                    style={{ color: 'var(--brand)', opacity: bulkAssigning ? 0.5 : 1 }}
                  >
                    {bulkAssigning ? 'Updating…' : 'Assign owner ▾'}
                  </button>
                  {showBulkOwner && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: 0,
                        marginBottom: 6,
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                        minWidth: 180,
                        zIndex: 50,
                        overflow: 'hidden',
                      }}
                    >
                      {canvasMembers.length === 0 ? (
                        <div className="px-3 py-2" style={{ color: 'var(--text-3)' }}>Loading…</div>
                      ) : (
                        canvasMembers.map((m) => (
                          <button
                            key={m.userId}
                            onClick={() => bulkCanvasAssignOwner(m.userId)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left"
                            style={{ color: 'var(--text)' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <span>{m.user.avatarEmoji ?? '👤'}</span>
                            <span>{m.user.realName ?? m.user.username}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Assign reviewer */}
                <div ref={bulkReviewerRef} style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowBulkReviewer((v) => !v)}
                    disabled={bulkAssigning}
                    className="font-medium transition-opacity"
                    style={{ color: 'var(--brand)', opacity: bulkAssigning ? 0.5 : 1 }}
                  >
                    {bulkAssigning ? 'Updating…' : 'Assign reviewer ▾'}
                  </button>
                  {showBulkReviewer && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: 0,
                        marginBottom: 6,
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                        minWidth: 180,
                        zIndex: 50,
                        overflow: 'hidden',
                      }}
                    >
                      {canvasMembers.length === 0 ? (
                        <div className="px-3 py-2" style={{ color: 'var(--text-3)' }}>Loading…</div>
                      ) : (
                        canvasMembers.map((m) => (
                          <button
                            key={m.userId}
                            onClick={() => bulkCanvasAssignReviewer(m.userId)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left"
                            style={{ color: 'var(--text)' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <span>{m.user.avatarEmoji ?? '👤'}</span>
                            <span>{m.user.realName ?? m.user.username}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Set status */}
                <div ref={bulkStatusRef} style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowBulkStatus((v) => !v)}
                    disabled={bulkAssigning}
                    className="font-medium transition-opacity"
                    style={{ color: 'var(--brand)', opacity: bulkAssigning ? 0.5 : 1 }}
                  >
                    Set status ▾
                  </button>
                  {showBulkStatus && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: 0,
                        marginBottom: 6,
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                        minWidth: 160,
                        zIndex: 50,
                        overflow: 'hidden',
                      }}
                    >
                      {[
                        { key: 'backlog', label: 'Not started', color: '#64748b' },
                        { key: 'todo', label: 'To Do', color: '#3b82f6' },
                        { key: 'in_progress', label: 'In Progress', color: '#f59e0b' },
                        { key: 'blocked', label: 'Blocked', color: '#ef4444' },
                        { key: 'done', label: 'Done', color: '#10b981' },
                      ].map((s) => (
                        <button
                          key={s.key}
                          onClick={() => bulkCanvasSetStatus(s.key)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left"
                          style={{ color: 'var(--text)' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                          <span>{s.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div ref={bulkColorRef} style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowBulkColor((v) => !v)}
                    disabled={bulkAssigning}
                    className="font-medium transition-opacity"
                    style={{ color: 'var(--brand)', opacity: bulkAssigning ? 0.5 : 1 }}
                  >
                    Set color ▾
                  </button>
                  {showBulkColor && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: 0,
                        marginBottom: 6,
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                        minWidth: 180,
                        zIndex: 50,
                        overflow: 'hidden',
                      }}
                    >
                      <div className="flex items-center gap-2 flex-wrap p-2.5">
                        {bulkEnabledColors.map((c) => (
                          <button
                            key={c}
                            onClick={() => bulkCanvasSetColor(c)}
                            title={bulkColorLegend[c] || c}
                            className="w-6 h-6 rounded-full transition-transform"
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                      <button
                        onClick={() => bulkCanvasSetColor(null)}
                        className="w-full text-left px-3 py-2 text-xs"
                        style={{ color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        Clear color
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          )}
        </ReactFlow>

        {/* Empty-state onboarding */}
        {tasksLoaded && tasks.length === 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <div
              className="flex flex-col items-center gap-2 px-5 py-4 rounded-2xl text-center"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                maxWidth: 320,
                pointerEvents: 'auto',
              }}
            >
              <div className="text-3xl opacity-60">📐</div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                Start building your canvas
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                Add tasks and connect them to show dependencies. Tasks with deadlines become milestones.
              </p>
              <div className="flex flex-col gap-1.5 w-full">
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
                >
                  <span
                    className="font-mono text-[10px] px-1 py-0.5 rounded"
                    style={{ background: 'var(--border)', color: 'var(--text-2)' }}
                  >
                    dbl-click
                  </span>
                  <span>canvas to create a task</span>
                </div>
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
                >
                  <span
                    className="font-mono text-[10px] px-1 py-0.5 rounded"
                    style={{ background: 'var(--border)', color: 'var(--text-2)' }}
                  >
                    drag
                  </span>
                  <span>between tasks to add dependencies</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Context menu */}
        {ctxMenu && (
          <div
            className="fixed rounded-xl shadow-xl z-50 py-1 overflow-hidden"
            style={{
              left: ctxMenu.x,
              top: ctxMenu.y,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              minWidth: 180,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {ctxMenu.type === 'edge' && canWriteCanvas && (
              <>
                <div
                  className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}
                >
                  {isProductEdge(ctxMenu.srcId!, ctxMenu.tgtId!) ? 'Product link' : 'Dependency'}
                </div>
                <button
                  className="w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2"
                  style={{ color: '#ef4444' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => deleteEdge(ctxMenu.srcId!, ctxMenu.tgtId!, ctxMenu.edgeId!)}
                >
                  ✕ Remove {isProductEdge(ctxMenu.srcId!, ctxMenu.tgtId!) ? 'link' : 'dependency'}
                </button>
              </>
            )}
            {ctxMenu.type === 'node' && ctxTask && (
              <>
                {canWriteCanvas && (
                  <>
                    <div
                      className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}
                    >
                      Set status
                    </div>
                    {STATUS_OPTIONS.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => quickSetStatus(ctxTask.id, s.key)}
                        className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors"
                        style={{ color: ctxTask.status === s.key ? 'var(--brand)' : 'var(--text)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                        {s.label}
                        {ctxTask.status === s.key && (
                          <span className="ml-auto" style={{ color: 'var(--brand)' }}>
                            ✓
                          </span>
                        )}
                      </button>
                    ))}
                  </>
                )}
                <div style={{ borderTop: canWriteCanvas ? '1px solid var(--border)' : undefined }}>
                  <button
                    className="w-full text-left px-3 py-2 text-sm transition-colors"
                    style={{ color: 'var(--text-2)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => {
                      setCtxMenu(null);
                      const t = tasks.find((x) => x.id === ctxTask.id);
                      if (t) setSelectedTask(t);
                    }}
                  >
                    Open detail…
                  </button>
                </div>
              </>
            )}
            <button
              className="w-full text-left px-3 py-1.5 text-xs transition-colors"
              style={{ color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              onClick={() => setCtxMenu(null)}
            >
              Cancel
            </button>
          </div>
        )}

        {selectedTask && (
          <TaskDetailPanel
            task={selectedTask}
            readOnly={!canWriteCanvas}
            onClose={() => setSelectedTask(null)}
            onUpdated={async (u) => {
              setSelectedTask(u);
              await refreshTasks();
            }}
            onDeleted={async () => {
              setSelectedTask(null);
              await refreshTasks();
            }}
          />
        )}

        {showNewTask && (
          <Modal title="New task" onClose={() => setShowNewTask(false)} width="max-w-sm">
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="label">Task name</label>
                <input
                  autoFocus
                  required
                  type="text"
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  className="input"
                  placeholder="What needs to be done?"
                />
              </div>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                Task appears at the centre of your viewport. Drag it into position then connect edges to link
                dependencies.
              </p>
              <div className="flex gap-3">
                <button type="submit" disabled={creating} className="btn-primary flex-1 flex justify-center">
                  {creating ? (
                    <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    'Create task'
                  )}
                </button>
                <button type="button" onClick={() => setShowNewTask(false)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </Modal>
        )}

        {showNewSprint && (
          <Modal title="New sub-plan" onClose={() => setShowNewSprint(false)} width="max-w-sm">
            <form onSubmit={handleCreateSprint} className="space-y-4">
              <div>
                <label className="label">Sub-plan name</label>
                <input
                  autoFocus
                  required
                  type="text"
                  value={sprintForm.name}
                  onChange={(e) => setSprintForm((p) => ({ ...p, name: e.target.value }))}
                  className="input"
                  placeholder="e.g. Sub-plan 1, MVP, Beta…"
                />
              </div>
              <div>
                <label className="label">Colour</label>
                <div className="flex gap-2 flex-wrap mt-1">
                  {SPRINT_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSprintForm((p) => ({ ...p, color: c }))}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: c,
                        border: sprintForm.color === c ? '3px solid var(--text)' : '2px solid transparent',
                        outline: sprintForm.color === c ? '2px solid ' + c : 'none',
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start date</label>
                  <input
                    required
                    type="date"
                    value={sprintForm.startDate}
                    onChange={(e) => setSprintForm((p) => ({ ...p, startDate: e.target.value }))}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">End date</label>
                  <input
                    required
                    type="date"
                    value={sprintForm.endDate}
                    onChange={(e) => setSprintForm((p) => ({ ...p, endDate: e.target.value }))}
                    className="input"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="submit" className="btn-primary flex-1">
                  Create sub-plan
                </button>
                <button type="button" onClick={() => setShowNewSprint(false)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </Modal>
        )}

        {editingSprint && (
          <Modal title="Edit sub-plan" onClose={() => setEditingSprint(null)} width="max-w-sm">
            <form onSubmit={handleEditSprint} className="space-y-4">
              <div>
                <label className="label">Sub-plan name</label>
                <input
                  autoFocus
                  required
                  type="text"
                  value={editSprintForm.name}
                  onChange={(e) => setEditSprintForm((p) => ({ ...p, name: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Colour</label>
                <div className="flex gap-2 flex-wrap mt-1">
                  {SPRINT_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditSprintForm((p) => ({ ...p, color: c }))}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: c,
                        border: editSprintForm.color === c ? '3px solid var(--text)' : '2px solid transparent',
                        outline: editSprintForm.color === c ? '2px solid ' + c : 'none',
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button type="submit" className="btn-primary flex-1">
                  Save changes
                </button>
                <button type="button" onClick={() => setEditingSprint(null)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </Modal>
        )}

        {showLegend && <LegendModal onClose={() => setShowLegend(false)} />}

        {/* Loading overlay */}
        {!layoutReady && (
          <div
            className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none"
            style={{ background: 'var(--bg)', transition: 'opacity 0.2s' }}
          >
            <div className="flex flex-col items-center gap-3" style={{ color: 'var(--text-3)' }}>
              <div
                className="w-6 h-6 border-2 rounded-full animate-spin"
                style={{ borderColor: 'var(--border)', borderTopColor: 'var(--brand)' }}
              />
              <span className="text-xs">Loading canvas…</span>
            </div>
          </div>
        )}

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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveSnapshot();
                  }}
                  className="input"
                  placeholder="e.g. Sub-plan 1 kickoff, QA review…"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={saveSnapshot}
                  disabled={savingSnapshot || !snapshotName.trim()}
                  className="btn-primary flex-1 flex justify-center"
                >
                  {savingSnapshot ? (
                    <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    'Save snapshot'
                  )}
                </button>
                <button onClick={() => setShowShareModal(false)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          </Modal>
        )}

        {showLoadModal && (
          <Modal title="Load layout" onClose={() => setShowLoadModal(false)} width="max-w-md">
            <div className="space-y-3">
              {totalSnapshotCount === 0 ? (
                <p className="text-sm py-4 text-center" style={{ color: 'var(--text-3)' }}>
                  No saved layouts yet. Use "Share layout" to create one.
                </p>
              ) : (
                <>
                  {totalSnapshotCount > 5 && (
                    <input
                      autoFocus
                      type="text"
                      value={snapshotSearch}
                      onChange={(e) => setSnapshotSearch(e.target.value)}
                      placeholder="Search by name or creator…"
                      className="input text-sm"
                    />
                  )}
                  {snapshots.length === 0 ? (
                    <p className="text-sm py-4 text-center" style={{ color: 'var(--text-3)' }}>
                      No layouts match "{snapshotSearch}"
                    </p>
                  ) : (
                    <div
                      className="divide-y rounded-lg overflow-hidden"
                      style={{ border: '1px solid var(--border)', maxHeight: 360, overflowY: 'auto' }}
                    >
                      {snapshots.map((snap) => (
                        <div
                          key={snap.id}
                          className="flex items-center gap-3 px-4 py-3"
                          style={{ background: 'var(--surface)' }}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                              {snap.name}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                              {snap.user.avatarEmoji ?? '👤'} {displayName(snap.user)} ·{' '}
                              {new Date(snap.updatedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <button
                            onClick={() => applySnapshot(snap)}
                            className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                            style={{ background: 'var(--brand)', color: 'white' }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                          >
                            Apply
                          </button>
                          {snap.userId === currentUser?.id && (
                            <>
                              <button
                                onClick={() => updateSnapshot(snap)}
                                className="flex-shrink-0 text-xs transition-colors"
                                style={{ color: 'var(--text-3)' }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand)')}
                                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                                title="Overwrite with the current layout"
                              >
                                ↻
                              </button>
                              <button
                                onClick={() => deleteSnapshot(snap)}
                                className="flex-shrink-0 text-xs transition-colors"
                                style={{ color: 'var(--text-3)' }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                                title="Delete snapshot"
                              >
                                ✕
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              <button onClick={() => setShowLoadModal(false)} className="btn-secondary w-full">
                Close
              </button>
            </div>
          </Modal>
        )}
      </div>
    </CanvasContext.Provider>
  );
}

export default function CanvasView() {
  return (
    <div className="h-full">
      <ReactFlowProvider>
        <CanvasInner />
      </ReactFlowProvider>
    </div>
  );
}
