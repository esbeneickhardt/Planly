/**
 * Filter bar above the Kanban board: mine-only, owner multi-select, color dots, sprint picker,
 * background image picker, and compact/board toggle. All state lives in KanbanBoard.
 */
import type { RefObject } from 'react';
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
  showOwnerDropdown: boolean;
  onToggleOwnerDropdown: () => void;
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
  showBgPicker: boolean;
  bgPickerRef: RefObject<HTMLDivElement>;
  onToggleBgPicker: () => void;
  onSelectBg: (id: string | null) => void;

  onReset: () => void;
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

export default function KanbanFiltersBar({
  taskCount,
  hasFilters,
  user,
  mineOnly,
  onMineToggle,
  taskOwners,
  ownerFilters,
  showOwnerDropdown,
  onToggleOwnerDropdown,
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
  showBgPicker,
  bgPickerRef,
  onToggleBgPicker,
  onSelectBg,
  onReset,
}: Props) {
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

      {/* Board layout toggle: status columns (default) vs Trello-style milestone columns. Shown on
          both mobile and desktop - unlike Simple/Compact below, KanbanMobileList honors this too. */}
      {milestones.length > 0 && !compact && (
        <button
          onClick={onToggleViewMode}
          className="text-xs flex items-center gap-1 px-2 py-1 rounded-md transition-all flex-shrink-0"
          style={{
            color: viewMode === 'milestone' ? 'var(--brand)' : 'var(--text-3)',
            background: viewMode === 'milestone' ? 'var(--brand-subtle)' : 'transparent',
            border: `1px solid ${viewMode === 'milestone' ? 'var(--brand)' : 'var(--border)'}`,
          }}
          title={
            viewMode === 'milestone'
              ? 'Switch back to status columns'
              : 'Switch to milestone columns, grouped by status within each'
          }
        >
          {viewMode === 'milestone' ? '📋 Status columns' : '🏁 Milestone columns'}
        </button>
      )}

      {/* Sub-plan and milestone filters, shown on mobile too - both narrow the same `filteredTasks`
          array that KanbanMobileList already renders from, so they work there exactly as on desktop. */}
      {sprints.length > 0 && (
        <div className="md:hidden flex items-center gap-1 flex-shrink-0">
          <SprintDot sprints={sprints} sprintFilter={sprintFilter} />
          <select
            value={sprintFilter ?? ''}
            onChange={(e) => onSprintChange(e.target.value === '' ? null : e.target.value)}
            className="text-xs px-2 py-1 rounded transition-all"
            style={{
              background: sprintFilter !== null ? 'var(--brand-subtle)' : 'var(--surface-2)',
              color: sprintFilter !== null ? 'var(--brand)' : 'var(--text-2)',
              border: `1px solid ${sprintFilter !== null ? 'var(--brand)' : 'var(--border)'}`,
            }}
          >
            <option value="">All sub-plans</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="md:hidden flex-shrink-0">
        <KanbanMilestoneFilter milestones={milestones} selectedId={milestoneFilter} onChange={onMilestoneChange} />
      </div>

      {/* Group by milestone toggle, shown on mobile too - unlike Simple/Compact below, the mobile
          board (KanbanMobileList) does honor this one, clustering each column's cards by milestone.
          Meaningless once milestones are themselves the columns, so hidden in that mode. */}
      {milestones.length > 0 && viewMode === 'status' && (
        <button
          onClick={onToggleGroupByMilestone}
          className="md:hidden text-xs flex items-center gap-1 px-2 py-1 rounded-md transition-all flex-shrink-0"
          style={{
            color: groupByMilestone ? 'var(--brand)' : 'var(--text-3)',
            background: groupByMilestone ? 'var(--brand-subtle)' : 'transparent',
            border: `1px solid ${groupByMilestone ? 'var(--brand)' : 'var(--border)'}`,
          }}
          title="Group cards into collapsible milestone sections within each column"
        >
          🏁 {groupByMilestone ? 'Grouped' : 'Group by milestone'}
        </button>
      )}

      {/* Desktop-only filters */}
      <div className="hidden md:contents">
        <div className="w-px h-4 flex-shrink-0" style={{ background: 'var(--border)' }} />

        {/* Reset */}
        <button
          onClick={onReset}
          className="text-xs flex items-center gap-1 px-2 py-1 rounded-md transition-all flex-shrink-0"
          style={{
            color: hasFilters ? 'var(--brand)' : 'var(--text-3)',
            background: hasFilters ? 'var(--brand-subtle)' : 'transparent',
            border: `1px solid ${hasFilters ? 'var(--brand)' : 'var(--border)'}`,
            opacity: hasFilters ? 1 : 0.45,
            cursor: hasFilters ? 'pointer' : 'default',
          }}
        >
          ↺ Reset
        </button>

        {/* Owner filter */}
        {taskOwners.length > 0 && (
          <div className="relative flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>
              Owner
            </span>
            <button
              onClick={onToggleOwnerDropdown}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-all"
              style={{
                background: ownerFilters.size > 0 ? 'var(--brand-subtle)' : 'var(--surface-2)',
                color: ownerFilters.size > 0 ? 'var(--brand)' : 'var(--text-2)',
                border: `1px solid ${ownerFilters.size > 0 ? 'var(--brand)' : 'var(--border)'}`,
              }}
            >
              {ownerFilters.size === 0 ? 'All' : `${ownerFilters.size} selected`}
              <span className="text-[10px] ml-0.5">▾</span>
            </button>
            {showOwnerDropdown && (
              <div
                className="absolute left-0 top-full mt-1 rounded-lg shadow-xl z-40 py-1 overflow-hidden"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 180 }}
                onMouseLeave={onToggleOwnerDropdown}
              >
                {taskOwners.map((u) => {
                  const active = ownerFilters.has(u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => onToggleOwner(u.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${active ? 'bg-[var(--brand-subtle)]' : 'hover:bg-[var(--surface-2)]'}`}
                      style={{ color: active ? 'var(--brand)' : 'var(--text)' }}
                    >
                      <span>{u.avatarEmoji ?? '👤'}</span>
                      <span className="flex-1 text-left truncate">{displayName(u)}</span>
                      {active && <span style={{ color: 'var(--brand)' }}>✓</span>}
                    </button>
                  );
                })}
                {ownerFilters.size > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    <button
                      onClick={onClearOwners}
                      className="w-full text-left px-3 py-1.5 text-xs transition-colors"
                      style={{ color: 'var(--text-3)' }}
                    >
                      Clear owners
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Color dots */}
        {taskColors.length > 0 && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>
              Color
            </span>
            <div className="flex items-center gap-2">
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

        {/* Sprint filter */}
        {sprints.length > 0 && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>
              Sub-plan
            </span>
            <SprintDot sprints={sprints} sprintFilter={sprintFilter} />
            <select
              value={sprintFilter ?? ''}
              onChange={(e) => onSprintChange(e.target.value === '' ? null : e.target.value)}
              className="text-xs px-2 py-0.5 rounded transition-all"
              style={{
                background: sprintFilter !== null ? 'var(--brand-subtle)' : 'var(--surface-2)',
                color: sprintFilter !== null ? 'var(--brand)' : 'var(--text-2)',
                border: `1px solid ${sprintFilter !== null ? 'var(--brand)' : 'var(--border)'}`,
              }}
            >
              <option value="">All sub-plans</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {!compact && milestones.length > 0 && viewMode === 'status' && (
          <div className="w-px h-4 flex-shrink-0" style={{ background: 'var(--border)' }} />
        )}

        {/* Group by milestone toggle (board view only; not shown in compact mode, meaningless in
            milestone-columns mode since milestones are themselves the columns there) */}
        {!compact && milestones.length > 0 && viewMode === 'status' && (
          <button
            onClick={onToggleGroupByMilestone}
            className="text-xs flex items-center gap-1 px-2 py-1 rounded-md transition-all flex-shrink-0"
            style={{
              color: groupByMilestone ? 'var(--brand)' : 'var(--text-3)',
              background: groupByMilestone ? 'var(--brand-subtle)' : 'transparent',
              border: `1px solid ${groupByMilestone ? 'var(--brand)' : 'var(--border)'}`,
            }}
            title="Group cards into collapsible milestone sections within each column"
          >
            ☰ {groupByMilestone ? 'Grouped' : 'Group by milestone'}
          </button>
        )}

        {/* Milestone filter (board view only; not shown in compact mode). Still useful even while
            grouped, e.g. to jump straight to one milestone's section. */}
        {!compact && (
          <KanbanMilestoneFilter milestones={milestones} selectedId={milestoneFilter} onChange={onMilestoneChange} />
        )}

        {toast && (
          <div
            className="text-xs px-2 py-1 rounded-lg"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            {toast}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2 flex-shrink-0">
        {/* Background picker (desktop, board view only) */}
        {!compact && (
          <div ref={bgPickerRef} className="relative hidden md:block">
            <button
              onClick={onToggleBgPicker}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all"
              title="Board background"
              style={{
                background: bgImage ? 'var(--brand-subtle)' : 'var(--surface-2)',
                color: bgImage ? 'var(--brand)' : 'var(--text-3)',
                border: `1px solid ${bgImage ? 'var(--brand)' : 'var(--border)'}`,
              }}
            >
              <span>🖼</span> Background
            </button>
            {showBgPicker && (
              <div
                className="absolute right-0 top-full mt-1 rounded-xl shadow-2xl overflow-hidden py-1.5 z-50"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: 200 }}
              >
                <button
                  onClick={() => onSelectBg(null)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${!bgImage ? 'bg-[var(--brand-subtle)]' : 'hover:bg-[var(--surface-2)]'}`}
                  style={{ color: !bgImage ? 'var(--brand)' : 'var(--text-2)' }}
                >
                  <span
                    className="w-8 h-6 rounded flex-shrink-0"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                  />
                  <span>None</span>
                  {!bgImage && (
                    <span className="ml-auto" style={{ color: 'var(--brand)' }}>
                      ✓
                    </span>
                  )}
                </button>
                {KANBAN_BACKGROUNDS.map((b) => {
                  const active = bgImage === b.id;
                  return (
                    <button
                      key={b.id}
                      onClick={() => onSelectBg(b.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${active ? 'bg-[var(--brand-subtle)]' : 'hover:bg-[var(--surface-2)]'}`}
                      style={{ color: active ? 'var(--brand)' : 'var(--text)' }}
                    >
                      <span className="w-8 h-6 rounded flex-shrink-0" style={{ background: b.gradient }} />
                      <span>{b.label}</span>
                      {active && (
                        <span className="ml-auto" style={{ color: 'var(--brand)' }}>
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Simple mode toggle - dense cards showing just the title. Board-view only and desktop
            only: the mobile view (KanbanMobileList) always uses its own fixed card density and
            doesn't read this flag, so the toggle would do nothing on a phone. */}
        {!compact && (
          <button
            onClick={onToggleSimpleMode}
            className="hidden md:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all"
            title={simpleMode ? 'Show owner, reviewer, and milestone details on cards' : 'Show titles only, for a denser board'}
            style={{
              background: simpleMode ? 'var(--brand-subtle)' : 'var(--surface-2)',
              color: simpleMode ? 'var(--brand)' : 'var(--text-3)',
              border: `1px solid ${simpleMode ? 'var(--brand)' : 'var(--border)'}`,
            }}
          >
            ▤ Simple
          </button>
        )}

        {/* Compact toggle - also desktop only, for the same reason: the mobile view always
            renders its own swipeable board regardless of this flag. */}
        <button
          onClick={onToggleCompact}
          className="hidden md:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all"
          title={compact ? 'Switch to board view' : 'Switch to compact list view'}
          style={{
            background: compact ? 'var(--brand-subtle)' : 'var(--surface-2)',
            color: compact ? 'var(--brand)' : 'var(--text-3)',
            border: `1px solid ${compact ? 'var(--brand)' : 'var(--border)'}`,
          }}
        >
          {compact ? '▦ Board' : '☰ Compact'}
        </button>
      </div>
    </div>
  );
}
