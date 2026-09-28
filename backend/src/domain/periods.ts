const DAY_MS = 24 * 60 * 60 * 1000;

export type Range = { from: Date; to: Date };

/** The `days` ending at `now`, and the same number of days immediately before that. */
export function windows(now: Date, days: number): { current: Range; previous: Range } {
  const from = new Date(now.getTime() - days * DAY_MS);
  const before = new Date(from.getTime() - days * DAY_MS);
  return { current: { from, to: now }, previous: { from: before, to: from } };
}

/**
 * Percentage change from `before` to `now`, rounded to a whole number.
 * `null` when there is nothing to compare against (before is 0) — a jump from 0
 * to 5 has no meaningful percentage.
 */
export function percentChange(now: number, before: number): number | null {
  if (before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}
