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
export const STAGE_STYLES: Record<Stage, { badge: string; dot: string; column: string; count: string; hex: string }> = {
  APPLIED: { badge: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400', column: 'from-slate-100/80', count: 'text-slate-500', hex: '#94a3b8' },
  SCREENING: { badge: 'bg-blue-50 text-blue-600', dot: 'bg-blue-500', column: 'from-blue-50', count: 'text-blue-600', hex: '#3b82f6' },
  INTERVIEW: { badge: 'bg-violet-50 text-violet-600', dot: 'bg-violet-500', column: 'from-violet-50', count: 'text-violet-600', hex: '#8b5cf6' },
  OFFER: { badge: 'bg-orange-50 text-orange-600', dot: 'bg-orange-400', column: 'from-orange-50', count: 'text-orange-600', hex: '#fb923c' },
  HIRED: { badge: 'bg-emerald-50 text-emerald-600', dot: 'bg-emerald-500', column: 'from-emerald-50', count: 'text-emerald-600', hex: '#10b981' },
  REJECTED: { badge: 'bg-rose-50 text-rose-600', dot: 'bg-rose-500', column: 'from-rose-50', count: 'text-rose-600', hex: '#f43f5e' },
}

/** What each board column says it holds. */
export const STAGE_DESCRIPTIONS: Record<Stage, string> = {
  APPLIED: 'New candidates who have applied',
  SCREENING: 'Initial screening & resume review',
  INTERVIEW: 'Interview rounds in progress',
  OFFER: 'Offer extended to candidates',
  HIRED: 'Successfully onboarded',
  REJECTED: 'Not moving forward',
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
