import type { Stage } from '../api/types'

/**
 * UX-only mirror of the backend's transition rules. It decides which buttons
 * to *offer*; it never decides what is *allowed*. The API re-validates every
 * request, and a stale or hand-crafted request that gets past this file is
 * answered with a 409 the UI handles (see usePipeline).
 */

/** Board columns, left to right. Rejected is rendered as its own section. */
export const PIPELINE_STAGES: readonly Stage[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED']

export const STAGE_LABELS: Record<Stage, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
}

const NEXT_STAGE: Partial<Record<Stage, Stage>> = {
  APPLIED: 'SCREENING',
  SCREENING: 'INTERVIEW',
  INTERVIEW: 'OFFER',
  OFFER: 'HIRED',
}

/** The single forward step from `stage`, or null when it is final. */
export function nextStage(stage: Stage): Stage | null {
  return NEXT_STAGE[stage] ?? null
}

/** Any non-final stage can be rejected. */
export function canReject(stage: Stage): boolean {
  return stage !== 'HIRED' && stage !== 'REJECTED'
}

// Full class names (not built from fragments) so Tailwind can see them.
export const STAGE_STYLES: Record<Stage, { badge: string; dot: string }> = {
  APPLIED: { badge: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-400' },
  SCREENING: { badge: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
  INTERVIEW: { badge: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500' },
  OFFER: { badge: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
  HIRED: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  REJECTED: { badge: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500' },
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

/**
 * Human-readable time since `since`, computed from the timestamp rather than
 * the API's whole-day counter so a candidate who moved an hour ago reads
 * "1 hour", not "0 days".
 */
export function formatTimeInStage(since: string, now: number = Date.now()): string {
  const elapsed = Math.max(0, now - new Date(since).getTime())
  if (elapsed < MINUTE) return 'under a minute'
  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), 'minute')
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), 'hour')
  return plural(Math.floor(elapsed / DAY), 'day')
}
