import type { Stage, StageHistoryEntry } from '../api/types'
import { STAGE_LABELS } from './stages'

/**
 * The audit trail records transitions only. A candidate's start in Applied is
 * not a transition, so there is no row for it — it comes from `createdAt`.
 */
export type TimelineEntry = {
  key: string
  /** ISO timestamp from the server. */
  at: string
  /** The stage the candidate was in as of this entry (drives the colour). */
  stage: Stage
  text: string
  by: string | null
  isCurrent: boolean
}

/** Oldest first. Stable, so rows sharing a timestamp keep the server's order. */
export function sortHistory(history: readonly StageHistoryEntry[]): StageHistoryEntry[] {
  return history
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => Date.parse(a.entry.changedAt) - Date.parse(b.entry.changedAt) || a.index - b.index)
    .map(({ entry }) => entry)
}

export function buildTimeline(createdAt: string, history: readonly StageHistoryEntry[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { key: 'created', at: createdAt, stage: 'APPLIED', text: `Applied — entered ${STAGE_LABELS.APPLIED}`, by: null, isCurrent: false },
    ...sortHistory(history).map((h) => ({
      key: h.id,
      at: h.changedAt,
      stage: h.toStage,
      text: `Moved from ${STAGE_LABELS[h.fromStage]} → ${STAGE_LABELS[h.toStage]}`,
      by: h.changedBy?.name ?? null,
      isCurrent: false,
    })),
  ]
  entries[entries.length - 1].isCurrent = true
  return entries
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

/** "3 days 7 hours", "5 hours 12 minutes", "12 minutes", "less than a minute". */
export function formatDetailedDuration(elapsedMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(elapsedMs / 60_000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return hours > 0 ? `${plural(days, 'day')} ${plural(hours, 'hour')}` : plural(days, 'day')
  if (hours > 0) return minutes > 0 ? `${plural(hours, 'hour')} ${plural(minutes, 'minute')}` : plural(hours, 'hour')
  if (minutes > 0) return plural(minutes, 'minute')
  return 'less than a minute'
}

/** "Currently in Interview for 3 days 7 hours". */
export function describeCurrentStage(stage: Stage, since: string, now: number): string {
  return `Currently in ${STAGE_LABELS[stage]} for ${formatDetailedDuration(now - Date.parse(since))}`
}

/** "Sep 20", or "Sep 20, 2025" when it isn't this year. */
export function formatEventDate(iso: string, now: number, locale?: string): string {
  const date = new Date(iso)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

export function formatEventTime(iso: string, locale?: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
}
