import { useState, useEffect, useCallback } from 'react';

interface Props {
  onClose: () => void;
}

const SEEN_KEY = 'planly_seen_welcome_v1';

export function shouldShowWelcome(hasProducts: boolean): boolean {
  return !hasProducts && !localStorage.getItem(SEEN_KEY);
}

export function markWelcomeSeen() {
  localStorage.setItem(SEEN_KEY, '1');
}

const PHASES = [
  {
    icon: '🗺️',
    label: 'Plan',
    color: 'var(--brand)',
    heading: 'Map your work as a graph',
    body: 'Create tasks and connect them with dependency arrows. Place milestones at the end of chains so you can see what needs to finish first.',
  },
  {
    icon: '⚡',
    label: 'Execute',
    color: '#f59e0b',
    heading: 'Work sub-plan by sub-plan',
    body: 'Pull tasks into sub-plans and move them across Kanban columns. A milestone progress bar shows how close you are to each deadline.',
  },
  {
    icon: '📊',
    label: 'Progress',
    color: '#10b981',
    heading: 'Track milestones on a timeline',
    body: 'The Gantt view shows every milestone as a horizontal bar, coloured by health. Hover to see which tasks are blocking it.',
  },
];

const CONCEPTS = [
  {
    term: 'Milestone',
    def: 'Any task with a deadline - visible on the canvas, Kanban progress bar, and Gantt timeline.',
  },
  {
    term: 'Final Product',
    def: 'The end goal at the bottom of all dependency chains. Milestone count tracks overall delivery.',
  },
  {
    term: 'Sub-plan',
    def: 'A time-boxed chunk of work. Pull tasks in from the Plan view and execute them on the board.',
  },
  {
    term: 'Dependencies',
    def: 'Arrows on the canvas that say "B can\'t start until A is done." Drives Gantt progress logic.',
  },
];

const PRINCIPLES = [
  { icon: '👤', heading: 'One owner per task', body: 'Accountability is unambiguous - no "the team owns it."' },
  {
    icon: '💬',
    heading: 'Every task has its own chat',
    body: 'Discussions live with the task, not scattered across Slack.',
  },
  {
    icon: '→',
    heading: 'Tasks flow through states',
    body: 'Columns show work state, not org charts. The board shows reality.',
  },
  { icon: '⛓', heading: 'Dependencies are explicit', body: 'Blockers are visible before they become crises.' },
  { icon: '📌', heading: 'Milestones mark commitments', body: 'A milestone is a commitment, not just a grouping.' },
  { icon: '⚡', heading: 'Sub-plans are optional', body: 'Filter by "All sub-plans" if your team doesn\'t cycle.' },
  {
    icon: '🔑',
    heading: 'Granular permissions',
    body: 'Per-tab, per-person access - external reviewers can view without editing.',
  },
  {
    icon: '📊',
    heading: 'Automation-friendly',
    body: 'Push tasks from spreadsheets, scripts, or CI via the REST API + tokens.',
  },
];

const PAGES = [
  { id: 'flow', title: 'The flow', subtitle: 'Three views, one coherent pipeline from planning to delivery.' },
  { id: 'concepts', title: 'Key concepts', subtitle: 'The building blocks that connect all three views.' },
  { id: 'principles', title: 'How we work', subtitle: 'The principles that make Planly different.' },
];

export default function PlanlyVisionModal({ onClose }: Props) {
  const [page, setPage] = useState(0);

  const prev = useCallback(() => setPage((p) => Math.max(0, p - 1)), []);
  const next = useCallback(() => {
    if (page < PAGES.length - 1) setPage((p) => p + 1);
    else onClose();
  }, [page, onClose]);

  useEffect(() => {
    markWelcomeSeen();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, next, prev]);

  const isLast = page === PAGES.length - 1;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '92vh' }}
      >
        {/* Header - fixed */}
        <div className="px-9 pt-7 pb-5 flex-shrink-0 flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0">
              <img
                src="/icons/p.png"
                alt="Planly"
                className="w-full h-full object-contain"
               
              />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight" style={{ color: 'var(--text)' }}>
                {PAGES[page]?.title}
              </h2>
              <p className="text-sm mt-0.5 leading-snug" style={{ color: 'var(--text-3)' }}>
                {PAGES[page]?.subtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors flex-shrink-0 ml-3"
            style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
          >
            ✕
          </button>
        </div>

        {/* Divider */}
        <div className="flex-shrink-0 mx-9" style={{ height: 1, background: 'var(--border)' }} />

        {/* Content - scrollable on small screens */}
        <div className="flex-1 overflow-y-auto px-9 py-6 min-h-0">
          {/* Page 1 - The flow */}
          {page === 0 && (
            <div className="space-y-0 relative">
              {/* Vertical connector */}
              <div className="absolute left-[27px] top-10 bottom-10 w-px" style={{ background: 'var(--border)' }} />
              {PHASES.map((phase, i) => (
                <div key={phase.label} className="flex gap-5 py-4">
                  {/* Step badge */}
                  <div
                    className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 z-10 gap-0.5"
                    style={{ background: phase.color + '22', border: `2px solid ${phase.color}` }}
                  >
                    <span className="text-2xl leading-none">{phase.icon}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: phase.color }}>
                      {i + 1}
                    </span>
                  </div>
                  {/* Text */}
                  <div
                    className="flex-1 rounded-2xl p-5"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                  >
                    <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: phase.color }}>
                      {phase.label}
                    </p>
                    <p className="text-base font-semibold leading-snug mb-2" style={{ color: 'var(--text)' }}>
                      {phase.heading}
                    </p>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-3)' }}>
                      {phase.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Page 2 - Key concepts */}
          {page === 1 && (
            <div className="space-y-3">
              {CONCEPTS.map(({ term, def }) => (
                <div
                  key={term}
                  className="flex gap-4 p-4 rounded-xl"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: 'var(--brand)' }}
                  />
                  <div>
                    <p className="text-base font-semibold" style={{ color: 'var(--text)' }}>
                      {term}
                    </p>
                    <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--text-3)' }}>
                      {def}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Page 3 - Principles */}
          {page === 2 && (
            <div className="grid grid-cols-2 gap-3">
              {PRINCIPLES.map(({ icon, heading, body }) => (
                <div
                  key={heading}
                  className="flex gap-3 p-4 rounded-xl"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                >
                  <span className="text-xl flex-shrink-0 leading-none mt-0.5">{icon}</span>
                  <div>
                    <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--text)' }}>
                      {heading}
                    </p>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-3)' }}>
                      {body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer - fixed: dots + nav */}
        <div
          className="flex-shrink-0 px-9 py-5 flex items-center justify-between"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2">
            {PAGES.map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === page ? 24 : 7,
                  height: 7,
                  background: i === page ? 'var(--brand)' : 'var(--border)',
                }}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {page > 0 && (
              <button onClick={prev} className="btn-secondary px-5">
                ← Back
              </button>
            )}
            <button onClick={next} className="btn-primary px-6">
              {isLast ? 'Get started →' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
