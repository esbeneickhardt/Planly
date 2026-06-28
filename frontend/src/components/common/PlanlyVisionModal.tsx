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
    heading: 'Work sprint by sprint',
    body: 'Pull tasks into sprints and move them across Kanban columns. A milestone progress bar shows how close you are to each deadline.',
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
  { term: 'Milestone', def: 'Any task with a deadline — visible on the canvas, Kanban progress bar, and Gantt timeline.' },
  { term: 'Final Product', def: 'The end goal at the bottom of all dependency chains. Milestone count tracks overall delivery.' },
  { term: 'Sprint', def: 'A time-boxed chunk of work. Pull tasks in from the Plan view and execute them on the board.' },
  { term: 'Dependencies', def: 'Arrows on the canvas that say "B can\'t start until A is done." Drives Gantt progress logic.' },
];

const PRINCIPLES = [
  { icon: '👤', heading: 'One owner per task', body: 'Accountability is unambiguous — no "the team owns it."' },
  { icon: '💬', heading: 'Every task has its own chat', body: 'Discussions live with the task, not scattered across Slack.' },
  { icon: '→', heading: 'Tasks flow through states', body: 'Columns show work state, not org charts. The board shows reality.' },
  { icon: '⛓', heading: 'Dependencies are explicit', body: 'Blockers are visible before they become crises.' },
  { icon: '📌', heading: 'Milestones mark commitments', body: 'A milestone is a promise to a stakeholder, not just a grouping.' },
  { icon: '⚡', heading: 'Sprints are optional', body: 'Filter by "All sprints" if your team doesn\'t sprint.' },
  { icon: '🔑', heading: 'Granular permissions', body: 'Per-tab, per-person access — external reviewers can view without editing.' },
  { icon: '📊', heading: 'Automation-friendly', body: 'Push tasks from spreadsheets, scripts, or CI via the REST API + tokens.' },
];

const PAGES = [
  { id: 'flow',       title: 'The flow',        subtitle: 'Three views, one coherent pipeline from planning to delivery.' },
  { id: 'concepts',  title: 'Key concepts',     subtitle: 'The building blocks that connect all three views.' },
  { id: 'principles',title: 'How we work',      subtitle: 'The principles that make Planly different.' },
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
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-xl rounded-3xl shadow-2xl flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', height: 480 }}
      >
        {/* Header — fixed */}
        <div className="px-7 pt-6 pb-4 flex-shrink-0 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0">
              <img src="/icons/icon.jpg" alt="Planly" className="w-full h-full object-cover" style={{ transform: 'scale(1.25)', transformOrigin: 'center' }} />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight" style={{ color: 'var(--text)' }}>{PAGES[page].title}</h2>
              <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-3)' }}>{PAGES[page].subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-xs transition-colors flex-shrink-0 ml-3"
            style={{ color: 'var(--text-3)', background: 'var(--surface-2)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
          >✕</button>
        </div>

        {/* Divider */}
        <div className="flex-shrink-0 mx-7" style={{ height: 1, background: 'var(--border)' }} />

        {/* Content — scrollable within fixed height */}
        <div className="flex-1 overflow-y-auto px-7 py-5 min-h-0">

          {/* Page 1 — The flow */}
          {page === 0 && (
            <div className="space-y-3">
              {/* Connector */}
              <div className="grid grid-cols-3 gap-3 relative">
                <div className="absolute top-[26px] left-[calc(33.33%+6px)] right-[calc(33.33%+6px)] h-px" style={{ background: 'var(--border)' }} />
                {PHASES.map((phase, i) => (
                  <div
                    key={phase.label}
                    className="rounded-2xl p-4 flex flex-col gap-2.5 relative"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                  >
                    <div
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ background: phase.color }}
                    >{i + 1}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{phase.icon}</span>
                      <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: phase.color }}>{phase.label}</span>
                    </div>
                    <p className="text-xs font-semibold leading-snug" style={{ color: 'var(--text)' }}>{phase.heading}</p>
                    <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-3)' }}>{phase.body}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-center pt-1" style={{ color: 'var(--text-3)' }}>
                Each view feeds the next — plan on the canvas, execute on the board, track on the timeline.
              </p>
            </div>
          )}

          {/* Page 2 — Key concepts */}
          {page === 1 && (
            <div className="space-y-2.5">
              {CONCEPTS.map(({ term, def }) => (
                <div key={term} className="flex gap-3 p-3.5 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: 'var(--brand)' }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{term}</p>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-3)' }}>{def}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Page 3 — Principles */}
          {page === 2 && (
            <div className="grid grid-cols-2 gap-2.5">
              {PRINCIPLES.map(({ icon, heading, body }) => (
                <div key={heading} className="flex gap-2.5 p-3 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <span className="text-lg flex-shrink-0 leading-none mt-0.5">{icon}</span>
                  <div>
                    <p className="text-xs font-semibold leading-snug" style={{ color: 'var(--text)' }}>{heading}</p>
                    <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-3)' }}>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Footer — fixed: dots + nav */}
        <div className="flex-shrink-0 px-7 py-4 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
          {/* Dot indicators */}
          <div className="flex items-center gap-2">
            {PAGES.map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === page ? 20 : 6,
                  height: 6,
                  background: i === page ? 'var(--brand)' : 'var(--border)',
                }}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            {page > 0 && (
              <button
                onClick={prev}
                className="btn-secondary text-sm px-4"
              >
                ← Back
              </button>
            )}
            <button
              onClick={next}
              className="btn-primary text-sm px-5"
            >
              {isLast ? 'Get started →' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
