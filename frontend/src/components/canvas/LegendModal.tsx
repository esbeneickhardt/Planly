/** Read-only reference modal explaining the canvas's node/edge visual language (status colours,
 * milestone/product node styling, dependency vs in-progress-animated vs product-feed edges) and
 * listing its drag/click/keyboard interactions. */
import Modal from '../common/Modal';

export default function LegendModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Canvas visual guide" onClose={onClose} width="max-w-md">
      <div className="space-y-4 text-sm" style={{ color: 'var(--text-2)' }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-3)' }}>
            Nodes
          </p>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <div
                style={{
                  width: 52,
                  height: 30,
                  borderRadius: 6,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderLeft: '3px solid #3b82f6',
                  flexShrink: 0,
                }}
              />
              <span>Regular task - left border shows status or custom colour</span>
            </div>
            <div className="flex items-center gap-3">
              <div
                style={{
                  width: 52,
                  height: 30,
                  borderRadius: 6,
                  background: 'rgba(245,158,11,0.08)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderLeft: '3px solid #f59e0b',
                  flexShrink: 0,
                }}
              />
              <span>Milestone - task with a deadline (amber tint)</span>
            </div>
            <div className="flex items-center gap-3">
              <div
                style={{
                  width: 52,
                  height: 30,
                  borderRadius: 6,
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderLeft: '3px solid #ef4444',
                  flexShrink: 0,
                }}
              />
              <span>Overdue milestone - deadline has passed</span>
            </div>
            <div className="flex items-center gap-3">
              <div
                style={{
                  width: 52,
                  height: 30,
                  borderRadius: 8,
                  background: 'var(--brand)',
                  flexShrink: 0,
                }}
              />
              <span>Product node - final deliverable all tasks lead to</span>
            </div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-3)' }}>
            Edges
          </p>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <svg width="52" height="16" style={{ flexShrink: 0 }}>
                <line x1="0" y1="8" x2="52" y2="8" stroke="var(--border-2)" strokeWidth="2" />
              </svg>
              <span>Dependency - source must complete before target</span>
            </div>
            <div className="flex items-center gap-3">
              <svg width="52" height="16" style={{ flexShrink: 0 }}>
                <line x1="0" y1="8" x2="52" y2="8" stroke="var(--border-2)" strokeWidth="2" strokeDasharray="4 3">
                  <animate attributeName="stroke-dashoffset" from="0" to="-14" dur="0.6s" repeatCount="indefinite" />
                </line>
              </svg>
              <span>Animated - target task is currently In Progress</span>
            </div>
            <div className="flex items-center gap-3">
              <svg width="52" height="16" style={{ flexShrink: 0 }}>
                <line x1="0" y1="8" x2="52" y2="8" stroke="var(--brand)" strokeWidth="2" strokeDasharray="5 3" />
              </svg>
              <span>Dashed purple - task feeds directly into the product</span>
            </div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-3)' }}>
            Interactions
          </p>
          <ul className="space-y-1 text-xs list-disc list-inside" style={{ color: 'var(--text-3)' }}>
            <li>Drag from a handle to another node to create a dependency</li>
            <li>Click an edge then press Delete / Backspace to remove it</li>
            <li>Right-click a task to quickly change its status</li>
            <li>Click a task to select it - double-click to open its detail panel</li>
            <li>Select a task and press Delete / Backspace to delete it</li>
            <li>When a sub-plan is selected the checkbox on each task adds / removes it</li>
            <li>Sub-plan map mode colours each task by which sub-plan(s) it belongs to</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}
