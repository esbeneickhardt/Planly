/**
 * ReactFlow-based dependency canvas that visualises tasks and their prerequisite relationships as a directed graph.
 * Pure graph utilities live in canvasUtils.ts; sprint state lives in useCanvasSprints.ts; the build+layout pipeline
 * and its fragile guard refs live in useCanvasGraph.ts (see that file's header comment before touching it).
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
import { api } from '../../api/client';
import { useColorLegend } from '../../hooks/useColorLegend';
import { useCanvasGraph } from '../../hooks/useCanvasGraph';
import type { Task } from '../../types';
import TaskNode from './nodes/TaskNode';
import ProductNode from './nodes/ProductNode';
import TaskDetailPanel from '../common/TaskDetailPanel';
import EmptyState from '../common/EmptyState';
import LegendModal from './LegendModal';
import CanvasControlPanel from './CanvasControlPanel';
import CanvasBulkActionBar from './CanvasBulkActionBar';
import CanvasContextMenu from './CanvasContextMenu';
import CanvasModals from './CanvasModals';
import { useCanvasSnapshots } from '../../hooks/useCanvasSnapshots';
import { useCanvasSprints } from './useCanvasSprints';
import { CanvasContext, loadState, patchState, getAncestorIds } from './canvasUtils';
import type { ViewMode, CtxMenu, CanvasState } from './canvasUtils';

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

  // Set right before a programmatic (not user-picked) change to viewMode/selectedSprintFilter -
  // e.g. entering "add tasks to this sub-plan" mode after creating one - so useCanvasGraph's
  // filter-relayout effect treats that one change as a no-op instead of scheduling a relayout.
  const skipNextFilterRelayoutRef = useRef(false);
  const suppressNextFilterRelayout = useCallback(() => {
    skipNextFilterRelayoutRef.current = true;
  }, []);
  const activeProductRef = useRef(activeProduct);
  activeProductRef.current = activeProduct;
  // Always-current ref so onNodeClick never reads stale sprint state from a closure
  const sprintClickRef = useRef<{ filter: string | null; toggle: (id: string) => Promise<void> }>({
    filter: null,
    toggle: async () => {},
  });
  // Always-current tasks ref so onNodesDelete captures latest task data without stale closure
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
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
  }, [tasks, viewMode, statusFilter, selectedMilestoneIds]);

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

  // ── Build+layout pipeline (extracted hook - see useCanvasGraph.ts's header comment before
  // touching anything here or inside it) ────────────────────────────────────────────────────
  const { layoutReady, productConnectionsRef, loadConnections, setAutoLayoutSave } = useCanvasGraph({
    activeProduct,
    activeProductRef,
    skipNextFilterRelayoutRef,
    tasksLoaded,
    filteredTasks,
    nodeHeights,
    columnLabelMap,
    sprints,
    selectedSprintFilter,
    localSprintMemberIds,
    showSprintAura,
    sprintColorsMap,
    viewMode,
    statusFilter,
    selectedMilestoneIds,
    nodes,
    edges,
    setNodes,
    setEdges,
    getViewport,
    setViewport,
    fitView,
    save,
    setViewMode,
    setStatusFilter,
    setSelectedSprintFilter,
    setSelectedMilestoneIds,
    setShowSprintAura,
    setSimpleMode,
  });

  const onMoveEnd = useCallback((_: unknown, vp: { x: number; y: number; zoom: number }) => {
    save({ viewport: vp });
  }, []);

  // Load sprints + product connections + column labels
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

  // Keep ref current so onNodeClick always reads latest sprint state without stale closures
  sprintClickRef.current = { filter: selectedSprintFilter, toggle: toggleSprintMembership };

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
    },
    [canWriteCanvas, getViewport],
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
    [activeProduct, setEdges, refreshTasks, tasks, showToast, canWriteCanvas, productConnectionsRef],
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
    [activeProduct, refreshTasks, canWriteCanvas, productConnectionsRef],
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
          `${taskNodes.length} task${taskNodes.length > 1 ? 's' : ''} deleted - press Ctrl+Z to undo`,
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

  // Ctrl+Z - only fires when focus is outside an input/textarea
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
  );

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

  const ctxTask = ctxMenu?.type === 'node' && ctxMenu.taskId ? tasks.find((t) => t.id === ctxMenu.taskId) : null;
  const activeSprint = sortedSprints.find((s) => s.id === selectedSprintFilter);

  return (
    <CanvasContext.Provider value={{ showSprintAura, simpleMode }}>
      <style>{`.react-flow__edge.selected .react-flow__edge-path { stroke: var(--brand) !important; stroke-width: 3px !important; } .react-flow__edge.selected .react-flow__edge-interaction { stroke: var(--brand) !important; }`}</style>
      {/* This wrapper's onClick is a broad "any click inside the canvas area closes an open
          context menu" backdrop-dismiss (belt-and-suspenders alongside ReactFlow's own
          onPaneClick/onNodeClick, which already call setCtxMenu(null) for the pane/node cases).
          It covers the whole canvas region, so making it a role="button"/tabIndex={0} element per
          the usual click-events fix would insert one giant, semantically-invalid tab stop ahead of
          every real node and control in the canvas - worse for keyboard/screen-reader users than
          the warning itself. There's no discrete keyboard equivalent to add here. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
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
            <CanvasControlPanel
              viewMode={viewMode}
              onSetViewMode={setViewModeSave}
              canWriteCanvas={canWriteCanvas}
              selectedSprintFilter={selectedSprintFilter}
              onSetSprintFilter={setSprintFilterSave}
              activeSprint={activeSprint}
              sortedSprints={sortedSprints}
              showSprintPicker={showSprintPicker}
              setShowSprintPicker={setShowSprintPicker}
              onNewSprint={() => setShowNewSprint(true)}
              onEditSprint={(s) => {
                setEditingSprint(s);
                setEditSprintForm({ name: s.name, color: s.color });
              }}
              onDeleteSprint={deleteSprint}
              showFiltersDropdown={showFiltersDropdown}
              setShowFiltersDropdown={setShowFiltersDropdown}
              setShowDisplayDropdown={setShowDisplayDropdown}
              setShowLayoutDropdown={setShowLayoutDropdown}
              statusFilter={statusFilter}
              onSetStatusFilter={setStatusFilterSave}
              selectedMilestoneIds={selectedMilestoneIds}
              onSetMilestoneIds={setMilestoneIdsSave}
              milestoneTasks={milestoneTasks}
              filteredMilestoneTasks={filteredMilestoneTasks}
              milestoneSearch={milestoneSearch}
              onMilestoneSearchChange={setMilestoneSearch}
              showDisplayDropdown={showDisplayDropdown}
              onRelayout={() => setAutoLayoutSave(true)}
              showSprintAura={showSprintAura}
              onToggleSprintAura={() => setSprintAuraSave(!showSprintAura)}
              simpleMode={simpleMode}
              onToggleSimpleMode={() => setSimpleModeSave(!simpleMode)}
              showLayoutDropdown={showLayoutDropdown}
              onOpenShareModal={() => {
                openShareModal();
                setShowLayoutDropdown(false);
              }}
              onOpenLoadModal={() => {
                openLoadModal();
                setShowLayoutDropdown(false);
              }}
              onShowLegend={() => setShowLegend(true)}
            />
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

          {/* ── Bulk action bar - appears when 2+ task nodes are selected ──── */}
          {selectedNodeIds.length >= 2 && canWriteCanvas && (
            <Panel position="bottom-center">
              <CanvasBulkActionBar
                selectedCount={selectedNodeIds.length}
                canvasMembers={canvasMembers}
                bulkAssigning={bulkAssigning}
                bulkOwnerRef={bulkOwnerRef}
                showBulkOwner={showBulkOwner}
                setShowBulkOwner={setShowBulkOwner}
                onAssignOwner={bulkCanvasAssignOwner}
                bulkReviewerRef={bulkReviewerRef}
                showBulkReviewer={showBulkReviewer}
                setShowBulkReviewer={setShowBulkReviewer}
                onAssignReviewer={bulkCanvasAssignReviewer}
                bulkStatusRef={bulkStatusRef}
                showBulkStatus={showBulkStatus}
                setShowBulkStatus={setShowBulkStatus}
                onSetStatus={bulkCanvasSetStatus}
                bulkColorRef={bulkColorRef}
                showBulkColor={showBulkColor}
                setShowBulkColor={setShowBulkColor}
                bulkColorLegend={bulkColorLegend}
                bulkEnabledColors={bulkEnabledColors}
                onSetColor={bulkCanvasSetColor}
              />
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
          <CanvasContextMenu
            ctxMenu={ctxMenu}
            canWriteCanvas={canWriteCanvas}
            ctxTask={ctxTask}
            onDeleteEdge={deleteEdge}
            onQuickSetStatus={quickSetStatus}
            onOpenDetail={(t) => setSelectedTask(t)}
            onClose={() => setCtxMenu(null)}
          />
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

        <CanvasModals
          showNewTask={showNewTask}
          onCloseNewTask={() => setShowNewTask(false)}
          newTaskName={newTaskName}
          onNewTaskNameChange={setNewTaskName}
          onSubmitNewTask={handleCreateTask}
          creatingTask={creating}
          showNewSprint={showNewSprint}
          onCloseNewSprint={() => setShowNewSprint(false)}
          sprintForm={sprintForm}
          onSprintFormChange={setSprintForm}
          onSubmitNewSprint={handleCreateSprint}
          editingSprint={editingSprint}
          onCloseEditSprint={() => setEditingSprint(null)}
          editSprintForm={editSprintForm}
          onEditSprintFormChange={setEditSprintForm}
          onSubmitEditSprint={handleEditSprint}
          showShareModal={showShareModal}
          onCloseShareModal={() => setShowShareModal(false)}
          snapshotName={snapshotName}
          onSnapshotNameChange={setSnapshotName}
          onSaveSnapshot={saveSnapshot}
          savingSnapshot={savingSnapshot}
          showLoadModal={showLoadModal}
          onCloseLoadModal={() => setShowLoadModal(false)}
          totalSnapshotCount={totalSnapshotCount}
          snapshots={snapshots}
          snapshotSearch={snapshotSearch}
          onSnapshotSearchChange={setSnapshotSearch}
          onApplySnapshot={applySnapshot}
          onUpdateSnapshot={updateSnapshot}
          onDeleteSnapshot={deleteSnapshot}
          currentUserId={currentUser?.id}
        />

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
