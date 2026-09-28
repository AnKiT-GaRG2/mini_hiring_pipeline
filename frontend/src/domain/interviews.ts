import { Building2, CalendarClock, Phone, Video, type LucideIcon } from 'lucide-react'
import type { Interview, InterviewType, MeetingPlatform } from '../api/types'

export const INTERVIEW_TYPES: readonly InterviewType[] = ['INITIAL', 'TECHNICAL', 'HR', 'PANEL', 'HIRING_MANAGER', 'OFFER_DISCUSSION']

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  INITIAL: 'Initial Interview',
  TECHNICAL: 'Technical Interview',
  HR: 'HR Interview',
  PANEL: 'Panel Interview',
  HIRING_MANAGER: 'Hiring Manager Round',
  OFFER_DISCUSSION: 'Offer Discussion',
}

/** Shorter labels for tight spaces, like the calendar's week grid. */
export const INTERVIEW_TYPE_SHORT_LABELS: Record<InterviewType, string> = {
  INITIAL: 'Initial',
  TECHNICAL: 'Technical',
  HR: 'HR',
  PANEL: 'Panel',
  HIRING_MANAGER: 'Hiring Mgr',
  OFFER_DISCUSSION: 'Offer',
}

// Full class names (not built from fragments) so Tailwind can see them.
export const INTERVIEW_STYLES: Record<InterviewType, { card: string; dot: string; text: string; pill: string; icon: string }> = {
  INITIAL: {
    card: 'border-sky-200 bg-sky-50 hover:bg-sky-100/70',
    dot: 'bg-sky-500',
    text: 'text-sky-700',
    pill: 'bg-sky-50 text-sky-700',
    icon: 'bg-sky-50 text-sky-600',
  },
  TECHNICAL: {
    card: 'border-violet-200 bg-violet-50 hover:bg-violet-100/70',
    dot: 'bg-violet-500',
    text: 'text-violet-700',
    pill: 'bg-violet-50 text-violet-700',
    icon: 'bg-violet-50 text-violet-600',
  },
  HR: {
    card: 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100/70',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700',
    pill: 'bg-emerald-50 text-emerald-700',
    icon: 'bg-emerald-50 text-emerald-600',
  },
  PANEL: {
    card: 'border-rose-200 bg-rose-50 hover:bg-rose-100/70',
    dot: 'bg-rose-500',
    text: 'text-rose-700',
    pill: 'bg-rose-50 text-rose-700',
    icon: 'bg-rose-50 text-rose-600',
  },
  HIRING_MANAGER: {
    card: 'border-amber-200 bg-amber-50 hover:bg-amber-100/70',
    dot: 'bg-amber-500',
    text: 'text-amber-800',
    pill: 'bg-amber-50 text-amber-800',
    icon: 'bg-amber-50 text-amber-600',
  },
  OFFER_DISCUSSION: {
    card: 'border-teal-200 bg-teal-50 hover:bg-teal-100/70',
    dot: 'bg-teal-500',
    text: 'text-teal-700',
    pill: 'bg-teal-50 text-teal-700',
    icon: 'bg-teal-50 text-teal-600',
  },
}

export const PLATFORMS: readonly MeetingPlatform[] = ['GOOGLE_MEET', 'ZOOM', 'PHONE', 'ON_SITE']

export const PLATFORM_LABELS: Record<MeetingPlatform, string> = {
  ZOOM: 'Zoom',
  GOOGLE_MEET: 'Google Meet',
  PHONE: 'Phone call',
  ON_SITE: 'On-site',
}

export const PLATFORM_ICONS: Record<MeetingPlatform, LucideIcon> = {
  ZOOM: Video,
  GOOGLE_MEET: Video,
  PHONE: Phone,
  ON_SITE: Building2,
}

export const InterviewFallbackIcon = CalendarClock

export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120] as const

/** Cancelled interviews stay in the database for the record but are not shown as events. */
export function isVisibleEvent(interview: Interview): boolean {
  return interview.status !== 'CANCELLED'
}
