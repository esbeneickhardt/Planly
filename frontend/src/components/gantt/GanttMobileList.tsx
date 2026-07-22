/**
 * Mobile-only (`md:hidden`) scrollable milestone list for the Gantt view, shown in place of the timeline chart.
 * Each milestone card shows a colour-coded progress bar and done-task count; clicking opens the task detail panel.
 * `progressColor` is exported for reuse in the desktop Gantt row renderer.
 */
import type { MilestoneResult } from '../../api/client';
import type { Task } from '../../types';

export function progressColor(m: MilestoneResult): string {
  if (m.status === 'done') return '#10b981';
  const now = new Date();
  const deadline = new Date(m.deadline);
  if (deadline < now) return m.progress >= 0.5 ? '#f59e0b' : '#ef4444';
  return m.progress >= 0.75 ? '#10b981' : m.progress >= 0.4 ? '#f59e0b' : '#ef4444';
}

interface Props {
  visibleMilestones: MilestoneResult[];
  milestones: MilestoneResult[];
  hideDone: boolean;
  doneCount: number;
  tasks: Task[];
  setSelectedTask: (task: Task | null) => void;
  setHideDone: (v: boolean | ((prev: boolean) => boolean)) => void;
}

export default function GanttMobileList({
  visibleMilestones,
  milestones,
  hideDone,
  doneCount,
  tasks,
  setSelectedTask,
  setHideDone,
}: Props) {
  return (
    <div className="md:hidden h-full overflow-y-auto px-4 py-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest mb-3 text-token-3">
        Milestones - {doneCount}/{milestones.length} done
      </p>
      {visibleMilestones.map((m) => {
        const color = progressColor(m);
        const isDone = m.status === 'done';
        const isOverdue = new Date(m.deadline) < new Date() && !isDone;
        return (
          <button
            key={m.id}
            className="w-full text-left rounded-xl px-4 py-3 transition-colors bg-surface-2 border border-border"
            onClick={() => {
              const t = tasks.find((t) => t.id === m.id);
              if (t) setSelectedTask(t);
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <p
                className="text-sm font-medium leading-tight"
                style={{
                  color: isDone ? 'var(--text-3)' : 'var(--text)',
                  textDecoration: isDone ? 'line-through' : 'none',
                }}
              >
                {isDone && <span className="mr-1">✓</span>}
                {m.name}
              </p>
              <span
                className="text-xs font-semibold flex-shrink-0 px-2 py-0.5 rounded-full"
                style={{
                  background: isOverdue ? 'rgba(239,68,68,0.12)' : 'rgba(100,116,139,0.12)',
                  color: isOverdue ? '#ef4444' : 'var(--text-3)',
                }}
              >
                {new Date(m.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
              </span>
            </div>
            {!isDone && (
              <div className="mt-2">
                <div className="h-1.5 rounded-full overflow-hidden bg-border">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${m.progress * 100}%`, background: color }}
                  />
                </div>
                <p className="text-[11px] mt-1 text-token-3">
                  {m.doneDependencies}/{m.totalDependencies} tasks done
                </p>
              </div>
            )}
          </button>
        );
      })}
      {doneCount > 0 && hideDone && (
        <button onClick={() => setHideDone(false)} className="w-full text-center text-xs py-2 text-token-3">
          Show {doneCount} completed milestone{doneCount !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
}
