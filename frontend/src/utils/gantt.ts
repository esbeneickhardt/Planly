/**
 * Pure timeline-math helpers shared by GanttPage and its toolbar/sidebar/bars sub-components.
 * Kept dependency-free (no React) and separate from GanttPage.tsx itself so the presentational
 * components below it in the tree can import them without creating a page -> component ->
 * page import cycle.
 */
import type { MilestoneResult } from '../api/client';

/** Where `date` falls between `start` and `end`, clamped to [0, 1]. */
export function pct(date: Date, start: Date, end: Date): number {
  const total = end.getTime() - start.getTime();
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, (date.getTime() - start.getTime()) / total));
}

// Adaptive time markers - max ~15 labels regardless of zoom level
export function getTimeMarkers(start: Date, end: Date): { date: Date; label: string }[] {
  const spanDays = (end.getTime() - start.getTime()) / 86_400_000;
  const MAX = 15;

  // Monthly / quarterly / annual
  if (spanDays > MAX * 14) {
    let monthStep = 1;
    if (spanDays > MAX * 360) monthStep = 12;
    else if (spanDays > MAX * 90) monthStep = 6;
    else if (spanDays > MAX * 30) monthStep = 3;
    const out: { date: Date; label: string }[] = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cur <= last) {
      out.push({
        date: new Date(cur),
        label:
          monthStep >= 12
            ? cur.getFullYear().toString()
            : cur.toLocaleDateString('en', {
                month: 'short',
                ...(monthStep >= 3 ? { year: '2-digit' } : {}),
              }),
      });
      cur.setMonth(cur.getMonth() + monthStep);
    }
    return out;
  }

  // Daily / every-N-days / weekly / bi-weekly
  let intervalDays = 1;
  if (spanDays > MAX * 7) intervalDays = 14;
  else if (spanDays > MAX * 3) intervalDays = 7;
  else if (spanDays > MAX) intervalDays = Math.ceil(spanDays / MAX);

  const out: { date: Date; label: string }[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  if (intervalDays >= 7) cur.setDate(cur.getDate() + ((1 - cur.getDay() + 7) % 7)); // snap to Monday
  while (cur <= end) {
    out.push({
      date: new Date(cur),
      label: cur.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    });
    cur.setDate(cur.getDate() + intervalDays);
  }
  return out;
}

// Default sort when no manual order has been set: active milestones soonest-first, done pushed to the bottom
function fallbackMilestoneSort(a: MilestoneResult, b: MilestoneResult): number {
  const aDone = a.status === 'done';
  const bDone = b.status === 'done';
  if (aDone !== bDone) return aDone ? 1 : -1;
  return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
}

// Sorts by the shared, backend-persisted milestoneOrder (set by dragging in either Gantt or
// Kanban). Milestones that have never been dragged all share the default 0 and fall back to
// done-last/soonest-first ordering, so nothing looks broken before anyone has ever reordered.
export function orderMilestones(list: MilestoneResult[]): MilestoneResult[] {
  return [...list].sort((a, b) => a.milestoneOrder - b.milestoneOrder || fallbackMilestoneSort(a, b));
}
