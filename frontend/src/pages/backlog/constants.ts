/**
 * Constants shared between BacklogPage.tsx (Filters popover, sort-column persistence) and
 * BacklogTable.tsx (column headers, row status dropdown, QuickTaskMenu) - kept here rather than
 * in either file so neither has to import from the other for a plain constant.
 */
import { STATUS_COLORS, STATUS_LABELS } from '../../utils/statusColors';
import type { StatusTab } from '../../hooks/useBacklogFilters';
import type { SortColumn } from '../../utils/backlogSort';

export const SORT_COLUMNS: SortColumn[] = ['name', 'status', 'owner', 'milestone', 'deadline', 'created'];

// Column headers, in table order. `column` is omitted for headers that aren't sortable.
export const COLUMN_HEADERS: { label: string; column?: SortColumn }[] = [
  { label: 'Task', column: 'name' },
  { label: 'Status', column: 'status' },
  { label: 'Owner', column: 'owner' },
  { label: 'Milestone', column: 'milestone' },
  { label: 'Subtasks' },
  { label: 'Deadline', column: 'deadline' },
  { label: 'Created', column: 'created' },
  { label: '' },
];

export const STATUS_TABS: { key: StatusTab; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: 'var(--text-3)' },
  {
    key: 'backlog',
    label: STATUS_LABELS.backlog!,
    color: STATUS_COLORS.backlog!,
  },
  { key: 'todo', label: STATUS_LABELS.todo!, color: STATUS_COLORS.todo! },
  {
    key: 'in_progress',
    label: STATUS_LABELS.in_progress!,
    color: STATUS_COLORS.in_progress!,
  },
  {
    key: 'blocked',
    label: STATUS_LABELS.blocked!,
    color: STATUS_COLORS.blocked!,
  },
  { key: 'done', label: STATUS_LABELS.done!, color: STATUS_COLORS.done! },
];
