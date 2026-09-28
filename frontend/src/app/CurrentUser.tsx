import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { setActingUserId } from '../api/actingUser'
import { errorMessage } from '../api/http'
import { getMe } from '../api/team'
import type { Me, Permission } from '../api/types'

type CurrentUser =
  | { status: 'loading' }
  | { status: 'error'; message: string; retry: () => void }
  | { status: 'ready'; me: Me; can: (permission: Permission) => boolean; switchTo: (userId: string | null) => void; refresh: () => Promise<void> }

const Context = createContext<CurrentUser | null>(null)

/**
 * Loads "who am I" once for the whole app. Every page asks this — never the
 * network — whether the current member may do something, and only to decide
 * what to *show*: the API refuses what a role may not do regardless.
 */
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    getMe().then(
      (loaded) => {
        if (cancelled) return
        setMe(loaded)
        setError(null)
      },
      (err: unknown) => {
        if (!cancelled) setError(errorMessage(err))
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  const refresh = useCallback(async () => {
    setMe(await getMe())
  }, [])

  const switchTo = useCallback((userId: string | null) => {
    setActingUserId(userId)
    // Everything on screen was loaded as the previous member; start clean.
    window.location.assign('/')
  }, [])

  const value = useMemo<CurrentUser>(() => {
    if (me) return { status: 'ready', me, can: (p) => me.permissions.includes(p), switchTo, refresh }
    if (error) return { status: 'error', message: error, retry: () => setAttempt((n) => n + 1) }
    return { status: 'loading' }
  }, [me, error, switchTo, refresh])

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useCurrentUserState(): CurrentUser {
  const value = useContext(Context)
  if (!value) throw new Error('useCurrentUser must be used inside <CurrentUserProvider>')
  return value
}

/** The signed-in member. Only call this below the shell, which renders children once the member has loaded. */
export function useCurrentUser() {
  const value = useCurrentUserState()
  if (value.status !== 'ready') throw new Error('useCurrentUser called before the current member loaded')
  return value
}
