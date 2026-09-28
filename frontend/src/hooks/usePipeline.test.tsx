import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installFakeApi, json, makeCandidate } from '../test/fakeApi'
import { usePipeline } from './usePipeline'

let api: ReturnType<typeof installFakeApi>
afterEach(() => api.restore())

/** Runs `fn` inside act and returns whatever it rejected with (letting a rejection escape act breaks later flushes). */
async function actAndCatch(fn: () => Promise<unknown>): Promise<unknown> {
  let caught: unknown = null
  await act(async () => {
    await fn().catch((err: unknown) => {
      caught = err
    })
  })
  return caught
}

async function setup(...candidates: ReturnType<typeof makeCandidate>[]) {
  api = installFakeApi(candidates)
  const hook = renderHook(() => usePipeline())
  await waitFor(() => expect(hook.result.current.loadState.status).toBe('ready'))
  return hook
}

describe('usePipeline: it never sends a move the rules cannot allow', () => {
  it('does not call the API to advance a Hired candidate', async () => {
    const hired = makeCandidate('Karan', { currentStage: 'HIRED' })
    const { result } = await setup(hired)

    await expect(result.current.moveToNext(hired)).resolves.toBeNull()
    expect(api.callsTo('POST /api/candidates/karan/transition')).toHaveLength(0)
  })

  it('does not call the API to reject a Hired or already-Rejected candidate', async () => {
    const hired = makeCandidate('Karan', { currentStage: 'HIRED' })
    const rejected = makeCandidate('Ritu', { currentStage: 'REJECTED' })
    const { result } = await setup(hired, rejected)

    await expect(result.current.reject(hired)).resolves.toBeNull()
    await expect(result.current.reject(rejected)).resolves.toBeNull()
    expect(api.calls.filter((c) => c.path.endsWith('/reject'))).toHaveLength(0)
  })

  it('always asks for exactly the next stage', async () => {
    const priya = makeCandidate('Priya')
    const { result } = await setup(priya)

    await act(() => result.current.moveToNext(priya))
    expect(api.callsTo('POST /api/candidates/priya/transition')[0].body).toEqual({ toStage: 'SCREENING' })
  })
})

describe('usePipeline: mutations', () => {
  it('ignores a second move for a candidate whose first is still in flight', async () => {
    const priya = makeCandidate('Priya')
    const { result } = await setup(priya)
    const release = api.hold('POST /api/candidates/priya/transition')

    let first!: Promise<unknown>
    let second!: Promise<unknown>
    act(() => {
      first = result.current.moveToNext(priya)
      second = result.current.moveToNext(priya)
    })

    await expect(second).resolves.toBeNull()
    expect(result.current.pending).toEqual({ priya: 'moving' })

    release()
    await act(() => first)
    expect(api.callsTo('POST /api/candidates/priya/transition')).toHaveLength(1)
    expect(result.current.pending).toEqual({})
  })

  it('replaces the candidate with the server response', async () => {
    const priya = makeCandidate('Priya')
    const { result } = await setup(priya)

    await act(() => result.current.moveToNext(priya))
    expect(result.current.candidates[0].currentStage).toBe('SCREENING')
  })

  it('clears pending state and rethrows when the server refuses', async () => {
    const priya = makeCandidate('Priya')
    const { result } = await setup(priya)
    api.override('POST /api/candidates/priya/transition', () => json({ error: 'nope' }, 500))

    const error = await actAndCatch(() => result.current.moveToNext(priya))
    expect(error).toMatchObject({ message: 'nope' })
    expect(result.current.pending).toEqual({})
    expect(result.current.candidates[0].currentStage).toBe('APPLIED')
  })

  it('refetches after a 409 so a stale board corrects itself', async () => {
    const priya = makeCandidate('Priya')
    const { result } = await setup(priya)
    api.setCandidates([{ ...priya, currentStage: 'SCREENING' }]) // someone else moved her
    api.override('POST /api/candidates/priya/transition', () => json({ error: 'already in SCREENING' }, 409))

    const error = await actAndCatch(() => result.current.moveToNext(priya))
    expect(error).toMatchObject({ status: 409 })
    await waitFor(() => expect(result.current.candidates[0].currentStage).toBe('SCREENING'))
    expect(api.callsTo('GET /api/candidates')).toHaveLength(2)
  })

  it('does not refetch after an unrelated failure', async () => {
    const priya = makeCandidate('Priya')
    const { result } = await setup(priya)
    api.override('POST /api/candidates/priya/transition', () => json({ error: 'boom' }, 500))

    const error = await actAndCatch(() => result.current.moveToNext(priya))
    expect(error).toBeInstanceOf(Error)
    expect(api.callsTo('GET /api/candidates')).toHaveLength(1)
  })
})

describe('usePipeline: search', () => {
  it('shows only matches, in the order the server ranked them', async () => {
    const a = makeCandidate('Amit')
    const b = makeCandidate('Bela')
    const c = makeCandidate('Chen')
    const { result } = await setup(a, b, c)
    api.override('GET /api/search', () =>
      json({ success: true, query: 'q', parsedQuery: { name: { query: 'q' } }, results: [{ ...c, score: 1, matchType: 'prefix' }, { ...a, score: 0.5, matchType: 'fuzzy' }] }),
    )

    await act(() => result.current.runSearch('q'))
    expect(result.current.visible.map((x) => x.name)).toEqual(['Chen', 'Amit'])

    act(() => result.current.clearSearch())
    expect(result.current.visible.map((x) => x.name)).toEqual(['Amit', 'Bela', 'Chen'])
  })

  it('ignores a stale response when a newer search has started', async () => {
    const a = makeCandidate('Amit')
    const b = makeCandidate('Bela')
    const { result } = await setup(a, b)
    const releaseFirst = api.hold('GET /api/search')
    api.override('GET /api/search', () => json({ success: true, query: 'second', parsedQuery: { name: { query: 'second' } }, results: [{ ...b, score: 1, matchType: 'exact' }] }))

    // The held rule is consulted first, so it serves the first request; the override the second.
    let first!: Promise<void>
    act(() => {
      first = result.current.runSearch('first')
    })
    await act(() => result.current.runSearch('second'))
    releaseFirst()
    await act(() => first)

    expect(result.current.outcome).toMatchObject({ kind: 'results', query: 'second' })
    expect(result.current.visible.map((x) => x.name)).toEqual(['Bela'])
  })

  it('discards a stale response even when the transport ignores cancellation', async () => {
    // Cancelling normally stops an old response arriving; this simulates one that was
    // already in flight and can't be stopped, so only the sequence guard protects us.
    api = installFakeApi([])
    const answer: Record<string, (r: Response) => void> = {}
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input)
      if (url === '/api/candidates') return Promise.resolve(json([]))
      return new Promise<Response>((resolve) => {
        answer[decodeURIComponent(url.split('q=')[1])] = resolve
      })
    })
    const { result } = renderHook(() => usePipeline())
    await waitFor(() => expect(result.current.loadState.status).toBe('ready'))
    const payload = (q: string) => json({ success: true, query: q, parsedQuery: { name: { query: q } }, results: [] })

    let first!: Promise<void>
    let second!: Promise<void>
    act(() => {
      first = result.current.runSearch('first')
    })
    act(() => {
      second = result.current.runSearch('second')
    })
    answer.second(payload('second'))
    await act(() => second)
    answer.first(payload('first')) // the old answer finally shows up
    await act(() => first)

    expect(result.current.outcome).toMatchObject({ kind: 'results', query: 'second' })
    expect(result.current.searching).toBe(false)
  })

  it('treats a blank query as clearing the search', async () => {
    const { result } = await setup(makeCandidate('Amit'))
    await act(() => result.current.runSearch('   '))
    expect(result.current.outcome).toBeNull()
    expect(api.callsTo('GET /api/search')).toHaveLength(0)
  })
})
