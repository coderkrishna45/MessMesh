/**
 * Week helpers for the weekly meal-rating contest.
 * Weeks run Monday 00:00 UTC → next Monday 00:00 UTC (end exclusive).
 */

export function getMondayUTC(inputDate) {
  const d = new Date(inputDate);
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset));
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

/** @returns {{ weekStart: Date, weekEnd: Date }} weekEnd is exclusive (next Monday) */
export function getWeekBounds(inputDate) {
  const weekStart = getMondayUTC(inputDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  return { weekStart, weekEnd };
}

export function formatISODate(d) {
  return d.toISOString().split('T')[0];
}

export function weekLabel(weekStart, currentMonday) {
  const startStr = formatISODate(weekStart);
  const curStr = formatISODate(currentMonday);
  if (startStr === curStr) return 'Current Week';

  const ms = currentMonday.getTime() - weekStart.getTime();
  const weeksAgo = Math.round(ms / (7 * 24 * 60 * 60 * 1000));
  if (weeksAgo === 1) return '1 Week Ago';
  if (weeksAgo === 2) return '2 Weeks Ago';
  if (weeksAgo === 3) return '3 Weeks Ago';
  return `Week of ${startStr}`;
}

export function weekRangeLabel(weekStart, weekEnd) {
  const endInclusive = new Date(weekEnd);
  endInclusive.setUTCDate(endInclusive.getUTCDate() - 1);
  return `${formatISODate(weekStart)} → ${formatISODate(endInclusive)}`;
}
