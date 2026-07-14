/**
 * Provides a `showToast` function that displays auto-dismissing notifications at the bottom-right of the screen.
 * Toasts are removed after 4000 ms via setTimeout; IDs come from a module-level counter (not React state) to avoid re-renders.
 * Three types are supported: `error`, `success`, and `info`, each with distinct colours from CSS custom properties.
 */
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ToastType = 'error' | 'success' | 'info';

interface Toast { id: number; message: string; type: ToastType; }

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Module-level counter — not state, so incrementing it doesn't cause a re-render
let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const COLORS: Record<ToastType, { bg: string; border: string; text: string }> = {
    error:   { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.25)',  text: '#ef4444' },
    success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)', text: '#10b981' },
    info:    { bg: 'var(--surface-2)',       border: 'var(--border)',          text: 'var(--text-2)' },
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const c = COLORS[t.type];
          return (
            <div
              key={t.id}
              className="px-4 py-2.5 rounded-xl text-sm shadow-lg pointer-events-auto animate-fade-in"
              style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text, maxWidth: 320 }}
            >
              {t.message}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
