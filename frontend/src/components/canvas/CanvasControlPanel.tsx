/**
 * The top-left Panel on the Canvas: view-mode segmented control + sub-plan (sprint) picker on
 * row 1, and the Filters/Display/Layouts dropdowns + legend button on row 2. Extracted verbatim
 * from CanvasView.tsx. All state (filters, dropdown open/closed, sprint list) stays owned by the
 * parent - this component and its Filters/Display/Layouts children are presentation-only, wired
 * up via callbacks.
 */
import type { Sprint } from '../../api/client';
import type { Task } from '../../types';
import { chip, segBtn } from './canvasUtils';
import type { ViewMode } from './canvasUtils';
import CanvasFiltersDropdown from './CanvasFiltersDropdown';
import CanvasDisplayDropdown from './CanvasDisplayDropdown';
import CanvasLayoutsDropdown from './CanvasLayoutsDropdown';

interface Props {
  viewMode: ViewMode;
  onSetViewMode: (v: ViewMode) => void;
  canWriteCanvas: boolean;

  // Sub-plan (sprint) picker
  selectedSprintFilter: string | null;
  onSetSprintFilter: (v: string | null) => void;
  activeSprint: Sprint | undefined;
  sortedSprints: Sprint[];
  showSprintPicker: boolean;
  setShowSprintPicker: (updater: boolean | ((v: boolean) => boolean)) => void;
  onNewSprint: () => void;
  onEditSprint: (s: Sprint) => void;
  onDeleteSprint: (id: string) => void;

  // Filters dropdown
  showFiltersDropdown: boolean;
  setShowFiltersDropdown: (updater: boolean | ((v: boolean) => boolean)) => void;
  setShowDisplayDropdown: (updater: boolean | ((v: boolean) => boolean)) => void;
  setShowLayoutDropdown: (updater: boolean | ((v: boolean) => boolean)) => void;
  statusFilter: string | null;
  onSetStatusFilter: (v: string | null) => void;
  selectedMilestoneIds: string[];
  onSetMilestoneIds: (v: string[]) => void;
  milestoneTasks: Task[];
  filteredMilestoneTasks: Task[];
  milestoneSearch: string;
  onMilestoneSearchChange: (v: string) => void;

  // Display dropdown
  showDisplayDropdown: boolean;
  onRelayout: () => void;
  showSprintAura: boolean;
  onToggleSprintAura: () => void;
  simpleMode: boolean;
  onToggleSimpleMode: () => void;

  // Layouts dropdown
  showLayoutDropdown: boolean;
  onOpenShareModal: () => void;
  onOpenLoadModal: () => void;

  onShowLegend: () => void;
}

export default function CanvasControlPanel({
  viewMode,
  onSetViewMode,
  canWriteCanvas,
  selectedSprintFilter,
  onSetSprintFilter,
  activeSprint,
  sortedSprints,
  showSprintPicker,
  setShowSprintPicker,
  onNewSprint,
  onEditSprint,
  onDeleteSprint,
  showFiltersDropdown,
  setShowFiltersDropdown,
  setShowDisplayDropdown,
  setShowLayoutDropdown,
  statusFilter,
  onSetStatusFilter,
  selectedMilestoneIds,
  onSetMilestoneIds,
  milestoneTasks,
  filteredMilestoneTasks,
  milestoneSearch,
  onMilestoneSearchChange,
  showDisplayDropdown,
  onRelayout,
  showSprintAura,
  onToggleSprintAura,
  simpleMode,
  onToggleSimpleMode,
  showLayoutDropdown,
  onOpenShareModal,
  onOpenLoadModal,
  onShowLegend,
}: Props) {
  return (
    <div className="flex flex-col gap-2">
      {/* Row 1 - view mode segmented control */}
      <div
        className="flex items-center p-1 gap-0.5 rounded-xl"
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
        }}
      >
        {(['all', 'active', 'milestones'] as ViewMode[]).map((key) => (
          <button
            key={key}
            onClick={() => onSetViewMode(key)}
            className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all capitalize"
            style={segBtn(viewMode, key)}
          >
            {key === 'milestones' ? '⭐ Milestones' : key === 'active' ? 'Active' : 'All'}
          </button>
        ))}

        {/* Sprint view mode + picker */}
        <div className="relative">
          <button
            onClick={() => {
              onSetViewMode('sprint');
              setShowSprintPicker((v) => !v);
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
            style={segBtn(viewMode, 'sprint')}
          >
            ⚡ {viewMode === 'sprint' && activeSprint ? activeSprint.name : 'Sub-plan'}
            <span className="text-[10px] opacity-50">▾</span>
          </button>
          {showSprintPicker && (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only guard against the parent's outside-click dismiss; not a keyboard-operable action
            <div
              className="absolute left-0 top-full mt-1 rounded-xl shadow-xl z-50 overflow-hidden"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 260 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                  Sub-plans
                </span>
                {canWriteCanvas && (
                  <button
                    onClick={() => {
                      setShowSprintPicker(false);
                      onNewSprint();
                    }}
                    className="text-xs font-medium px-2 py-0.5 rounded-lg transition-colors"
                    style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '0.8';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '1';
                    }}
                  >
                    + New
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  onSetSprintFilter(null);
                  onSetViewMode('all');
                  setShowSprintPicker(false);
                }}
                className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2 transition-colors"
                style={{ borderBottom: sortedSprints.length > 0 ? '1px solid var(--border)' : 'none' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--surface-2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--border)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: !selectedSprintFilter ? 'var(--brand)' : 'var(--text-2)' }}>
                  No sub-plan (exit sub-plan mode)
                </span>
                {!selectedSprintFilter && (
                  <span className="ml-auto" style={{ color: 'var(--brand)' }}>
                    ✓
                  </span>
                )}
              </button>
              {sortedSprints.length === 0 && (
                <p className="px-3 py-3 text-xs" style={{ color: 'var(--text-3)' }}>
                  No sub-plans yet - create one to start planning.
                </p>
              )}
              {sortedSprints.map((s) => {
                const isActive = selectedSprintFilter === s.id;
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    className="flex items-center gap-2 px-3 py-2.5 group transition-colors cursor-pointer"
                    style={{ background: isActive ? 'var(--brand-subtle)' : 'transparent' }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'var(--surface-2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isActive ? 'var(--brand-subtle)' : 'transparent';
                    }}
                    onClick={() => {
                      onSetSprintFilter(isActive ? null : s.id);
                      setShowSprintPicker(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      onSetSprintFilter(isActive ? null : s.id);
                      setShowSprintPicker(false);
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: isActive ? 'var(--brand)' : 'var(--text)' }}>
                        {s.name}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                        {new Date(s.startDate).toLocaleDateString()} → {new Date(s.endDate).toLocaleDateString()} ·{' '}
                        {s.taskIds.length} tasks
                      </p>
                    </div>
                    {isActive && <span style={{ color: 'var(--brand)', fontSize: 11, flexShrink: 0 }}>✓</span>}
                    {canWriteCanvas && (
                      <>
                        <button
                          className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-xs flex-shrink-0 transition-opacity"
                          style={{ color: 'var(--text-3)' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = 'var(--text)';
                            e.currentTarget.style.background = 'var(--surface-2)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--text-3)';
                            e.currentTarget.style.background = 'transparent';
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditSprint(s);
                            setShowSprintPicker(false);
                          }}
                          title="Edit sub-plan"
                        >
                          ✎
                        </button>
                        <button
                          className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-xs flex-shrink-0 transition-opacity"
                          style={{ color: 'var(--text-3)' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#ef4444';
                            e.currentTarget.style.background = 'rgba(239,68,68,0.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--text-3)';
                            e.currentTarget.style.background = 'transparent';
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSprint(s.id);
                          }}
                          title="Delete sub-plan"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Row 2 - grouped control dropdowns */}
      <div className="flex items-center gap-1.5 flex-wrap" style={{ maxWidth: 'calc(100vw - 2rem)' }}>
        <CanvasFiltersDropdown
          open={showFiltersDropdown}
          onToggle={() => {
            setShowFiltersDropdown((v) => !v);
            setShowDisplayDropdown(false);
            setShowLayoutDropdown(false);
            onMilestoneSearchChange('');
          }}
          statusFilter={statusFilter}
          onSetStatusFilter={onSetStatusFilter}
          selectedMilestoneIds={selectedMilestoneIds}
          onSetMilestoneIds={onSetMilestoneIds}
          milestoneTasks={milestoneTasks}
          filteredMilestoneTasks={filteredMilestoneTasks}
          milestoneSearch={milestoneSearch}
          onMilestoneSearchChange={onMilestoneSearchChange}
          onClearAll={() => {
            onSetStatusFilter(null);
            onSetMilestoneIds([]);
            setShowFiltersDropdown(false);
            onMilestoneSearchChange('');
          }}
        />

        <CanvasDisplayDropdown
          open={showDisplayDropdown}
          onToggle={() => {
            setShowDisplayDropdown((v) => !v);
            setShowFiltersDropdown(false);
            setShowLayoutDropdown(false);
            onMilestoneSearchChange('');
          }}
          onClose={() => setShowDisplayDropdown(false)}
          onRelayout={onRelayout}
          showSprintAura={showSprintAura}
          onToggleSprintAura={onToggleSprintAura}
          simpleMode={simpleMode}
          onToggleSimpleMode={onToggleSimpleMode}
        />

        <CanvasLayoutsDropdown
          open={showLayoutDropdown}
          onToggle={() => {
            setShowLayoutDropdown((v) => !v);
            setShowFiltersDropdown(false);
            setShowDisplayDropdown(false);
            onMilestoneSearchChange('');
          }}
          canWriteCanvas={canWriteCanvas}
          onOpenShareModal={onOpenShareModal}
          onOpenLoadModal={onOpenLoadModal}
        />

        <button
          onClick={onShowLegend}
          title="Visual guide"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
          style={chip(false)}
        >
          ?
        </button>
      </div>
    </div>
  );
}
