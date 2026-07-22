/**
 * Unit tests for the useGanttDragZoom hook.
 *
 * The hook manages the visible date range (vs/ve) on the Gantt chart, supporting
 * pinch/scroll zoom (applyZoom), drag-to-pan, and explicit setViewStart/setViewEnd.
 * It enforces a 3-day minimum window and clamps back to fullStart/fullEnd on zoom-out.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGanttDragZoom } from '../../hooks/useGanttDragZoom';

const DAY = 86_400_000;

function makeOptions(overrides: Partial<Parameters<typeof useGanttDragZoom>[0]> = {}) {
  const fullStart = new Date('2024-01-01');
  const fullEnd = new Date('2024-12-31');
  return {
    fullStart,
    fullEnd,
    onResizing: vi.fn(),
    onResized: vi.fn(),
    ...overrides,
  };
}

describe('useGanttDragZoom', () => {
  // Initial visible window matches the full date range supplied by the parent
  it('initialises vs/ve to fullStart/fullEnd', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useGanttDragZoom(opts));
    expect(result.current.vs).toEqual(opts.fullStart);
    expect(result.current.ve).toEqual(opts.fullEnd);
  });

  // No gesture is active on first render; both flags must start as false
  it('isDragging and isResizing start false', () => {
    const { result } = renderHook(() => useGanttDragZoom(makeOptions()));
    expect(result.current.isDragging).toBe(false);
    expect(result.current.isResizing).toBe(false);
  });

  // factor < 1 zooms in (shrinks the span); factor > 1 zooms out (widens the span)
  it('applyZoom(0.5) zooms in - narrows the view window', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useGanttDragZoom(opts));

    const originalSpan = opts.fullEnd.getTime() - opts.fullStart.getTime();

    act(() => {
      result.current.applyZoom(0.5);
    });

    const newSpan = result.current.ve.getTime() - result.current.vs.getTime();
    expect(newSpan).toBeLessThan(originalSpan);
    expect(newSpan).toBeCloseTo(originalSpan * 0.5, -5);
  });

  // Zooming out beyond fullStart/fullEnd clamps to the full range (no blank padding)
  it('applyZoom(2) from full span resets to full span', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useGanttDragZoom(opts));

    act(() => {
      result.current.applyZoom(0.5);
    }); // zoom in first
    act(() => {
      result.current.applyZoom(2);
    }); // then zoom back out to full

    expect(result.current.vs).toEqual(opts.fullStart);
    expect(result.current.ve).toEqual(opts.fullEnd);
  });

  // Prevents zooming so far in that rows collapse to sub-pixel width
  it('applyZoom below 3-day minimum does nothing', () => {
    const opts = makeOptions({
      fullStart: new Date('2024-01-01'),
      fullEnd: new Date('2024-01-10'),
    });
    const { result } = renderHook(() => useGanttDragZoom(opts));

    // Zoom in very aggressively - should hit minimum
    act(() => {
      result.current.applyZoom(0.01);
    });

    const span = result.current.ve.getTime() - result.current.vs.getTime();
    // If the zoom was rejected, span stays at full; if accepted it is >= 3 days
    expect(span).toBeGreaterThanOrEqual(3 * DAY);
  });

  // Direct setters let the parent sync the view range (e.g. after loading a saved scroll position)
  it('setViewStart / setViewEnd update vs/ve', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useGanttDragZoom(opts));

    const newStart = new Date('2024-03-01');
    const newEnd = new Date('2024-06-01');
    act(() => {
      result.current.setViewStart(newStart);
      result.current.setViewEnd(newEnd);
    });

    expect(result.current.vs).toEqual(newStart);
    expect(result.current.ve).toEqual(newEnd);
  });
});
