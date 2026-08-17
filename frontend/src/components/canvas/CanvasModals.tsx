/**
 * The five standalone modals CanvasView opens outside the canvas area itself: new task, new
 * sub-plan (sprint), edit sub-plan, share layout, and load layout. Bundled into one file (rather
 * than five) since they're small, share no state with each other, and are only ever rendered from
 * CanvasView - all form/open/close state stays in the parent, this is presentation-only. Mirrors
 * how Phase M5 bundled KanbanBoard's small modals into KanbanModals.tsx.
 */
import type { Sprint } from '../../api/client';
import { displayName } from '../../api/client';
import type { CanvasSnapshot } from '../../api/client';
import Modal from '../common/Modal';
import { SPRINT_PALETTE } from './canvasUtils';

interface SprintForm {
  name: string;
  startDate: string;
  endDate: string;
  color: string;
}
interface EditSprintForm {
  name: string;
  color: string;
}

interface Props {
  // New task
  showNewTask: boolean;
  onCloseNewTask: () => void;
  newTaskName: string;
  onNewTaskNameChange: (v: string) => void;
  onSubmitNewTask: (e: React.FormEvent) => void;
  creatingTask: boolean;

  // New sub-plan
  showNewSprint: boolean;
  onCloseNewSprint: () => void;
  sprintForm: SprintForm;
  onSprintFormChange: (updater: (p: SprintForm) => SprintForm) => void;
  onSubmitNewSprint: (e: React.FormEvent) => void;

  // Edit sub-plan
  editingSprint: Sprint | null;
  onCloseEditSprint: () => void;
  editSprintForm: EditSprintForm;
  onEditSprintFormChange: (updater: (p: EditSprintForm) => EditSprintForm) => void;
  onSubmitEditSprint: (e: React.FormEvent) => void;

  // Share layout
  showShareModal: boolean;
  onCloseShareModal: () => void;
  snapshotName: string;
  onSnapshotNameChange: (v: string) => void;
  onSaveSnapshot: () => void;
  savingSnapshot: boolean;

  // Load layout
  showLoadModal: boolean;
  onCloseLoadModal: () => void;
  totalSnapshotCount: number;
  snapshots: CanvasSnapshot[];
  snapshotSearch: string;
  onSnapshotSearchChange: (v: string) => void;
  onApplySnapshot: (snap: CanvasSnapshot) => void;
  onUpdateSnapshot: (snap: CanvasSnapshot) => void;
  onDeleteSnapshot: (snap: CanvasSnapshot) => void;
  currentUserId: string | undefined;
}

export default function CanvasModals({
  showNewTask,
  onCloseNewTask,
  newTaskName,
  onNewTaskNameChange,
  onSubmitNewTask,
  creatingTask,
  showNewSprint,
  onCloseNewSprint,
  sprintForm,
  onSprintFormChange,
  onSubmitNewSprint,
  editingSprint,
  onCloseEditSprint,
  editSprintForm,
  onEditSprintFormChange,
  onSubmitEditSprint,
  showShareModal,
  onCloseShareModal,
  snapshotName,
  onSnapshotNameChange,
  onSaveSnapshot,
  savingSnapshot,
  showLoadModal,
  onCloseLoadModal,
  totalSnapshotCount,
  snapshots,
  snapshotSearch,
  onSnapshotSearchChange,
  onApplySnapshot,
  onUpdateSnapshot,
  onDeleteSnapshot,
  currentUserId,
}: Props) {
  return (
    <>
      {showNewTask && (
        <Modal title="New task" onClose={onCloseNewTask} width="max-w-sm">
          <form onSubmit={onSubmitNewTask} className="space-y-4">
            <div>
              <label className="label" htmlFor="canvas-new-task-name">
                Task name
              </label>
              <input
                id="canvas-new-task-name"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- first field in a freshly-opened modal
                autoFocus
                required
                type="text"
                value={newTaskName}
                onChange={(e) => onNewTaskNameChange(e.target.value)}
                className="input"
                placeholder="What needs to be done?"
              />
            </div>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Task appears at the centre of your viewport. Drag it into position then connect edges to link
              dependencies.
            </p>
            <div className="flex gap-3">
              <button type="submit" disabled={creatingTask} className="btn-primary flex-1 flex justify-center">
                {creatingTask ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  'Create task'
                )}
              </button>
              <button type="button" onClick={onCloseNewTask} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showNewSprint && (
        <Modal title="New sub-plan" onClose={onCloseNewSprint} width="max-w-sm">
          <form onSubmit={onSubmitNewSprint} className="space-y-4">
            <div>
              <label className="label" htmlFor="canvas-new-sprint-name">
                Sub-plan name
              </label>
              <input
                id="canvas-new-sprint-name"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- first field in a freshly-opened modal
                autoFocus
                required
                type="text"
                value={sprintForm.name}
                onChange={(e) => onSprintFormChange((p) => ({ ...p, name: e.target.value }))}
                className="input"
                placeholder="e.g. Sub-plan 1, MVP, Beta…"
              />
            </div>
            <div>
              {/* Not a real label - it's a heading for the color swatch grid below, no single associated control */}
              <span className="label">Colour</span>
              <div className="flex gap-2 flex-wrap mt-1">
                {SPRINT_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onSprintFormChange((p) => ({ ...p, color: c }))}
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
                <label className="label" htmlFor="canvas-new-sprint-start">
                  Start date
                </label>
                <input
                  id="canvas-new-sprint-start"
                  required
                  type="date"
                  value={sprintForm.startDate}
                  onChange={(e) => onSprintFormChange((p) => ({ ...p, startDate: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="canvas-new-sprint-end">
                  End date
                </label>
                <input
                  id="canvas-new-sprint-end"
                  required
                  type="date"
                  value={sprintForm.endDate}
                  onChange={(e) => onSprintFormChange((p) => ({ ...p, endDate: e.target.value }))}
                  className="input"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary flex-1">
                Create sub-plan
              </button>
              <button type="button" onClick={onCloseNewSprint} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingSprint && (
        <Modal title="Edit sub-plan" onClose={onCloseEditSprint} width="max-w-sm">
          <form onSubmit={onSubmitEditSprint} className="space-y-4">
            <div>
              <label className="label" htmlFor="canvas-edit-sprint-name">
                Sub-plan name
              </label>
              <input
                id="canvas-edit-sprint-name"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- first field in a freshly-opened modal
                autoFocus
                required
                type="text"
                value={editSprintForm.name}
                onChange={(e) => onEditSprintFormChange((p) => ({ ...p, name: e.target.value }))}
                className="input"
              />
            </div>
            <div>
              {/* Not a real label - it's a heading for the color swatch grid below, no single associated control */}
              <span className="label">Colour</span>
              <div className="flex gap-2 flex-wrap mt-1">
                {SPRINT_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onEditSprintFormChange((p) => ({ ...p, color: c }))}
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
              <button type="button" onClick={onCloseEditSprint} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showShareModal && (
        <Modal title="Share layout" onClose={onCloseShareModal} width="max-w-sm">
          <div className="space-y-4">
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Save the current node positions and zoom level so teammates can apply the same view.
            </p>
            <div>
              <label className="label" htmlFor="canvas-snapshot-name">
                Snapshot name
              </label>
              <input
                id="canvas-snapshot-name"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- first field in a freshly-opened modal
                autoFocus
                type="text"
                value={snapshotName}
                onChange={(e) => onSnapshotNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveSnapshot();
                }}
                className="input"
                placeholder="e.g. Sub-plan 1 kickoff, QA review…"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={onSaveSnapshot}
                disabled={savingSnapshot || !snapshotName.trim()}
                className="btn-primary flex-1 flex justify-center"
              >
                {savingSnapshot ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  'Save snapshot'
                )}
              </button>
              <button onClick={onCloseShareModal} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showLoadModal && (
        <Modal title="Load layout" onClose={onCloseLoadModal} width="max-w-md">
          <div className="space-y-3">
            {totalSnapshotCount === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: 'var(--text-3)' }}>
                No saved layouts yet. Use "Share layout" to create one.
              </p>
            ) : (
              <>
                {totalSnapshotCount > 5 && (
                  <input
                    // eslint-disable-next-line jsx-a11y/no-autofocus -- search field in a freshly-opened modal
                    autoFocus
                    type="text"
                    value={snapshotSearch}
                    onChange={(e) => onSnapshotSearchChange(e.target.value)}
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
                      <div key={snap.id} className="flex items-center gap-3 px-4 py-3" style={{ background: 'var(--surface)' }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                            {snap.name}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                            {snap.user.avatarEmoji ?? '👤'} {displayName(snap.user)} · {new Date(snap.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => onApplySnapshot(snap)}
                          className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                          style={{ background: 'var(--brand)', color: 'white' }}
                          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                        >
                          Apply
                        </button>
                        {snap.userId === currentUserId && (
                          <>
                            <button
                              onClick={() => onUpdateSnapshot(snap)}
                              className="flex-shrink-0 text-xs transition-colors"
                              style={{ color: 'var(--text-3)' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand)')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                              title="Overwrite with the current layout"
                            >
                              ↻
                            </button>
                            <button
                              onClick={() => onDeleteSnapshot(snap)}
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
            <button onClick={onCloseLoadModal} className="btn-secondary w-full">
              Close
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
