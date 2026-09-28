import { matchOneOf, soleWord } from "./wordMatch";

const DAY_WORDS = ["today", "tomorrow", "yesterday"] as const;

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const MONTH_ABBREVIATIONS = MONTHS.map((m) => m.slice(0, 3));

function monthIndex(word: string): number | undefined {
  const w = word.toLowerCase();
  const full = MONTHS.indexOf(w);
  if (full !== -1) return full;
  const short = MONTH_ABBREVIATIONS.indexOf(w);
  return short !== -1 ? short : undefined;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function subDays(d: Date, days: number): Date {
  return addDays(d, -days);
}

/** Midnight of the Sunday on or before `d`. */
function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  return subDays(day, day.getDay());
}

/** A single day as a [from, to) pair, one day apart. */
function daySpan(d: Date): { from: Date; to: Date } {
  const from = startOfDay(d);
  return { from, to: addDays(from, 1) };
}

/** Real date, or undefined for an overflow like 2026-02-31. */
function realDate(year: number, month0: number, day: number): Date | undefined {
  const date = new Date(year, month0, day);
  const ok = date.getFullYear() === year && date.getMonth() === month0 && date.getDate() === day;
  return ok ? date : undefined;
}

/** Most recent occurrence of `weekdayIndex` (0=Sunday), including today. */
function mostRecentWeekday(now: Date, weekdayIndex: number): Date {
  const today = startOfDay(now);
  const diff = (today.getDay() - weekdayIndex + 7) % 7;
  return subDays(today, diff);
}

/** Nearest occurrence of `weekdayIndex` on or after today. */
function nextOrTodayWeekday(now: Date, weekdayIndex: number): Date {
  const today = startOfDay(now);
  const diff = (weekdayIndex - today.getDay() + 7) % 7;
  return addDays(today, diff);
}

/** The occurrence of `weekdayIndex` strictly after today (never today itself). */
function strictlyNextWeekday(now: Date, weekdayIndex: number): Date {
  const candidate = nextOrTodayWeekday(now, weekdayIndex);
  return candidate.getTime() === startOfDay(now).getTime() ? addDays(candidate, 7) : candidate;
}

/** The occurrence of `weekdayIndex` strictly before today (never today itself). */
function strictlyLastWeekday(now: Date, weekdayIndex: number): Date {
  const candidate = mostRecentWeekday(now, weekdayIndex);
  return candidate.getTime() === startOfDay(now).getTime() ? subDays(candidate, 7) : candidate;
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

/**
 * Finds a date phrase anywhere in free text — on its own, or alongside other
 * words ("panel interview tomorrow") — and reads it as the day or week it
 * names, as a [from, to) instant range. Unlike {@link parseSinceDate} this
 * looks forward as readily as back, because it backs the quick search box,
 * where "monday" or "sep 30" most often means "show me what's coming up"
 * rather than "how long has it been".
 *
 * Recognises: "today", "tomorrow", "yesterday"; a bare weekday (nearest
 * occurrence, today counts), "next <weekday>" (strictly after today) and
 * "last <weekday>" (strictly before); "this week" and "next week" (Sunday to
 * Saturday); an ISO date; and a month name with a day ("Sep 30", "30
 * September", "September 30, 2026" — year defaults to `now`'s year). Returns
 * undefined when no such phrase appears. Checked most-specific first, so
 * "next monday" is read as one phrase rather than the bare weekday "monday".
 *
 * When `text` is a single word, a 3-letter-or-longer prefix of "today",
 * "tomorrow" or "yesterday" counts too — what lets the quick search box
 * start predicting a day before the word is fully typed.
 */
export function parseDayPhrase(text: string, now: Date = new Date()): { from: Date; to: Date } | undefined {
  const p = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!p) return undefined;

  const word = soleWord(p);
  if (word) {
    const dayHit = matchOneOf(word, DAY_WORDS);
    if (dayHit === "today") return daySpan(now);
    if (dayHit === "tomorrow") return daySpan(addDays(now, 1));
    if (dayHit === "yesterday") return daySpan(subDays(now, 1));

    const weekdayHit = matchOneOf(word, WEEKDAYS);
    if (weekdayHit) return daySpan(nextOrTodayWeekday(now, WEEKDAYS.indexOf(weekdayHit)));
  }

  if (/\btoday\b/.test(p)) return daySpan(now);
  if (/\btomorrow\b/.test(p)) return daySpan(addDays(now, 1));
  if (/\byesterday\b/.test(p)) return daySpan(subDays(now, 1));

  if (/\bthis week\b/.test(p)) {
    const from = startOfWeek(now);
    return { from, to: addDays(from, 7) };
  }
  if (/\bnext week\b/.test(p)) {
    const from = addDays(startOfWeek(now), 7);
    return { from, to: addDays(from, 7) };
  }

  const nextWeekdayMatch = /\bnext\s+(\w+)\b/.exec(p);
  if (nextWeekdayMatch) {
    const idx = WEEKDAYS.indexOf(nextWeekdayMatch[1]);
    if (idx !== -1) return daySpan(strictlyNextWeekday(now, idx));
  }

  const lastWeekdayMatch = /\blast\s+(\w+)\b/.exec(p);
  if (lastWeekdayMatch) {
    const idx = WEEKDAYS.indexOf(lastWeekdayMatch[1]);
    if (idx !== -1) return daySpan(strictlyLastWeekday(now, idx));
  }

  for (const weekday of WEEKDAYS) {
    if (new RegExp(`\\b${weekday}\\b`).test(p)) return daySpan(nextOrTodayWeekday(now, WEEKDAYS.indexOf(weekday)));
  }

  const isoMatch = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(p);
  if (isoMatch) {
    const [year, month, day] = isoMatch.slice(1).map(Number);
    const date = realDate(year, month - 1, day);
    if (date) return daySpan(date);
  }

  // "sep 30", "sep 30 2026", "sep 30, 2026" — month first.
  const monthDayMatch = /\b([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/.exec(p);
  // "30 sep", "30 september 2026" — day first.
  const dayMonthMatch = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?(?:,?\s+(\d{4}))?\b/.exec(p);
  for (const [found, monthFirst] of [[monthDayMatch, true] as const, [dayMonthMatch, false] as const]) {
    if (!found) continue;
    const [monthWord, dayWord] = monthFirst ? [found[1], found[2]] : [found[2], found[1]];
    const month = monthIndex(monthWord);
    if (month === undefined) continue;
    const day = Number(dayWord);
    const year = found[3] ? Number(found[3]) : now.getFullYear();
    const date = realDate(year, month, day);
    if (date) return daySpan(date);
  }

  return undefined;
}
