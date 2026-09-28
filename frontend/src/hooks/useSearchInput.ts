import { useCallback, useEffect, useRef, useState } from 'react'

/** Wait this long after the last keystroke before searching. */
export const SEARCH_DEBOUNCE_MS = 400

type Search = {
  runSearch: (query: string) => Promise<void>
  clearSearch: () => void
}

/**
 * The single global search box. Typing searches after a short pause (so a
 * query isn't sent for every keystroke, and half-typed phrases like "stuck in
 * Scr" don't flash misleading results); Enter or the button searches
 * immediately; emptying the box returns to the board without a request.
 * A query that was just sent is never sent twice.
 */
export function useSearchInput({ runSearch, clearSearch }: Search) {
  const [text, setText] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastSent = useRef('')

  useEffect(() => () => clearTimeout(timer.current), [])

  const send = useCallback(
    (query: string) => {
      lastSent.current = query
      void runSearch(query)
    },
    [runSearch],
  )

  const reset = useCallback(() => {
    clearTimeout(timer.current)
    lastSent.current = ''
    clearSearch()
  }, [clearSearch])

  const onChange = useCallback(
    (value: string) => {
      setText(value)
      clearTimeout(timer.current)
      const query = value.trim()
      if (!query) return reset()
      if (query === lastSent.current) return // already showing this
      timer.current = setTimeout(() => send(query), SEARCH_DEBOUNCE_MS)
    },
    [reset, send],
  )

  const onSubmit = useCallback(
    (value: string) => {
      clearTimeout(timer.current)
      const query = value.trim()
      if (!query) return reset()
      send(query) // explicit: sent even if it repeats the last query (e.g. to retry)
    },
    [reset, send],
  )

  const onClear = useCallback(() => {
    setText('')
    reset()
  }, [reset])

  return { text, onChange, onSubmit, onClear }
}
