/**
 * useCanvasGraph - owns Canvas's build+layout pipeline: the ReactFlow graph build effect, dagre
 * auto-relayout (manual "Re-layout graph" button + debounced auto-relayout-on-filter-change), and
 * the hand-documented guard refs (`initializedRef`, `filterEffectPrimedRef`) that prevent
 * mis-relayouts on remount vs. genuine filter changes.
 *
 * EXTREME CARE: this is the single most fragile piece of logic in the whole Canvas view. The
 * guard-ref choreography across the three effects below (persisted-state load -> build+layout ->
 * filter-relayout debounce) was moved verbatim out of CanvasView.tsx during Phase M7's
 * extraction - same effects, same conditions, same order, same dependency arrays (each still has
 * its original eslint-disable-next-line react-hooks/exhaustive-deps, deliberately). Do not
 * "clean up", reorder, or restructure anything in here without first re-reading the equivalent
 * region of git history for CanvasView.tsx and understanding exactly why each guard exists.
 *
 * `skipNextFilterRelayoutRef` and `activeProductRef` stay OWNED BY THE CALLER (CanvasView) and
 * are threaded in by reference rather than created here, for two reasons: (1)
 * `suppressNextFilterRelayout()` - the setter for `skipNextFilterRelayoutRef` - must exist before
 * `useCanvasSprints` is called, and `useCanvasSprints` must in turn run before this hook, since
 * this hook consumes its `localSprintMemberIds`/`sprints` output (calling this hook first would
 * create a circular dependency); (2) `activeProductRef` is also read by CanvasView's own `save()`
 * helper, which predates and outlives this hook's use of it.
 */
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Node, Edge } from 'reactflow';
import type { Task, Product } from '../types';
import type { Sprint } from '../api/client';
import { api } from '../api/client';
import { useDebouncedCallback } from './useDebouncedCallback';
import { loadState, patchState, buildGraph, runAutoLayout } from '../components/canvas/canvasUtils';
import type { ViewMode, CanvasState } from '../components/canvas/canvasUtils';

interface Options {
  activeProduct: Product | null;
  activeProductRef: MutableRefObject<Product | null>;
  skipNextFilterRelayoutRef: MutableRefObject<boolean>;
  tasksLoaded: boolean;
  filteredTasks: Task[];
  nodeHeights: Map<string, number>;
  columnLabelMap: Map<string, string>;
  sprints: Sprint[];
  selectedSprintFilter: string | null;
  localSprintMemberIds: Set<string>;
  showSprintAura: boolean;
  sprintColorsMap: Map<string, string[]>;
  viewMode: ViewMode;
  statusFilter: string | null;
  selectedMilestoneIds: string[];
  nodes: Node[];
  edges: Edge[];
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  getViewport: () => { x: number; y: number; zoom: number };
  setViewport: (vp: { x: number; y: number; zoom: number }) => void;
  fitView: (opts?: { padding?: number }) => void;
  save: (p: Partial<CanvasState>) => void;
  setViewMode: (v: ViewMode) => void;
  setStatusFilter: (v: string | null) => void;
  setSelectedSprintFilter: (v: string | null) => void;
  setSelectedMilestoneIds: (v: string[]) => void;
  setShowSprintAura: (v: boolean) => void;
  setSimpleMode: (v: boolean) => void;
}

export function useCanvasGraph({
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
}: Options) {
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
  const [autoLayoutEnabled, setAutoLayoutEnabled] = useState(false);

  const initializedRef = useRef<string | null>(null);
  // Guards the filter-relayout effect against firing right after (re)initializing this product -
  // e.g. leaving the Canvas and coming back remounts this component, and restoring the persisted
  // viewMode/statusFilter/etc from localStorage changes those exact same state values that effect
  // watches, even though the user didn't touch anything. Reset to false alongside initializedRef
  // whenever the product changes; the first time the filter-relayout effect observes the board as
  // initialized for this product, it just arms this flag instead of relaying out - only a LATER
  // filter change (a real one, made after that point) goes on to trigger the actual relayout.
  const filterEffectPrimedRef = useRef(false);
  const productConnectionsRef = useRef<Set<string>>(new Set());
  const savedViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  // Always-current node/edge/height refs so the debounced auto-relayout effect (below) never
  // relays out a render-stale snapshot of the graph once its timer actually fires
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const nodeHeightsRef = useRef(nodeHeights);
  nodeHeightsRef.current = nodeHeights;

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
    // activeProduct: only `.id` drives this effect; object identity changes on every context
    // re-render regardless of which product is active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProduct?.id]);

  // Load product connections (feeds the "Product link" edges buildGraph draws). Exposed so the
  // caller can trigger it alongside loading sprints/columns - those two remain the caller's
  // concern (columnLabelMap and sprints are inputs to this hook, not owned by it).
  async function loadConnections() {
    if (!activeProduct) return;
    productConnectionsRef.current = new Set(await api.connections.list(activeProduct.id).catch(() => []));
    setConnectionsVersion((v) => v + 1);
  }

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
  // `prod` is passed as an explicit argument (not closed over) specifically so the "did the active
  // product change while we were waiting" check below compares against the product that was active
  // when THIS relayout was scheduled, not whatever's active when the debounced call fires.
  const [scheduleRelayout, cancelRelayout] = useDebouncedCallback((prod: NonNullable<typeof activeProduct>) => {
    const currentProd = activeProductRef.current;
    // Bail if the product changed (or hasn't finished initializing) during the wait, so a
    // relayout meant for the old product/filters never lands on whatever's showing now.
    if (!currentProd || currentProd.id !== prod.id || initializedRef.current !== currentProd.id) return;
    relayoutGraph(currentProd, nodesRef.current, edgesRef.current, nodeHeightsRef.current);
  }, 500);
  useEffect(() => {
    // Unconditional, before the guards below - cancels a relayout still pending from a previous
    // run of this effect even when this run's own guards end up skipping scheduling a new one
    // (e.g. a suppressed programmatic filter change shouldn't let an earlier real one still land).
    cancelRelayout();
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
    scheduleRelayout(prod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, statusFilter, selectedSprintFilter, selectedMilestoneIds, scheduleRelayout, cancelRelayout]);

  return {
    layoutReady,
    productConnectionsRef,
    loadConnections,
    setAutoLayoutSave,
  };
}
