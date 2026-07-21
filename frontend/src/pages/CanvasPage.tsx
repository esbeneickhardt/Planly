/**
 * Thin wrapper that renders the CanvasView (free-form node graph) at full viewport size.
 * All canvas state — node positions, zoom, snapshots, and connection drawing — live in CanvasView.
 * On mobile we show a placeholder: the graph requires pointer precision not available on touch-only devices.
 */
import CanvasView from '../components/canvas/CanvasView';

export default function CanvasPage() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      {/* Mobile placeholder */}
      <div
        className="md:hidden flex flex-col items-center justify-center gap-4 h-full px-8 text-center"
        style={{ color: 'var(--text-3)' }}
        role="status"
        aria-label="Canvas not available on mobile"
      >
        <span style={{ fontSize: 48 }} aria-hidden="true">🗺️</span>
        <p className="text-base font-medium" style={{ color: 'var(--text)' }}>Canvas requires a larger screen</p>
        <p className="text-sm max-w-xs">
          The dependency graph relies on precise pointer interaction.
          Open Planly on a desktop or tablet to use Canvas.
        </p>
      </div>
      {/* Full canvas — hidden on small screens */}
      <div className="hidden md:block" style={{ width: '100%', height: '100%' }}>
        <CanvasView />
      </div>
    </div>
  );
}
