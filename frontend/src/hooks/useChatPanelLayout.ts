/**
 * Manages ChatPanel's window chrome: expand/minimize/sidebar-dock state, floating panel size +
 * position (persisted to localStorage), and the pointer-driven drag/resize handlers, plus the
 * mobile-breakpoint detection that forces fullscreen below 768px.
 *
 * The drag/resize handlers use refs that shadow the corresponding state (`panelWidthRef`,
 * `panelHeightRef`, `chatPosRef`, `isSidebarRef`) purely to dodge stale closures: each handler
 * registers its `pointermove`/`pointerup` listeners on `window` once per gesture (via
 * `addEventListener`, not React's synthetic system), so those listeners only ever see the state
 * values captured at registration time unless a ref is read instead. This pattern is intentionally
 * preserved verbatim from ChatPanel.tsx - do not "simplify" it by reading state directly inside
 * `onMove`/`onUp`, that reintroduces the exact stale-closure bug it exists to prevent.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

interface Options {
  /** Swipe-down-to-dismiss (while expanded) closes the panel once past the drag threshold. */
  onClose: () => void;
}

const EXPANDED_DRAG_CLOSE_THRESHOLD = 100;
const EXPANDED_DRAG_MAX = 300;

export function useChatPanelLayout({ onClose }: Options) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  // Swipe-down-to-dismiss while expanded (the layout mobile is always forced into below 768px) -
  // the header's ✕ is a reach on a phone, so dragging down from the header closes the panel
  // instead. Harmless on desktop's manually-toggled fullscreen too, since touch events simply
  // never fire from mouse interaction there.
  const [expandedDragY, setExpandedDragY] = useState(0);
  const [expandedDragging, setExpandedDragging] = useState(false);
  const expandedDragStartYRef = useRef<number | null>(null);
  const [isSidebar, setIsSidebar] = useState(() => {
    try {
      return localStorage.getItem('planly-chat-sidebar') === 'true';
    } catch {
      return false;
    }
  });
  const [panelWidth, setPanelWidth] = useState(() => {
    try {
      return parseInt(localStorage.getItem('planly-chat-width') ?? '380');
    } catch {
      return 380;
    }
  });
  const [panelHeight, setPanelHeight] = useState(() => {
    try {
      return parseInt(localStorage.getItem('planly-chat-height') ?? '560');
    } catch {
      return 560;
    }
  });
  const [chatPos, setChatPos] = useState<{ x: number; y: number }>(() => {
    try {
      const s = localStorage.getItem('planly-chat-pos');
      if (s) return JSON.parse(s);
    } catch {}
    const w = parseInt(localStorage.getItem('planly-chat-width') ?? '380');
    return { x: Math.max(8, window.innerWidth - w - 16), y: 64 };
  });
  const panelWidthRef = useRef(panelWidth);
  panelWidthRef.current = panelWidth;
  const panelHeightRef = useRef(panelHeight);
  panelHeightRef.current = panelHeight;
  const chatPosRef = useRef(chatPos);
  chatPosRef.current = chatPos;
  const isSidebarRef = useRef(isSidebar);
  isSidebarRef.current = isSidebar;
  const headerDragRef = useRef<{ startX: number; startY: number; px: number; py: number } | null>(null);

  // On small screens always use fullscreen mode; also re-check on resize. `isMobile` is tracked
  // separately from `isExpanded` because the latter can also be true on desktop (manual fullscreen
  // toggle) - the compose bar needs a real breakpoint signal to render only one textarea (mobile's
  // compact single-row one, or desktop's toolbar+textarea), never both.
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    function syncMobile() {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setIsExpanded(true);
    }
    syncMobile();
    window.addEventListener('resize', syncMobile);
    return () => window.removeEventListener('resize', syncMobile);
  }, []);

  const startResizeDir = useCallback((e: React.PointerEvent, dir: string) => {
    e.preventDefault();
    e.stopPropagation();
    const sx = chatPosRef.current.x,
      sy = chatPosRef.current.y;
    const sw = panelWidthRef.current,
      sh = panelHeightRef.current;
    const startX = e.clientX,
      startY = e.clientY;
    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX,
        dy = ev.clientY - startY;
      let newW = sw,
        newH = sh,
        newX = sx,
        newY = sy;
      if (dir.includes('e')) newW = Math.max(300, Math.min(1200, sw + dx));
      if (dir.includes('w')) {
        newW = Math.max(300, Math.min(1200, sw - dx));
        if (!isSidebarRef.current) newX = sx + sw - newW;
      }
      if (dir.includes('s')) newH = Math.max(200, Math.min(window.innerHeight - 40, sh + dy));
      if (dir.includes('n')) {
        newH = Math.max(200, Math.min(window.innerHeight - 40, sh - dy));
        newY = sy + sh - newH;
      }
      newX = Math.max(0, Math.min(window.innerWidth - newW, newX));
      newY = Math.max(0, newY);
      setPanelWidth(newW);
      panelWidthRef.current = newW;
      setPanelHeight(newH);
      panelHeightRef.current = newH;
      if (!isSidebarRef.current) setChatPos({ x: newX, y: newY });
    }
    function onUp() {
      try {
        localStorage.setItem('planly-chat-width', String(panelWidthRef.current));
        localStorage.setItem('planly-chat-height', String(panelHeightRef.current));
        localStorage.setItem('planly-chat-pos', JSON.stringify(chatPosRef.current));
      } catch {}
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  const onHeaderDrag = useCallback((e: React.PointerEvent) => {
    if ((e.target as Element).closest('button')) return;
    e.preventDefault();
    const startPX = isSidebarRef.current ? window.innerWidth - panelWidthRef.current : chatPosRef.current.x;
    const startPY = isSidebarRef.current ? 0 : chatPosRef.current.y;
    headerDragRef.current = { startX: e.clientX, startY: e.clientY, px: startPX, py: startPY };
    function onMove(ev: PointerEvent) {
      if (!headerDragRef.current) return;
      const x = Math.max(
        0,
        Math.min(
          window.innerWidth - panelWidthRef.current,
          headerDragRef.current.px + (ev.clientX - headerDragRef.current.startX),
        ),
      );
      const y = Math.max(
        0,
        Math.min(window.innerHeight - 56, headerDragRef.current.py + (ev.clientY - headerDragRef.current.startY)),
      );
      // Undock from sidebar if dragged away from right edge
      if (isSidebarRef.current && x + panelWidthRef.current < window.innerWidth - 40) {
        setIsSidebar(false);
        isSidebarRef.current = false;
        try {
          localStorage.setItem('planly-chat-sidebar', 'false');
        } catch {}
      }
      setChatPos({ x, y });
    }
    function onUp() {
      // Snap to sidebar if released near right edge
      const pos = chatPosRef.current;
      if (!isSidebarRef.current && pos.x + panelWidthRef.current >= window.innerWidth - 40) {
        setIsSidebar(true);
        isSidebarRef.current = true;
        try {
          localStorage.setItem('planly-chat-sidebar', 'true');
        } catch {}
      }
      try {
        localStorage.setItem('planly-chat-pos', JSON.stringify(chatPosRef.current));
      } catch {}
      headerDragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  function handleExpandedTouchStart(e: React.TouchEvent) {
    if (!isExpanded) return;
    const t = e.touches[0];
    if (!t) return;
    expandedDragStartYRef.current = t.clientY;
    setExpandedDragging(true);
  }

  function handleExpandedTouchMove(e: React.TouchEvent) {
    if (expandedDragStartYRef.current === null) return;
    const t = e.touches[0];
    if (!t) return;
    const dy = t.clientY - expandedDragStartYRef.current;
    setExpandedDragY(Math.max(0, Math.min(dy, EXPANDED_DRAG_MAX)));
  }

  function handleExpandedTouchEnd() {
    if (expandedDragStartYRef.current === null) return;
    expandedDragStartYRef.current = null;
    setExpandedDragging(false);
    if (expandedDragY >= EXPANDED_DRAG_CLOSE_THRESHOLD) onClose();
    setExpandedDragY(0);
  }

  return {
    isExpanded,
    setIsExpanded,
    isMinimized,
    setIsMinimized,
    expandedDragY,
    expandedDragging,
    isSidebar,
    panelWidth,
    panelHeight,
    chatPos,
    isMobile,
    startResizeDir,
    onHeaderDrag,
    handleExpandedTouchStart,
    handleExpandedTouchMove,
    handleExpandedTouchEnd,
  };
}
