import { Menu, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { ErrorState } from '../components/ui/StatusViews'
import { Spinner } from '../components/ui/Spinner'
import { useCurrentUserState } from './CurrentUser'
import { GlobalSearch } from './GlobalSearch'
import { NotificationsMenu } from './NotificationsMenu'
import { useLocation } from './router'
import { BrandMark, Sidebar, SidebarContent } from './Sidebar'
import { UserMenu } from './UserMenu'

function MobileNav({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Menu" className="relative h-full w-72 max-w-[85vw] bg-white shadow-pop">
        <button type="button" onClick={onClose} aria-label="Close menu" className="absolute top-4 right-3 flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-tint">
          <X className="h-5 w-5" />
        </button>
        <SidebarContent onNavigate={onClose} />
      </div>
    </div>
  )
}

/** Sidebar + top bar around whichever page is showing. Waits for "who am I" before rendering the page. */
export function AppShell({ children }: { children: ReactNode }) {
  const user = useCurrentUserState()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  // Landing on a new page always starts at its top.
  useEffect(() => {
    window.scrollTo?.({ top: 0 })
  }, [pathname])

  if (user.status === 'loading') {
    return (
      <div role="status" className="flex min-h-screen items-center justify-center gap-3 text-sm text-ink-500">
        <Spinner /> Loading…
      </div>
    )
  }

  if (user.status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <ErrorState title="Can’t open the app" message={user.message} onRetry={user.retry} />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Sidebar />
      {menuOpen && <MobileNav onClose={() => setMenuOpen(false)} />}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-600 hover:bg-tint lg:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden shrink-0 sm:block lg:hidden">
            <BrandMark />
          </div>
          <GlobalSearch />
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <NotificationsMenu />
            <span className="mx-1 hidden h-7 w-px bg-line sm:block" aria-hidden="true" />
            <UserMenu />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  )
}
