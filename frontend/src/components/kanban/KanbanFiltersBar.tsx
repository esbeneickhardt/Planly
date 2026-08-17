/**
 * Filter bar above the Kanban board: mine-only toggle, a "Filters" menu (owner/color/sprint/
 * milestone) and a "View" menu (board layout, density, background) consolidate what used to be
 * ~12 always-visible controls. All state lives in KanbanBoard; this component only renders it.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { Sprint } from '../../api/client';
import type { KanbanColumn } from '../../types';
import { displayName } from '../../api/client';
import KanbanMilestoneFilter from './KanbanMilestoneFilter';
import type { MilestoneOption } from './KanbanMilestoneFilter';
import KanbanBackgroundPicker from './KanbanBackgroundPicker';

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

  statuses: KanbanColumn[];
  statusFilters: Set<string>;
  onToggleStatus: (statusKey: string) => void;

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

/** One row inside the View menu - a full-width toggle button with an optional trailing checkmark.
 * `desktopOnly` hides the row on mobile for settings KanbanMobileList doesn't apply at all (the
 * compact-vs-board layout swap, a desktop-only concept) - simple cards and background are both
 * mobile-relevant now and don't use this flag. */
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

/** Owner filter as a collapsed, searchable multi-select dropdown - mirrors
 * KanbanMilestoneFilter's trigger-button/click-outside/search pattern, adapted to let more than
 * one owner be active at once (checkmark rows instead of a single selection). */
function OwnerFilterSection({
  taskOwners,
  ownerFilters,
  onToggleOwner,
  onClearOwners,
}: {
  taskOwners: User[];
  ownerFilters: Set<string>;
  onToggleOwner: (id: string) => void;
  onClearOwners: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const q = search.trim().toLowerCase();
  const filtered = q ? taskOwners.filter((u) => displayName(u).toLowerCase().includes(q)) : taskOwners;
  const selectedUsers = taskOwners.filter((u) => ownerFilters.has(u.id));
  const singleSelected = selectedUsers.length === 1 ? selectedUsers[0] : undefined;

  let label = 'All owners';
  if (singleSelected) label = displayName(singleSelected);
  else if (selectedUsers.length > 1) label = `${selectedUsers.length} owners`;

  return (
    <div ref={ref} className="relative">
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
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-all"
        style={{
          background: ownerFilters.size > 0 ? 'var(--brand-subtle)' : 'var(--surface-2)',
          color: ownerFilters.size > 0 ? 'var(--brand)' : 'var(--text-2)',
          border: `1px solid ${ownerFilters.size > 0 ? 'var(--brand)' : 'var(--border)'}`,
        }}
      >
        {singleSelected && <span className="flex-shrink-0">{singleSelected.avatarEmoji ?? '👤'}</span>}
        <span className="flex-1 text-left truncate">{label}</span>
        <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1 rounded-lg shadow-xl z-40 overflow-hidden flex flex-col w-full"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: 240 }}
        >
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people…"
            className="text-xs px-2.5 py-2 bg-transparent outline-none flex-shrink-0"
            style={{ color: 'var(--text)', borderBottom: '1px solid var(--border)' }}
          />
          <div className="overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>
                No match
              </div>
            )}
            {filtered.map((u) => {
              const active = ownerFilters.has(u.id);
              return (
                <button
                  key={u.id}
                  onClick={() => onToggleOwner(u.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${active ? 'bg-[var(--brand-subtle)]' : 'hover:bg-[var(--surface-2)]'}`}
                  style={{ color: active ? 'var(--brand)' : 'var(--text)' }}
                >
                  <span className="flex-shrink-0">{u.avatarEmoji ?? '👤'}</span>
                  <span className="flex-1 text-left truncate">{displayName(u)}</span>
                  {active && <span style={{ color: 'var(--brand)' }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
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
  statuses,
  statusFilters,
  onToggleStatus,
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
  const hasFilterOptions =
    taskOwners.length > 0 || taskColors.length > 0 || statuses.length > 0 || sprints.length > 0 || milestones.length > 0;
  const activeFilterCount =
    ownerFilters.size +
    colorFilters.size +
    statusFilters.size +
    (sprintFilter !== null ? 1 : 0) +
    (milestoneFilter !== null ? 1 : 0);
  const viewCustomized =
    compact || simpleMode || viewMode === 'milestone' || groupByMilestone || bgImage !== null;

  return (
    <div className="px-4 md:px-6 pt-3 md:pt-4 pb-3 flex-shrink-0 flex items-center gap-2 md:gap-3 flex-wrap">
      {/* Task count */}
      <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>
        {taskCount}
        {hasFilters ? ' filtered' : ''} tasks
      </span>

      <div className="hidden md:block w-px h-4 flex-shrink-0" style={{ background: 'var(--border)' }} />

      {/* Mine toggle - icon-only on mobile (label hidden below md:) to keep this whole row from
          wrapping to a second line on a phone-width screen; the emoji plus title/aria-label alone
          still reads clearly as a toggle at that size. */}
      <button
        onClick={onMineToggle}
        aria-label="Show only my tasks"
        className="text-xs flex items-center gap-1 px-2 py-1 rounded-md transition-all flex-shrink-0"
        style={{
          color: mineOnly ? 'var(--brand)' : 'var(--text-3)',
          background: mineOnly ? 'var(--brand-subtle)' : 'transparent',
          border: `1px solid ${mineOnly ? 'var(--brand)' : 'var(--border)'}`,
        }}
        title="Show only my tasks"
      >
        {user?.avatarEmoji ?? '👤'} <span className="hidden md:inline">Mine</span>
      </button>

      {/* Reset - only worth showing once something is actually filtered; icon-only on mobile,
          same reasoning as Mine above. */}
      {hasFilters && (
        <button
          onClick={onReset}
          aria-label="Reset filters"
          className="text-xs flex items-center gap-1 px-2 py-1 rounded-md transition-all flex-shrink-0"
          style={{ color: 'var(--brand)', background: 'var(--brand-subtle)', border: '1px solid var(--brand)' }}
        >
          ↺ <span className="hidden md:inline">Reset</span>
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
              className="fixed left-2 right-2 top-14 md:absolute md:left-0 md:right-auto md:top-full md:mt-1 md:w-64 rounded-xl shadow-xl z-40 p-3 space-y-3 overflow-y-auto animate-dropdown-in"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '70vh' }}
            >
              {statuses.length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                    Status
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    {statuses.map((s) => {
                      const active = statusFilters.has(s.statusKey);
                      return (
                        <button
                          key={s.id}
                          onClick={() => onToggleStatus(s.statusKey)}
                          className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors"
                          style={{
                            background: active ? 'var(--brand-subtle)' : 'var(--surface-2)',
                            color: active ? 'var(--brand)' : 'var(--text-2)',
                            border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
                          }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                          {s.label}
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
                          className="w-5 h-5 rounded-full flex-shrink-0 transition-all"
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

              {taskOwners.length > 0 && (
                <OwnerFilterSection
                  taskOwners={taskOwners}
                  ownerFilters={ownerFilters}
                  onToggleOwner={onToggleOwner}
                  onClearOwners={onClearOwners}
                />
              )}

              {sprints.length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                    Sub-plan
                  </span>
                  <div className="flex items-center gap-1.5 mt-1.5">
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
            "which tasks show". Compact list view is a desktop-only layout swap (KanbanCompactList),
            so that row stays desktop-only; Simple cards and Background both now render on the
            mobile swipeable list too, so their pickers are available there. */}
        <div className="relative" ref={viewMenuRef}>
          <button
            onClick={onToggleViewMenu}
            aria-label="View options"
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all"
            style={{
              background: viewCustomized ? 'var(--brand-subtle)' : 'var(--surface-2)',
              color: viewCustomized ? 'var(--brand)' : 'var(--text-3)',
              border: `1px solid ${viewCustomized ? 'var(--brand)' : 'var(--border)'}`,
            }}
          >
            {/* Icon-only on mobile (label hidden below md:) - a bare "View" word with nothing
                else isn't recognizable as a button at a glance the way an icon is. */}
            <span aria-hidden="true">🎨</span>
            <span className="hidden md:inline">View</span>
            <span className="text-[10px]">▾</span>
          </button>
          {showViewMenu && (
            <div
              className="fixed left-2 right-2 top-14 md:absolute md:left-auto md:right-0 md:top-full md:mt-1 md:w-56 rounded-xl shadow-xl z-40 p-2 space-y-1 overflow-y-auto animate-dropdown-in"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '70vh' }}
            >
              <ViewMenuRow active={compact} onClick={onToggleCompact} desktopOnly>
                {compact ? '▦ Board view' : '☰ Compact list view'}
              </ViewMenuRow>

              {/* Hidden on desktop specifically while compact list view is active (a different
                  desktop-only layout a title-density toggle wouldn't apply to) - but mobile
                  ignores `compact` entirely (it always uses its own swipeable card list), so this
                  must stay visible there regardless of that desktop-only state. */}
              <div className={compact ? 'md:hidden' : ''}>
                <ViewMenuRow active={simpleMode} onClick={onToggleSimpleMode}>
                  ▤ Simple cards (titles only)
                </ViewMenuRow>
              </div>

              {!compact && (
                <>
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

                  <KanbanBackgroundPicker bgImage={bgImage} onSelectBg={onSelectBg} />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
