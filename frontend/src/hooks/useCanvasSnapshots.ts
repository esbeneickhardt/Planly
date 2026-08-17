/**
 * useCanvasSnapshots - manages named, sharable Canvas layout "snapshots" for the active product:
 * create/update/delete/apply a snapshot capturing node positions, viewport, and active filters,
 * plus the Share/Load modal visibility and snapshot-list search state. The snapshot list is
 * fetched on demand when the Load modal opens, not on mount. Node-position autosave to the
 * server is a separate concern handled by the `save` callback the caller passes in (CanvasView's
 * `patchState` wrapper) - this hook only touches the persisted, named snapshot list.
 */
import { useState } from 'react';
import type { Node } from 'reactflow';
import { api, displayName } from '../api/client';
import type { CanvasSnapshot, CanvasSnapshotViewport } from '../api/client';
import type { Product } from '../types';

type ViewMode = 'all' | 'active' | 'milestones' | 'sprint';

// The filter selection captured in a snapshot alongside positions/viewport, so loading a layout
// restores what was being looked at, not just where the nodes were.
interface CanvasFilters {
  statusFilter: string | null;
  selectedSprintFilter: string | null;
  selectedMilestoneIds: string[];
}

interface CanvasPatch {
  viewport?: { x: number; y: number; zoom: number };
  viewMode?: ViewMode;
  simpleMode?: boolean;
  statusFilter?: string | null;
  selectedSprintFilter?: string | null;
  selectedMilestoneIds?: string[];
  positions?: Record<string, { x: number; y: number }>;
}

interface Options {
  activeProduct: Product | null;
  nodes: Node[];
  getViewport: () => { x: number; y: number; zoom: number };
  setViewport: (vp: { x: number; y: number; zoom: number }) => void;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  viewMode: ViewMode;
  simpleMode: boolean;
  setViewMode: (mode: ViewMode) => void;
  setSimpleMode: (v: boolean) => void;
  filters: CanvasFilters;
  setFilters: (f: CanvasFilters) => void;
  currentUserId?: string;
  save: (p: CanvasPatch) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function useCanvasSnapshots({
  activeProduct,
  nodes,
  getViewport,
  setViewport,
  setNodes,
  viewMode,
  simpleMode,
  setViewMode,
  setSimpleMode,
  filters,
  setFilters,
  currentUserId,
  save,
  showToast,
}: Options) {
  // State
  const [showShareModal, setShowShareModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [snapshots, setSnapshots] = useState<CanvasSnapshot[]>([]);
  const [snapshotName, setSnapshotName] = useState('');
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  // Client-side search over the loaded snapshot list, by layout name or creator
  const [snapshotSearch, setSnapshotSearch] = useState('');

  // Actions
  function openShareModal() {
    setSnapshotName('');
    setShowShareModal(true);
  }

  async function openLoadModal() {
    if (!activeProduct) return;
    const snaps = await api.canvasSnapshots.list(activeProduct.id).catch(() => []);
    setSnapshots(snaps);
    setSnapshotSearch('');
    setShowLoadModal(true);
  }

  function currentPositions(): Record<string, { x: number; y: number }> {
    const positions: Record<string, { x: number; y: number }> = {};
    nodes.forEach((n) => {
      positions[n.id] = { x: n.position.x, y: n.position.y };
    });
    return positions;
  }

  function currentViewport(): CanvasSnapshotViewport {
    return {
      ...getViewport(),
      viewMode,
      simpleMode,
      statusFilter: filters.statusFilter,
      selectedSprintFilter: filters.selectedSprintFilter,
      selectedMilestoneIds: filters.selectedMilestoneIds,
    };
  }

  async function saveSnapshot() {
    if (!activeProduct || !snapshotName.trim()) return;
    setSavingSnapshot(true);
    try {
      await api.canvasSnapshots.create(activeProduct.id, {
        name: snapshotName.trim(),
        positions: currentPositions(),
        viewport: currentViewport(),
      });
      showToast('Layout saved', 'success');
      setShowShareModal(false);
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingSnapshot(false);
    }
  }

  // Overwrites an existing (own) snapshot with the current positions/viewport/filters, keeping
  // its name - lets a creator refresh their saved layout instead of always creating a new one.
  async function updateSnapshot(snap: CanvasSnapshot) {
    if (!activeProduct) return;
    try {
      const updated = await api.canvasSnapshots.update(activeProduct.id, snap.id, {
        positions: currentPositions(),
        viewport: currentViewport(),
      });
      setSnapshots((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      showToast(`Layout "${snap.name}" updated`, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }

  function applySnapshot(snap: CanvasSnapshot) {
    if (!activeProduct) return;
    setNodes((prev) =>
      prev.map((n) => {
        const pos = snap.positions[n.id];
        return pos ? { ...n, position: pos } : n;
      }),
    );
    const { x, y, zoom } = snap.viewport;
    setViewport({ x, y, zoom });
    // Persist snapshot positions to localStorage so this user's canvas restores correctly on reload
    const patch: CanvasPatch = {
      viewport: { x, y, zoom },
      positions: snap.positions,
    };
    if (snap.viewport.viewMode) {
      setViewMode(snap.viewport.viewMode as ViewMode);
      patch.viewMode = snap.viewport.viewMode as ViewMode;
    }
    if (snap.viewport.simpleMode !== undefined) setSimpleMode(snap.viewport.simpleMode);
    const restoredFilters: CanvasFilters = {
      statusFilter: snap.viewport.statusFilter ?? null,
      selectedSprintFilter: snap.viewport.selectedSprintFilter ?? null,
      selectedMilestoneIds: snap.viewport.selectedMilestoneIds ?? [],
    };
    setFilters(restoredFilters);
    patch.statusFilter = restoredFilters.statusFilter;
    patch.selectedSprintFilter = restoredFilters.selectedSprintFilter;
    patch.selectedMilestoneIds = restoredFilters.selectedMilestoneIds;
    save(patch);
    setShowLoadModal(false);
    showToast(`Layout "${snap.name}" applied`, 'success');
  }

  async function deleteSnapshot(snap: CanvasSnapshot) {
    if (!activeProduct) return;
    await api.canvasSnapshots.delete(activeProduct.id, snap.id).catch(() => {});
    setSnapshots((prev) => prev.filter((s) => s.id !== snap.id));
  }

  // Own snapshots first, then most-recently-updated within each group; then narrowed by search
  // (matches layout name or creator's display name) - reused by the Load modal's render.
  const sortedFilteredSnapshots = (() => {
    const q = snapshotSearch.trim().toLowerCase();
    const matches = q
      ? snapshots.filter((s) => s.name.toLowerCase().includes(q) || displayName(s.user).toLowerCase().includes(q))
      : snapshots;
    return [...matches].sort((a, b) => {
      const aOwn = a.userId === currentUserId ? 0 : 1;
      const bOwn = b.userId === currentUserId ? 0 : 1;
      if (aOwn !== bOwn) return aOwn - bOwn;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  })();

  return {
    showShareModal,
    setShowShareModal,
    showLoadModal,
    setShowLoadModal,
    snapshots: sortedFilteredSnapshots,
    totalSnapshotCount: snapshots.length,
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
  };
}
