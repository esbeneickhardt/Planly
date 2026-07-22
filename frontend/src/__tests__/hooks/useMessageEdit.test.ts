/**
 * Unit tests for the useMessageEdit hook.
 *
 * The hook encapsulates the "edit a chat message" state machine:
 * which message is being edited (editingId), the in-progress text (editDraft),
 * and the actions to start, cancel, and submit an edit.
 * The API call itself is stubbed so tests stay pure.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMessageEdit } from '../../hooks/useMessageEdit';

vi.mock('../../api/client', () => ({
  api: {
    messages: { update: vi.fn() },
    adminChat: { update: vi.fn() },
  },
}));

function makeOptions() {
  return {
    isAdminChat: false,
    productId: 'prod-1',
    setAllMessages: vi.fn(),
  };
}

describe('useMessageEdit', () => {
  // Idle state: no edit is in progress on first render
  it('starts with no active edit', () => {
    const { result } = renderHook(() => useMessageEdit(makeOptions()));
    expect(result.current.editingId).toBeNull();
    expect(result.current.editDraft).toBe('');
  });

  // startEdit pre-fills the draft with the message's current text
  it('startEdit sets editingId and editDraft', () => {
    const { result } = renderHook(() => useMessageEdit(makeOptions()));
    act(() => {
      result.current.startEdit('msg-1', 'Hello world');
    });
    expect(result.current.editingId).toBe('msg-1');
    expect(result.current.editDraft).toBe('Hello world');
  });

  // cancelEdit returns to idle state without making any API call
  it('cancelEdit clears editingId and editDraft', () => {
    const { result } = renderHook(() => useMessageEdit(makeOptions()));
    act(() => {
      result.current.startEdit('msg-1', 'Hello');
    });
    act(() => {
      result.current.cancelEdit();
    });
    expect(result.current.editingId).toBeNull();
    expect(result.current.editDraft).toBe('');
  });

  // setEditDraft is called on every keystroke; the final value is what gets submitted
  it('setEditDraft updates the draft', () => {
    const { result } = renderHook(() => useMessageEdit(makeOptions()));
    act(() => {
      result.current.startEdit('msg-1', 'Original');
    });
    act(() => {
      result.current.setEditDraft('Updated');
    });
    expect(result.current.editDraft).toBe('Updated');
  });
});
