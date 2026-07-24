/**
 * Colored strip shown above the board while a milestone filter is active - gives the filtered view
 * its own visual identity (the milestone's color) and lets the user flip to the next/previous
 * milestone without reopening the KanbanMilestoneFilter dropdown.
 */
import type { MilestoneOption } from './KanbanMilestoneFilter';

interface Props {
  milestone: MilestoneOption;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClear: () => void;
}

export default function KanbanMilestoneBanner({ milestone, index, total, onPrev, onNext, onClear }: Props) {
  return (
    <div
      className="flex items-center gap-3 px-4 md:px-6 py-2 flex-shrink-0"
      style={{ background: `${milestone.color}14`, borderBottom: `2px solid ${milestone.color}` }}
    >
      <button
        onClick={onPrev}
        disabled={total <= 1}
        className="text-base leading-none px-1.5 py-0.5 rounded transition-opacity"
        style={{ color: milestone.color, opacity: total <= 1 ? 0.35 : 1 }}
        title="Previous milestone"
      >
        ‹
      </button>

      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: milestone.color }} />
      <span className="text-sm font-semibold truncate" style={{ color: milestone.color }}>
        {milestone.name}
      </span>
      <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>
        {milestone.count} task{milestone.count !== 1 ? 's' : ''} · {index + 1}/{total}
      </span>

      <button
        onClick={onNext}
        disabled={total <= 1}
        className="text-base leading-none px-1.5 py-0.5 rounded transition-opacity"
        style={{ color: milestone.color, opacity: total <= 1 ? 0.35 : 1 }}
        title="Next milestone"
      >
        ›
      </button>

      <button
        onClick={onClear}
        className="ml-auto text-xs flex-shrink-0 transition-opacity hover:opacity-100"
        style={{ color: 'var(--text-3)', opacity: 0.7 }}
        title="Clear milestone filter"
      >
        ✕ All milestones
      </button>
    </div>
  );
}
