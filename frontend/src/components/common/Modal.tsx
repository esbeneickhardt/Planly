/**
 * Generic modal dialog with a title bar, close button, backdrop click-to-close, Escape key support,
 * focus trap, and ARIA dialog semantics for screen reader accessibility.
 * `width` defaults to `max-w-lg` and accepts any Tailwind width class.
 */
import { ReactNode, useEffect, useRef, useState } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

// Swipe-down-to-dismiss thresholds for the mobile fullscreen sheet - lets users close it without
// reaching up to the corner ✕, matching how native mobile sheets (iOS, Material bottom sheets)
// are dismissed.
const DRAG_CLOSE_THRESHOLD = 100;
const DRAG_MAX = 300;

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  /** Below the `md:` breakpoint, render as a fullscreen sheet instead of a centered dialog. */
  mobileFullscreen?: boolean;
  /** Suppresses the visible title bar (title text row + ✕ button) for dialogs that render their own
   * compact content instead (e.g. ConfirmContext's Cancel/Confirm prompt, which has no use for a
   * separate close button). `title` is still required and used as the dialog's accessible name -
   * via `aria-label` instead of `aria-labelledby`, since there's no visible heading element to
   * label it with. */
  hideHeader?: boolean;
}

export default function Modal({
  title,
  onClose,
  children,
  width = 'max-w-lg',
  mobileFullscreen = false,
  hideHeader = false,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2)}`).current;
  // Keep a stable ref so the keydown handler always calls the latest onClose without
  // it being a useEffect dependency. If onClose were in the dep array, every inline
  // arrow passed by a parent re-render would re-run the effect, firing the cleanup's
  // previouslyFocused?.focus() and stealing focus from inputs on every keystroke.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    // Save the element that had focus before the modal opened so we can restore it on close
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus into the modal on the first focusable element
    const el = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    el?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      // Trap Tab / Shift+Tab inside the dialog
      if (e.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  // Swipe-down-to-dismiss for the fullscreen mobile sheet - the ✕ button is a reach on a phone,
  // so dragging down from the header (or anywhere that isn't itself scrollable/interactive) closes
  // it instead, the same way a native mobile sheet would.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartYRef = useRef<number | null>(null);

  function handleHeaderTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    dragStartYRef.current = t.clientY;
    setDragging(true);
  }

  function handleHeaderTouchMove(e: React.TouchEvent) {
    if (dragStartYRef.current === null) return;
    const t = e.touches[0];
    if (!t) return;
    const dy = t.clientY - dragStartYRef.current;
    setDragY(Math.max(0, Math.min(dy, DRAG_MAX)));
  }

  function handleHeaderTouchEnd() {
    if (dragStartYRef.current === null) return;
    dragStartYRef.current = null;
    setDragging(false);
    if (dragY >= DRAG_CLOSE_THRESHOLD) onClose();
    setDragY(0);
  }

  return (
    <div
      className={
        mobileFullscreen
          ? 'fixed inset-0 z-50 flex items-center justify-center md:p-4'
          : 'fixed inset-0 z-50 flex items-center justify-center p-4'
      }
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-modal-backdrop-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hideHeader ? undefined : titleId}
        aria-label={hideHeader ? title : undefined}
        className={
          mobileFullscreen
            ? `relative w-full h-full md:h-auto ${width} rounded-none md:rounded-2xl card shadow-2xl flex flex-col animate-modal-in`
            : `relative w-full ${width} card shadow-2xl animate-modal-in`
        }
        style={
          mobileFullscreen
            ? {
                maxHeight: '100dvh',
                transform: dragY ? `translateY(${dragY}px)` : undefined,
                transition: dragging ? 'none' : 'transform 200ms ease',
              }
            : { maxHeight: '90vh', overflowY: 'auto' }
        }
      >
        <div
          onTouchStart={mobileFullscreen ? handleHeaderTouchStart : undefined}
          onTouchMove={mobileFullscreen ? handleHeaderTouchMove : undefined}
          onTouchEnd={mobileFullscreen ? handleHeaderTouchEnd : undefined}
          onTouchCancel={mobileFullscreen ? handleHeaderTouchEnd : undefined}
          className="flex-shrink-0"
          style={mobileFullscreen ? { touchAction: 'none' } : undefined}
        >
          {mobileFullscreen && (
            <div className="md:hidden flex justify-center pt-2 pb-1" aria-hidden="true">
              <div className="w-9 h-1 rounded-full" style={{ background: 'var(--border-2)' }} />
            </div>
          )}
          {!hideHeader && (
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 id={titleId} className="font-semibold text-token">
                {title}
              </h2>
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-lg transition-colors text-token-3 hover:text-token"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          )}
        </div>
        <div className={mobileFullscreen ? 'p-6 flex-1 overflow-y-auto' : 'p-6'}>{children}</div>
      </div>
    </div>
  );
}
