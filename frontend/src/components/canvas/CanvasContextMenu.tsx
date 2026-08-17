/**
 * The right-click context menu for canvas edges and task nodes (quick status set, open detail,
 * remove dependency/link). Extracted verbatim from CanvasView.tsx; `ctxMenu`/`ctxTask` stay owned
 * by the parent (CanvasView), this is presentation + click-wiring only.
 */
import type { Task } from '../../types';
import { STATUS_OPTIONS } from './canvasUtils';
import type { CtxMenu } from './canvasUtils';

interface Props {
  ctxMenu: CtxMenu;
  canWriteCanvas: boolean;
  ctxTask: Task | null | undefined;
  onDeleteEdge: (srcId: string, tgtId: string, edgeId: string) => void;
  onQuickSetStatus: (taskId: string, status: string) => void;
  onOpenDetail: (task: Task) => void;
  onClose: () => void;
}

export default function CanvasContextMenu({
  ctxMenu,
  canWriteCanvas,
  ctxTask,
  onDeleteEdge,
  onQuickSetStatus,
  onOpenDetail,
  onClose,
}: Props) {
  const isProductEdge = (s: string, t: string) => s.startsWith('product-') || t.startsWith('product-');

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only guard against the parent's outside-click dismiss; not a keyboard-operable action
    <div
      className="fixed rounded-xl shadow-xl z-50 py-1 overflow-hidden"
      style={{
        left: ctxMenu.x,
        top: ctxMenu.y,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        minWidth: 180,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {ctxMenu.type === 'edge' && canWriteCanvas && (
        <>
          <div
            className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}
          >
            {isProductEdge(ctxMenu.srcId!, ctxMenu.tgtId!) ? 'Product link' : 'Dependency'}
          </div>
          <button
            className="w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2"
            style={{ color: '#ef4444' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={() => onDeleteEdge(ctxMenu.srcId!, ctxMenu.tgtId!, ctxMenu.edgeId!)}
          >
            ✕ Remove {isProductEdge(ctxMenu.srcId!, ctxMenu.tgtId!) ? 'link' : 'dependency'}
          </button>
        </>
      )}
      {ctxMenu.type === 'node' && ctxTask && (
        <>
          {canWriteCanvas && (
            <>
              <div
                className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}
              >
                Set status
              </div>
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => onQuickSetStatus(ctxTask.id, s.key)}
                  className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors"
                  style={{ color: ctxTask.status === s.key ? 'var(--brand)' : 'var(--text)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  {s.label}
                  {ctxTask.status === s.key && (
                    <span className="ml-auto" style={{ color: 'var(--brand)' }}>
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </>
          )}
          <div style={{ borderTop: canWriteCanvas ? '1px solid var(--border)' : undefined }}>
            <button
              className="w-full text-left px-3 py-2 text-sm transition-colors"
              style={{ color: 'var(--text-2)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              onClick={() => {
                onClose();
                onOpenDetail(ctxTask);
              }}
            >
              Open detail…
            </button>
          </div>
        </>
      )}
      <button
        className="w-full text-left px-3 py-1.5 text-xs transition-colors"
        style={{ color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        onClick={onClose}
      >
        Cancel
      </button>
    </div>
  );
}
