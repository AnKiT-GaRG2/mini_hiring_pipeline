import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'

/**
 * A deliberately small router: six flat pages and a few query parameters don't
 * justify a dependency. Paths and query strings are real (deep links and the
 * back button work); everything else is plain React state.
 */

type Location = { pathname: string; search: string }

type RouterValue = {
  location: Location
  navigate: (to: string, options?: { replace?: boolean }) => void
}

const RouterContext = createContext<RouterValue | null>(null)

function readLocation(): Location {
  return { pathname: window.location.pathname, search: window.location.search }
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<Location>(readLocation)

  useEffect(() => {
    const onPop = () => setLocation(readLocation())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((to: string, options: { replace?: boolean } = {}) => {
    const target = new URL(to, window.location.origin)
    const next = { pathname: target.pathname, search: target.search }
    const same = next.pathname === window.location.pathname && next.search === window.location.search
    if (!same) {
      if (options.replace) window.history.replaceState({}, '', target.pathname + target.search)
      else window.history.pushState({}, '', target.pathname + target.search)
    }
    setLocation(next)
  }, [])

  const value = useMemo(() => ({ location, navigate }), [location, navigate])
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

function useRouter(): RouterValue {
  const value = useContext(RouterContext)
  if (!value) throw new Error('Router hooks must be used inside <RouterProvider>')
  return value
}

export function useLocation(): Location {
  return useRouter().location
}

export function useNavigate() {
  return useRouter().navigate
}

/** Reads the query string, and merges changes into it. `undefined`/'' removes a parameter. */
export function useSearchParams() {
  const { location, navigate } = useRouter()
  const params = useMemo(() => new URLSearchParams(location.search), [location.search])

  const setParams = useCallback(
    (changes: Record<string, string | undefined>, options: { replace?: boolean } = {}) => {
      const next = new URLSearchParams(window.location.search)
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined || value === '') next.delete(key)
        else next.set(key, value)
      }
      const text = next.toString()
      navigate(window.location.pathname + (text ? `?${text}` : ''), options)
    },
    [navigate],
  )

  return [params, setParams] as const
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string }

/** A normal anchor (so middle-click and "open in new tab" work) that navigates without a page load. */
export function Link({ to, onClick, children, ...rest }: LinkProps) {
  const navigate = useNavigate()

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (rest.target && rest.target !== '_self') return
    e.preventDefault()
    navigate(to)
  }

  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  )
}
