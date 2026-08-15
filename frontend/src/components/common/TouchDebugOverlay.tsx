import { useEffect, useState } from 'react';

// Opt-in via a `?touchdebug` query param - never shown otherwise. Added after several rounds of
// guessing at the mobile swipe-to-reply bug blind (no way to attach a real device debugger here) -
// this renders a live trace of what MessageBubble's touch handlers actually saw, directly on the
// phone screen, so the next repro gives us real facts instead of another theory.
export const TOUCH_DEBUG = typeof window !== 'undefined' && /touchdebug/.test(window.location.search);

type LogEntry = Record<string, unknown>;

export function logTouch(msgId: string, isOwn: boolean, phase: string, extra?: LogEntry) {
  if (!TOUCH_DEBUG) return;
  const w = window as unknown as { __touchDebug?: LogEntry[] };
  const entry: LogEntry = { t: Date.now() % 100000, id: msgId.slice(-4), side: isOwn ? 'R' : 'L', phase, ...extra };
  w.__touchDebug = w.__touchDebug ?? [];
  w.__touchDebug.push(entry);
  if (w.__touchDebug.length > 40) w.__touchDebug.shift();
}

// Polls the shared log above rather than receiving it via props - touch handlers live in many
// separate MessageBubble instances (one per message) and this overlay renders once, fixed, over
// the whole panel.
export default function TouchDebugOverlay() {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    if (!TOUCH_DEBUG) return;
    const iv = setInterval(() => {
      const w = window as unknown as { __touchDebug?: LogEntry[] };
      const log = w.__touchDebug ?? [];
      setLines(log.slice(-14).map((e) => Object.entries(e).map(([k, v]) => `${k}:${v}`).join(' ')));
    }, 150);
    return () => clearInterval(iv);
  }, []);
  if (!TOUCH_DEBUG) return null;
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: '38vh',
        overflowY: 'auto',
        background: 'rgba(0,0,0,0.88)',
        color: '#4ade80',
        fontFamily: 'monospace',
        fontSize: 9,
        lineHeight: 1.35,
        padding: '4px 6px',
        zIndex: 9999,
        pointerEvents: 'none',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {lines.length === 0 ? 'touchdebug: waiting for a touch on a message…' : lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}
