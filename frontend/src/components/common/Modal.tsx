/**
 * Generic modal dialog with a title bar, close button, backdrop click-to-close, Escape key support,
 * focus trap, and ARIA dialog semantics for screen reader accessibility.
 * `width` defaults to `max-w-lg` and accepts any Tailwind width class.
 */
import { ReactNode, useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}

export default function Modal({ title, onClose, children, width = 'max-w-lg' }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    // Save the element that had focus before the modal opened so we can restore it on close
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus into the modal on the first focusable element
    const el = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    el?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      // Trap Tab / Shift+Tab inside the dialog
      if (e.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (focusable.length === 0) { e.preventDefault(); return; }
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative w-full ${width} card shadow-2xl`}
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 id={titleId} className="font-semibold text-token">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-lg transition-colors text-token-3 hover:text-token"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
