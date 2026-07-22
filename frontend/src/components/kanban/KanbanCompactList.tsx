/**
 * Compact sortable table view for the Kanban board, shown when the user picks "Compact" mode.
 * Each row lets the owner change the task's status without opening the detail panel.
 */
import type { Task, KanbanColumn } from '../../types';
import { displayName } from '../../api/client';

type User = { id: string; username: string; avatarEmoji?: string | null; realName?: string | null };
type SortKey = 'name' | 'status' | 'owner' | 'deadline';
type SortDir = 1 | -1;

interface Props {
  tasks: Task[];
  columns: KanbanColumn[];
  users: User[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSortChange: (key: SortKey) => void;
  readOnly: boolean;
  updatingStatus: string | null;
  onStatusChange: (taskId: string, newStatus: string) => void;
  onOpenDetail: (task: Task) => void;
}

/** Sortable column header button. */
function SortHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 text-left"
      style={{ color: active ? 'var(--brand)' : 'var(--text-3)', fontWeight: active ? 600 : 400 }}
    >
      {label}
      <span className="text-[10px]">{active ? (dir === 1 ? '▲' : '▼') : '⇅'}</span>
    </button>
  );
}

export default function KanbanCompactList({
  tasks,
  columns,
  users,
  sortKey,
  sortDir,
  onSortChange,
  readOnly,
  updatingStatus,
  onStatusChange,
  onOpenDetail,
}: Props) {
  const colOrder = Object.fromEntries(columns.map((c, i) => [c.statusKey, i]));

  const sorted = [...tasks].sort((a, b) => {
    if (sortKey === 'status') {
      const diff = (colOrder[a.status] ?? 99) - (colOrder[b.status] ?? 99);
      return diff * sortDir;
    }
    if (sortKey === 'name') return a.name.localeCompare(b.name) * sortDir;
    if (sortKey === 'owner') {
      const an = users.find((u) => u.id === a.ownerId) ? displayName(users.find((u) => u.id === a.ownerId)!) : '';
      const bn = users.find((u) => u.id === b.ownerId) ? displayName(users.find((u) => u.id === b.ownerId)!) : '';
      return an.localeCompare(bn) * sortDir;
    }
    if (sortKey === 'deadline') {
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return (new Date(a.deadline).getTime() - new Date(b.deadline).getTime()) * sortDir;
    }
    return 0;
  });

  return (
    <div className="flex-1 overflow-auto px-6 pb-6">
      <table className="w-full text-sm border-separate" style={{ borderSpacing: '0 2px' }}>
        <thead>
          <tr className="text-xs" style={{ color: 'var(--text-3)' }}>
            <th className="text-left px-3 py-2 w-36">
              <SortHeader
                label="Status"
                sortKey="status"
                active={sortKey === 'status'}
                dir={sortDir}
                onSort={onSortChange}
              />
            </th>
            <th className="text-left px-3 py-2">
              <SortHeader label="Task" sortKey="name" active={sortKey === 'name'} dir={sortDir} onSort={onSortChange} />
            </th>
            <th className="text-left px-3 py-2 w-32">
              <SortHeader
                label="Owner"
                sortKey="owner"
                active={sortKey === 'owner'}
                dir={sortDir}
                onSort={onSortChange}
              />
            </th>
            <th className="text-left px-3 py-2 w-28">
              <SortHeader
                label="Deadline"
                sortKey="deadline"
                active={sortKey === 'deadline'}
                dir={sortDir}
                onSort={onSortChange}
              />
            </th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((task) => {
            const col = columns.find((c) => c.statusKey === task.status);
            const owner = users.find((u) => u.id === task.ownerId);
            const isOverdue = task.deadline && new Date(task.deadline) < new Date() && !col?.isDone;
            return (
              <tr
                key={task.id}
                onClick={() => onOpenDetail(task)}
                className="group cursor-pointer rounded-xl bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors"
              >
                {/* Status */}
                <td className="px-3 py-2 rounded-l-xl" onClick={(e) => e.stopPropagation()}>
                  {readOnly ? (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: `${col?.color ?? '#64748b'}20`, color: col?.color ?? '#64748b' }}
                    >
                      {col?.label ?? task.status}
                    </span>
                  ) : (
                    <select
                      value={task.status}
                      onChange={(e) => onStatusChange(task.id, e.target.value)}
                      disabled={updatingStatus === task.id}
                      className="text-xs px-2 py-0.5 rounded-full font-medium border-0 outline-none cursor-pointer"
                      style={{
                        background: `${col?.color ?? '#64748b'}20`,
                        color: col?.color ?? '#64748b',
                        opacity: updatingStatus === task.id ? 0.6 : 1,
                      }}
                    >
                      {columns.map((c) => (
                        <option key={c.statusKey} value={c.statusKey}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                {/* Name */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {task.color && (
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: task.color }} />
                    )}
                    <span
                      className="font-medium truncate max-w-xs"
                      style={{
                        color: 'var(--text)',
                        textDecoration: col?.isDone ? 'line-through' : 'none',
                        opacity: col?.isDone ? 0.6 : 1,
                      }}
                    >
                      {task.name}
                    </span>
                    {(task.subtasks?.length ?? 0) > 0 && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
                      >
                        {task.subtasks!.filter((s) => s.completed).length}/{task.subtasks!.length}
                      </span>
                    )}
                  </div>
                </td>
                {/* Owner */}
                <td className="px-3 py-2">
                  {owner ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{owner.avatarEmoji ?? '👤'}</span>
                      <span className="text-xs truncate" style={{ color: 'var(--text-2)' }}>
                        {displayName(owner)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--text-3)', opacity: 0.5 }}>
                      -
                    </span>
                  )}
                </td>
                {/* Deadline */}
                <td className="px-3 py-2">
                  {task.deadline ? (
                    <span className="text-xs" style={{ color: isOverdue ? '#ef4444' : 'var(--text-3)' }}>
                      {isOverdue && '⚠ '}
                      {new Date(task.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--text-3)', opacity: 0.5 }}>
                      -
                    </span>
                  )}
                </td>
                {/* Arrow */}
                <td className="px-2 py-2 rounded-r-xl">
                  <span
                    className="text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--text-3)' }}
                  >
                    ›
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="text-center py-16 text-sm" style={{ color: 'var(--text-3)' }}>
          No tasks match the current filters
        </div>
      )}
    </div>
  );
}
