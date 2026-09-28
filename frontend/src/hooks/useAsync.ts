import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '../api/http'

export type AsyncState<T> = {
  data: T | undefined
  error: string | null
  /** True while a request is in flight — including refreshes, when `data` still holds the previous result. */
  loading: boolean
  reload: () => void
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}

/**
 * Runs `load` whenever `deps` change and tracks its result. A response that
 * arrives after the inputs have changed (or the component has gone) is
 * dropped, and the previous data stays on screen while a refresh is running so
 * lists don't flash empty on every filter change.
 */
export function useAsync<T>(load: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    loadRef.current(controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return
        setData(result)
        setError(null)
        setLoading(false)
      },
      (err: unknown) => {
        if (controller.signal.aborted || isAbort(err)) return
        setError(errorMessage(err))
        setLoading(false)
      },
    )
    return () => controller.abort()
    // `deps` is the caller's dependency list, so the linter cannot check it
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data, error, loading, reload }
}
