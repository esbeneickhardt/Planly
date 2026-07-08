import { useState, useRef } from 'react';

type ResizeType = 'milestone' | 'sprint' | 'sprint-start' | 'product';

interface ResizeEvent { type: ResizeType; id: string; date: Date; }
interface ResizedEvent { type: ResizeType; id: string; }

interface Options {
  fullStart: Date;
  fullEnd: Date;
  onResizing: (e: ResizeEvent) => void;
  onResized: (e: ResizedEvent) => void;
}

export function useGanttDragZoom({ fullStart, fullEnd, onResizing, onResized }: Options) {
  const [viewStart, setViewStart] = useState<Date | null>(null);
  const [viewEnd, setViewEnd] = useState<Date | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const viewRef = useRef({ vs: new Date(), ve: new Date(), fullStart: new Date(), fullEnd: new Date() });
  const dragState = useRef<{ startX: number; vs: Date; ve: Date } | null>(null);
  const resizeState = useRef<{ type: ResizeType; id: string } | null>(null);

  // Keep viewRef current on every render (same pattern as the original component-level
  // viewRef.current = { vs, ve, fullStart, fullEnd } update, so the wheel closure reads fresh values)
  const vs = viewStart ?? fullStart;
  const ve = viewEnd ?? fullEnd;
  viewRef.current.vs = vs;
  viewRef.current.ve = ve;
  viewRef.current.fullStart = fullStart;
  viewRef.current.fullEnd = fullEnd;

  function applyZoom(factor: number, anchorRatio = 0.5) {
    const { vs: v, ve: e, fullStart: fs, fullEnd: fe } = viewRef.current;
    const span = e.getTime() - v.getTime();
    const newSpan = span * factor;
    const minSpan = 3 * 86_400_000;
    const maxSpan = fe.getTime() - fs.getTime();
    if (newSpan < minSpan) return;
    if (newSpan >= maxSpan) { setViewStart(fs); setViewEnd(fe); return; }
    const anchor = v.getTime() + anchorRatio * span;
    let newStart = anchor - anchorRatio * newSpan;
    let newEnd = anchor + (1 - anchorRatio) * newSpan;
    if (newStart < fs.getTime()) { newStart = fs.getTime(); newEnd = fs.getTime() + newSpan; }
    if (newEnd > fe.getTime()) { newEnd = fe.getTime(); newStart = Math.max(fs.getTime(), fe.getTime() - newSpan); }
    setViewStart(new Date(newStart));
    setViewEnd(new Date(newEnd));
  }

  const attachWheel = (el: HTMLDivElement | null) => {
    if (!el) return;
    if ((el as HTMLDivElement & { _wheelAttached?: boolean })._wheelAttached) return;
    (el as HTMLDivElement & { _wheelAttached?: boolean })._wheelAttached = true;
    el.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const { vs: v, ve: en, fullStart: fs, fullEnd: fe } = viewRef.current;
      const rect = el.getBoundingClientRect();
      const span = en.getTime() - v.getTime();
      const maxSpan = fe.getTime() - fs.getTime();

      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const deltaMs = (e.deltaX / rect.width) * span * 1.5;
        let newStart = v.getTime() + deltaMs;
        let newEnd = en.getTime() + deltaMs;
        if (newStart < fs.getTime()) { newStart = fs.getTime(); newEnd = fs.getTime() + span; }
        if (newEnd > fe.getTime()) { newEnd = fe.getTime(); newStart = Math.max(fs.getTime(), fe.getTime() - span); }
        viewRef.current.vs = new Date(newStart);
        viewRef.current.ve = new Date(newEnd);
        setViewStart(new Date(newStart));
        setViewEnd(new Date(newEnd));
        return;
      }

      const mouseRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const factor = e.deltaY > 0 ? 1.25 : 0.8;
      const newSpan = span * factor;
      const minSpan = 3 * 86_400_000;
      if (newSpan < minSpan) return;
      if (newSpan >= maxSpan) {
        viewRef.current.vs = fs;
        viewRef.current.ve = fe;
        setViewStart(new Date(fs));
        setViewEnd(new Date(fe));
        return;
      }
      const anchor = v.getTime() + mouseRatio * span;
      let newStart = anchor - mouseRatio * newSpan;
      let newEnd = anchor + (1 - mouseRatio) * newSpan;
      if (newStart < fs.getTime()) { newStart = fs.getTime(); newEnd = fs.getTime() + newSpan; }
      if (newEnd > fe.getTime()) { newEnd = fe.getTime(); newStart = Math.max(fs.getTime(), fe.getTime() - newSpan); }
      viewRef.current.vs = new Date(newStart);
      viewRef.current.ve = new Date(newEnd);
      setViewStart(new Date(newStart));
      setViewEnd(new Date(newEnd));
    }, { passive: false });
  };

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const { vs: v, ve: en } = viewRef.current;
    if (e.button !== 0) return;
    const handle = (e.target as HTMLElement).closest('[data-resize]') as HTMLElement | null;
    if (handle) {
      const id = handle.getAttribute('data-resize')!;
      const type = handle.getAttribute('data-resize-type') as ResizeType;
      resizeState.current = { type, id };
      setIsResizing(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if ((e.target as HTMLElement).closest('button, a')) return;
    dragState.current = { startX: e.clientX, vs: v, ve: en };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const { vs: v, ve: en, fullStart: fs, fullEnd: fe } = viewRef.current;
    if (resizeState.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const pctX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newDate = new Date(v.getTime() + pctX * (en.getTime() - v.getTime()));
      onResizing({ type: resizeState.current.type, id: resizeState.current.id, date: newDate });
      return;
    }
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const rect = e.currentTarget.getBoundingClientRect();
    const span = dragState.current.ve.getTime() - dragState.current.vs.getTime();
    const deltaMs = -(dx / rect.width) * span;
    let newStart = dragState.current.vs.getTime() + deltaMs;
    let newEnd = dragState.current.ve.getTime() + deltaMs;
    if (newStart < fs.getTime()) { newStart = fs.getTime(); newEnd = fs.getTime() + span; }
    if (newEnd > fe.getTime()) { newEnd = fe.getTime(); newStart = Math.max(fs.getTime(), fe.getTime() - span); }
    setViewStart(new Date(newStart));
    setViewEnd(new Date(newEnd));
  }

  function handlePointerUp() {
    if (resizeState.current) {
      onResized({ type: resizeState.current.type, id: resizeState.current.id });
      resizeState.current = null;
      setIsResizing(false);
      return;
    }
    dragState.current = null;
    setIsDragging(false);
  }

  return {
    vs, ve, viewStart, viewEnd, setViewStart, setViewEnd,
    isDragging, isResizing,
    applyZoom, attachWheel,
    handlePointerDown, handlePointerMove, handlePointerUp,
  };
}
