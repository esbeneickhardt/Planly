/**
 * Returns true only when the given date's calendar day is strictly before today.
 * Compares at midnight in local time so a deadline of "today" is never overdue.
 */
export function isBeforeToday(date: string | Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d < today;
}
