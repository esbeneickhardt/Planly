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
  it('starts with no active edit', () => {
    const { result } = renderHook(() => useMessageEdit(makeOptions()));
    expect(result.current.editingId).toBeNull();
    expect(result.current.editDraft).toBe('');
  });

  it('startEdit sets editingId and editDraft', () => {
    const { result } = renderHook(() => useMessageEdit(makeOptions()));
    act(() => { result.current.startEdit('msg-1', 'Hello world'); });
    expect(result.current.editingId).toBe('msg-1');
    expect(result.current.editDraft).toBe('Hello world');
  });

  it('cancelEdit clears editingId and editDraft', () => {
    const { result } = renderHook(() => useMessageEdit(makeOptions()));
    act(() => { result.current.startEdit('msg-1', 'Hello'); });
    act(() => { result.current.cancelEdit(); });
    expect(result.current.editingId).toBeNull();
    expect(result.current.editDraft).toBe('');
  });

  it('setEditDraft updates the draft', () => {
    const { result } = renderHook(() => useMessageEdit(makeOptions()));
    act(() => { result.current.startEdit('msg-1', 'Original'); });
    act(() => { result.current.setEditDraft('Updated'); });
    expect(result.current.editDraft).toBe('Updated');
  });
});
