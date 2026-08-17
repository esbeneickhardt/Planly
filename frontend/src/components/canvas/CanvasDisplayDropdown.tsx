/**
 * The "Display" dropdown in CanvasControlPanel's Row 2 - manual re-layout trigger, sub-plan
 * colour map toggle, and simple-mode toggle. Extracted verbatim from CanvasView.tsx; presentation
 * only, all state stays owned by the parent (CanvasView).
 */
import { chip } from './canvasUtils';

interface Props {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onRelayout: () => void;
  showSprintAura: boolean;
  onToggleSprintAura: () => void;
  simpleMode: boolean;
  onToggleSimpleMode: () => void;
}

export default function CanvasDisplayDropdown({
  open,
  onToggle,
  onClose,
  onRelayout,
  showSprintAura,
  onToggleSprintAura,
  simpleMode,
  onToggleSimpleMode,
}: Props) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
        style={chip(showSprintAura || simpleMode)}
      >
        Display{showSprintAura || simpleMode ? ' ●' : ''}
        <span className="text-[10px] opacity-50">▾</span>
      </button>
      {open && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only guard against the parent's outside-click dismiss; not a keyboard-operable action
        <div
          className="absolute left-0 top-full mt-1 rounded-xl shadow-xl z-50 overflow-hidden"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            minWidth: 200,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              onRelayout();
              onClose();
            }}
            className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2.5 transition-colors"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--surface-2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span
              style={{
                width: 20,
                textAlign: 'center',
                flexShrink: 0,
                fontSize: 14,
              }}
            >
              ◫
            </span>
            <div className="flex-1">
              <p style={{ color: 'var(--text)', fontWeight: 500 }}>Re-layout graph</p>
              <p style={{ color: 'var(--text-3)', fontSize: 10, marginTop: 1 }}>Auto-arrange using DAG layout</p>
            </div>
          </button>
          <div style={{ borderTop: '1px solid var(--border)' }} />
          <button
            onClick={onToggleSprintAura}
            className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2.5 transition-colors"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--surface-2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span
              style={{
                width: 20,
                textAlign: 'center',
                flexShrink: 0,
                fontSize: 14,
              }}
            >
              🎨
            </span>
            <div className="flex-1">
              <p style={{ color: 'var(--text)', fontWeight: 500 }}>Sub-plan colour map</p>
              <p style={{ color: 'var(--text-3)', fontSize: 10, marginTop: 1 }}>Colour tasks by sub-plan membership</p>
            </div>
            {showSprintAura && <span style={{ color: 'var(--brand)', fontSize: 12 }}>✓</span>}
          </button>
          <button
            onClick={onToggleSimpleMode}
            className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2.5 transition-colors"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--surface-2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span
              style={{
                width: 20,
                textAlign: 'center',
                flexShrink: 0,
                fontSize: 14,
              }}
            >
              ◻
            </span>
            <div className="flex-1">
              <p style={{ color: 'var(--text)', fontWeight: 500 }}>Simple mode</p>
              <p style={{ color: 'var(--text-3)', fontSize: 10, marginTop: 1 }}>Show task names only</p>
            </div>
            {simpleMode && <span style={{ color: 'var(--brand)', fontSize: 12 }}>✓</span>}
          </button>
        </div>
      )}
    </div>
  );
}
