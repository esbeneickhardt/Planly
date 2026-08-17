/**
 * The "Layouts" dropdown in CanvasControlPanel's Row 2 - opens the Share/Load layout modals.
 * Extracted verbatim from CanvasView.tsx; presentation only, modal state stays owned by the
 * parent (CanvasView, via useCanvasSnapshots).
 */
import { chip } from './canvasUtils';

interface Props {
  open: boolean;
  onToggle: () => void;
  canWriteCanvas: boolean;
  onOpenShareModal: () => void;
  onOpenLoadModal: () => void;
}

export default function CanvasLayoutsDropdown({ open, onToggle, canWriteCanvas, onOpenShareModal, onOpenLoadModal }: Props) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
        style={chip(false)}
      >
        Layouts <span className="text-[10px] opacity-50">▾</span>
      </button>
      {open && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only guard against the parent's outside-click dismiss; not a keyboard-operable action
        <div
          className="absolute left-0 top-full mt-1 rounded-xl shadow-xl z-50 overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 200 }}
          onClick={(e) => e.stopPropagation()}
        >
          {canWriteCanvas && (
            <button
              onClick={onOpenShareModal}
              className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2.5 transition-colors"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--surface-2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ fontSize: 15 }}>↑</span>
              <div>
                <p style={{ color: 'var(--text)', fontWeight: 500 }}>Save layout</p>
                <p style={{ color: 'var(--text-3)', fontSize: 10, marginTop: 1 }}>Share current positions with team</p>
              </div>
            </button>
          )}
          <button
            onClick={onOpenLoadModal}
            className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2.5 transition-colors"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--surface-2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span style={{ fontSize: 15 }}>↓</span>
            <div>
              <p style={{ color: 'var(--text)', fontWeight: 500 }}>Load layout</p>
              <p style={{ color: 'var(--text-3)', fontSize: 10, marginTop: 1 }}>Apply a saved team snapshot</p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
