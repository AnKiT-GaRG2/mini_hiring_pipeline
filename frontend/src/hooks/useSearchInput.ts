import { useCallback, useEffect, useRef, useState } from 'react'

/** Wait this long after the last keystroke before searching. */
export const SEARCH_DEBOUNCE_MS = 400

type Search = {
  runSearch: (query: string) => void
  clearSearch: () => void
}

/**
 * The natural-language search box. Typing searches after a short pause (so a
 * query isn't sent for every keystroke); Enter or the button searches
 * immediately; emptying the box returns to the filtered list without a request.
 */
export function useSearchInput({ runSearch, clearSearch }: Search, initial = '') {
  const [text, setText] = useState(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastSent = useRef('')

  useEffect(() => () => clearTimeout(timer.current), [])

  const send = useCallback(
    (query: string) => {
      lastSent.current = query
      runSearch(query)
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
      if (query === lastSent.current) return
      timer.current = setTimeout(() => send(query), SEARCH_DEBOUNCE_MS)
    },
    [reset, send],
  )

  const onSubmit = useCallback(
    (value: string) => {
      clearTimeout(timer.current)
      const query = value.trim()
      if (!query) return reset()
      send(query)
    },
    [reset, send],
  )

  const onClear = useCallback(() => {
    setText('')
    reset()
  }, [reset])

  return { text, onChange, onSubmit, onClear }
}
