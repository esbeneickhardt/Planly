/**
 * Filter bar above the Kanban board: mine-only toggle, a "Filters" menu (owner/color/sprint/
 * milestone) and a "View" menu (board layout, density, background) consolidate what used to be
 * ~12 always-visible controls. All state lives in KanbanBoard; this component only renders it.
 */
import type { ReactNode, RefObject } from 'react';
import type { Sprint } from '../../api/client';
import { KANBAN_BACKGROUNDS } from '../../constants/kanbanBackgrounds';
import { displayName } from '../../api/client';
import KanbanMilestoneFilter from './KanbanMilestoneFilter';
import type { MilestoneOption } from './KanbanMilestoneFilter';

type User = { id: string; username: string; avatarEmoji?: string | null; realName?: string | null };

interface Props {
  taskCount: number;
  hasFilters: boolean;
  user: { id: string; avatarEmoji?: string | null } | null;

  mineOnly: boolean;
  onMineToggle: () => void;

  taskOwners: User[];
  ownerFilters: Set<string>;
  onToggleOwner: (id: string) => void;
  onClearOwners: () => void;

  taskColors: string[];
  colorFilters: Set<string>;
  colorLegend: Record<string, string>;
  onToggleColor: (c: string) => void;

  sprints: Sprint[];
  sprintFilter: string | null;
  onSprintChange: (val: string | null) => void;

  milestones: MilestoneOption[];
  milestoneFilter: string | null;
  onMilestoneChange: (id: string | null) => void;

  groupByMilestone: boolean;
  onToggleGroupByMilestone: () => void;

  /** Trello-style alternate board layout: columns = milestones instead of status */
  viewMode: 'status' | 'milestone';
  onToggleViewMode: () => void;

  toast: string;

  compact: boolean;
  onToggleCompact: () => void;

  simpleMode: boolean;
  onToggleSimpleMode: () => void;

  bgImage: string | null;
  onSelectBg: (id: string | null) => void;

  onReset: () => void;

  showFiltersMenu: boolean;
  filtersMenuRef: RefObject<HTMLDivElement>;
  onToggleFiltersMenu: () => void;

  showViewMenu: boolean;
  viewMenuRef: RefObject<HTMLDivElement>;
  onToggleViewMenu: () => void;
}

/** Displays a sprint's color swatch next to the sprint selector. */
function SprintDot({ sprints, sprintFilter }: { sprints: Sprint[]; sprintFilter: string | null }) {
  if (!sprintFilter) return null;
  const s = sprints.find((s) => s.id === sprintFilter);
  if (!s) return null;
  return (
    <span
      style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: s.color,
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  );
}

/** One row inside the View menu - a full-width toggle button with an optional trailing checkmark.
 * `desktopOnly` hides the row on mobile for the settings KanbanMobileList doesn't actually read
 * (compact/simple density, background), matching what those controls did before consolidation. */
function ViewMenuRow({
  active,
  onClick,
  desktopOnly,
  children,
}: {
  active: boolean;
  onClick: () => void;
  desktopOnly?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${desktopOnly ? 'hidden md:flex' : 'flex'}`}
      style={{
        background: active ? 'var(--brand-subtle)' : 'transparent',
        color: active ? 'var(--brand)' : 'var(--text-2)',
      }}
    >
      <span className="flex-1">{children}</span>
      {active && <span style={{ color: 'var(--brand)' }}>✓</span>}
    </button>
  );
}

export default function KanbanFiltersBar({
  taskCount,
  hasFilters,
  user,
  mineOnly,
  onMineToggle,
  taskOwners,
  ownerFilters,
  onToggleOwner,
  onClearOwners,
  taskColors,
  colorFilters,
  colorLegend,
  onToggleColor,
  sprints,
  sprintFilter,
  onSprintChange,
  milestones,
  milestoneFilter,
  onMilestoneChange,
  groupByMilestone,
  onToggleGroupByMilestone,
  viewMode,
  onToggleViewMode,
  toast,
  compact,
  onToggleCompact,
  simpleMode,
  onToggleSimpleMode,
  bgImage,
  onSelectBg,
  onReset,
  showFiltersMenu,
  filtersMenuRef,
  onToggleFiltersMenu,
  showViewMenu,
  viewMenuRef,
  onToggleViewMenu,
}: Props) {
  const hasFilterOptions = taskOwners.length > 0 || taskColors.length > 0 || sprints.length > 0 || milestones.length > 0;
  const activeFilterCount =
    ownerFilters.size + colorFilters.size + (sprintFilter !== null ? 1 : 0) + (milestoneFilter !== null ? 1 : 0);
  const viewCustomized =
    compact || simpleMode || viewMode === 'milestone' || groupByMilestone || bgImage !== null;

  return (
    <div className="px-4 md:px-6 pt-3 md:pt-4 pb-3 flex-shrink-0 flex items-center gap-2 md:gap-3 flex-wrap">
      {/* Task count */}
      <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>
        {taskCount}
        {hasFilters ? ' filtered' : ''} tasks
      </span>

      <div className="w-px h-4 flex-shrink-0" style={{ background: 'var(--border)' }} />

      {/* Mine toggle */}
      <button
        onClick={onMineToggle}
        className="text-xs flex items-center gap-1 px-2 py-1 rounded-md transition-all flex-shrink-0"
        style={{
          color: mineOnly ? 'var(--brand)' : 'var(--text-3)',
          background: mineOnly ? 'var(--brand-subtle)' : 'transparent',
          border: `1px solid ${mineOnly ? 'var(--brand)' : 'var(--border)'}`,
        }}
        title="Show only my tasks"
      >
        {user?.avatarEmoji ?? '👤'} Mine
      </button>

      {/* Reset - only worth showing once something is actually filtered */}
      {hasFilters && (
        <button
          onClick={onReset}
          className="text-xs flex items-center gap-1 px-2 py-1 rounded-md transition-all flex-shrink-0"
          style={{ color: 'var(--brand)', background: 'var(--brand-subtle)', border: '1px solid var(--brand)' }}
        >
          ↺ Reset
        </button>
      )}

      {/* Filters menu: owner / color / sub-plan / milestone, all narrowing the same filteredTasks
          array that both the desktop board and KanbanMobileList render from - shown identically
          on both, unlike View below which has a couple of desktop-only rows. */}
      {hasFilterOptions && (
        <div className="relative flex-shrink-0" ref={filtersMenuRef}>
          <button
            onClick={onToggleFiltersMenu}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all"
            style={{
              background: activeFilterCount > 0 ? 'var(--brand-subtle)' : 'var(--surface-2)',
              color: activeFilterCount > 0 ? 'var(--brand)' : 'var(--text-3)',
              border: `1px solid ${activeFilterCount > 0 ? 'var(--brand)' : 'var(--border)'}`,
            }}
          >
            Filters
            {activeFilterCount > 0 && (
              <span
                className="text-[10px] leading-none px-1 py-0.5 rounded-full"
                style={{ background: 'var(--brand)', color: '#fff' }}
              >
                {activeFilterCount}
              </span>
            )}
            <span className="text-[10px]">▾</span>
          </button>
          {showFiltersMenu && (
            <div
              className="absolute left-0 top-full mt-1 rounded-xl shadow-xl z-40 p-3 space-y-3 overflow-y-auto animate-dropdown-in"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 240, maxHeight: '70vh' }}
            >
              {taskOwners.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                      Owner
                    </span>
                    {ownerFilters.size > 0 && (
                      <button onClick={onClearOwners} className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-0.5 -mx-1">
                    {taskOwners.map((u) => {
                      const active = ownerFilters.has(u.id);
                      return (
                        <button
                          key={u.id}
                          onClick={() => onToggleOwner(u.id)}
                          className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs transition-colors ${active ? 'bg-[var(--brand-subtle)]' : 'hover:bg-[var(--surface-2)]'}`}
                          style={{ color: active ? 'var(--brand)' : 'var(--text)' }}
                        >
                          <span>{u.avatarEmoji ?? '👤'}</span>
                          <span className="flex-1 text-left truncate">{displayName(u)}</span>
                          {active && <span style={{ color: 'var(--brand)' }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {taskColors.length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                    Color
                  </span>
                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    {taskColors.map((c) => {
                      const active = colorFilters.has(c);
                      return (
                        <button
                          key={c}
                          onClick={() => onToggleColor(c)}
                          className="w-4 h-4 rounded-full flex-shrink-0 transition-all"
                          style={{
                            background: c,
                            outline: active ? `2px solid ${c}` : 'none',
                            outlineOffset: active ? '2px' : '0',
                            boxShadow: active ? `0 0 0 1px var(--surface)` : 'none',
                          }}
                          title={colorLegend[c] || c}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {sprints.length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                    Sub-plan
                  </span>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <SprintDot sprints={sprints} sprintFilter={sprintFilter} />
                    <select
                      value={sprintFilter ?? ''}
                      onChange={(e) => onSprintChange(e.target.value === '' ? null : e.target.value)}
                      className="input text-xs py-1"
                    >
                      <option value="">All sub-plans</option>
                      {sprints.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {milestones.length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                    Milestone
                  </span>
                  <div className="mt-1.5">
                    <KanbanMilestoneFilter milestones={milestones} selectedId={milestoneFilter} onChange={onMilestoneChange} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {toast && (
        <div
          className="text-xs px-2 py-1 rounded-lg"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          {toast}
        </div>
      )}

      <div className="ml-auto flex items-center gap-2 flex-shrink-0">
        {/* View menu: board layout, density, and background - "how the board looks" rather than
            "which tasks show". Compact/Simple/Background have no effect on the mobile swipeable
            list (KanbanMobileList always uses its own fixed layout), so those rows stay desktop-only
            inside the menu, same as before consolidation. */}
        <div className="relative" ref={viewMenuRef}>
          <button
            onClick={onToggleViewMenu}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all"
            style={{
              background: viewCustomized ? 'var(--brand-subtle)' : 'var(--surface-2)',
              color: viewCustomized ? 'var(--brand)' : 'var(--text-3)',
              border: `1px solid ${viewCustomized ? 'var(--brand)' : 'var(--border)'}`,
            }}
          >
            View
            <span className="text-[10px]">▾</span>
          </button>
          {showViewMenu && (
            <div
              className="absolute right-0 top-full mt-1 rounded-xl shadow-xl z-40 p-2 space-y-1 overflow-y-auto animate-dropdown-in"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 220, maxHeight: '70vh' }}
            >
              <ViewMenuRow active={compact} onClick={onToggleCompact} desktopOnly>
                {compact ? '▦ Board view' : '☰ Compact list view'}
              </ViewMenuRow>

              {!compact && (
                <>
                  <ViewMenuRow active={simpleMode} onClick={onToggleSimpleMode} desktopOnly>
                    ▤ Simple cards (titles only)
                  </ViewMenuRow>

                  {milestones.length > 0 && (
                    <ViewMenuRow active={viewMode === 'milestone'} onClick={onToggleViewMode}>
                      🏁 Milestone columns
                    </ViewMenuRow>
                  )}

                  {milestones.length > 0 && viewMode === 'status' && (
                    <ViewMenuRow active={groupByMilestone} onClick={onToggleGroupByMilestone}>
                      🏁 Group by milestone
                    </ViewMenuRow>
                  )}

                  <div className="hidden md:block pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                    <span
                      className="text-[10px] font-semibold uppercase tracking-widest px-1 block mb-1.5 mt-1"
                      style={{ color: 'var(--text-3)' }}
                    >
                      Background
                    </span>
                    <div className="grid grid-cols-4 gap-1.5 px-1">
                      <button
                        onClick={() => onSelectBg(null)}
                        title="None"
                        className="h-8 rounded flex-shrink-0"
                        style={{
                          background: 'var(--surface-2)',
                          border: `1px solid ${bgImage === null ? 'var(--brand)' : 'var(--border)'}`,
                          outline: bgImage === null ? '2px solid var(--brand)' : 'none',
                          outlineOffset: bgImage === null ? '1px' : '0',
                        }}
                      />
                      {KANBAN_BACKGROUNDS.map((b) => {
                        const active = bgImage === b.id;
                        return (
                          <button
                            key={b.id}
                            onClick={() => onSelectBg(b.id)}
                            title={b.label}
                            className="h-8 rounded flex-shrink-0"
                            style={{
                              background: b.gradient,
                              outline: active ? '2px solid var(--brand)' : 'none',
                              outlineOffset: active ? '1px' : '0',
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
