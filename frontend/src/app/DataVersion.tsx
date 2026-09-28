import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type DataVersion = { version: number; bump: () => void }

const Context = createContext<DataVersion>({ version: 0, bump: () => {} })

/**
 * A counter that goes up whenever something changes on the server. Pages that
 * show data other screens can modify (a candidate moved from the drawer, an
 * interview scheduled from the calendar) include `version` in what they load,
 * so they refresh instead of drifting out of date.
 */
export function DataVersionProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])
  const value = useMemo(() => ({ version, bump }), [version, bump])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useDataVersion(): DataVersion {
  return useContext(Context)
}
