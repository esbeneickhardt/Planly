/**
 * Provides an imperative `confirm(message)` API that returns a Promise<boolean>, replacing native dialogs.
 * The provider renders its own confirm dialog through the shared `Modal` component (with its header bar
 * suppressed via `hideHeader`, since Cancel/Confirm buttons already provide the only exit this dialog
 * needs) so callers never need to manage confirm UI themselves, and get the same Escape-to-close, focus
 * trap, and ARIA semantics every other modal in the app has.
 * `resolveRef` holds the current promise's resolve function so the modal buttons can settle it from JSX.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Modal from '../components/common/Modal';

interface PendingConfirm {
  message: string;
  resolve: (value: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (message: string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue>({ confirm: async () => false });

export function ConfirmProvider({ children }: { children: ReactNode }) {
  // State: null when no dialog is open
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  // Ref holds resolve so answer() can call it outside the promise closure
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setPending({ message, resolve });
    });
  }, []);

  function answer(value: boolean) {
    resolveRef.current?.(value);
    setPending(null);
  }

  // Memoized so consumers of useConfirm() (most of the app) only re-render if `confirm` itself
  // changes - which, since it's already a stable useCallback, means never after mount.
  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && (
        <Modal title="Confirm" onClose={() => answer(false)} hideHeader width="max-w-sm">
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
              {pending.message}
            </p>
            <div className="flex justify-end gap-2">
              {/* No explicit autoFocus needed - Modal already focuses the dialog's first focusable
                  element on mount, which this Cancel button is (see Modal.tsx's own focus-trap effect). */}
              <button
                onClick={() => answer(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => answer(true)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ background: '#dc2626', color: 'white' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
