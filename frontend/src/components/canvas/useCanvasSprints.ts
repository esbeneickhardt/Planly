/**
 * useCanvasSprints — manages all sprint / sub-plan state for the Canvas view.
 * Extracted from CanvasView.tsx to keep that file manageable.
 *
 * Owns: sprint list, local membership set, all sprint-related UI state, and
 * the async handlers (create / edit / delete sprint, toggle task membership).
 * The caller retains `selectedSprintFilter` because it is also needed by the
 * filteredTasks memo in CanvasView; the hook reads it as a param and calls
 * `onSetSprintFilter` when a deletion requires clearing it.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../api/client';
import type { Sprint } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SPRINT_PALETTE } from './canvasUtils';
import type { ViewMode } from './canvasUtils';

interface Params {
  activeProductId: string | undefined;
  selectedSprintFilter: string | null;
  canWriteCanvas: boolean;
  /** Called when the hook needs to clear or change the active sprint filter. */
  onSetSprintFilter: (v: string | null) => void;
  /** Called when the hook switches the canvas to sprint view mode. */
  onSetViewMode: (v: ViewMode) => void;
}

type SprintForm = { name: string; startDate: string; endDate: string; color: string };
type EditSprintForm = { name: string; color: string };

export function useCanvasSprints({
  activeProductId,
  selectedSprintFilter,
  canWriteCanvas,
  onSetSprintFilter,
  onSetViewMode,
}: Params) {
  const { showToast } = useToast();

  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [localSprintMemberIds, setLocalSprintMemberIds] = useState<Set<string>>(new Set());
  const sprintInitRef = useRef<string | null>(null);

  // Sprint UI state
  const [showSprintPicker, setShowSprintPicker] = useState(false);
  const [showNewSprint, setShowNewSprint] = useState(false);
  const [sprintForm, setSprintForm] = useState<SprintForm>({
    name: '', startDate: '', endDate: '', color: SPRINT_PALETTE[0],
  });
  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null);
  const [editSprintForm, setEditSprintForm] = useState<EditSprintForm>({ name: '', color: SPRINT_PALETTE[0] });

  // Reset sprint init tracking when product changes so a new product starts fresh
  useEffect(() => {
    sprintInitRef.current = null;
    setLocalSprintMemberIds(new Set());
    setSprints([]);
  }, [activeProductId]);

  // Sync local membership set whenever the selected sprint or sprint list changes
  useEffect(() => {
    if (!selectedSprintFilter) {
      setLocalSprintMemberIds(new Set());
      sprintInitRef.current = null;
      return;
    }
    const sprint = sprints.find((s) => s.id === selectedSprintFilter);
    if (sprint && sprintInitRef.current !== selectedSprintFilter) {
      setLocalSprintMemberIds(new Set(sprint.taskIds));
      sprintInitRef.current = selectedSprintFilter;
    }
  }, [selectedSprintFilter, sprints]);

  /** Fetches the sprint list from the backend and updates local state. Returns the fetched list. */
  async function loadSprints(): Promise<Sprint[]> {
    if (!activeProductId) return [];
    const result = await api.sprints.list(activeProductId).catch(() => [] as Sprint[]);
    setSprints(result);
    return result;
  }

  /** Optimistically toggles task membership in the currently selected sprint. */
  const toggleSprintMembership = useCallback(async (taskId: string) => {
    if (!activeProductId || !selectedSprintFilter || !canWriteCanvas) return;
    const isIn = localSprintMemberIds.has(taskId);
    setLocalSprintMemberIds((prev) => {
      const next = new Set(prev);
      if (isIn) next.delete(taskId); else next.add(taskId);
      return next;
    });
    try {
      if (isIn) {
        await api.sprints.removeTask(activeProductId, selectedSprintFilter, taskId);
        setSprints((prev) => prev.map((s) =>
          s.id === selectedSprintFilter ? { ...s, taskIds: s.taskIds.filter((id) => id !== taskId) } : s,
        ));
      } else {
        await api.sprints.addTasks(activeProductId, selectedSprintFilter, [taskId]);
        setSprints((prev) => prev.map((s) =>
          s.id === selectedSprintFilter ? { ...s, taskIds: [...s.taskIds, taskId] } : s,
        ));
      }
    } catch (err) {
      // Revert optimistic update on failure
      setLocalSprintMemberIds((prev) => {
        const next = new Set(prev);
        if (isIn) next.add(taskId); else next.delete(taskId);
        return next;
      });
      showToast((err as Error).message, 'error');
    }
  }, [activeProductId, selectedSprintFilter, localSprintMemberIds, canWriteCanvas, showToast]);

  /** Creates a new sprint and advances the form colour to the next palette slot. */
  async function handleCreateSprint(e: React.FormEvent) {
    e.preventDefault();
    if (!activeProductId) return;
    try {
      const s = await api.sprints.create(activeProductId, {
        name: sprintForm.name, startDate: sprintForm.startDate,
        endDate: sprintForm.endDate, color: sprintForm.color,
      });
      setSprints((prev) => {
        const next = [...prev, s].sort((a, b) => a.startDate.localeCompare(b.startDate));
        setSprintForm({ name: '', startDate: '', endDate: '', color: SPRINT_PALETTE[next.length % SPRINT_PALETTE.length] ?? SPRINT_PALETTE[0] });
        return next;
      });
      setShowNewSprint(false);
      showToast(`Sub-plan "${s.name}" created`, 'success');
    } catch (err) { showToast((err as Error).message, 'error'); }
  }

  /** Updates name/colour of the sprint currently being edited. */
  async function handleEditSprint(e: React.FormEvent) {
    e.preventDefault();
    if (!activeProductId || !editingSprint) return;
    try {
      const updated = await api.sprints.update(activeProductId, editingSprint.id, {
        name: editSprintForm.name, color: editSprintForm.color,
      });
      setSprints((prev) => prev.map((s) => s.id === updated.id ? { ...updated, taskIds: s.taskIds } : s));
      setEditingSprint(null);
      showToast('Sub-plan updated', 'success');
    } catch (err) { showToast((err as Error).message, 'error'); }
  }

  /** Deletes a sprint and clears the sprint filter if it was the active one. */
  async function deleteSprint(sprintId: string) {
    if (!activeProductId) return;
    await api.sprints.delete(activeProductId, sprintId).catch(() => {});
    setSprints((prev) => prev.filter((s) => s.id !== sprintId));
    if (selectedSprintFilter === sprintId) {
      onSetSprintFilter(null);
      onSetViewMode('all');
    }
    showToast('Sprint deleted', 'info');
  }

  return {
    sprints, setSprints,
    localSprintMemberIds,
    showSprintPicker, setShowSprintPicker,
    showNewSprint, setShowNewSprint,
    sprintForm, setSprintForm,
    editingSprint, setEditingSprint,
    editSprintForm, setEditSprintForm,
    loadSprints,
    toggleSprintMembership,
    handleCreateSprint,
    handleEditSprint,
    deleteSprint,
  };
}
