/**
 * Unit tests for the KanbanMobileList component.
 * Covers: column grouping, task card rendering, ARIA attributes,
 * overdue state, "no tasks" placeholder, and detail-open callback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import KanbanMobileList from '../../components/kanban/KanbanMobileList';
import type { Task, KanbanColumn } from '../../types';

vi.mock('../../api/client', () => ({
  displayName: (u: { username: string; realName?: string | null }) => u.realName ?? u.username,
}));

// ── Minimal factories ────────────────────────────────────────────────────────

function makeColumn(overrides: Partial<KanbanColumn> = {}): KanbanColumn {
  return {
    id: 'col-1',
    productId: 'prod-1',
    label: 'To Do',
    statusKey: 'todo',
    color: '#3b82f6',
    position: 0,
    isDone: false,
    ...overrides,
  } as KanbanColumn;
}

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: `Task ${id}`,
    status: 'todo',
    productId: 'prod-1',
    description: null,
    assigneeId: null,
    ownerId: null,
    deadline: null,
    color: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    canvasX: null,
    canvasY: null,
    kanbanOrder: 0,
    columnPosition: 0,
    dependsOn: [],
    assignee: null,
    subtasks: [],
    ...overrides,
  } as unknown as Task;
}

const USERS = [{ id: 'u1', username: 'alice', avatarEmoji: '😀', realName: 'Alice' }];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('KanbanMobileList', () => {
  const onOpenDetail = vi.fn();

  beforeEach(() => onOpenDetail.mockClear());

  it('renders a section heading for each column', () => {
    const columns = [makeColumn(), makeColumn({ id: 'col-2', label: 'Done', statusKey: 'done', isDone: true })];
    render(<KanbanMobileList columns={columns} tasks={[]} users={[]} onOpenDetail={onOpenDetail} />);
    expect(screen.getByText('To Do')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('groups tasks into the correct column', () => {
    const columns = [makeColumn(), makeColumn({ id: 'col-2', label: 'Done', statusKey: 'done', isDone: true })];
    const tasks = [makeTask('t1', { status: 'todo' }), makeTask('t2', { status: 'done' })];
    render(<KanbanMobileList columns={columns} tasks={tasks} users={[]} onOpenDetail={onOpenDetail} />);
    // Each column shows its task count; both have 1 task so two count spans appear
    const counts = screen.getAllByText('1', { selector: 'span' });
    expect(counts).toHaveLength(2);
  });

  it('renders the task name inside a button', () => {
    render(
      <KanbanMobileList
        columns={[makeColumn()]}
        tasks={[makeTask('t1', { name: 'Fix login bug' })]}
        users={[]}
        onOpenDetail={onOpenDetail}
      />,
    );
    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
  });

  it('calls onOpenDetail with the task when a card is clicked', () => {
    const task = makeTask('t1', { name: 'Click me' });
    render(<KanbanMobileList columns={[makeColumn()]} tasks={[task]} users={[]} onOpenDetail={onOpenDetail} />);
    fireEvent.click(screen.getByText('Click me'));
    expect(onOpenDetail).toHaveBeenCalledWith(task);
  });

  it('shows "No tasks" when a column is empty', () => {
    render(<KanbanMobileList columns={[makeColumn()]} tasks={[]} users={[]} onOpenDetail={onOpenDetail} />);
    expect(screen.getByText('No tasks')).toBeInTheDocument();
  });

  it('shows fallback text when there are no columns at all', () => {
    render(<KanbanMobileList columns={[]} tasks={[]} users={[]} onOpenDetail={onOpenDetail} />);
    expect(screen.getByText(/No columns yet/i)).toBeInTheDocument();
  });

  it('renders the assignee name inline, left-aligned in the card metadata row', () => {
    const task = makeTask('t1', { ownerId: 'u1' });
    render(<KanbanMobileList columns={[makeColumn()]} tasks={[task]} users={USERS} onOpenDetail={onOpenDetail} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /assigned to Alice/i })).toBeInTheDocument();
  });

  it('renders the deadline for tasks that have one', () => {
    const task = makeTask('t1', { deadline: '2030-06-15T00:00:00.000Z' });
    render(<KanbanMobileList columns={[makeColumn()]} tasks={[task]} users={[]} onOpenDetail={onOpenDetail} />);
    // The short locale string includes the month abbreviation; "Jun" or "15" should appear.
    // Named explicitly since the column now also has a sort-mode button and a drag-handle.
    const btn = screen.getByRole('button', { name: /Task t1/ });
    expect(btn.textContent).toMatch(/Jun|15/);
  });

  it('shows sr-only "(overdue)" text for overdue non-done tasks', () => {
    const task = makeTask('t1', { deadline: '2020-01-01T00:00:00.000Z', status: 'todo' });
    render(<KanbanMobileList columns={[makeColumn()]} tasks={[task]} users={[]} onOpenDetail={onOpenDetail} />);
    expect(document.querySelector('.sr-only')?.textContent).toContain('overdue');
  });

  it('does NOT mark a done task as overdue even if deadline is past', () => {
    const doneCol = makeColumn({ id: 'col-done', statusKey: 'done', label: 'Done', isDone: true });
    const task = makeTask('t1', { deadline: '2020-01-01T00:00:00.000Z', status: 'done' });
    render(<KanbanMobileList columns={[doneCol]} tasks={[task]} users={[]} onOpenDetail={onOpenDetail} />);
    expect(document.querySelector('.sr-only')).toBeNull();
  });

  it('renders the aria-label container', () => {
    render(<KanbanMobileList columns={[makeColumn()]} tasks={[]} users={[]} onOpenDetail={onOpenDetail} />);
    expect(document.querySelector('[aria-label="Kanban columns"]')).toBeInTheDocument();
  });

  it('renders column heading with aria-labelledby on the section', () => {
    render(<KanbanMobileList columns={[makeColumn()]} tasks={[]} users={[]} onOpenDetail={onOpenDetail} />);
    const section = document.querySelector('section')!;
    const labelId = section.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)).not.toBeNull();
  });

  it('renders subtask count when task has subtasks', () => {
    const task = makeTask('t1', {
      subtasks: [
        { id: 's1', completed: true, title: 'Sub 1' },
        { id: 's2', completed: false, title: 'Sub 2' },
      ] as unknown as Task['subtasks'],
    });
    render(<KanbanMobileList columns={[makeColumn()]} tasks={[task]} users={[]} onOpenDetail={onOpenDetail} />);
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });
});
