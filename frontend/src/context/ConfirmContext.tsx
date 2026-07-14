/**
 * Provides an imperative `confirm(message)` API that returns a Promise<boolean>, replacing native dialogs.
 * The provider renders its own modal overlay so callers never need to manage confirm UI themselves.
 * `resolveRef` holds the current promise's resolve function so the modal buttons can settle it from JSX.
 */
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

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

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => answer(false)} />
          <div
            className="relative w-full max-w-sm rounded-2xl shadow-2xl p-6 flex flex-col gap-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{pending.message}</p>
            <div className="flex justify-end gap-2">
              <button
                autoFocus
                onClick={() => answer(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
              >Cancel</button>
              <button
                onClick={() => answer(true)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ background: '#dc2626', color: 'white' }}
              >Confirm</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
