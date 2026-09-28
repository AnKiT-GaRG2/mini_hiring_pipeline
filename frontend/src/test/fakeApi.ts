import { vi } from 'vitest'
import type { Candidate, Job, Me } from '../api/types'

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const DAY = 24 * 60 * 60 * 1000

export function makeCandidate(name: string, overrides: Partial<Candidate> = {}): Candidate {
  const slug = name.toLowerCase().replace(/\s+/g, '.')
  const since = new Date(Date.now() - 3 * DAY).toISOString()
  return {
    id: slug,
    name,
    email: `${slug}@example.com`,
    phone: null,
    location: null,
    currentStage: 'APPLIED',
    source: 'OTHER',
    yearsOfExperience: 2,
    job: { id: 'job-1', title: 'Frontend Developer' },
    skills: [],
    tags: [],
    createdAt: since,
    updatedAt: since,
    currentStageSince: since,
    daysInCurrentStage: 3,
    ...overrides,
  }
}

export const FAKE_ME: Me = {
  id: 'me-1',
  name: 'Ankit Garg',
  email: 'ankit.garg@example.com',
  role: 'HIRING_MANAGER',
  status: 'ACTIVE',
  jobTitle: 'Hiring Manager',
  phone: null,
  location: null,
  joinedAt: new Date().toISOString(),
  permissions: ['team:manage', 'company:edit', 'jobs:manage'],
}

export const FAKE_JOB: Job = {
  id: 'job-1',
  title: 'Frontend Developer',
  department: 'Engineering',
  location: 'Bengaluru, India',
  workMode: 'REMOTE',
  employmentType: 'FULL_TIME',
  status: 'OPEN',
  openings: 1,
  description: null,
  createdAt: new Date().toISOString(),
  closedAt: null,
  createdBy: { id: 'me-1', name: 'Ankit Garg' },
  counts: { APPLIED: 1, SCREENING: 0, INTERVIEW: 0, OFFER: 0, HIRED: 0, REJECTED: 0 },
  total: 1,
  active: 1,
  hired: 0,
}

export type Rule = { test: (method: string, url: URL) => boolean; respond: (url: URL) => Response | Promise<Response> }

export type RecordedCall = { method: string; url: URL }

/**
 * Replaces global fetch with a small router: each test registers the routes it
 * cares about, and anything unmatched 404s loudly instead of hanging silently.
 */
export function installFakeApi() {
  const calls: RecordedCall[] = []
  const rules: Rule[] = []

  function on(test: Rule['test'], respond: Rule['respond']) {
    rules.push({ test, respond })
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const method = (init.method ?? 'GET').toUpperCase()
    const url = new URL(String(input), 'http://localhost')
    calls.push({ method, url })
    const rule = rules.find((r) => r.test(method, url))
    if (!rule) return json({ error: `No fake route for ${method} ${url.pathname}${url.search}` }, 404)
    return rule.respond(url)
  })
  vi.stubGlobal('fetch', fetchMock)

  return { on, calls, path: (p: string) => (_m: string, u: URL) => u.pathname === p }
}
