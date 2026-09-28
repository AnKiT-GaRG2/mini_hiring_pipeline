/**
 * Calendar maths in a chosen IANA time zone.
 *
 * The browser's own zone is not necessarily the one the team schedules in, so
 * the calendar lets people pick. Everything here works on plain `{y, m, d}` days
 * and converts to/from instants through Intl, which knows about daylight saving.
 */

/** A calendar day. `m` is 1–12. */
export type Ymd = { y: number; m: number; d: number }

const MS_MINUTE = 60_000
const MS_DAY = 24 * 60 * MS_MINUTE

const formatters = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(tz, f)
  }
  return f
}

type Parts = { y: number; m: number; d: number; hour: number; minute: number; second: number }

export function zonedParts(instant: Date | number, tz: string): Parts {
  const out: Record<string, number> = {}
  for (const part of partsFormatter(tz).formatToParts(instant)) {
    if (part.type !== 'literal') out[part.type] = Number(part.value)
  }
  return {
    y: out.year,
    m: out.month,
    d: out.day,
    hour: out.hour === 24 ? 0 : out.hour, // some engines print midnight as 24
    minute: out.minute,
    second: out.second,
  }
}

/** How far ahead of UTC the zone's wall clock is at this instant, in ms. */
function offsetMs(instant: number, tz: string): number {
  const p = zonedParts(instant, tz)
  const asIfUtc = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute, p.second)
  return asIfUtc - Math.floor(instant / 1000) * 1000
}

/** The instant at which the wall clock in `tz` reads `hour:minute` on `day`. */
export function zonedTimeToInstant(day: Ymd, hour: number, minute: number, tz: string): Date {
  const guess = Date.UTC(day.y, day.m - 1, day.d, hour, minute)
  const first = offsetMs(guess, tz)
  let instant = guess - first
  // Across a daylight-saving change the first guess can be an hour out; correct once.
  const second = offsetMs(instant, tz)
  if (second !== first) instant = guess - second
  return new Date(instant)
}

export function ymdOf(instant: Date | number, tz: string): Ymd {
  const { y, m, d } = zonedParts(instant, tz)
  return { y, m, d }
}

export function addDays(day: Ymd, n: number): Ymd {
  const t = new Date(Date.UTC(day.y, day.m - 1, day.d) + n * MS_DAY)
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}

export function addMonths(day: Ymd, n: number): Ymd {
  const total = day.y * 12 + (day.m - 1) + n
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  const daysInTarget = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { y, m, d: Math.min(day.d, daysInTarget) }
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(day: Ymd): number {
  return new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay()
}

export const sameDay = (a: Ymd, b: Ymd) => a.y === b.y && a.m === b.m && a.d === b.d
export const compareDays = (a: Ymd, b: Ymd) => Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)

export const ymdKey = ({ y, m, d }: Ymd) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

export function parseYmdKey(text: string): Ymd | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return null
  const day = { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
  const back = addDays(day, 0) // normalises impossible dates such as 2026-02-31
  return sameDay(back, day) ? day : null
}

/** The Sunday on or before `day`. */
export function startOfWeek(day: Ymd): Ymd {
  return addDays(day, -dayOfWeek(day))
}

export function startOfMonth(day: Ymd): Ymd {
  return { y: day.y, m: day.m, d: 1 }
}

/** Every day shown in a month grid: whole weeks, Sunday to Saturday, covering the month. */
export function monthGrid(day: Ymd): Ymd[] {
  const first = startOfMonth(day)
  const start = startOfWeek(first)
  const daysInMonth = new Date(Date.UTC(day.y, day.m, 0)).getUTCDate()
  const weeks = Math.ceil((dayOfWeek(first) + daysInMonth) / 7)
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
}

export type Range = { from: Date; to: Date }

/** [midnight, next midnight) for the first day through the last, in `tz`. */
export function daysRange(first: Ymd, last: Ymd, tz: string): Range {
  return { from: zonedTimeToInstant(first, 0, 0, tz), to: zonedTimeToInstant(addDays(last, 1), 0, 0, tz) }
}

// ───────────────────────────── formatting ─────────────────────────────

const timeFormatters = new Map<string, Intl.DateTimeFormat>()

function timeFormatter(tz: string, withMeridiem: boolean): Intl.DateTimeFormat {
  const key = `${tz}|${withMeridiem}`
  let f = timeFormatters.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true })
    timeFormatters.set(key, f)
  }
  return f
}

/** "9:00 AM". */
export function formatTime(instant: Date | string, tz: string): string {
  return timeFormatter(tz, true).format(new Date(instant)).replace(/\s/g, ' ')
}

/** "9:00 – 9:45 AM", or "11:30 AM – 12:15 PM" when it crosses noon. */
export function formatTimeRange(start: Date | string, end: Date | string, tz: string): string {
  const a = formatTime(start, tz)
  const b = formatTime(end, tz)
  const meridiem = (t: string) => t.slice(-2)
  return meridiem(a) === meridiem(b) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const monthShort = (day: Ymd) => MONTHS[day.m - 1]
export const monthLong = (day: Ymd) => MONTHS_LONG[day.m - 1]
export const weekdayLong = (day: Ymd) => WEEKDAYS_LONG[dayOfWeek(day)]

/** "Sep 28". */
export const formatDayShort = (day: Ymd) => `${monthShort(day)} ${day.d}`

/** "Sep 28 – Oct 4, 2025" (or "Sep 28 – Oct 4, 2025" across a year boundary with both years). */
export function formatRangeLabel(first: Ymd, last: Ymd): string {
  if (sameDay(first, last)) return `${formatDayShort(first)}, ${first.y}`
  if (first.y !== last.y) return `${formatDayShort(first)}, ${first.y} – ${formatDayShort(last)}, ${last.y}`
  return `${formatDayShort(first)} – ${formatDayShort(last)}, ${last.y}`
}

/** "September 2025". */
export const formatMonthYear = (day: Ymd) => `${monthLong(day)} ${day.y}`

// ───────────────────────────── time zones ─────────────────────────────

export type ZoneOption = { id: string; label: string; name: string }

const KNOWN_ZONES: ZoneOption[] = [
  { id: 'Asia/Kolkata', label: 'IST', name: 'India Standard Time' },
  { id: 'UTC', label: 'UTC', name: 'Coordinated Universal Time' },
  { id: 'Europe/London', label: 'UK', name: 'London' },
  { id: 'Europe/Berlin', label: 'CET', name: 'Central Europe' },
  { id: 'America/New_York', label: 'ET', name: 'US Eastern' },
  { id: 'America/Los_Angeles', label: 'PT', name: 'US Pacific' },
  { id: 'Asia/Singapore', label: 'SGT', name: 'Singapore' },
  { id: 'Australia/Sydney', label: 'AET', name: 'Sydney' },
]

export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** The zones offered in the picker; the browser's own is added if it isn't already there. */
export function zoneOptions(current: string): ZoneOption[] {
  const list = [...KNOWN_ZONES]
  for (const id of [browserZone(), current]) {
    if (!list.some((z) => z.id === id)) list.unshift({ id, label: shortZoneName(id), name: id.replace(/_/g, ' ') })
  }
  return list
}

export function shortZoneName(id: string): string {
  const known = KNOWN_ZONES.find((z) => z.id === id)
  if (known) return known.label
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: id, timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')
    return part?.value ?? id
  } catch {
    return id
  }
}

export function isValidZone(id: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: id })
    return true
  } catch {
    return false
  }
}
