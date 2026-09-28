import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createCandidate,
  listCandidates,
  rejectCandidate,
  searchCandidates,
  transitionCandidate,
} from '../api/candidates'
import { errorMessage, isStaleStateError } from '../api/http'
import type { Candidate, CreateCandidateInput, MatchType, ParsedQuery, SearchResult } from '../api/types'
import { canReject, nextStage } from '../domain/stages'

export type LoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string }

export type PendingKind = 'moving' | 'rejecting'

export type MatchInfo = { score: number | null; matchType: MatchType | null }

export type SearchOutcome =
  | {
      kind: 'results'
      query: string
      /** The filters the backend understood, for showing "why these results". */
      parsed: ParsedQuery
      /** Candidate ids in the server's relevance order. */
      ids: string[]
      matches: Record<string, MatchInfo>
    }
  | { kind: 'unparsed'; query: string; message: string; supportedFilters: string[] }
  | { kind: 'error'; query: string; message: string }

function upsertResults(list: Candidate[], results: SearchResult[]): Candidate[] {
  const incoming = new Map(
    results.map(({ score: _score, ...candidate }): [string, Candidate] => [candidate.id, candidate]),
  )
  const merged = list.map((c) => incoming.get(c.id) ?? c)
  const known = new Set(list.map((c) => c.id))
  return [...merged, ...[...incoming.values()].filter((c) => !known.has(c.id))]
}

/**
 * All pipeline state in one place: the candidate list, per-card pending
 * state, and search. The server is the source of truth — mutations replace a
 * candidate with the server's response, and a 409/404 triggers a silent
 * refetch so a stale board corrects itself instead of drifting.
 *
 * Mutating actions resolve with the updated candidate and *throw* on failure;
 * showing success/error messages is the caller's job, keeping this hook free
 * of UI concerns.
 */
export function usePipeline() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [pending, setPending] = useState<Record<string, PendingKind>>({})
  const inFlight = useRef(new Set<string>())

  const [outcome, setOutcome] = useState<SearchOutcome | null>(null)
  /** The search currently in flight, if any — its start time lets the UI react to a slow one. */
  const [pendingSearch, setPendingSearch] = useState<{ query: string; startedAt: number } | null>(null)
  const searchSeq = useRef(0)
  const searchAbort = useRef<AbortController | null>(null)

  const reload = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoadState({ status: 'loading' })
    try {
      setCandidates(await listCandidates())
      setLoadState({ status: 'ready' })
    } catch (err) {
      // A failed background resync keeps what's on screen rather than
      // replacing a usable board with an error page.
      if (!silent) setLoadState({ status: 'error', message: errorMessage(err) })
    }
  }, [])

  // Initial load. State already starts as 'loading', and the result is dropped
  // if the component goes away first (unmount, or StrictMode's remount).
  useEffect(() => {
    let cancelled = false
    listCandidates().then(
      (list) => {
        if (cancelled) return
        setCandidates(list)
        setLoadState({ status: 'ready' })
      },
      (err: unknown) => {
        if (!cancelled) setLoadState({ status: 'error', message: errorMessage(err) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  const mutate = useCallback(
    async (id: string, kind: PendingKind, action: () => Promise<Candidate>) => {
      if (inFlight.current.has(id)) return null
      inFlight.current.add(id)
      setPending((p) => ({ ...p, [id]: kind }))
      try {
        const updated = await action()
        setCandidates((list) => list.map((c) => (c.id === updated.id ? updated : c)))
        return updated
      } catch (err) {
        if (isStaleStateError(err)) void reload({ silent: true })
        throw err
      } finally {
        inFlight.current.delete(id)
        setPending((p) => {
          const next = { ...p }
          delete next[id]
          return next
        })
      }
    },
    [reload],
  )

  const moveToNext = useCallback(
    (candidate: Candidate) => {
      const to = nextStage(candidate.currentStage)
      if (!to) return Promise.resolve(null) // never send a move the rules can't allow
      return mutate(candidate.id, 'moving', () => transitionCandidate(candidate.id, to))
    },
    [mutate],
  )

  const reject = useCallback(
    (candidate: Candidate) => {
      if (!canReject(candidate.currentStage)) return Promise.resolve(null)
      return mutate(candidate.id, 'rejecting', () => rejectCandidate(candidate.id))
    },
    [mutate],
  )

  const addCandidate = useCallback(async (input: CreateCandidateInput) => {
    const created = await createCandidate(input)
    setCandidates((list) => [...list, created])
    return created
  }, [])

  const cancelInFlightSearch = useCallback(() => {
    searchSeq.current += 1 // any response still on its way is now stale
    searchAbort.current?.abort()
    searchAbort.current = null
  }, [])

  const clearSearch = useCallback(() => {
    cancelInFlightSearch()
    setPendingSearch(null)
    setOutcome(null)
  }, [cancelInFlightSearch])

  const runSearch = useCallback(
    async (raw: string) => {
      const query = raw.trim()
      if (!query) {
        clearSearch()
        return
      }

      cancelInFlightSearch()
      const seq = searchSeq.current
      const controller = new AbortController()
      searchAbort.current = controller
      setPendingSearch({ query, startedAt: Date.now() })
      try {
        const res = await searchCandidates(query, controller.signal)
        if (seq !== searchSeq.current) return
        if (res.success && !res.parsedQuery) throw new Error('The server sent a response the app could not read.')
        if (res.success) {
          setCandidates((list) => upsertResults(list, res.results))
          setOutcome({
            kind: 'results',
            query,
            parsed: res.parsedQuery,
            ids: res.results.map((r) => r.id),
            matches: Object.fromEntries(res.results.map((r) => [r.id, { score: r.score, matchType: r.matchType }])),
          })
        } else {
          setOutcome({ kind: 'unparsed', query, message: res.message, supportedFilters: res.supportedFilters })
        }
      } catch (err) {
        if (seq !== searchSeq.current) return // superseded or cleared: not worth reporting
        setOutcome({ kind: 'error', query, message: errorMessage(err) })
      } finally {
        if (seq === searchSeq.current) setPendingSearch(null)
      }
    },
    [clearSearch, cancelInFlightSearch],
  )

  // With a search active the board shows only the matches, in ranked order.
  const visible = useMemo(() => {
    if (!outcome) return candidates
    if (outcome.kind !== 'results') return []
    const byId = new Map(candidates.map((c) => [c.id, c]))
    return outcome.ids.flatMap((id) => byId.get(id) ?? [])
  }, [candidates, outcome])

  return {
    candidates,
    visible,
    loadState,
    reload,
    pending,
    moveToNext,
    reject,
    addCandidate,
    outcome,
    searching: pendingSearch !== null,
    pendingSearch,
    runSearch,
    clearSearch,
  }
}
