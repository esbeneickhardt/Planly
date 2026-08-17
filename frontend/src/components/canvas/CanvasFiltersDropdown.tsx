/**
 * The "Filters" dropdown in CanvasControlPanel's Row 2 - status filter + milestone-focus
 * checklist. Extracted verbatim from CanvasView.tsx; all filter state stays owned by the parent
 * (CanvasView), this is presentation-only.
 */
import { chip, STATUS_OPTIONS } from './canvasUtils';
import type { Task } from '../../types';

interface Props {
  open: boolean;
  onToggle: () => void;
  statusFilter: string | null;
  onSetStatusFilter: (v: string | null) => void;
  selectedMilestoneIds: string[];
  onSetMilestoneIds: (v: string[]) => void;
  milestoneTasks: Task[];
  filteredMilestoneTasks: Task[];
  milestoneSearch: string;
  onMilestoneSearchChange: (v: string) => void;
  onClearAll: () => void;
}

export default function CanvasFiltersDropdown({
  open,
  onToggle,
  statusFilter,
  onSetStatusFilter,
  selectedMilestoneIds,
  onSetMilestoneIds,
  milestoneTasks,
  filteredMilestoneTasks,
  milestoneSearch,
  onMilestoneSearchChange,
  onClearAll,
}: Props) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
        style={chip(!!statusFilter || selectedMilestoneIds.length > 0)}
      >
        {statusFilter ? (
          <>
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: STATUS_OPTIONS.find((s) => s.key === statusFilter)?.color }}
            />
            {STATUS_OPTIONS.find((s) => s.key === statusFilter)?.label}
          </>
        ) : selectedMilestoneIds.length > 0 ? (
          `⭐ ${selectedMilestoneIds.length} milestone${selectedMilestoneIds.length > 1 ? 's' : ''}`
        ) : (
          'Filters'
        )}
        <span className="text-[10px] opacity-50">▾</span>
      </button>
      {open && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only guard against the parent's outside-click dismiss; not a keyboard-operable action
        <div
          className="absolute left-0 top-full mt-1 rounded-xl shadow-xl z-50 overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 220 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            Status
          </div>
          <button
            onClick={() => onSetStatusFilter(null)}
            className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors"
            style={{ color: !statusFilter ? 'var(--brand)' : 'var(--text-2)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--surface-2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            All statuses {!statusFilter && <span className="ml-auto">✓</span>}
          </button>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => onSetStatusFilter(statusFilter === s.key ? null : s.key)}
              className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors"
              style={{ color: statusFilter === s.key ? 'var(--brand)' : 'var(--text-2)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--surface-2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
              {s.label} {statusFilter === s.key && <span className="ml-auto">✓</span>}
            </button>
          ))}
          {milestoneTasks.length > 0 && (
            <>
              <div
                className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}
              >
                Milestone focus
              </div>
              {milestoneTasks.length > 5 && (
                <div className="px-3 pb-1.5">
                  <input
                    type="text"
                    value={milestoneSearch}
                    onChange={(e) => onMilestoneSearchChange(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Search milestones…"
                    className="w-full text-xs px-2 py-1 rounded outline-none"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                </div>
              )}
              <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                <button
                  onClick={() => onSetMilestoneIds([])}
                  className="w-full text-left px-3 py-1.5 text-xs transition-colors"
                  style={{ color: selectedMilestoneIds.length === 0 ? '#f59e0b' : 'var(--text-2)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--surface-2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  Show all {selectedMilestoneIds.length === 0 && '✓'}
                </button>
                {filteredMilestoneTasks.length === 0 && (
                  <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>
                    No matches
                  </p>
                )}
                {filteredMilestoneTasks.map((t) => {
                  const sel = selectedMilestoneIds.includes(t.id);
                  const overdue = new Date(t.deadline!) < new Date() && t.status !== 'done';
                  return (
                    <button
                      key={t.id}
                      onClick={() =>
                        onSetMilestoneIds(sel ? selectedMilestoneIds.filter((id) => id !== t.id) : [...selectedMilestoneIds, t.id])
                      }
                      className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors"
                      style={{ color: 'var(--text-2)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--surface-2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          flexShrink: 0,
                          background: sel ? (overdue ? '#ef4444' : '#f59e0b') : 'transparent',
                          border: `1.5px solid ${overdue ? 'rgba(239,68,68,0.5)' : 'rgba(245,158,11,0.5)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {sel && <span style={{ color: 'white', fontSize: 8 }}>✓</span>}
                      </span>
                      <span className="flex-1 truncate">{t.name}</span>
                      <span style={{ color: overdue ? '#ef4444' : 'var(--text-3)', flexShrink: 0, fontSize: 10 }}>
                        {new Date(t.deadline!).toLocaleDateString()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {(statusFilter || selectedMilestoneIds.length > 0) && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              <button
                onClick={onClearAll}
                className="w-full text-left px-3 py-2 text-xs font-medium transition-colors"
                style={{ color: '#ef4444' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface-2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
