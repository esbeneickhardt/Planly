/**
 * Unit tests for BacklogPage's status dropdown (BacklogRow's Status cell). Clicking the status
 * cell opens a menu listing all 5 statuses, the current status is visually marked with a
 * checkmark, and clicking a different status calls onQuickStatusChange with the new status key
 * and closes the menu. BacklogRow is exported from BacklogPage.tsx specifically for this test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BacklogRow } from '../../pages/BacklogPage';
import type { Task } from '../../types';

vi.mock('../../context/ChatContext', () => ({
  useChat: () => ({ openChat: vi.fn() }),
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    productId: 'prod-1',
    name: 'Write tests',
    status: 'todo',
    kanbanOrder: 0,
    milestoneOrder: 0,
    createdBy: 'u1',
    createdAt: new Date().toISOString(),
    subtasks: [],
    dependsOn: [],
    requiredBy: [],
    ...overrides,
  };
}

function renderRow(task: Task, onQuickStatusChange = vi.fn()) {
  const utils = render(
    <table>
      <tbody>
        <BacklogRow
          task={task}
          selected={false}
          isOverdue={false}
          milestoneName={null}
          milestoneColor={null}
          onToggle={vi.fn()}
          onOpen={vi.fn()}
          onMoveTodo={vi.fn()}
          onQuickStatusChange={onQuickStatusChange}
          onDelete={vi.fn()}
        />
      </tbody>
    </table>,
  );
  return { ...utils, onQuickStatusChange };
}

describe('BacklogRow status dropdown', () => {
  beforeEach(() => {
    // useLayoutEffect positions the dropdown via getBoundingClientRect, which jsdom stubs as
    // all-zero - fine for these tests since we only assert on content/behavior, not position.
  });

  it('shows the current status label and no dropdown initially', () => {
    renderRow(makeTask({ status: 'in_progress' }));
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    // Only one status label visible before opening the dropdown
    expect(screen.getAllByText('In Progress')).toHaveLength(1);
  });

  it('clicking the status cell opens a dropdown listing all 5 statuses', async () => {
    const user = userEvent.setup();
    renderRow(makeTask({ status: 'todo' }));

    await user.click(screen.getByText('To Do'));

    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(screen.getAllByText('To Do').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('marks the current status with a checkmark', async () => {
    const user = userEvent.setup();
    const { container } = renderRow(makeTask({ status: 'blocked' }));

    await user.click(screen.getByText('Blocked'));

    const dropdown = container.querySelector('.animate-dropdown-in') as HTMLElement;
    expect(dropdown).not.toBeNull();
    const scoped = within(dropdown);

    const blockedButton = scoped.getByText('Blocked').closest('button')!;
    expect(blockedButton.textContent).toContain('✓');

    const doneButton = scoped.getByText('Done').closest('button')!;
    expect(doneButton.textContent).not.toContain('✓');
  });

  it('clicking a different status calls onQuickStatusChange with the new status and closes the dropdown', async () => {
    const user = userEvent.setup();
    const { onQuickStatusChange } = renderRow(makeTask({ status: 'todo' }));

    await user.click(screen.getByText('To Do'));
    await user.click(screen.getByText('Done'));

    expect(onQuickStatusChange).toHaveBeenCalledWith('done');
    // Dropdown closed: "Blocked" (an option-only label, not the trigger) should no longer be present
    expect(screen.queryByText('Blocked')).not.toBeInTheDocument();
  });

  it('clicking the status trigger again toggles the dropdown closed', () => {
    renderRow(makeTask({ status: 'todo' }));
    const trigger = screen.getByText('To Do').closest('button')!;

    fireEvent.click(trigger);
    expect(screen.getByText('Blocked')).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByText('Blocked')).not.toBeInTheDocument();
  });
});
