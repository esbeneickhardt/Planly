/**
 * The sortable task table itself - header row, milestone-grouped or flat body, and the empty
 * state. Row rendering (including the status dropdown and long-press quick-actions sheet) lives
 * in BacklogRow/QuickTaskMenu below, also moved here since they only ever render inside this table.
 */
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useChat } from '../../context/ChatContext';
import { useLongPress } from '../../hooks/useLongPress';
import { displayName } from '../../api/client';
import type { Task } from '../../types';
import EmptyState from '../../components/common/EmptyState';
import { isBeforeToday } from '../../utils/dates';
import { STATUS_COLORS, STATUS_LABELS } from '../../utils/statusColors';
import type { SortColumn, SortDir } from '../../utils/backlogSort';
import { COLUMN_HEADERS, STATUS_TABS } from './constants';

interface MilestoneGroups {
  sections: { milestone: Task | null; children: Task[] }[];
  ungrouped: Task[];
}

interface Props {
  filteredTasks: Task[];
  sortedFilteredTasks: Task[];
  milestoneGroups: MilestoneGroups | null;
  search: string;
  readOnly: boolean;
  sortColumn: SortColumn;
  sortDir: SortDir;
  onSort: (column: SortColumn) => void;
  selected: Set<string>;
  onToggleAll: () => void;
  onToggleSelect: (id: string) => void;
  collapsedMilestones: Set<string>;
  onToggleMilestoneCollapsed: (id: string) => void;
  primaryMilestones: Map<string, Task>;
  milestoneColors: Map<string, string>;
  onOpen: (task: Task) => void;
  onMoveTodo: (task: Task) => void | Promise<void>;
  onQuickStatusChange?: (task: Task, status: string) => void | Promise<void>;
  onDelete: (task: Task) => void | Promise<void>;
  onAddFirstTask: () => void;
}

export default function BacklogTable({
  filteredTasks,
  sortedFilteredTasks,
  milestoneGroups,
  search,
  readOnly,
  sortColumn,
  sortDir,
  onSort,
  selected,
  onToggleAll,
  onToggleSelect,
  collapsedMilestones,
  onToggleMilestoneCollapsed,
  primaryMilestones,
  milestoneColors,
  onOpen,
  onMoveTodo,
  onQuickStatusChange,
  onDelete,
  onAddFirstTask,
}: Props) {
  function renderRows(taskList: Task[]) {
    return taskList.map((task) => {
      const milestone = task.deadline ? task : (primaryMilestones.get(task.id) ?? null);
      return (
        <BacklogRow
          key={task.id}
          task={task}
          selected={selected.has(task.id)}
          isOverdue={!!task.deadline && task.status !== 'done' && isBeforeToday(task.deadline)}
          readOnly={readOnly}
          milestoneName={task.deadline ? null : (primaryMilestones.get(task.id)?.name ?? null)}
          milestoneColor={milestone ? (milestoneColors.get(milestone.id) ?? null) : null}
          onToggle={() => onToggleSelect(task.id)}
          onOpen={() => onOpen(task)}
          onMoveTodo={() => onMoveTodo(task)}
          onQuickStatusChange={onQuickStatusChange ? (status) => onQuickStatusChange(task, status) : undefined}
          onDelete={() => onDelete(task)}
        />
      );
    });
  }

  if (filteredTasks.length === 0) {
    return (
      <EmptyState
        icon={search ? '🔍' : '✓'}
        description={search ? `No tasks matching "${search}"` : 'No tasks in this view'}
        className="h-48"
        action={
          !search && !readOnly ? (
            <button onClick={onAddFirstTask} className="btn-primary text-xs">
              + Add first task
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <table className="w-full min-w-[640px] text-sm border-collapse">
      <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          {!readOnly && (
            <th className="w-10 px-4 py-3">
              <input
                type="checkbox"
                checked={selected.size === filteredTasks.length && filteredTasks.length > 0}
                onChange={onToggleAll}
                style={{ accentColor: 'var(--brand)' }}
              />
            </th>
          )}
          {COLUMN_HEADERS.map(({ label, column }) => (
            <th
              key={label || 'actions'}
              className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-3)' }}
            >
              {column ? (
                <button
                  onClick={() => onSort(column)}
                  className="flex items-center gap-1 uppercase tracking-wide font-semibold"
                  style={{ color: sortColumn === column ? 'var(--text)' : 'var(--text-3)' }}
                >
                  {label}
                  <span style={{ opacity: sortColumn === column ? 1 : 0.3, fontSize: 9 }}>
                    {sortColumn === column && sortDir === 'desc' ? '▼' : '▲'}
                  </span>
                </button>
              ) : (
                label
              )}
            </th>
          ))}
        </tr>
      </thead>
      {milestoneGroups ? (
        <>
          {milestoneGroups.sections.map(({ milestone, children }) => {
            const collapsed = collapsedMilestones.has(milestone!.id);
            const doneCount = children.filter((t) => t.status === 'done').length;
            const color = milestoneColors.get(milestone!.id) ?? 'var(--text-3)';
            return (
              <tbody key={milestone!.id}>
                <tr
                  onClick={() => onToggleMilestoneCollapsed(milestone!.id)}
                  style={{
                    background: 'var(--surface-2)',
                    borderBottom: '1px solid var(--border)',
                    borderLeft: `3px solid ${color}`,
                    cursor: 'pointer',
                  }}
                >
                  <td colSpan={readOnly ? 8 : 9} className="px-4 py-2">
                    <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                      <span style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.1s' }}>
                        ▾
                      </span>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span>{milestone!.name}</span>
                      <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>
                        {doneCount}/{children.length} done
                      </span>
                    </div>
                  </td>
                </tr>
                {!collapsed && renderRows(children)}
              </tbody>
            );
          })}
          {milestoneGroups.ungrouped.length > 0 && (
            <tbody>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                <td colSpan={readOnly ? 8 : 9} className="px-4 py-2 text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                  Ungrouped
                </td>
              </tr>
              {renderRows(milestoneGroups.ungrouped)}
            </tbody>
          )}
        </>
      ) : (
        <tbody>{renderRows(sortedFilteredTasks)}</tbody>
      )}
    </table>
  );
}

/** Small "quick actions" menu - long-press a task name to open this instead of jumping straight
 * to its chat: pick "Open chat" or change status without opening the full detail panel.
 *
 * A bottom sheet, not a popover anchored to the row (`absolute ... top-full`, as this used to
 * be) - anchoring to the row broke for any task low on screen, since the popover had nowhere to
 * open without running past the bottom edge. Fixed to the viewport bottom instead, mirroring the
 * identical long-press pattern used for mobile Kanban cards (`KanbanMobileList.tsx`'s
 * `QuickStatusMenu`) - same slide-up-on-open animation and swipe-down-to-dismiss, so both feel
 * like the same gesture across the app. */
function QuickTaskMenu({
  current,
  onSelect,
  onOpenChat,
  onClose,
}: {
  current: string;
  onSelect?: (status: string) => void;
  onOpenChat: () => void;
  onClose: () => void;
}) {
  // Mounts already translated off-screen, then flips to translateY(0) one frame later so the
  // transition actually animates a slide-up instead of just appearing in place.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Swipe-down-to-dismiss, mirroring KanbanMobileList.tsx's own quick-actions sheet.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<number | null>(null);
  const DISMISS_THRESHOLD = 80;
  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    dragStartRef.current = t.clientY;
    setDragging(true);
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (dragStartRef.current === null) return;
    const t = e.touches[0];
    if (!t) return;
    setDragY(Math.max(0, t.clientY - dragStartRef.current));
  }
  function handleTouchEnd() {
    if (dragStartRef.current === null) return;
    dragStartRef.current = null;
    setDragging(false);
    if (dragY > DISMISS_THRESHOLD) onClose();
    setDragY(0);
  }

  return (
    <>
      <button
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        aria-label="Close quick actions menu"
        onClick={onClose}
      />
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- onClick is a stopPropagation-only guard against the backdrop button's onClick={onClose}; onTouch* handlers are swipe-to-dismiss */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className="fixed left-0 right-0 bottom-0 z-50 rounded-t-2xl shadow-2xl overflow-hidden"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderBottom: 'none',
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
          transform: visible ? `translateY(${dragY}px)` : 'translateY(100%)',
          transition: dragging ? 'none' : 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)',
          touchAction: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2 pb-1" aria-hidden="true">
          <div className="w-9 h-1 rounded-full" style={{ background: 'var(--border-2)' }} />
        </div>
        <button
          onClick={onOpenChat}
          className="w-full flex items-center gap-2 px-4 py-3 text-sm text-left transition-colors"
          style={{ color: 'var(--text)', borderBottom: onSelect ? '1px solid var(--border)' : 'none' }}
        >
          <span className="flex-shrink-0">💬</span>
          <span className="flex-1">Open chat</span>
        </button>
        {onSelect &&
          STATUS_TABS.filter((t) => t.key !== 'all').map((t) => (
            <button
              key={t.key}
              onClick={() => onSelect(t.key)}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-left transition-colors"
              style={{
                color: t.key === current ? t.color : 'var(--text)',
                background: t.key === current ? `${t.color}14` : 'transparent',
                fontWeight: t.key === current ? 600 : 400,
              }}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color }} />
              <span className="flex-1">{t.label}</span>
              {t.key === current && <span>✓</span>}
            </button>
          ))}
      </div>
    </>
  );
}

export function BacklogRow({
  task,
  selected,
  isOverdue,
  milestoneName,
  milestoneColor,
  onToggle,
  onOpen,
  onMoveTodo,
  onQuickStatusChange,
  onDelete,
  readOnly,
}: {
  task: Task;
  selected: boolean;
  isOverdue: boolean;
  /** Name of the milestone this task feeds into; null for milestone tasks themselves or unlinked tasks */
  milestoneName: string | null;
  /** This task's own color if it's a milestone, or the color of the milestone it feeds into */
  milestoneColor: string | null;
  readOnly?: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onMoveTodo: () => void;
  onQuickStatusChange?: (status: string) => void;
  onDelete: () => void;
}) {
  const isMilestone = !!task.deadline;
  const done = task.subtasks.filter((s) => s.completed).length;
  const statusColor = STATUS_COLORS[task.status] ?? '#64748b';
  const { openChat } = useChat();
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const longPress = useLongPress(() => setShowQuickMenu(true));

  // Desktop-friendly status dropdown on the Status cell itself - the long-press bottom sheet above
  // (on the task name) covers mobile, but a long-press isn't a natural desktop/mouse gesture, and
  // opening the full TaskDetailPanel just to flip a status was overkill for the common case.
  // `position: fixed`, measured from the trigger button's own on-screen position (same pattern as
  // MessageBubble's reaction picker), rather than `position: absolute` anchored to the row - this
  // table can be long enough that a row near the bottom would otherwise have its dropdown clipped
  // by the scroll container instead of just opening upward.
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const statusBtnRef = useRef<HTMLButtonElement>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const [statusMenuStyle, setStatusMenuStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });
  useLayoutEffect(() => {
    if (!showStatusMenu) return;
    const btn = statusBtnRef.current;
    if (!btn) return;
    const btnRect = btn.getBoundingClientRect();
    const menuRect = statusMenuRef.current?.getBoundingClientRect();
    const menuHeight = menuRect?.height ?? 220;
    const menuWidth = menuRect?.width ?? 170;
    const margin = 4;
    let top = btnRect.bottom + margin;
    if (top + menuHeight > window.innerHeight - margin) {
      top = Math.max(margin, btnRect.top - menuHeight - margin);
    }
    const left = Math.max(margin, Math.min(btnRect.left, window.innerWidth - menuWidth - margin));
    setStatusMenuStyle({ position: 'fixed', top, left, zIndex: 50 });
  }, [showStatusMenu]);
  useEffect(() => {
    if (!showStatusMenu) return;
    function onDown(e: MouseEvent) {
      if (
        statusMenuRef.current &&
        !statusMenuRef.current.contains(e.target as Node) &&
        statusBtnRef.current &&
        !statusBtnRef.current.contains(e.target as Node)
      ) {
        setShowStatusMenu(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showStatusMenu]);

  return (
    <tr
      style={{
        borderBottom: '1px solid var(--border)',
        background: selected ? 'var(--brand-subtle)' : 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = 'var(--surface-2)';
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent';
      }}
    >
      {!readOnly && (
        <td className="px-4 py-3 w-10">
          <input type="checkbox" checked={selected} onChange={onToggle} style={{ accentColor: 'var(--brand)' }} />
        </td>
      )}
      <td className="px-4 py-3">
        <div className="relative flex items-center gap-2">
          {isMilestone ? (
            <span title="Milestone">⭐</span>
          ) : (
            task.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: task.color }} />
          )}
          <button
            onClick={onOpen}
            className="font-medium text-left hover:underline whitespace-nowrap"
            style={{ color: 'var(--text)' }}
            title="Long-press for quick actions (chat, change status)"
            {...longPress}
          >
            {task.name}
          </button>
          {showQuickMenu && (
            <QuickTaskMenu
              current={task.status}
              onClose={() => setShowQuickMenu(false)}
              onOpenChat={() => {
                openChat(task.id, task.name);
                setShowQuickMenu(false);
              }}
              onSelect={
                onQuickStatusChange
                  ? (status) => {
                      onQuickStatusChange(status);
                      setShowQuickMenu(false);
                    }
                  : undefined
              }
            />
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        {onQuickStatusChange ? (
          <>
            <button
              ref={statusBtnRef}
              onClick={() => setShowStatusMenu((v) => !v)}
              className="flex items-center gap-1.5 text-xs whitespace-nowrap px-2 py-1 -mx-2 -my-1 rounded-lg transition-colors"
              style={{ color: 'var(--text-2)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColor }} />
              <span>{STATUS_LABELS[task.status] ?? task.status}</span>
              <span className="text-[9px]" style={{ color: 'var(--text-3)' }}>
                ▾
              </span>
            </button>
            {showStatusMenu && (
              <div
                ref={statusMenuRef}
                className="rounded-xl shadow-xl overflow-hidden animate-dropdown-in"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 170, ...statusMenuStyle }}
              >
                {STATUS_TABS.filter((t) => t.key !== 'all').map((t) => (
                  <button
                    key={t.key}
                    onClick={() => {
                      onQuickStatusChange(t.key);
                      setShowStatusMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors"
                    style={{
                      color: t.key === task.status ? t.color : 'var(--text)',
                      background: t.key === task.status ? `${t.color}14` : 'transparent',
                      fontWeight: t.key === task.status ? 600 : 400,
                    }}
                    onMouseEnter={(e) => {
                      if (t.key !== task.status) e.currentTarget.style.background = 'var(--surface-2)';
                    }}
                    onMouseLeave={(e) => {
                      if (t.key !== task.status) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color }} />
                    <span className="flex-1">{t.label}</span>
                    {t.key === task.status && <span>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-xs whitespace-nowrap">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColor }} />
            <span style={{ color: 'var(--text-2)' }}>{STATUS_LABELS[task.status] ?? task.status}</span>
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {task.owner ? (
          <span className="flex items-center gap-1.5 text-xs whitespace-nowrap" style={{ color: 'var(--text-2)' }}>
            <span>{task.owner.avatarEmoji ?? '👤'}</span>
            <span>{displayName(task.owner)}</span>
          </span>
        ) : (
          <span
            className="text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}
          >
            Unassigned
          </span>
        )}
      </td>
      <td
        className="px-4 py-3 text-xs truncate max-w-[180px]"
        style={{ color: 'var(--text-3)' }}
        title={milestoneName ?? undefined}
      >
        {milestoneName ? (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: milestoneColor ?? 'var(--text-3)' }} />
            {milestoneName}
          </span>
        ) : (
          '-'
        )}
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-3)' }}>
        {task.subtasks.length > 0 ? `${done}/${task.subtasks.length}` : '-'}
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: isOverdue ? '#ef4444' : 'var(--text-3)' }}>
        {task.deadline ? (
          <span className="flex items-center gap-1">
            {isOverdue && <span>⏰</span>}
            {new Date(task.deadline).toLocaleDateString()}
          </span>
        ) : (
          '-'
        )}
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-3)' }}>
        {new Date(task.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 justify-end">
          {/* Only for genuinely "Not started" (backlog) tasks - this used to fire for anything
              that wasn't literally 'todo' or 'done', which wrongly suggested moving already
              in-progress or blocked tasks backward to To Do. */}
          {!readOnly && task.status === 'backlog' && (
            <button
              onClick={onMoveTodo}
              className="text-xs font-medium whitespace-nowrap transition-colors"
              style={{ color: 'var(--brand)' }}
            >
              {task.ownerId ? 'Move to To Do →' : 'Assign owner'}
            </button>
          )}
          {!readOnly && (
            <button
              onClick={onDelete}
              className="text-xs transition-colors"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
            >
              Delete
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
