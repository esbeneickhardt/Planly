/**
 * The bottom-center Panel that appears when 2+ task nodes are multi-selected on the canvas -
 * owner/reviewer/status/color bulk-assign dropdowns. Extracted verbatim from CanvasView.tsx.
 * The four dropdown-open booleans and their outside-click-dismiss refs stay owned by the parent
 * (CanvasView) since the outside-click listeners are registered there; this component is
 * presentation-only.
 */
import type { RefObject } from 'react';

interface Member {
  userId: string;
  user: { id: string; username: string; realName: string | null; avatarEmoji: string | null };
}

interface Props {
  selectedCount: number;
  canvasMembers: Member[];
  bulkAssigning: boolean;

  bulkOwnerRef: RefObject<HTMLDivElement>;
  showBulkOwner: boolean;
  setShowBulkOwner: (updater: boolean | ((v: boolean) => boolean)) => void;
  onAssignOwner: (userId: string) => void;

  bulkReviewerRef: RefObject<HTMLDivElement>;
  showBulkReviewer: boolean;
  setShowBulkReviewer: (updater: boolean | ((v: boolean) => boolean)) => void;
  onAssignReviewer: (userId: string) => void;

  bulkStatusRef: RefObject<HTMLDivElement>;
  showBulkStatus: boolean;
  setShowBulkStatus: (updater: boolean | ((v: boolean) => boolean)) => void;
  onSetStatus: (status: string) => void;

  bulkColorRef: RefObject<HTMLDivElement>;
  showBulkColor: boolean;
  setShowBulkColor: (updater: boolean | ((v: boolean) => boolean)) => void;
  bulkColorLegend: Record<string, string>;
  bulkEnabledColors: string[];
  onSetColor: (color: string | null) => void;
}

const STATUS_ITEMS = [
  { key: 'backlog', label: 'Not started', color: '#64748b' },
  { key: 'todo', label: 'To Do', color: '#3b82f6' },
  { key: 'in_progress', label: 'In Progress', color: '#f59e0b' },
  { key: 'blocked', label: 'Blocked', color: '#ef4444' },
  { key: 'done', label: 'Done', color: '#10b981' },
];

export default function CanvasBulkActionBar({
  selectedCount,
  canvasMembers,
  bulkAssigning,
  bulkOwnerRef,
  showBulkOwner,
  setShowBulkOwner,
  onAssignOwner,
  bulkReviewerRef,
  showBulkReviewer,
  setShowBulkReviewer,
  onAssignReviewer,
  bulkStatusRef,
  showBulkStatus,
  setShowBulkStatus,
  onSetStatus,
  bulkColorRef,
  showBulkColor,
  setShowBulkColor,
  bulkColorLegend,
  bulkEnabledColors,
  onSetColor,
}: Props) {
  return (
    <div
      className="flex items-center gap-4 px-4 py-2.5 rounded-xl text-xs"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
        marginBottom: 12,
      }}
    >
      <span style={{ color: 'var(--text-3)' }}>{selectedCount} selected</span>

      {/* Assign owner */}
      <div ref={bulkOwnerRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setShowBulkOwner((v) => !v)}
          disabled={bulkAssigning}
          className="font-medium transition-opacity"
          style={{ color: 'var(--brand)', opacity: bulkAssigning ? 0.5 : 1 }}
        >
          {bulkAssigning ? 'Updating…' : 'Assign owner ▾'}
        </button>
        {showBulkOwner && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: 6,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              minWidth: 180,
              zIndex: 50,
              overflow: 'hidden',
            }}
          >
            {canvasMembers.length === 0 ? (
              <div className="px-3 py-2" style={{ color: 'var(--text-3)' }}>
                Loading…
              </div>
            ) : (
              canvasMembers.map((m) => (
                <button
                  key={m.userId}
                  onClick={() => onAssignOwner(m.userId)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left"
                  style={{ color: 'var(--text)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span>{m.user.avatarEmoji ?? '👤'}</span>
                  <span>{m.user.realName ?? m.user.username}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Assign reviewer */}
      <div ref={bulkReviewerRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setShowBulkReviewer((v) => !v)}
          disabled={bulkAssigning}
          className="font-medium transition-opacity"
          style={{ color: 'var(--brand)', opacity: bulkAssigning ? 0.5 : 1 }}
        >
          {bulkAssigning ? 'Updating…' : 'Assign reviewer ▾'}
        </button>
        {showBulkReviewer && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: 6,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              minWidth: 180,
              zIndex: 50,
              overflow: 'hidden',
            }}
          >
            {canvasMembers.length === 0 ? (
              <div className="px-3 py-2" style={{ color: 'var(--text-3)' }}>
                Loading…
              </div>
            ) : (
              canvasMembers.map((m) => (
                <button
                  key={m.userId}
                  onClick={() => onAssignReviewer(m.userId)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left"
                  style={{ color: 'var(--text)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span>{m.user.avatarEmoji ?? '👤'}</span>
                  <span>{m.user.realName ?? m.user.username}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Set status */}
      <div ref={bulkStatusRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setShowBulkStatus((v) => !v)}
          disabled={bulkAssigning}
          className="font-medium transition-opacity"
          style={{ color: 'var(--brand)', opacity: bulkAssigning ? 0.5 : 1 }}
        >
          Set status ▾
        </button>
        {showBulkStatus && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: 6,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              minWidth: 160,
              zIndex: 50,
              overflow: 'hidden',
            }}
          >
            {STATUS_ITEMS.map((s) => (
              <button
                key={s.key}
                onClick={() => onSetStatus(s.key)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left"
                style={{ color: 'var(--text)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div ref={bulkColorRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setShowBulkColor((v) => !v)}
          disabled={bulkAssigning}
          className="font-medium transition-opacity"
          style={{ color: 'var(--brand)', opacity: bulkAssigning ? 0.5 : 1 }}
        >
          Set color ▾
        </button>
        {showBulkColor && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: 6,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              minWidth: 180,
              zIndex: 50,
              overflow: 'hidden',
            }}
          >
            <div className="flex items-center gap-2 flex-wrap p-2.5">
              {bulkEnabledColors.map((c) => (
                <button
                  key={c}
                  onClick={() => onSetColor(c)}
                  title={bulkColorLegend[c] || c}
                  className="w-6 h-6 rounded-full transition-transform"
                  style={{ background: c }}
                />
              ))}
            </div>
            <button
              onClick={() => onSetColor(null)}
              className="w-full text-left px-3 py-2 text-xs"
              style={{ color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Clear color
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
