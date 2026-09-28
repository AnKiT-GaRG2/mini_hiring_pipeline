import type { Role } from '../api/types'

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  HIRING_MANAGER: 'Hiring Manager',
  RECRUITER: 'Recruiter',
}

export const ROLES: readonly Role[] = ['RECRUITER', 'HIRING_MANAGER', 'ADMIN']

export const ROLE_STYLES: Record<Role, { badge: string; dot: string; chart: string }> = {
  RECRUITER: { badge: 'bg-brand-50 text-brand-700', dot: 'bg-brand-500', chart: '#3f74f2' },
  HIRING_MANAGER: { badge: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500', chart: '#a06bf5' },
  ADMIN: { badge: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500', chart: '#f6a13a' },
}
