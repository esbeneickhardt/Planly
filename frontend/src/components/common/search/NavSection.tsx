/**
 * Renders the "Go to" / "Settings" nav-destination rows plus sprint rows in the search modal -
 * these two share one section/header block in the original layout (sprints append directly below
 * nav items, no second header), so they stay together here rather than being split further.
 */
import type { Sprint } from '../../../api/client';
import type { NavItem, TabFilter } from './types';

interface Props {
  navItems: NavItem[];
  sprintItems: Sprint[];
  tab: TabFilter;
  highlightIdx: number;
  nextIdx: () => number;
  onActivateNav: (item: NavItem) => void;
  onGoToGantt: () => void;
}

export default function NavSection({ navItems, sprintItems, tab, highlightIdx, nextIdx, onActivateNav, onGoToGantt }: Props) {
  if (navItems.length === 0 && sprintItems.length === 0) return null;
  return (
    <div className="py-1">
      <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        {tab === 'settings' ? 'Settings' : 'Go to'}
      </div>
      {navItems.map((item) => {
        const i = nextIdx();
        const isHighlighted = highlightIdx === i;
        return (
          <button
            key={item.path}
            data-idx={i}
            onClick={() => onActivateNav(item)}
            className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
            style={{ background: isHighlighted ? 'var(--brand-subtle)' : 'transparent' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')}
          >
            <span className="text-base flex-shrink-0 w-5 text-center">{item.icon}</span>
            <span className="flex-1 min-w-0">
              <span className="text-sm font-medium block" style={{ color: 'var(--text)' }}>
                {item.label}
              </span>
              <span className="text-xs block" style={{ color: 'var(--text-3)' }}>
                {item.subtitle}
              </span>
            </span>
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>
              →
            </span>
          </button>
        );
      })}
      {sprintItems.map((cycle) => {
        const i = nextIdx();
        const isHighlighted = highlightIdx === i;
        return (
          <button
            key={cycle.id}
            data-idx={i}
            onClick={onGoToGantt}
            className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
            style={{ background: isHighlighted ? 'var(--brand-subtle)' : 'transparent' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')}
          >
            <span className="w-3 h-3 rounded-full flex-shrink-0 ml-1" style={{ background: cycle.color }} />
            <span className="flex-1 min-w-0">
              <span className="text-sm font-medium block" style={{ color: 'var(--text)' }}>
                {cycle.name}
              </span>
              <span className="text-xs block" style={{ color: 'var(--text-3)' }}>
                Sub-plan ·{' '}
                {new Date(cycle.startDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })} –{' '}
                {new Date(cycle.endDate).toLocaleDateString('en', { month: 'short', day: 'numeric' })} · Progress
              </span>
            </span>
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>
              →
            </span>
          </button>
        );
      })}
    </div>
  );
}
