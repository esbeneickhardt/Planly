/**
 * Touch-and-hold gesture hook - fires `onLongPress` after `delay` ms if the touch hasn't moved
 * more than `moveTolerance` px, and suppresses the synthetic click a touchend still fires
 * afterwards so a long-press doesn't also trigger whatever the plain tap does.
 */
import { useRef } from 'react';

interface Options {
  delay?: number;
  moveTolerance?: number;
}

export function useLongPress(onLongPress: () => void, { delay = 500, moveTolerance = 10 }: Options = {}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  function clear() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    startRef.current = null;
  }

  function start(x: number, y: number) {
    firedRef.current = false;
    startRef.current = { x, y };
    clear();
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, delay);
  }

  function move(x: number, y: number) {
    if (!startRef.current) return;
    const dx = x - startRef.current.x;
    const dy = y - startRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > moveTolerance) clear();
  }

  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (t) start(t.clientX, t.clientY);
    },
    onTouchMove: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (t) move(t.clientX, t.clientY);
    },
    onTouchEnd: clear,
    onTouchCancel: clear,
    // A touchend still fires a synthetic click right after - swallow that one click if it was
    // actually the end of a long-press, so tap-to-open doesn't also fire.
    onClickCapture: (e: React.MouseEvent) => {
      if (firedRef.current) {
        e.preventDefault();
        e.stopPropagation();
        firedRef.current = false;
      }
    },
  };
}
