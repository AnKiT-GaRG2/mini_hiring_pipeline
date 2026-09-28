import { Briefcase, Cloud, Code2, Database, PenTool, Users, type LucideIcon } from 'lucide-react'
import type { EmploymentType, JobStatus, WorkMode } from '../api/types'

export const JOB_STATUS_LABELS: Record<JobStatus, string> = { OPEN: 'Active', PAUSED: 'On Hold', CLOSED: 'Closed' }

export const WORK_MODE_LABELS: Record<WorkMode, string> = { REMOTE: 'Remote', HYBRID: 'Hybrid', ON_SITE: 'On-site' }

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
}

// Full class names so Tailwind can see them.
export const JOB_STATUS_STYLES: Record<JobStatus, { badge: string; dot: string; bar: string }> = {
  OPEN: { badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', bar: '#22b391' },
  PAUSED: { badge: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500', bar: '#f5a524' },
  CLOSED: { badge: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500', bar: '#f0506e' },
}

type JobIcon = { Icon: LucideIcon; tile: string }

/** A recognisable icon per kind of role, chosen from the title — purely decorative. */
export function jobIconFor(title: string): JobIcon {
  const t = title.toLowerCase()
  if (/front|ui developer|web dev/.test(t)) return { Icon: Code2, tile: 'bg-brand-50 text-brand-600' }
  if (/back|database|data |api|software/.test(t)) return { Icon: Database, tile: 'bg-violet-50 text-violet-600' }
  if (/design|ux|ui\/|creative/.test(t)) return { Icon: PenTool, tile: 'bg-rose-50 text-rose-500' }
  if (/product|manager|lead|people/.test(t)) return { Icon: Users, tile: 'bg-amber-50 text-amber-600' }
  if (/devops|cloud|infra|sre|platform|reliab/.test(t)) return { Icon: Cloud, tile: 'bg-teal-50 text-teal-600' }
  return { Icon: Briefcase, tile: 'bg-slate-100 text-slate-500' }
}
