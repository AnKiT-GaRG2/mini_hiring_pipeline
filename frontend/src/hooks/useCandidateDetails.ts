import { useCallback, useEffect, useState } from 'react'
import { getCandidate, getCandidateHistory } from '../api/candidates'
import { errorMessage } from '../api/http'
import type { Candidate, StageHistoryEntry } from '../api/types'
import { isSnapshotConsistent } from '../domain/history'

export type DetailsState =
  | { status: 'loading' }
  | { status: 'ready'; candidate: Candidate; history: StageHistoryEntry[] }
  | { status: 'error'; message: string }

const MAX_ATTEMPTS = 3

/**
 * Always fetched from the server by id — never assembled from the board's copy
 * of the candidate, which may be stale. The two requests aren't atomic, so if a
 * transition lands between them (stage disagrees with the latest history row)
 * we fetch again rather than show a contradictory snapshot.
 */
export async function loadCandidateDetails(id: string) {
  for (let attempt = 1; ; attempt++) {
    const [candidate, history] = await Promise.all([getCandidate(id), getCandidateHistory(id)])
    if (attempt >= MAX_ATTEMPTS || isSnapshotConsistent(candidate, history)) return { candidate, history }
  }
}

export function useCandidateDetails(id: string) {
  const [state, setState] = useState<DetailsState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadCandidateDetails(id).then(
      (details) => {
        if (!cancelled) setState({ status: 'ready', ...details })
      },
      (err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: errorMessage(err) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  return { state, retry }
}
