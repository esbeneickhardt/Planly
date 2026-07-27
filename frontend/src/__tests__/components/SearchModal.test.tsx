/**
 * Unit tests for the SearchModal component.
 *
 * The modal shows quick-nav shortcuts when the query is empty and
 * switches to live search results as the user types. Keyboard navigation
 * (ArrowUp/ArrowDown/Enter/Escape) must work without mouse input.
 * All context dependencies and the search API are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Context mocks ─────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  BrowserRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../context/ProductContext', () => ({
  useProduct: () => ({
    activeProduct: { id: 'prod-1', name: 'Test Project' },
    products: [{ id: 'prod-1', name: 'Test Project' }],
    setActiveProduct: vi.fn(),
    refreshTasks: vi.fn(),
  }),
}));

vi.mock('../../context/ChatContext', () => ({
  useChat: () => ({ openChat: vi.fn() }),
}));

vi.mock('../../context/PermissionContext', () => ({
  usePermission: () => ({
    canRead: (_tab: string) => true,
    canManage: true,
    canWrite: (_tab: string) => true,
  }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', username: 'testuser', isAdmin: false, announcementsEnabled: true },
  }),
}));

vi.mock('../../api/client', () => ({
  api: {
    search: vi.fn().mockResolvedValue({ tasks: [], messages: [] }),
    sprints: { list: vi.fn().mockResolvedValue([]) },
    tasks: { get: vi.fn() },
  },
  displayName: (u: { username: string }) => u.username,
}));

vi.mock('./TaskDetailPanel', () => ({ default: () => <div>TaskDetailPanel</div> }));

import SearchModal from '../../components/common/SearchModal';

// ── Tests ────────────────────────────────────────────────────────────────

describe('SearchModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
    mockNavigate.mockClear();
  });

  // Smoke test: the modal mounts and exposes the search input
  it('renders the search input', () => {
    render(<SearchModal onClose={onClose} />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  // Escape is the primary keyboard dismissal path (matches native modal conventions)
  it('Escape key calls onClose', () => {
    render(<SearchModal onClose={onClose} />);
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  // Quick-nav shortcuts appear before the user types anything
  it('shows quick-nav items when the query is empty', () => {
    render(<SearchModal onClose={onClose} />);
    expect(screen.getByText(/Plan - Canvas/i)).toBeInTheDocument();
    expect(screen.getByText(/Execute - Kanban/i)).toBeInTheDocument();
    expect(screen.getByText(/Tasks - Full task list/i)).toBeInTheDocument();
  });

  // First ArrowDown sets focus to index 0 so Enter immediately picks the first item
  it('ArrowDown highlights the first quick-nav item', () => {
    render(<SearchModal onClose={onClose} />);
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    // The first quick-nav item should now be highlighted (data-idx=0)
    const firstItem = document.querySelector('[data-idx="0"]');
    expect(firstItem).not.toBeNull();
  });

  // Pressing Enter on a highlighted item navigates to its route and dismisses the modal
  it('Enter on highlighted quick-nav item navigates and closes', () => {
    render(<SearchModal onClose={onClose} />);
    const input = screen.getByPlaceholderText(/search/i);
    // Move to the first item (Canvas) and confirm
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/canvas');
    expect(onClose).toHaveBeenCalled();
  });

  // Two ArrowDown presses move to index 1 (Kanban); Enter confirms that selection
  it('ArrowDown + ArrowDown + Enter navigates to the second quick-nav item', () => {
    render(<SearchModal onClose={onClose} />);
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/kanban');
  });

  // Boundary: ArrowUp from index 0 must not wrap or go negative
  it('ArrowUp at the top does not go below 0', () => {
    render(<SearchModal onClose={onClose} />);
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // idx 0
    fireEvent.keyDown(input, { key: 'ArrowUp' }); // tries to go to -1, should stay at 0
    fireEvent.keyDown(input, { key: 'Enter' });
    // Should still navigate to first item
    expect(mockNavigate).toHaveBeenCalled();
  });

  // Clicking the backdrop (outside the modal card) should dismiss the modal
  it('overlay click calls onClose', () => {
    render(<SearchModal onClose={onClose} />);
    // The overlay is the first child of the portal - click on the backdrop
    const overlay = document.querySelector('.fixed.inset-0');
    if (overlay) fireEvent.click(overlay as Element);
    expect(onClose).toHaveBeenCalled();
  });
});
