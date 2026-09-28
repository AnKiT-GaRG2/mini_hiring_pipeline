import { Sparkles, Users } from 'lucide-react'
import { Link, useLocation } from './router'
import { isActive, NAV } from './nav'

export function BrandMark() {
  return (
    <Link to="/" className="flex items-center gap-3 rounded-lg px-1">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-600/30">
        <Users className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="text-[17px] font-bold tracking-tight text-ink-950">Hiring Pipeline</span>
    </Link>
  )
}

/** The navigation itself — shared by the fixed desktop column and the mobile drawer. */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation()

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-5 pb-6">
        <BrandMark />
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1 px-3">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = isActive(to, pathname)
          return (
            <Link
              key={to}
              to={to}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={`flex h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition-colors ${
                active ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-tint hover:text-ink-950'
              }`}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="p-4">
        <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-4 shadow-card">
          <div className="absolute -right-8 -bottom-10 h-28 w-28 rounded-full bg-gradient-to-br from-brand-100 to-transparent" aria-hidden="true" />
          <Sparkles className="relative h-5 w-5 text-brand-600" aria-hidden="true" />
          <p className="relative mt-3 text-sm font-semibold text-ink-950">Build great teams</p>
          <p className="relative mt-1 text-xs leading-relaxed text-ink-500">
            Find the right people,
            <br />
            for a brighter future.
          </p>
        </div>
      </div>
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-white/80 backdrop-blur lg:block">
      <SidebarContent />
    </aside>
  )
}
