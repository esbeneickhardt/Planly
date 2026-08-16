/**
 * Unit tests for PrivacyModal's two optimistic toggles: `acceptsInvites` and
 * `showProjectsOnProfile`. Each toggle flips immediately on click (optimistic), calls
 * api.users.update with the new value, and reverts the UI back if the API call fails.
 * AuthContext and api/client are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockRefreshUser = vi.fn().mockResolvedValue(undefined);
const mockUpdate = vi.fn();

vi.mock('../../api/client', () => ({
  api: {
    users: { update: (...args: unknown[]) => mockUpdate(...args) },
  },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', username: 'testuser', acceptsInvites: true, showProjectsOnProfile: true },
    refreshUser: mockRefreshUser,
  }),
}));

const mockShowToast = vi.fn();
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

import PrivacyModal from '../../components/common/PrivacyModal';

describe('PrivacyModal', () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockRefreshUser.mockClear();
    mockShowToast.mockClear();
  });

  // ToggleSwitch renders as div, not a native checkbox - toggles are addressed via their button's
  // accessible text instead.
  function invitesButton() {
    return screen.getByText('Allow project invitations').closest('button')!;
  }
  function showProjectsButton() {
    return screen.getByText('Show my projects on my profile').closest('button')!;
  }

  it('clicking the invitations toggle calls api.users.update with the flipped value', async () => {
    mockUpdate.mockResolvedValue({});
    const user = userEvent.setup();
    render(<PrivacyModal onClose={vi.fn()} />);

    await user.click(invitesButton());

    expect(mockUpdate).toHaveBeenCalledWith('u1', { acceptsInvites: false });
    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled());
  });

  it('clicking the show-projects toggle calls api.users.update with the flipped value', async () => {
    mockUpdate.mockResolvedValue({});
    const user = userEvent.setup();
    render(<PrivacyModal onClose={vi.fn()} />);

    await user.click(showProjectsButton());

    expect(mockUpdate).toHaveBeenCalledWith('u1', { showProjectsOnProfile: false });
    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled());
  });

  it('reverts the invitations toggle UI when the API call fails', async () => {
    mockUpdate.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    render(<PrivacyModal onClose={vi.fn()} />);

    const btn = invitesButton();
    // ToggleSwitch's outer track div is the button's first child; its background style
    // (var(--brand) when on, var(--border) when off) is the visual signal of checked state.
    const trackBefore = btn.firstElementChild?.getAttribute('style');

    await user.click(btn);

    // Optimistic flip happened, then reverted back to the original state after rejection
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Network error', 'error'));
    const trackAfter = btn.firstElementChild?.getAttribute('style');
    expect(trackAfter).toBe(trackBefore);
  });

  it('reverts the show-projects toggle UI when the API call fails', async () => {
    mockUpdate.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    render(<PrivacyModal onClose={vi.fn()} />);

    const btn = showProjectsButton();
    const trackBefore = btn.firstElementChild?.getAttribute('style');

    await user.click(btn);

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Network error', 'error'));
    const trackAfter = btn.firstElementChild?.getAttribute('style');
    expect(trackAfter).toBe(trackBefore);
  });
});
