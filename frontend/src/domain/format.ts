const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "just now", "5 minutes ago", "2 hours ago", "1 day ago", "3 weeks ago", "Apr 12, 2025". */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const elapsed = now - new Date(iso).getTime()
  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), 'minute') + ' ago'
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), 'hour') + ' ago'
  if (elapsed < 14 * DAY) return plural(Math.floor(elapsed / DAY), 'day') + ' ago'
  if (elapsed < 60 * DAY) return plural(Math.floor(elapsed / (7 * DAY)), 'week') + ' ago'
  return formatDate(iso)
}

export function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

/** "Apr 12, 2025" — always with the year: these are stored dates, not "this week" phrasing. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "Apr 2024". */
export function formatMonthYearOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/** "Priya" from "Priya Sharma". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

/** "Good morning", "Good afternoon" or "Good evening" for the hour (0–23). */
export function greeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** "+12%" style text for a change, or a dash when there's nothing to compare with. */
export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Math.abs(value)}%`
}
