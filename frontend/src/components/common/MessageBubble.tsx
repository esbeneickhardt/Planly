/**
 * Renders a single chat message bubble with markdown content, image/file attachments, emoji reactions, and edit/delete controls.
 * Reactions are grouped by emoji with the current user's own reaction highlighted; `reactionPickerOpen` state is lifted to the parent.
 * Edit and delete controls are only shown on hover for the message author; `formatTime` is exported for reuse in task list timestamps.
 */
import { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import { MermaidBlock } from './MermaidBlock';
import { displayName } from '../../api/client';
import type { Message } from '../../api/client';
import { EMOJI_SET } from './MarkdownEditor';
import EmojiPicker from './EmojiPicker';
import { logTouch } from './TouchDebugOverlay';

// Swipe-right-to-reply thresholds (mirrors Messenger/WhatsApp-style chat gestures)
const SWIPE_MAX = 60;
const SWIPE_THRESHOLD = 40;
// Movement below this is treated as a tap (not a swipe) - above it, the tap-to-reveal-actions
// click that the browser may still fire on touchend is suppressed so the two gestures don't fight.
const SWIPE_TAP_TOLERANCE = 6;
// Total movement (either axis) required before classifying the gesture as horizontal or vertical.
// Every touch starts with a few pixels of diagonal noise - deciding from the very first sample (as
// opposed to accumulating a bit of distance first) is what made the swipe fire inconsistently.
// Both constants below were bumped up from 10/1.5: short (one-line) messages get swiped with a
// quicker, more arc-like thumb motion than tall ones (less room to move "carefully"), so the
// natural vertical component of that arc was tipping the classifier toward "vertical" and
// cancelling the gesture more often on short bubbles - more tolerance here favors horizontal.
const DIRECTION_LOCK_DISTANCE = 14;
// Swipe is the priority gesture here (tap-to-open-menu is the fallback), so an ambiguous diagonal
// drag should still commit to "horizontal" unless it's clearly more vertical than horizontal.
const VERTICAL_BIAS = 2;

// Per-element `user-select: none` (mdTouchProps below) reliably stops selection FROM COMPLETING,
// but real-world testing showed the native long-press-to-select negotiation can still CAPTURE the
// touch over a rendered text run even so, silently eating the rest of the gesture (confirmed: works
// on the sender name, bubble padding/edges, quoted text, images - fails only in the middle of the
// message's own rendered text, every time). This matches a documented, cross-browser class of bug:
// react-aria's own textSelection.ts utility (a widely-used, heavily cross-browser-tested library)
// carries the exact same workaround, with the comment "adding [user-select:none] to the pressable
// element prevents that element from being selected, but nearby elements may still receive
// selection." Their fix - and this one - is to suppress selection at the DOCUMENT ROOT, imperatively,
// for the duration of the touch, rather than trusting a static per-element style alone.
function suppressGlobalTextSelection(disabled: boolean) {
  const style = document.documentElement.style;
  style.userSelect = disabled ? 'none' : '';
  (style as unknown as { webkitUserSelect: string }).webkitUserSelect = disabled ? 'none' : '';
}

export function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return `Yesterday ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

interface Props {
  msg: Message;
  isOwn: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onImageClick: (url: string) => void;
  canEdit: boolean;
  onReact: (emoji: string) => void;
  currentUserId: string | null;
  reactionPickerOpen: boolean;
  onToggleReactionPicker: () => void;
  /** Whether the reply/edit/delete overlay is showing for this message - tap-toggled so it works
   * on touch devices, not just desktop hover (see onToggleActions). */
  actionsOpen: boolean;
  onToggleActions: () => void;
  onReply?: () => void;
  onScrollToReply?: (id: string) => void;
  authorRole?: string | null;
  /** Mobile gets a Messenger-style long-press overlay (full-screen backdrop, centered quick-react
   * row, bottom-sheet actions menu) instead of desktop's tap/hover-revealed inline icon row. */
  isMobile?: boolean;
  /** The message list's own scrollable element (ChatPanel.tsx's messageListRef) - listened to
   * directly so a real native scroll of the list unambiguously cancels a pending long-press,
   * regardless of touch-delta heuristics (see the long-press timer section below for why those
   * alone weren't reliable enough). */
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

// First 6 of the shared EMOJI_SET, used as the quick-reaction row - "+" expands to the full set.
const QUICK_REACTION_COUNT = 6;

const ROLE_STYLE: Record<string, { background: string; color: string }> = {
  'Server Owner': { background: 'rgba(245,158,11,0.15)', color: '#d97706' },
  'Server Admin': { background: 'rgba(99,102,241,0.12)', color: '#6366f1' },
  'Project Owner': { background: 'rgba(22,163,74,0.12)', color: '#16a34a' },
  'Project Co-Owner': { background: 'rgba(13,148,136,0.12)', color: '#0d9488' },
};

export default function MessageBubble({
  msg,
  isOwn,
  onEdit,
  onDelete,
  onImageClick,
  canEdit,
  onReact,
  currentUserId,
  reactionPickerOpen,
  onToggleReactionPicker,
  actionsOpen,
  onToggleActions,
  onReply,
  onScrollToReply,
  authorRole,
  isMobile,
  scrollContainerRef,
}: Props) {
  // Every element ReactMarkdown renders below needs touch-action/user-select applied directly on
  // ITSELF, not just on the wrapping chat-markdown div - this is the actual missing piece: the
  // sender-name row and the reply-quote button (plain hand-written JSX elsewhere in this file)
  // already had this applied at their own level and swipe worked fine on them, while a plain-text
  // message - which renders as nothing but a bare <p> from the `p` component below, previously
  // with no touch/select styling of its own at all - did not. Both properties are used-value
  // computed per element on real mobile browsers and don't reliably fall back to an ancestor's
  // value (the file's own established, repeatedly-learned lesson - see the bubble div and outer
  // row's own copies of this same style for the earlier instances of the same problem).
  //
  // touchAction stays 'pan-y' here, same as everywhere else - an earlier attempt switched this to
  // 'none' plus a hand-rolled manual scroll (translating scrollContainerRef directly from touch
  // deltas) to route around native scroll not engaging over glyphs, but that manual scroll proved
  // unreliable in the field (regressed ordinary scrolling) and wasn't even a full fix for the
  // swipe issue it targeted. Reverted - see handleTouchEnd's ground-truth fallback for how a swipe
  // that starts on text is actually made to work reliably instead, without touching scroll at all.
  const mdTouchProps = (isMob: boolean | undefined): React.CSSProperties => ({
    touchAction: 'pan-y',
    WebkitUserSelect: isMob ? 'none' : undefined,
    userSelect: isMob ? 'none' : undefined,
    WebkitTouchCallout: isMob ? 'none' : undefined,
  });

  // Built once per [isMobile, isOwn] pair via useMemo, NOT recreated fresh on every render like the
  // rest of this component's inline styles are - this turned out to be the actual root cause of the
  // whole swipe-over-text saga, not native browser gesture-stealing at all. React distinguishes
  // custom component types (react-markdown renders each entry here as `<Component {...props}/>`, not
  // by calling it inline) by FUNCTION REFERENCE, not by visual output. A fresh object literal full of
  // fresh arrow functions on every render - which is what this used to be, defined inline inside
  // renderContent below - means React sees a "new" `p` (etc.) component type at the same tree
  // position on every re-render, and fully unmounts + remounts that subtree rather than patching it.
  // handleTouchStart's own setDragging(true) re-renders this component on every touch that begins
  // over text, destroying the actual DOM node the finger is touching in the process - and once a
  // touch's target is removed from the document mid-gesture, no browser (confirmed identically on
  // Chrome/Brave and Firefox) keeps delivering touchmove/touchend for it. That's why nothing about
  // touch-action, user-select, or even a hard non-passive preventDefault() on touchstart ever made a
  // difference: none of those address DOM node identity, which was the actual problem the whole time.
  const mdComponents = useMemo(
    () => ({
      pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
      code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
        if (className?.includes('language-mermaid')) return <MermaidBlock code={String(children).trimEnd()} />;
        if (String(children).includes('\n'))
          return (
            <pre style={{ margin: '6px -4px', borderRadius: 6, overflow: 'auto', fontSize: 12, ...mdTouchProps(isMobile) }}>
              <code className={className} {...props}>
                {children}
              </code>
            </pre>
          );
        return (
          <code
            style={{
              background: isOwn ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
              padding: '1px 4px',
              borderRadius: 3,
              fontSize: '0.88em',
              fontFamily: 'monospace',
              ...mdTouchProps(isMobile),
            }}
            {...props}
          >
            {children}
          </code>
        );
      },
      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          style={{
            color: isOwn ? 'rgba(255,255,255,0.85)' : 'var(--brand)',
            textDecoration: 'underline',
            ...mdTouchProps(isMobile),
          }}
        >
          {children}
        </a>
      ),
      p: ({ children }: { children?: React.ReactNode }) => <p style={{ margin: '2px 0', ...mdTouchProps(isMobile) }}>{children}</p>,
      h1: ({ children }: { children?: React.ReactNode }) => (
        <h1 style={{ margin: '6px 0 2px', fontSize: '1.3em', fontWeight: 700, lineHeight: 1.3, ...mdTouchProps(isMobile) }}>
          {children}
        </h1>
      ),
      h2: ({ children }: { children?: React.ReactNode }) => (
        <h2 style={{ margin: '5px 0 2px', fontSize: '1.15em', fontWeight: 700, lineHeight: 1.3, ...mdTouchProps(isMobile) }}>
          {children}
        </h2>
      ),
      h3: ({ children }: { children?: React.ReactNode }) => (
        <h3 style={{ margin: '4px 0 2px', fontSize: '1.05em', fontWeight: 600, lineHeight: 1.3, ...mdTouchProps(isMobile) }}>
          {children}
        </h3>
      ),
      h4: ({ children }: { children?: React.ReactNode }) => (
        <h4 style={{ margin: '3px 0 2px', fontSize: '1em', fontWeight: 600, ...mdTouchProps(isMobile) }}>{children}</h4>
      ),
      ul: ({ children }: { children?: React.ReactNode }) => (
        <ul style={{ margin: '4px 0', paddingLeft: 16, ...mdTouchProps(isMobile) }}>{children}</ul>
      ),
      ol: ({ children }: { children?: React.ReactNode }) => (
        <ol style={{ margin: '4px 0', paddingLeft: 16, ...mdTouchProps(isMobile) }}>{children}</ol>
      ),
      li: ({ children }: { children?: React.ReactNode }) => <li style={{ margin: '2px 0', ...mdTouchProps(isMobile) }}>{children}</li>,
      blockquote: ({ children }: { children?: React.ReactNode }) => (
        <blockquote
          style={{
            margin: '4px 0',
            paddingLeft: 10,
            borderLeft: `3px solid ${isOwn ? 'rgba(255,255,255,0.4)' : 'var(--brand)'}`,
            opacity: 0.8,
            ...mdTouchProps(isMobile),
          }}
        >
          {children}
        </blockquote>
      ),
    }),
    [isMobile, isOwn],
  );

  const renderContent = (content: string) => (
    <div className="chat-markdown" style={{ fontSize: 13, lineHeight: 1.5, ...mdTouchProps(isMobile) }}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]} components={mdComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );

  // Group reactions by emoji to show counts and highlight current user's own reactions
  const reactionGroups: Record<string, string[]> = {};
  for (const r of msg.reactions ?? []) {
    if (!reactionGroups[r.emoji]) reactionGroups[r.emoji] = [];
    reactionGroups[r.emoji]!.push(r.userId);
  }
  const hasReactions = Object.keys(reactionGroups).length > 0;

  // Swipe-right-to-reply: drags the whole row right as feedback, reveals a reply icon behind it,
  // and fires onReply once released past SWIPE_THRESHOLD. The gesture's direction is classified
  // ONCE, after DIRECTION_LOCK_DISTANCE of total movement (not on every touchmove tick from the
  // first pixel) - deciding too early made the swipe randomly abandon itself on the small diagonal
  // wobble every touch gesture starts with. Once locked, the classification doesn't change for the
  // rest of the gesture, and ties are biased toward horizontal since swipe is the priority gesture
  // here (tap-to-open-menu is the fallback for anything that isn't a clear swipe).
  // `touchAction: 'pan-y'` below tells the browser to keep handling vertical scroll natively while
  // leaving horizontal movement to this handler, so the two don't fight over the same touch.
  // Mobile's long-press menu mounts already translated off-screen, then flips to `translateY(0)`
  // one frame later so the transition actually animates a slide-up instead of just appearing in
  // place - the standard "animate on mount" trick, since there's nothing to transition from if the
  // final position were rendered immediately.
  const [sheetVisible, setSheetVisible] = useState(false);
  useEffect(() => {
    if (!(isMobile && actionsOpen)) {
      setSheetVisible(false);
      return;
    }
    const raf = requestAnimationFrame(() => setSheetVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [isMobile, actionsOpen]);

  // Desktop's reaction popover used to be `position: absolute` anchored to this message row (open
  // upward via `bottom-full`). That put its containing block inside the scrollable message list,
  // so for a message near the very top of that list - most obviously the first message in the
  // whole thread - there was no room above it and the ancestor's `overflow-y-auto` clipped the
  // popover almost entirely, making it look like it had vanished behind something else. Switching
  // to `position: fixed`, measured from the trigger button's own on-screen position, escapes that
  // clipping (fixed elements aren't bounded by an ancestor's overflow) and lets it flip to open
  // downward instead whenever there isn't enough room above.
  const reactBtnRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pickerStyle, setPickerStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });
  useLayoutEffect(() => {
    if (isMobile || !reactionPickerOpen) return;
    const btn = reactBtnRef.current;
    if (!btn) return;
    const btnRect = btn.getBoundingClientRect();
    const pickerRect = pickerRef.current?.getBoundingClientRect();
    const pickerHeight = pickerRect?.height ?? 260;
    const pickerWidth = pickerRect?.width ?? 260;
    const margin = 6;
    let top = btnRect.top - pickerHeight - margin;
    if (top < margin) top = Math.min(btnRect.bottom + margin, window.innerHeight - pickerHeight - margin);
    let left = isOwn ? btnRect.right - pickerWidth : btnRect.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - pickerWidth - margin));
    setPickerStyle({ position: 'fixed', top, left, zIndex: 50 });
  }, [reactionPickerOpen, isMobile, isOwn]);

  // Swipe-down-to-dismiss on the sheet itself, mirroring the panel's own swipe-to-close gesture -
  // no "Cancel" button needed since the backdrop tap and this both close it.
  const [sheetDragY, setSheetDragY] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const sheetDragStartRef = useRef<number | null>(null);
  const SHEET_DISMISS_THRESHOLD = 80;

  function closeSheet() {
    if (reactionPickerOpen) onToggleReactionPicker();
    onToggleActions();
  }

  function handleSheetTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    sheetDragStartRef.current = t.clientY;
    setSheetDragging(true);
  }
  function handleSheetTouchMove(e: React.TouchEvent) {
    if (sheetDragStartRef.current === null) return;
    const t = e.touches[0];
    if (!t) return;
    setSheetDragY(Math.max(0, t.clientY - sheetDragStartRef.current));
  }
  function handleSheetTouchEnd() {
    if (sheetDragStartRef.current === null) return;
    sheetDragStartRef.current = null;
    setSheetDragging(false);
    if (sheetDragY > SHEET_DISMISS_THRESHOLD) closeSheet();
    setSheetDragY(0);
  }

  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  // Attached to the outer row (see the ref prop below) so a raw, non-passive touchmove listener can
  // be registered on it directly - see the useEffect further down for why.
  const rowRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  // Set once at touchstart and only ever cleared at touchend/touchcancel - unlike touchStartRef
  // above (which gets nulled early: once direction resolves to 'vertical', or once the long-press
  // timer fires), this always survives to the end of the gesture. handleTouchEnd uses it as a
  // ground-truth fallback: touchend/touchcancel is guaranteed to fire with the touch's real final
  // position, regardless of whether any touchmove ticks made it through live (see its own comment).
  const gestureStartRef = useRef<{ x: number; y: number } | null>(null);
  // Updated on every touchmove tick regardless of direction classification - a fire-time safety
  // net for the long-press timer below (see its own comment for why this is needed on top of
  // handleTouchMove's own cancellation).
  const lastTouchPosRef = useRef<{ x: number; y: number } | null>(null);
  // Set at touchstart: whether the touch began inside a rendered markdown text element. The debug
  // overlay proved touchstart on such an element is where the browser silently swallows the whole
  // gesture (no touchmove/touchend ever arrives) - a hard native touch veto is now applied for these
  // (see the touchstart useEffect below), which also suppresses native vertical panning for the same
  // touch, so a 'vertical' classification for a text-started gesture has to manually drive
  // scrollContainerRef itself instead of trusting the browser to already be handling it.
  const startedOnTextRef = useRef(false);
  // Last position the manual-scroll passthrough computed a delta from - separate from touchStartRef
  // (which holds the gesture's ORIGIN, not a rolling last position).
  const lastScrollTickRef = useRef<{ x: number; y: number } | null>(null);
  const directionRef = useRef<'unknown' | 'horizontal' | 'vertical'>('unknown');
  // True for the brief window after a real swipe (meaningful horizontal movement) ends - the
  // browser can still fire a synthetic "click" on release even after a drag, which would otherwise
  // also toggle the tap-to-reveal actions overlay right as (or instead of) the swipe fires onReply.
  const suppressNextClickRef = useRef(false);

  // Long-press (mobile only) opens the Messenger-style overlay instead of a plain tap - swipe and
  // long-press share the same touch tracking above since they're mutually exclusive by nature (a
  // long-press requires holding still; any real movement cancels it in favor of swipe/scroll).
  // Deliberately much longer than a typical system long-press: a slow/deliberate swipe-to-reply
  // can hold fairly still for its first few hundred ms before picking up speed, and 600ms still
  // wasn't enough headroom for that to reliably beat the timer, so the menu kept winning the race.
  // Also cancelled on much smaller movement than the horizontal/vertical swipe classifier needs
  // (see LONG_PRESS_CANCEL_DISTANCE below), so as soon as any real movement starts, the timer gives
  // up immediately rather than needing to wait out the swipe classifier's own threshold.
  const LONG_PRESS_DELAY = 900;
  const LONG_PRESS_CANCEL_DISTANCE = 6;
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  // Belt-and-suspenders on top of the touch-delta cancellation in handleTouchMove below: a real
  // scroll firing on the list is unambiguous proof that panning happened, whereas the delta check
  // depends on this element continuing to receive touchmove ticks at a fine enough grain to notice
  // - not guaranteed once the browser hands a `touch-action: pan-y` gesture off to native scrolling
  // (timing/coalescing of touchmove during native scroll varies by browser). Quick, repeated
  // up/down flicks that start on a bubble were slipping past the delta check often enough to still
  // open the long-press menu; listening to the container's own 'scroll' event directly closes that
  // gap regardless of which bubble the gesture started on.
  useEffect(() => {
    if (!isMobile) return;
    const el = scrollContainerRef?.current;
    if (!el) return;
    function onScroll() {
      logTouch(msg.id, isOwn, 'nativeScrollCancel');
      clearLongPressTimer();
      touchStartRef.current = null;
      directionRef.current = 'unknown';
      setDragging(false);
      setDragX(0);
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isMobile, scrollContainerRef, msg.id, isOwn]);

  function handleTouchStart(e: React.TouchEvent) {
    if (!onReply && !isMobile) return;
    const t = e.touches[0];
    if (!t) return;
    if (isMobile) suppressGlobalTextSelection(true);
    const targetEl = e.target as HTMLElement | null;
    logTouch(msg.id, isOwn, 'start', {
      tag: targetEl?.tagName,
      onText: !!targetEl?.closest?.('.chat-markdown'),
    });
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    gestureStartRef.current = { x: t.clientX, y: t.clientY };
    lastTouchPosRef.current = { x: t.clientX, y: t.clientY };
    startedOnTextRef.current = !!targetEl?.closest?.('.chat-markdown');
    lastScrollTickRef.current = { x: t.clientX, y: t.clientY };
    directionRef.current = 'unknown';
    setDragging(true);
    longPressFiredRef.current = false;
    if (isMobile) {
      clearLongPressTimer();
      longPressTimerRef.current = setTimeout(() => {
        // Fire-time safety net: the cancellation in handleTouchMove below depends on that handler
        // receiving touchmove ticks at a fine enough grain to notice movement before this timer
        // elapses - not guaranteed if the browser delays touchmove delivery while internally
        // evaluating a native text-selection gesture (a documented WebKit/Blink quirk specifically
        // when a touch starts over selectable text, even with user-select suppressed - see
        // renderContent's own comment on this file for the CSS side of the same problem). Re-
        // checking the LAST known position here, not just trusting that cancellation already
        // happened, catches a real swipe whose cancelling touchmove ticks only arrived late.
        //
        // Reads from gestureStartRef, NOT touchStartRef: touchStartRef gets deliberately nulled by
        // handleTouchMove as soon as a gesture classifies 'vertical' (see below), and if that
        // nulling happens to land in the same narrow window as this timer firing, using it here
        // would skip the check entirely and let the menu open mid-scroll. gestureStartRef only ever
        // clears at touchend/touchcancel, so it's always available for this comparison.
        const start = gestureStartRef.current;
        const last = lastTouchPosRef.current;
        if (start && last) {
          const dx = last.x - start.x;
          const dy = last.y - start.y;
          if (Math.abs(dx) >= LONG_PRESS_CANCEL_DISTANCE || Math.abs(dy) >= LONG_PRESS_CANCEL_DISTANCE) return;
        }
        longPressFiredRef.current = true;
        touchStartRef.current = null;
        setDragging(false);
        setDragX(0);
        onToggleActions();
      }, LONG_PRESS_DELAY);
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchStartRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    lastTouchPosRef.current = { x: t.clientX, y: t.clientY };
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;

    // Cancel a pending long-press on much smaller movement than the swipe classifier itself needs
    // - a long-press means holding still, so any real movement at all (well before we know whether
    // it'll turn out to be a swipe or a scroll) should give up on it immediately.
    if (Math.abs(dx) >= LONG_PRESS_CANCEL_DISTANCE || Math.abs(dy) >= LONG_PRESS_CANCEL_DISTANCE) {
      clearLongPressTimer();
    }

    if (directionRef.current === 'unknown') {
      if (Math.abs(dx) < DIRECTION_LOCK_DISTANCE && Math.abs(dy) < DIRECTION_LOCK_DISTANCE) return;
      directionRef.current = Math.abs(dy) > Math.abs(dx) * VERTICAL_BIAS ? 'vertical' : 'horizontal';
      logTouch(msg.id, isOwn, 'directionLocked', { dir: directionRef.current, dx: Math.round(dx), dy: Math.round(dy) });
      if (directionRef.current === 'vertical') {
        setDragging(false);
        setDragX(0);
        // The touchstart veto below preempts ALL native touch handling for a gesture that started
        // on rendered text, including native vertical panning - so a 'vertical' classification here
        // has to manually drive the scroll container itself instead of trusting the browser to
        // already be handling it, the way every other gesture does. Keep touchStartRef alive (don't
        // null it) so subsequent ticks keep reaching this function, and rebase the scroll tick to
        // THIS tick's position so the first actual scroll adjustment below is a smooth incremental
        // step, not a jump covering the whole accumulated distance since touchstart.
        if (startedOnTextRef.current) {
          lastScrollTickRef.current = { x: t.clientX, y: t.clientY };
        } else {
          touchStartRef.current = null;
        }
        return;
      }
    }

    if (directionRef.current === 'horizontal') setDragX(Math.max(0, Math.min(dx, SWIPE_MAX)));
    else if (directionRef.current === 'vertical' && startedOnTextRef.current && scrollContainerRef?.current) {
      const last = lastScrollTickRef.current;
      if (last) scrollContainerRef.current.scrollTop -= t.clientY - last.y;
      lastScrollTickRef.current = { x: t.clientX, y: t.clientY };
    }
  }

  // React's JSX touch props above are attached as passive listeners, so calling preventDefault
  // inside them is a silent no-op. That alone wasn't the full story though - the debug overlay
  // (added a couple rounds ago) proved something stronger: for a touch starting on rendered
  // markdown text, NO further touchmove or touchend ever arrives at all, on Chrome/Brave AND
  // Firefox alike. The browser isn't just winning a race against our classification logic - it's
  // consuming the entire touch sequence right at touchstart, before any of our JS (including a
  // touchmove-time preventDefault) gets a chance to run at all. A veto has to happen at touchstart
  // itself, immediately, for a touch beginning inside `.chat-markdown`, to have any effect.
  //
  // Blocking native default behavior at touchstart also blocks native vertical panning for that
  // same touch - unlike the touchmove-time veto below (which only ever fires once a gesture is
  // already confirmed horizontal, leaving vertical scrolling untouched), this one can't know yet
  // whether the gesture will turn out to be a swipe or a scroll. That's why handleTouchMove above
  // now manually drives scrollContainerRef for a 'vertical'-classified gesture that started on text
  // (see startedOnTextRef) - native pan-y no longer engages for it, so nothing else would.
  useEffect(() => {
    if (!isMobile) return;
    const el = rowRef.current;
    if (!el) return;
    function onNativeTouchStart(e: TouchEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('.chat-markdown')) {
        e.preventDefault();
        logTouch(msg.id, isOwn, 'nativePreventDefaultOnStart');
      }
    }
    el.addEventListener('touchstart', onNativeTouchStart, { passive: false });
    return () => el.removeEventListener('touchstart', onNativeTouchStart);
  }, [isMobile, msg.id, isOwn]);

  // Belt-and-suspenders on top of the touchstart veto above: if a gesture somehow still classifies
  // horizontal without that veto having caught it (e.g. it started just outside `.chat-markdown` and
  // drifted onto text), preempt native handling here too once we're sure it's a swipe, not a scroll.
  useEffect(() => {
    if (!isMobile) return;
    const el = rowRef.current;
    if (!el) return;
    function onNativeTouchMove(e: TouchEvent) {
      if (directionRef.current === 'horizontal') {
        e.preventDefault();
        logTouch(msg.id, isOwn, 'nativePreventDefault');
      }
    }
    el.addEventListener('touchmove', onNativeTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onNativeTouchMove);
  }, [isMobile, msg.id, isOwn]);

  function handleTouchEnd(e: React.TouchEvent) {
    if (isMobile) suppressGlobalTextSelection(false);
    clearLongPressTimer();
    const gestureStart = gestureStartRef.current;
    gestureStartRef.current = null;
    logTouch(msg.id, isOwn, 'end', {
      dir: directionRef.current,
      dragX: Math.round(dragX),
      hasGestureStart: !!gestureStart,
      hasTouchStart: !!touchStartRef.current,
      changedTouches: e.changedTouches.length,
    });

    // Ground-truth fallback, independent of whatever `dragX` ended up as live: touchend/touchcancel
    // is guaranteed to fire with the touch's real final position, even when intermediate touchmove
    // ticks got starved mid-gesture (observed in the field: classification succeeds and dragX starts
    // updating normally - the reply arrow shows - then live ticks stop arriving before the gesture
    // reaches SWIPE_THRESHOLD, leaving dragX stuck below it even though the finger kept moving).
    // Runs whenever direction isn't 'vertical' - i.e. either never classified at all, or correctly
    // classified 'horizontal' but then starved - trusting the real final position over a `dragX`
    // that may be stale in either case. Only genuinely skipped for 'vertical': a real scroll that
    // happens to drift a bit sideways by the time the finger lifts shouldn't be reinterpreted as a
    // swipe just because the final position looks swipe-shaped.
    if (gestureStart && directionRef.current !== 'vertical') {
      const finalTouch = e.changedTouches[0];
      if (finalTouch) {
        const finalDx = finalTouch.clientX - gestureStart.x;
        const finalDy = finalTouch.clientY - gestureStart.y;
        logTouch(msg.id, isOwn, 'groundTruthCheck', { finalDx: Math.round(finalDx), finalDy: Math.round(finalDy) });
        if (finalDx >= SWIPE_THRESHOLD && Math.abs(finalDy) <= Math.abs(finalDx) * VERTICAL_BIAS) {
          if (longPressFiredRef.current) {
            longPressFiredRef.current = false;
            onToggleActions();
          }
          touchStartRef.current = null;
          setDragging(false);
          setDragX(0);
          suppressNextClickRef.current = true;
          logTouch(msg.id, isOwn, 'onReply-fired-groundTruth');
          onReply?.();
          return;
        }
      }
    }

    if (!touchStartRef.current) {
      logTouch(msg.id, isOwn, 'end-noop-noTouchStart');
      return;
    }
    touchStartRef.current = null;
    setDragging(false);
    if (dragX > SWIPE_TAP_TOLERANCE) suppressNextClickRef.current = true;
    if (dragX >= SWIPE_THRESHOLD) {
      logTouch(msg.id, isOwn, 'onReply-fired-dragXFallback', { dragX: Math.round(dragX) });
      onReply?.();
    } else {
      logTouch(msg.id, isOwn, 'end-belowThreshold', { dragX: Math.round(dragX) });
    }
    setDragX(0);
  }

  function handleBubbleClick() {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    if (isMobile) return; // mobile opens the menu via long-press instead of a plain tap
    onToggleActions();
  }

  return (
    <div
      ref={rowRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onContextMenu={(e) => {
        // Android fires its own native long-press (text-selection callout / "Open in new tab" /
        // image-save context menu) at roughly the same ~500ms mark our long-press timer is still
        // counting toward - whichever wins steals the touch from our own gesture tracking, which
        // looked like our long-press "colluding" with the OS's. Suppressing contextmenu outright on
        // mobile stops that native gesture from ever getting a chance to compete.
        if (isMobile) e.preventDefault();
      }}
      className="relative flex group"
      style={{
        // `translateX(0px)` is still a non-'none' transform value, and ANY transform on an element
        // makes it the containing block for `position: fixed` descendants - so the mobile overlay
        // below (meant to cover the full viewport) was actually being sized/positioned relative to
        // this one message row instead of the screen, because this was unconditionally set even
        // at rest. Only applying an actual transform while genuinely dragging fixes that.
        transform: dragX ? `translateX(${dragX}px)` : undefined,
        transition: dragging ? 'none' : 'transform 200ms ease',
        touchAction: 'pan-y',
        // On mobile, text selection is disabled for the entire touch lifecycle (not only once a
        // horizontal drag is confirmed) - the OS's native "select this text" callout can otherwise
        // kick in during the initial hold, before our own touchmove handler has moved the direction
        // out of 'unknown', hijacking the same hold our long-press timer is waiting out. Desktop
        // (mouse) users keep normal text selection since none of this gesture handling applies to
        // them.
        WebkitUserSelect: isMobile ? 'none' : undefined,
        userSelect: isMobile ? 'none' : undefined,
        WebkitTouchCallout: isMobile ? 'none' : undefined,
      }}
    >
      {onReply && (
        <div
          className="absolute top-1/2 -translate-y-1/2 left-0 flex items-center justify-center rounded-full transition-opacity"
          style={{
            width: 28,
            height: 28,
            marginLeft: -36,
            background: 'var(--surface-2)',
            color: 'var(--brand)',
            opacity: dragX > 8 ? Math.min(dragX / SWIPE_THRESHOLD, 1) : 0,
          }}
          aria-hidden="true"
        >
          ↩
        </div>
      )}
      <div
        onClick={handleBubbleClick}
        className={`flex-1 min-w-0 ${isOwn ? 'items-end' : 'items-start'} flex flex-col relative cursor-pointer ${hasReactions ? 'pb-3' : ''}`}
        style={{ touchAction: 'pan-y' }}
      >
        <div className={`flex items-center gap-1.5 mb-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
          <span className="text-sm leading-none flex-shrink-0">{msg.author.avatarEmoji ?? '👤'}</span>
          <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
            {displayName(msg.author)}
          </span>
          {authorRole && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ ...(ROLE_STYLE[authorRole] ?? ROLE_STYLE['Server Admin']), lineHeight: 1.2 }}
            >
              {authorRole}
            </span>
          )}
          <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
            {formatTime(msg.createdAt)}
            {msg.editedAt ? ' (edited)' : ''}
          </span>
        </div>
        {/* Wraps the bubble + attachments (not the name/timestamp row above) so reactions can
            overlap the bottom corner of whichever is last, instead of taking a full row below -
            same "badge hangs off the message" pattern most chat apps use. */}
        <div className="relative" style={{ touchAction: 'pan-y' }}>
        {(msg.content || msg.replyTo) && (
          <div
            className={`px-3 py-2 rounded-2xl text-sm max-w-[320px] ${isOwn ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
            style={{
              background: isOwn ? 'var(--brand)' : 'var(--surface-2)',
              color: isOwn ? 'white' : 'var(--text)',
              border: isOwn ? 'none' : '1px solid var(--border)',
              wordBreak: 'break-word',
              touchAction: 'pan-y',
              // Repeated here (not just on the outer wrapper) for the same reason touchAction is
              // repeated: user-select doesn't reliably compute down from an ancestor across
              // browsers, and this bubble - a full selectable paragraph of text - is exactly where
              // Android's native long-press-to-select is most eager to kick in.
              WebkitUserSelect: isMobile ? 'none' : undefined,
              userSelect: isMobile ? 'none' : undefined,
            }}
          >
            {/* Quote block inside the bubble, clicking jumps to original (not the tap-for-actions
                toggle above - this is specifically about the quote, not the message itself) */}
            {msg.replyTo && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onScrollToReply?.(msg.replyTo!.id);
                }}
                className="w-full text-left mb-2 px-2 py-1.5 rounded-lg flex items-center gap-2"
                style={{
                  background: isOwn ? 'rgba(0,0,0,0.15)' : 'var(--surface)',
                  borderLeft: `3px solid ${isOwn ? 'rgba(255,255,255,0.5)' : 'var(--brand)'}`,
                }}
                title="Jump to original message"
              >
                {(() => {
                  const img = msg.replyTo!.attachments.find((a) => a.type?.startsWith('image/'));
                  return img ? (
                    <img
                      src={img.thumbnailUrl ?? img.url}
                      alt=""
                      className="w-8 h-8 rounded object-cover flex-shrink-0"
                    />
                  ) : null;
                })()}
                <div className="min-w-0">
                  <span
                    className="text-[10px] font-semibold block"
                    style={{ color: isOwn ? 'rgba(255,255,255,0.85)' : 'var(--brand)' }}
                  >
                    {displayName(msg.replyTo.author)}
                  </span>
                  <span
                    className="text-[10px] block truncate"
                    style={{ color: isOwn ? 'rgba(255,255,255,0.65)' : 'var(--text-3)', maxWidth: 220 }}
                  >
                    {msg.replyTo.content
                      ? msg.replyTo.content.slice(0, 120)
                      : msg.replyTo.attachments.length > 0
                        ? '📷 Photo'
                        : ''}
                  </span>
                </div>
              </button>
            )}
            {msg.content && renderContent(msg.content)}
          </div>
        )}
        {msg.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {msg.attachments.map((att, i) =>
              att.type?.startsWith('image/') ? (
                <button key={i} onClick={() => onImageClick(att.url)} className="block">
                  <img
                    src={att.thumbnailUrl ?? att.url}
                    alt={att.name}
                    loading="lazy"
                    decoding="async"
                    className="rounded-lg object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
                    style={{ maxWidth: 200, maxHeight: 160 }}
                  />
                </button>
              ) : (
                <a
                  key={i}
                  href={att.url}
                  download={att.name}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs"
                  style={{ background: 'var(--surface-2)', color: 'var(--brand)', border: '1px solid var(--border)' }}
                >
                  📎 {att.name}
                </a>
              ),
            )}
          </div>
        )}

        {/* Reactions - overlap the bottom corner of the bubble/attachments above (like Messenger,
            WhatsApp, etc.) instead of taking a full row below, so a reacted-to message costs no
            extra vertical space beyond the badge peeking over the corner. Only rendered once at
            least one exists (adding a reaction is done from the action menu, not from here). */}
        {hasReactions && (
          <div className={`absolute -bottom-2.5 flex items-center gap-1 ${isOwn ? 'right-1' : 'left-1'}`}>
            {Object.entries(reactionGroups).map(([emoji, userIds]) => {
              const mine = currentUserId ? userIds.includes(currentUserId) : false;
              return (
                <button
                  key={emoji}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReact(emoji);
                  }}
                  title={userIds.length > 3 ? userIds.join(', ') : undefined}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs shadow-sm transition-colors"
                  style={{
                    background: mine ? 'var(--brand-subtle)' : 'var(--surface-2)',
                    border: `1px solid ${mine ? 'var(--brand)' : 'var(--border)'}`,
                    color: mine ? 'var(--brand)' : 'var(--text-2)',
                  }}
                >
                  {emoji} <span>{userIds.length}</span>
                </button>
              );
            })}
          </div>
        )}
        </div>

        {/* Desktop: emoji picker for reactions, anchored next to the bubble. Mobile has its own
            overlay below instead (full-screen backdrop + centered quick-react row + bottom sheet),
            matching Messenger rather than a small anchored popover. */}
        {!isMobile && reactionPickerOpen && (
          <div
            ref={pickerRef}
            onClick={(e) => e.stopPropagation()}
            className="p-2 rounded-xl shadow-xl"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              ...pickerStyle,
            }}
          >
            <EmojiPicker
              onChange={(e) => {
                onReact(e);
                onToggleReactionPicker();
              }}
            />
          </div>
        )}

        {/* Desktop: reply, react, edit/delete - one menu, icon-only (Teams-style). Absolutely
            positioned so it takes zero layout space when hidden. Deliberately overlaps the top of
            the name/timestamp row (negative top, not bottom-full+margin) rather than floating
            above it with a gap - a gap between the bubble and the menu is dead space the mouse has
            to cross on the way there, and group-hover ends the moment the cursor leaves every
            element of the group, closing the menu before it's reached. Covering part of the name
            row briefly is fine since it's already how you'd know whose message this is. Shown on
            hover (group-hover) or click-toggled via actionsOpen. Mobile uses the long-press overlay
            below instead of this row entirely. */}
        {!isMobile && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={`absolute -top-2 flex gap-0.5 p-1 rounded-lg shadow-lg transition-opacity z-10 ${
              isOwn ? 'right-0 flex-row-reverse' : 'left-0'
            } ${actionsOpen ? 'opacity-100' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'}`}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            {onReply && (
              <button
                onClick={onReply}
                title="Reply"
                aria-label="Reply"
                className="hover-only items-center justify-center w-7 h-7 rounded text-sm"
                style={{ color: 'var(--text-3)' }}
              >
                ↩
              </button>
            )}
            <button
              ref={reactBtnRef}
              onClick={onToggleReactionPicker}
              title="React"
              aria-label="React"
              className="flex items-center justify-center w-7 h-7 rounded text-sm"
              style={{ color: 'var(--text-3)' }}
            >
              😊
            </button>
            {isOwn && canEdit && (
              <button
                onClick={onEdit}
                title="Edit"
                aria-label="Edit"
                className="flex items-center justify-center w-7 h-7 rounded text-sm"
                style={{ color: 'var(--text-3)' }}
              >
                ✎
              </button>
            )}
            {isOwn && (
              <button
                onClick={onDelete}
                title="Delete"
                aria-label="Delete"
                className="flex items-center justify-center w-7 h-7 rounded text-sm"
                style={{ color: '#ef4444' }}
              >
                🗑
              </button>
            )}
          </div>
        )}

        {/* Mobile: Messenger-style long-press menu - one panel that slides up from the bottom of
            the screen (not a floating modal), holding the quick-reaction row (expands into the
            same full multi-page EmojiPicker used everywhere else via "+") above a divider, then
            Reply/Edit/Delete/Copy side-by-side below - no "Cancel" needed since tapping the
            backdrop or swiping the sheet down both close it. onReply/onEdit/onDelete already close
            the menu themselves (ChatPanel.tsx sets activeMessageId to null in each), so they're
            called directly here without an extra toggle - only the reaction picks need to close it
            explicitly. */}
        {isMobile && actionsOpen && (
          <>
            <button
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(0,0,0,0.5)' }}
              aria-label="Close message menu"
              onClick={closeSheet}
            />
            <div
              onTouchStart={handleSheetTouchStart}
              onTouchMove={handleSheetTouchMove}
              onTouchEnd={handleSheetTouchEnd}
              onTouchCancel={handleSheetTouchEnd}
              className="fixed left-0 right-0 bottom-0 z-50 rounded-t-2xl shadow-2xl"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderBottom: 'none',
                paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
                transform: sheetVisible ? `translateY(${sheetDragY}px)` : 'translateY(100%)',
                transition: sheetDragging ? 'none' : 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)',
                touchAction: 'none',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pt-2 pb-1" aria-hidden="true">
                <div className="w-9 h-1 rounded-full" style={{ background: 'var(--border-2)' }} />
              </div>
              <div className="px-2 pb-2" style={{ borderBottom: '1px solid var(--border)' }}>
                {reactionPickerOpen ? (
                  <EmojiPicker
                    onChange={(e) => {
                      onReact(e);
                      onToggleReactionPicker();
                      onToggleActions();
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-around">
                    {EMOJI_SET.slice(0, QUICK_REACTION_COUNT).map((e) => (
                      <button
                        key={e}
                        onClick={() => {
                          onReact(e);
                          onToggleActions();
                        }}
                        className="flex items-center justify-center rounded-full text-2xl transition-transform active:scale-90"
                        style={{ width: 40, height: 40 }}
                      >
                        {e}
                      </button>
                    ))}
                    <button
                      onClick={onToggleReactionPicker}
                      aria-label="More emoji"
                      className="flex items-center justify-center rounded-full text-lg flex-shrink-0"
                      style={{ width: 40, height: 40, background: 'var(--surface-2)', color: 'var(--text-2)' }}
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
              {/* Side-by-side icon+label actions (Messenger's own layout), not stacked full-width rows */}
              <div className="flex items-stretch p-2 gap-1">
                {onReply && (
                  <button
                    onClick={onReply}
                    className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg"
                    style={{ color: 'var(--text)' }}
                  >
                    <span className="text-xl">↩</span>
                    <span className="text-[11px]">Reply</span>
                  </button>
                )}
                {isOwn && canEdit && (
                  <button
                    onClick={onEdit}
                    className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg"
                    style={{ color: 'var(--text)' }}
                  >
                    <span className="text-xl">✎</span>
                    <span className="text-[11px]">Edit</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(msg.content).catch(() => {});
                    onToggleActions();
                  }}
                  className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg"
                  style={{ color: 'var(--text)' }}
                >
                  <span className="text-xl">📋</span>
                  <span className="text-[11px]">Copy</span>
                </button>
                {isOwn && (
                  <button
                    onClick={onDelete}
                    className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg"
                    style={{ color: '#ef4444' }}
                  >
                    <span className="text-xl">🗑</span>
                    <span className="text-[11px]">Delete</span>
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
