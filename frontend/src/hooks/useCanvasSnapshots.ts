/**
 * useCanvasSnapshots - loads and saves task node positions for the Canvas view.
 *
 * Fetches the stored snapshot on mount and provides a save() function that
 * persists the current node positions. Debounces saves to avoid hammering the
 * API on every drag event - callers should call save() on drag-end.
 */
import { useState } from 'react';
import type { Node } from 'reactflow';
import { api } from '../api/client';
import type { CanvasSnapshot } from '../api/client';
import type { Product } from '../types';

type ViewMode = 'all' | 'active' | 'milestones' | 'sprint';

interface CanvasPatch {
  viewport?: { x: number; y: number; zoom: number };
  viewMode?: ViewMode;
  simpleMode?: boolean;
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
  save,
  showToast,
}: Options) {
  // State
  const [showShareModal, setShowShareModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [snapshots, setSnapshots] = useState<CanvasSnapshot[]>([]);
  const [snapshotName, setSnapshotName] = useState('');
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  // Actions
  function openShareModal() {
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
      nodes.forEach((n) => {
        positions[n.id] = { x: n.position.x, y: n.position.y };
      });
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
    setNodes((prev) =>
      prev.map((n) => {
        const pos = snap.positions[n.id];
        return pos ? { ...n, position: pos } : n;
      }),
    );
    const { x, y, zoom } = snap.viewport as { x: number; y: number; zoom: number };
    setViewport({ x, y, zoom });
    const snapVp = snap.viewport as { viewMode?: ViewMode; simpleMode?: boolean };
    // Persist snapshot positions to localStorage so this user's canvas restores correctly on reload
    const patch: CanvasPatch = { viewport: { x, y, zoom }, positions: snap.positions };
    if (snapVp.viewMode) {
      setViewMode(snapVp.viewMode);
      patch.viewMode = snapVp.viewMode;
    }
    save(patch);
    if (snapVp.simpleMode !== undefined) setSimpleMode(snapVp.simpleMode);
    setShowLoadModal(false);
    showToast(`Layout "${snap.name}" applied`, 'success');
  }

  async function deleteSnapshot(snap: CanvasSnapshot) {
    if (!activeProduct) return;
    await api.canvasSnapshots.delete(activeProduct.id, snap.id).catch(() => {});
    setSnapshots((prev) => prev.filter((s) => s.id !== snap.id));
  }

  return {
    showShareModal,
    setShowShareModal,
    showLoadModal,
    setShowLoadModal,
    snapshots,
    snapshotName,
    setSnapshotName,
    savingSnapshot,
    openShareModal,
    openLoadModal,
    saveSnapshot,
    applySnapshot,
    deleteSnapshot,
  };
}
