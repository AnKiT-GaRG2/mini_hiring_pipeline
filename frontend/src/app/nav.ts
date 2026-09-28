import { Briefcase, CalendarDays, Home, Settings, Users, UsersRound, type LucideIcon } from 'lucide-react'

export type NavItem = { to: string; label: string; icon: LucideIcon }

/** The six pages, in the order they appear in the sidebar. */
export const NAV: readonly NavItem[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/candidates', label: 'Candidates', icon: Users },
  { to: '/jobs', label: 'Jobs', icon: Briefcase },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/team', label: 'Manage Teams', icon: UsersRound },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function isActive(itemTo: string, pathname: string): boolean {
  return itemTo === '/' ? pathname === '/' : pathname === itemTo || pathname.startsWith(`${itemTo}/`)
}
