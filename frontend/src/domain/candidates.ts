import type { CandidateSource, ExperienceLevel } from '../api/types'

export const CANDIDATE_SOURCE_LABELS: Record<CandidateSource, string> = {
  LINKEDIN: 'LinkedIn',
  REFERRAL: 'Referral',
  CAREER_PAGE: 'Career page',
  JOB_BOARD: 'Job board',
  AGENCY: 'Agency',
  OTHER: 'Other',
}

export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  fresher: 'Fresher (< 1 yr)',
  junior: 'Junior (1–2 yrs)',
  mid: 'Mid (3–5 yrs)',
  senior: 'Senior (6+ yrs)',
}

// A skill's colour is a function of its own text, so the same skill always looks the same.
const SKILL_PALETTE = ['bg-blue-50 text-blue-700', 'bg-violet-50 text-violet-700', 'bg-emerald-50 text-emerald-700', 'bg-amber-50 text-amber-700', 'bg-rose-50 text-rose-700', 'bg-teal-50 text-teal-700']

export function skillTone(name: string): string {
  let hash = 0
  for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return SKILL_PALETTE[hash % SKILL_PALETTE.length]
}

export const TAG_COLOR_STYLES: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
}
