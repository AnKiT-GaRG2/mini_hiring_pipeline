import { vi } from 'vitest'
import type { Candidate, Stage, StageHistoryEntry } from '../api/types'

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const DAY = 24 * 60 * 60 * 1000

export function makeCandidate(name: string, overrides: Partial<Candidate> = {}): Candidate {
  const slug = name.toLowerCase().split(' ')[0]
  const since = new Date(Date.now() - 3 * DAY).toISOString()
  return {
    id: slug,
    name,
    email: `${slug}@example.com`,
    phone: null,
    currentStage: 'APPLIED',
    createdAt: since,
    updatedAt: since,
    currentStageSince: since,
    daysInCurrentStage: 3,
    ...overrides,
  }
}

export type RecordedCall = { method: string; path: string; body: unknown }

type RequestContext = { method: string; url: URL; body: Record<string, unknown> | undefined }
type Rule = { key: string; once: boolean; respond: (ctx: RequestContext) => Response | Promise<Response> }

/**
 * Replaces global fetch with an in-memory stand-in for the backend. Happy
 * paths behave like the real API; anything else (a 409, a 500, a slow
 * response) is scripted per test via `override` / `hold`.
 */
export function installFakeApi(initial: Candidate[]) {
  let candidates = [...initial]
  const histories: Record<string, StageHistoryEntry[]> = {}
  const calls: RecordedCall[] = []
  const rules: Rule[] = []

  function defaultResponse(method: string, url: URL, body: Record<string, unknown> | undefined): Response {
    const { pathname } = url

    if (method === 'GET' && pathname === '/api/candidates') return json(candidates)

    if (method === 'POST' && pathname === '/api/candidates') {
      const email = String(body?.email)
      if (candidates.some((c) => c.email === email)) {
        return json({ error: `A candidate with email ${email} already exists` }, 409)
      }
      const now = new Date().toISOString()
      const created = makeCandidate(String(body?.name), {
        id: `new-${candidates.length}`,
        email,
        phone: (body?.phone as string | undefined) ?? null,
        createdAt: now,
        updatedAt: now,
        currentStageSince: now,
        daysInCurrentStage: 0,
      })
      candidates = [...candidates, created]
      return json(created, 201)
    }

    const action = /^\/api\/candidates\/([^/]+)\/(transition|reject)$/.exec(pathname)
    if (method === 'POST' && action) {
      const target = candidates.find((c) => c.id === decodeURIComponent(action[1]))
      if (!target) return json({ error: 'Candidate not found' }, 404)
      const to = (action[2] === 'reject' ? 'REJECTED' : body?.toStage) as Stage
      const now = new Date().toISOString()
      const trail = histories[target.id] ?? []
      histories[target.id] = [...trail, { id: `h-${target.id}-${trail.length}`, fromStage: target.currentStage, toStage: to, changedAt: now }]
      const updated = { ...target, currentStage: to, updatedAt: now, currentStageSince: now, daysInCurrentStage: 0 }
      candidates = candidates.map((c) => (c.id === updated.id ? updated : c))
      return json(updated)
    }

    const read = /^\/api\/candidates\/([^/]+)(\/history)?$/.exec(pathname)
    if (method === 'GET' && read) {
      const id = decodeURIComponent(read[1])
      const found = candidates.find((c) => c.id === id)
      if (!found) return json({ error: `Candidate ${id} not found` }, 404)
      return json(read[2] ? (histories[id] ?? []) : found)
    }

    if (method === 'GET' && pathname === '/api/search') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase()
      const results = candidates
        .filter((c) => c.name.toLowerCase().includes(q))
        .map((c) => ({ ...c, score: 1, matchType: 'word' }))
      return json({ success: true, query: url.searchParams.get('q'), parsedQuery: { name: { query: q } }, results })
    }

    return json({ error: 'Not found' }, 404)
  }

  const respondTo = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), 'http://localhost')
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined
    calls.push({ method, path: url.pathname + url.search, body })

    const key = `${method} ${url.pathname}`
    const index = rules.findIndex((r) => r.key === key)
    if (index !== -1) {
      const rule = rules[index]
      if (rule.once) rules.splice(index, 1)
      return rule.respond({ method, url, body })
    }
    return defaultResponse(method, url, body)
  }

  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const signal = init?.signal
    if (!signal) return respondTo(input, init)

    // Like a real fetch: reject with an AbortError as soon as the signal fires.
    return new Promise<Response>((resolve, reject) => {
      const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'))
      if (signal.aborted) return abort()
      signal.addEventListener('abort', abort, { once: true })
      respondTo(input, init).then(resolve, reject)
    })
  })

  return {
    calls,
    /** Requests matching "METHOD /path" so far. */
    callsTo: (key: string) => calls.filter((c) => `${c.method} ${c.path.split('?')[0]}` === key),
    /** Server-side truth, for scenarios where the UI is stale. */
    setCandidates(next: Candidate[]) {
      candidates = next
    },
    /** Server-side audit trail for a candidate (oldest first, as the real API returns it). */
    setHistory(id: string, entries: StageHistoryEntry[]) {
      histories[id] = entries
    },
    /** Answer the next request to "METHOD /path" with `respond` instead. */
    override(key: string, respond: (ctx: RequestContext) => Response | Promise<Response>) {
      rules.push({ key, once: true, respond })
    },
    /** Delay the next request to "METHOD /path" until the returned function is called. */
    hold(key: string) {
      let release!: () => void
      const gate = new Promise<void>((resolve) => (release = resolve))
      rules.push({
        key,
        once: true,
        respond: async ({ method, url, body }) => {
          await gate
          return defaultResponse(method, url, body)
        },
      })
      return release
    },
    restore: () => spy.mockRestore(),
  }
}
