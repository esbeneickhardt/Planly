/**
 * The three standalone modals KanbanBoard opens outside the board area itself: quick "new task"
 * and "add column" forms, and the delete-column confirmation. Bundled into one file (rather than
 * three) since they're small, share no state with each other, and are only ever rendered from
 * KanbanBoard - all form/open/close state stays in the parent, this is presentation-only.
 */
import type { KanbanColumn as KanbanColumnType } from '../../types';
import Modal from '../common/Modal';

interface Props {
  showNewTask: boolean;
  onCloseNewTask: () => void;
  newTaskName: string;
  onNewTaskNameChange: (name: string) => void;
  onSubmitNewTask: (e: React.FormEvent) => void;
  creatingTask: boolean;

  showNewColumn: boolean;
  onCloseNewColumn: () => void;
  newColLabel: string;
  onNewColLabelChange: (label: string) => void;
  onSubmitNewColumn: (e: React.FormEvent) => void;
  creatingColumn: boolean;

  pendingDeleteCol: KanbanColumnType | null;
  onCancelDeleteColumn: () => void;
  onConfirmDeleteColumn: () => void;
  pendingTaskCount: number;
  deletingColumn: boolean;
}

export default function KanbanModals({
  showNewTask,
  onCloseNewTask,
  newTaskName,
  onNewTaskNameChange,
  onSubmitNewTask,
  creatingTask,
  showNewColumn,
  onCloseNewColumn,
  newColLabel,
  onNewColLabelChange,
  onSubmitNewColumn,
  creatingColumn,
  pendingDeleteCol,
  onCancelDeleteColumn,
  onConfirmDeleteColumn,
  pendingTaskCount,
  deletingColumn,
}: Props) {
  return (
    <>
      {/* New task modal */}
      {showNewTask && (
        <Modal title="New task" onClose={onCloseNewTask} width="max-w-sm">
          <form onSubmit={onSubmitNewTask} className="space-y-4">
            <div>
              <label className="label" htmlFor="kanban-new-task-name">
                Task name
              </label>
              <input
                id="kanban-new-task-name"
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

      {/* New column modal */}
      {showNewColumn && (
        <Modal title="Add column" onClose={onCloseNewColumn} width="max-w-sm">
          <form onSubmit={onSubmitNewColumn} className="space-y-4">
            <div>
              <label className="label" htmlFor="kanban-new-column-name">
                Column name
              </label>
              <input
                id="kanban-new-column-name"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- first field in a freshly-opened modal
                autoFocus
                required
                type="text"
                value={newColLabel}
                onChange={(e) => onNewColLabelChange(e.target.value)}
                className="input"
                placeholder="e.g. Review, Testing…"
              />
            </div>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Added before the completion column. Tasks can be dragged into it.
            </p>
            <div className="flex gap-3">
              <button type="submit" disabled={creatingColumn} className="btn-primary flex-1 flex justify-center">
                {creatingColumn ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  'Add column'
                )}
              </button>
              <button type="button" onClick={onCloseNewColumn} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete column confirmation modal */}
      {pendingDeleteCol && (
        <Modal title="Delete column" onClose={onCancelDeleteColumn} width="max-w-sm">
          <div className="space-y-4">
            <div
              className="flex items-center gap-3 p-3 rounded-lg"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <span className="text-lg">⚠️</span>
              <p className="text-sm" style={{ color: 'var(--text)' }}>
                Delete <strong>"{pendingDeleteCol.label}"</strong>?
                {pendingTaskCount > 0
                  ? ` ${pendingTaskCount} task${pendingTaskCount !== 1 ? 's' : ''} will be moved to To Do.`
                  : ' The column is empty.'}
              </p>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onConfirmDeleteColumn}
                disabled={deletingColumn}
                className="flex-1 py-2 rounded-lg text-sm font-medium flex justify-center transition-colors"
                style={{ background: '#ef4444', color: 'white' }}
              >
                {deletingColumn ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  'Delete column'
                )}
              </button>
              <button type="button" onClick={onCancelDeleteColumn} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
