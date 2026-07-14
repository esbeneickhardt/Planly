/**
 * Thin wrapper that renders the CanvasView (free-form node graph) at full viewport size.
 * All canvas state — node positions, zoom, snapshots, and connection drawing — live in CanvasView.
 */
import CanvasView from '../components/canvas/CanvasView';

export default function CanvasPage() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <CanvasView />
    </div>
  );
}
