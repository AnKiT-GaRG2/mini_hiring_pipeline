import { useNow } from '../hooks/useNow'

/** How long a search may take before we tell the user it's slow. */
export const SLOW_SEARCH_MS = 3000

/** Mounted only while a search is in flight; appears once it has been running suspiciously long. */
export function SlowSearchNotice({ startedAt }: { startedAt: number }) {
  const now = useNow(500)
  if (now - startedAt < SLOW_SEARCH_MS) return null
  return (
    <p role="status" className="text-sm text-amber-700">
      Still searching — this is taking longer than usual. Your connection may be slow.
    </p>
  )
}
