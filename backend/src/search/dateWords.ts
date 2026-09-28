const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function subDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - days);
  return copy;
}

/** Most recent occurrence of `weekdayIndex` (0=Sunday), including today. */
function mostRecentWeekday(now: Date, weekdayIndex: number): Date {
  const today = startOfDay(now);
  const diff = (today.getDay() - weekdayIndex + 7) % 7;
  return subDays(today, diff);
}

/**
 * Parses the free-text phrase that follows "since" into a concrete Date.
 * Supports: weekday names (most recent occurrence), "today", "yesterday",
 * "N days ago", and ISO dates (YYYY-MM-DD). Returns undefined for anything
 * else — the caller treats that as a specific parse failure rather than
 * silently ignoring the "since" clause.
 */
export function parseSinceDate(phrase: string, now: Date = new Date()): Date | undefined {
  const p = phrase.trim().toLowerCase();

  if (p === "today") return startOfDay(now);
  if (p === "yesterday") return subDays(startOfDay(now), 1);

  const weekdayIndex = WEEKDAYS.indexOf(p);
  if (weekdayIndex !== -1) return mostRecentWeekday(now, weekdayIndex);

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p);
  if (isoMatch) {
    const [year, month, day] = isoMatch.slice(1).map(Number);
    // Local midnight, like every other branch here, so "since 2026-09-20"
    // and "since Monday" mean the same kind of boundary.
    const date = new Date(year, month - 1, day);
    // Round-trip check rejects overflow dates like 2026-02-31.
    const isRealDate =
      date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    return isRealDate ? date : undefined;
  }

  const daysAgoMatch = /^(\d+)\s+days?\s+ago$/.exec(p);
  if (daysAgoMatch) return subDays(startOfDay(now), Number(daysAgoMatch[1]));

  return undefined;
}
