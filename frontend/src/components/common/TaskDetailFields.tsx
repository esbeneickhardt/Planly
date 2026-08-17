/**
 * The task-editing form fields shared by all three TaskDetailPanel layouts (fullscreen,
 * sidebar-docked, floating): name, description, status/owner/reviewer, sub-plan membership,
 * deadline, milestone, color tag, subtasks, and the GitHub-link/completed-at/error footnotes.
 * Purely controlled - every value and mutation comes in as a prop. `isDirty` comparison and the
 * actual save/autosave-on-close call stay in TaskDetailPanel, which is the only place that knows
 * what "the saved task" looked like; this component never reads or writes localStorage/the API.
 * `variant` picks between the fullscreen two-column layout (name+description scroll independently
 * from the metadata column, per TaskDetailPanel's mobile-single-scroll-region comment) and the
 * single-column stack used by the sidebar/floating layouts - lifted verbatim from the two call
 * sites, including the pre-existing asymmetry that the fullscreen name field (unlike the panel
 * one) isn't given a `disabled` prop when `readOnly`.
 */
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { Subtask, Task, User } from '../../types';
import type { Sprint } from '../../api/client';
import { displayName } from '../../api/client';
import MarkdownEditor, { type MarkdownEditorHandle } from './MarkdownEditor';

type Member = Pick<User, 'id' | 'username' | 'realName' | 'avatarEmoji'>;

interface StatusOption {
  statusKey: string;
  label: string;
  color: string;
}

interface Props {
  variant: 'fullscreen' | 'panel';
  readOnly: boolean;
  descEditorRef: RefObject<MarkdownEditorHandle>;

  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;

  status: string;
  setStatus: (v: string) => void;
  statusOptions: StatusOption[];

  ownerId: string;
  setOwnerId: (v: string) => void;
  reviewerId: string;
  setReviewerId: (v: string) => void;
  users: Member[];

  sprints: Sprint[];
  sprintIds: Set<string>;
  setSprintIds: Dispatch<SetStateAction<Set<string>>>;

  deadline: string;
  setDeadline: (v: string) => void;

  milestoneId: string;
  setMilestoneId: (v: string) => void;
  canEditMilestone: boolean;
  tasks: Task[];
  taskId: string;

  color: string;
  setColor: (v: string) => void;
  legend: Record<string, string>;
  enabledColors: string[];

  subtasks: Subtask[];
  addingSubtask: boolean;
  setAddingSubtask: (v: boolean) => void;
  newSubtaskName: string;
  setNewSubtaskName: (v: string) => void;
  subtaskLoading: string | null;
  onToggleSubtask: (s: Subtask) => void;
  onAddSubtask: () => void;
  onDeleteSubtask: (s: Subtask) => void;

  githubUrl?: string;
  completedAt?: string;
  error: string;
}

export default function TaskDetailFields({
  variant,
  readOnly,
  descEditorRef,
  name,
  setName,
  description,
  setDescription,
  status,
  setStatus,
  statusOptions,
  ownerId,
  setOwnerId,
  reviewerId,
  setReviewerId,
  users,
  sprints,
  sprintIds,
  setSprintIds,
  deadline,
  setDeadline,
  milestoneId,
  setMilestoneId,
  canEditMilestone,
  tasks,
  taskId,
  color,
  setColor,
  legend,
  enabledColors,
  subtasks,
  addingSubtask,
  setAddingSubtask,
  newSubtaskName,
  setNewSubtaskName,
  subtaskLoading,
  onToggleSubtask,
  onAddSubtask,
  onDeleteSubtask,
  githubUrl,
  completedAt,
  error,
}: Props) {
  const descField = (rows: number) => (
    <div>
      {/* Not a real label - MarkdownEditor is a custom multi-control component (toolbar, textarea,
          preview toggle), not a single control htmlFor could target */}
      <span className="label mb-1">Description</span>
      <MarkdownEditor
        ref={descEditorRef}
        value={description}
        onChange={setDescription}
        rows={rows}
        placeholder="Supports Markdown. Paste or drag images to upload."
        disabled={readOnly}
        initialPreview
      />
    </div>
  );

  const metaFields = (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="task-detail-status">
            Status
          </label>
          <select
            id="task-detail-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="input"
            disabled={readOnly}
          >
            {statusOptions.map((o) => (
              <option key={o.statusKey} value={o.statusKey}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="task-detail-owner">
            Owner
          </label>
          <select
            id="task-detail-owner"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="input"
            disabled={readOnly}
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.avatarEmoji ? `${u.avatarEmoji} ` : ''}
                {displayName(u)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="task-detail-reviewer">
            Reviewer
          </label>
          <select
            id="task-detail-reviewer"
            value={reviewerId}
            onChange={(e) => setReviewerId(e.target.value)}
            className="input"
            disabled={readOnly}
          >
            <option value="">None</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.avatarEmoji ? `${u.avatarEmoji} ` : ''}
                {displayName(u)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {sprints.length > 0 && (
        <div>
          {/* Not a real label - it's a heading for the sub-plan toggle group below, no single associated control */}
          <span className="label">Sub-plan</span>
          <div className="flex flex-wrap gap-2">
            {sprints.map((s) => {
              const active = sprintIds.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={readOnly}
                  onClick={() =>
                    setSprintIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(s.id)) next.delete(s.id);
                      else next.add(s.id);
                      return next;
                    })
                  }
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: active ? `${s.color}22` : 'var(--surface-2)',
                    color: active ? s.color : 'var(--text-2)',
                    border: `1px solid ${active ? s.color : 'var(--border)'}`,
                    opacity: readOnly ? 0.6 : 1,
                    cursor: readOnly ? 'default' : 'pointer',
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  {s.name}
                  {active && <span style={{ fontSize: 10 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label className="label" htmlFor="task-detail-deadline">
          Deadline{' '}
          <span className="normal-case font-normal" style={{ color: 'var(--text-3)' }}>
            (makes this a Milestone)
          </span>
        </label>
        <input
          id="task-detail-deadline"
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="input"
          disabled={readOnly}
        />
      </div>

      <div>
        <label className="label" htmlFor="task-detail-milestone">
          Feeds into milestone{' '}
          {!readOnly && !canEditMilestone && (
            <span className="normal-case font-normal" style={{ color: 'var(--text-3)' }}>
              (requires Canvas access to change)
            </span>
          )}
        </label>
        <select
          id="task-detail-milestone"
          value={milestoneId}
          onChange={(e) => setMilestoneId(e.target.value)}
          className="input"
          disabled={readOnly || !canEditMilestone}
        >
          <option value="">None</option>
          {tasks
            .filter((t) => !!t.deadline && t.id !== taskId)
            .sort((a, b) => a.milestoneOrder - b.milestoneOrder || a.name.localeCompare(b.name))
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
      </div>

      <div>
        {/* Not a real label - it's a heading for the color swatch grid below, no single associated control */}
        <span className="label">Color tag</span>
        <div className="flex items-center gap-2 flex-wrap">
          {enabledColors.map((c) => (
            <button
              key={c}
              onClick={() => !readOnly && setColor(color === c ? '' : c)}
              title={legend[c] || c}
              className="w-6 h-6 rounded-full transition-transform relative group"
              style={{
                background: c,
                transform: color === c ? 'scale(1.25)' : 'scale(1)',
                boxShadow: color === c ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}` : 'none',
                cursor: readOnly ? 'default' : 'pointer',
              }}
            >
              {legend[c] && (
                <span
                  className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  style={{ background: 'var(--text)', color: 'var(--bg)' }}
                >
                  {legend[c]}
                </span>
              )}
            </button>
          ))}
          {color && !enabledColors.includes(color) && (
            <button
              onClick={() => !readOnly && setColor('')}
              title={legend[color] || color}
              className="w-6 h-6 rounded-full transition-transform relative group"
              style={{
                background: color,
                transform: 'scale(1.25)',
                boxShadow: `0 0 0 2px var(--surface), 0 0 0 4px ${color}`,
                cursor: readOnly ? 'default' : 'pointer',
              }}
            >
              {legend[color] && (
                <span
                  className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  style={{ background: 'var(--text)', color: 'var(--bg)' }}
                >
                  {legend[color]}
                </span>
              )}
            </button>
          )}
          {!readOnly && (
            <button
              onClick={() => setColor('')}
              className="text-xs px-2 py-1 rounded"
              style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          {/* Not a real label - it's a section heading for the subtask list below, no single associated control */}
          <span className="label mb-0">Subtasks</span>
          {subtasks.length > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>
              {subtasks.filter((s) => s.completed).length}/{subtasks.length} done
            </span>
          )}
        </div>
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {subtasks.length === 0 && !addingSubtask ? (
            <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-3)' }}>
              No subtasks yet
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {subtasks.map((s) => (
                <div key={s.id} className="flex items-center gap-2.5 px-3 py-2 group">
                  <input
                    type="checkbox"
                    checked={s.completed}
                    disabled={readOnly || subtaskLoading === s.id}
                    onChange={() => onToggleSubtask(s)}
                    className="rounded flex-shrink-0"
                    style={{ accentColor: 'var(--brand)' }}
                  />
                  <span
                    className="flex-1 text-sm"
                    style={{
                      color: s.completed ? 'var(--text-3)' : 'var(--text-2)',
                      textDecoration: s.completed ? 'line-through' : 'none',
                    }}
                  >
                    {s.name}
                  </span>
                  {!readOnly && (
                    <button
                      onClick={() => onDeleteSubtask(s)}
                      className="opacity-0 group-hover:opacity-100 text-xs transition-all text-[var(--text-3)] hover:text-[#ef4444]"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {!readOnly &&
            (addingSubtask ? (
              <div
                className="flex gap-1.5 px-3 py-2"
                style={{ borderTop: subtasks.length > 0 ? '1px solid var(--border)' : 'none' }}
              >
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- field just revealed by clicking "+ Add subtask"; focusing it is the expected next action
                  autoFocus
                  type="text"
                  value={newSubtaskName}
                  onChange={(e) => setNewSubtaskName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onAddSubtask();
                    if (e.key === 'Escape') {
                      setAddingSubtask(false);
                      setNewSubtaskName('');
                    }
                  }}
                  placeholder="Subtask name…"
                  className="input text-sm py-1 flex-1"
                />
                <button onClick={onAddSubtask} className="text-xs font-medium px-2" style={{ color: 'var(--brand)' }}>
                  Add
                </button>
                <button
                  onClick={() => {
                    setAddingSubtask(false);
                    setNewSubtaskName('');
                  }}
                  className="text-xs"
                  style={{ color: 'var(--text-3)' }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingSubtask(true)}
                className="w-full text-left px-3 py-2 text-xs transition-colors text-[var(--text-3)] hover:text-[var(--brand)]"
                style={{ borderTop: subtasks.length > 0 ? '1px solid var(--border)' : 'none' }}
              >
                + Add subtask
              </button>
            ))}
        </div>
      </div>

      {githubUrl && (
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs transition-colors"
          style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand)';
            (e.currentTarget as HTMLElement).style.color = 'var(--brand)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
            (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          View on GitHub ↗
        </a>
      )}

      {completedAt && (
        <div
          className="text-xs px-3 py-2.5 rounded-lg"
          style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}
        >
          Completed {new Date(completedAt).toLocaleString()}
        </div>
      )}
      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>
      )}
    </div>
  );

  if (variant === 'fullscreen') {
    return (
      // Below md, this whole area is ONE scroll region (name+description then metadata stacked in
      // normal document flow) rather than two independently-scrolling columns - nesting two
      // separate overflow-y-auto panes inside a non-scrolling flex-col parent left no way to reach
      // content past the first pane's own height on a phone. At md+ it goes back to two side-by-side
      // columns that each scroll independently.
      <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
        {/* Left: name + description */}
        <div className="flex-1 md:overflow-y-auto px-4 py-4 md:px-8 md:py-6 space-y-5">
          <div>
            <label className="label" htmlFor="task-detail-name-fs">
              Name
            </label>
            <input
              id="task-detail-name-fs"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input font-medium text-base"
            />
          </div>
          {descField(18)}
        </div>
        {/* Right: metadata - stacks below the name/description on narrow screens instead of
            sitting in a fixed 320px column next to it, which left almost no room for the
            left side on a phone even once fullscreen mode kicked in. */}
        <div className="md:w-80 flex-shrink-0 md:overflow-y-auto px-4 py-4 md:px-6 md:py-6 border-t md:border-t-0 md:border-l border-[var(--border)]">
          {metaFields}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
      <div>
        <label className="label" htmlFor="task-detail-name">
          Name
        </label>
        <input
          id="task-detail-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input font-medium"
          disabled={readOnly}
        />
      </div>
      {descField(4)}
      {metaFields}
    </div>
  );
}
