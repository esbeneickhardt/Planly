/**
 * useDebouncedCallback - returns a stable `[run, cancel]` pair. Calling `run(...args)` schedules
 * `fn(...args)` to fire after `delayMs` of inactivity, cancelling and rescheduling any call still
 * pending from a previous `run()`; `cancel()` drops a pending call outright without firing it.
 * `fn` itself doesn't need to be stable across renders - the latest version is always the one that
 * actually fires (mirrored into a ref via an effect, the same "ref tracks latest callback" pattern
 * Modal.tsx uses for its own onClose handler), so callers don't need to memoize it themselves.
 * Any call still pending is cleared automatically on unmount.
 */
import { useCallback, useEffect, useRef } from 'react';

export function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
): [(...args: Args) => void, () => void] {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const run = useCallback(
    (...args: Args) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fnRef.current(...args);
      }, delayMs);
    },
    [delayMs],
  );

  // Drop any pending call when the component using this hook unmounts.
  useEffect(() => cancel, [cancel]);

  return [run, cancel];
}
