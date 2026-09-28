import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { Candidate } from './api/types'
import { SEARCH_TIMEOUT_MS } from './api/candidates'
import { SLOW_SEARCH_MS } from './components/SlowSearchNotice'
import { SEARCH_DEBOUNCE_MS } from './hooks/useSearchInput'
import { installFakeApi, json, makeCandidate } from './test/fakeApi'
import { realSearchResponses as real } from './test/realSearchResponses'

let api: ReturnType<typeof installFakeApi>
afterEach(() => {
  vi.useRealTimers()
  api.restore()
})

async function renderApp(candidates: Candidate[] = [makeCandidate('Priya')]) {
  api = installFakeApi(candidates)
  render(<App />)
  await screen.findByRole('group', { name: 'Hiring pipeline' })
  return userEvent.setup()
}

const box = () => screen.getByRole('searchbox', { name: 'Search candidates' }) as HTMLInputElement
const results = () => screen.getByRole('region', { name: 'Search results' })
const cards = () => within(results()).getAllByRole('article').map((a) => a.getAttribute('aria-label'))
const searchCalls = () => api.callsTo('GET /api/search')

type RealQuery = keyof typeof real
/** Answer the next search with the response the real backend gave for `query`. */
const answerWithReal = (query: RealQuery) => api.override('GET /api/search', () => json(real[query]))

async function searchFor(user: Awaited<ReturnType<typeof renderApp>>, query: RealQuery) {
  answerWithReal(query)
  await user.type(box(), `${query}{Enter}`)
}

describe('the example queries from the brief (real backend responses)', () => {
  it('"Who’s in Interview right now?" — count and the stage filter', async () => {
    const user = await renderApp()
    await searchFor(user, "Who's in Interview right now?")

    expect(await screen.findByRole('heading', { name: '2 candidates found' })).toBeTruthy()
    const filters = screen.getByRole('list', { name: 'Search filters' })
    expect(within(filters).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Current stage = Interview'])
    expect(cards()).toEqual(['Sneha Reddy', 'Vikram Nair'])
  })

  it('"Who has been stuck in Screening for more than a week?" — stage and time-in-stage filters', async () => {
    const user = await renderApp()
    await searchFor(user, 'Who has been stuck in Screening for more than a week?')

    expect(await screen.findByRole('heading', { name: '1 candidate found' })).toBeTruthy()
    const filters = screen.getByRole('list', { name: 'Search filters' })
    expect(within(filters).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Current stage = Screening',
      'More than 7 days in current stage',
    ])
    expect(screen.getByText('Filters:')).toBeTruthy()
    expect(cards()).toEqual(['Rahul Mehta'])
  })

  it('"sharam" — finds Priya Sharma and says it was a fuzzy name match', async () => {
    const user = await renderApp()
    await searchFor(user, 'sharam')

    expect(await screen.findByRole('heading', { name: '1 candidate found' })).toBeTruthy()
    expect(cards()).toEqual(['Priya Sharma'])
    expect(within(results()).getByText('Fuzzy name match')).toBeTruthy()
  })

  it('"Find Priya Sharma" — says it was an exact name match', async () => {
    const user = await renderApp()
    await searchFor(user, 'Find Priya Sharma')

    await screen.findByRole('heading', { name: '1 candidate found' })
    expect(within(results()).getByText('Exact name match')).toBeTruthy()
  })

  it('"purple elephants" — explains instead of saying "no candidates found"', async () => {
    const user = await renderApp()
    await searchFor(user, 'purple elephants')

    expect(await screen.findByRole('heading', { name: 'I couldn’t understand that search.' })).toBeTruthy()
    expect(within(results()).getByText(/“purple elephants”/)).toBeTruthy()
    expect(screen.getByText('Try searching by:')).toBeTruthy()
    for (const topic of ['Candidate name', 'Current stage', 'Time in stage', 'Stage movement', 'Hiring outcome']) {
      expect(within(results()).getByText(topic)).toBeTruthy()
    }
    expect(screen.queryByText(/no candidates found/i)).toBeNull()
  })

  it('a query the parser rejects outright gets the same help', async () => {
    const user = await renderApp()
    await searchFor(user, 'who is the')

    expect(await screen.findByRole('heading', { name: 'I couldn’t understand that search.' })).toBeTruthy()
    expect(screen.getByText('Try searching by:')).toBeTruthy()
    expect(screen.queryByText(/I looked for a candidate named/)).toBeNull() // nothing was searched for
  })

  it('an unknown stage says exactly what was wrong', async () => {
    const user = await renderApp()
    await searchFor(user, 'moved to Bananas')

    await screen.findByRole('heading', { name: 'I couldn’t understand that search.' })
    expect(within(results()).getByText(/"Bananas"/)).toBeTruthy()
    expect(within(results()).getByText(/not a valid stage/)).toBeTruthy()
    expect(screen.getByText('Try searching by:')).toBeTruthy()
  })

  it('"reached Offer but didn’t get hired" — outcome filter', async () => {
    const user = await renderApp()
    await searchFor(user, "Who reached the Offer stage but didn't get hired?")

    expect(await screen.findByRole('heading', { name: '3 candidates found' })).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Search filters' })).getByText('Reached Offer but not hired')).toBeTruthy()
  })

  it('"everyone except rejected" — exclusion filter', async () => {
    const user = await renderApp()
    await searchFor(user, 'Everyone except rejected candidates')

    expect(await screen.findByRole('heading', { name: '9 candidates found' })).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Search filters' })).getByText('Excluding Rejected')).toBeTruthy()
    expect(cards()).not.toContain('Ritu Singh')
  })

  it('"moved to Interview since Monday" — understood, nobody matches: shows the filter, not the help', async () => {
    const user = await renderApp()
    await searchFor(user, 'Who moved to Interview since Monday?')

    expect(await screen.findByRole('heading', { name: 'No candidates found' })).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Search filters' })).getByText(/^Moved to Interview since /)).toBeTruthy()
    expect(screen.getByText('Try removing one of these conditions.')).toBeTruthy()
    expect(screen.queryByText('Try searching by:')).toBeNull()
  })

  it('a combined query with no match lists every condition it applied', async () => {
    const user = await renderApp()
    await searchFor(user, 'Priya in Screening for more than 7 days')

    await screen.findByRole('heading', { name: 'No candidates found' })
    expect(within(screen.getByRole('list', { name: 'Search filters' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Name similar to “Priya”',
      'Current stage = Screening',
      'More than 7 days in current stage',
    ])
  })
})

describe('ranked results and why they matched', () => {
  const ana = makeCandidate('Ana Rao', { currentStage: 'SCREENING' })
  const anna = makeCandidate('Anna Roy', { currentStage: 'INTERVIEW' })
  const anand = makeCandidate('Anand Iyer', { currentStage: 'OFFER' })

  const rankedResponse = () =>
    json({
      success: true,
      query: 'ana',
      parsedQuery: { name: { query: 'ana' } },
      results: [
        { ...ana, score: 1, matchType: 'prefix' },
        { ...anand, score: 0.8, matchType: 'prefix' },
        { ...anna, score: 0.5, matchType: 'fuzzy' },
      ],
    })

  it('lists results in the server’s relevance order, numbered, with each reason', async () => {
    const user = await renderApp([ana, anna, anand])
    api.override('GET /api/search', rankedResponse)
    await user.type(box(), 'ana{Enter}')

    await screen.findByRole('list', { name: 'Results, best match first' })
    expect(cards()).toEqual(['Ana Rao', 'Anand Iyer', 'Anna Roy']) // not re-sorted by stage
    const items = within(screen.getByRole('list', { name: 'Results, best match first' })).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items.map((li) => within(li).getByLabelText(/^Result \d+$/).textContent)).toEqual(['1', '2', '3'])
    expect(within(items[0]).getByText('Name starts with “ana”')).toBeTruthy()
    expect(within(items[2]).getByText('Fuzzy name match')).toBeTruthy()
  })

  it('explains a whole-word match', async () => {
    const user = await renderApp()
    api.override('GET /api/search', () =>
      json({
        success: true,
        query: 'sharma',
        parsedQuery: { name: { query: 'sharma' } },
        results: [{ ...makeCandidate('Priya Sharma'), score: 1, matchType: 'word' }],
      }),
    )
    await user.type(box(), 'sharma{Enter}')
    expect(await within(await screen.findByRole('region', { name: 'Search results' })).findByText('Name contains “sharma”')).toBeTruthy()
  })

  it('does not number results that have no relevance score', async () => {
    const user = await renderApp()
    await searchFor(user, "Who's in Interview right now?")

    await screen.findByRole('heading', { name: '2 candidates found' })
    expect(screen.getByRole('list', { name: 'Results' })).toBeTruthy()
    expect(within(results()).queryByLabelText(/^Result \d+$/)).toBeNull()
    expect(within(results()).queryByText(/name match/i)).toBeNull()
  })

  it('still lets you act on a result, and keeps it in the list', async () => {
    const user = await renderApp([makeCandidate('Priya')])
    await searchFor(user, 'sharam')
    await screen.findByRole('heading', { name: '1 candidate found' })
    const priya = within(results()).getByRole('article', { name: 'Priya Sharma' })

    await user.click(within(priya).getByRole('button', { name: 'Open' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })
})

describe('empty query', () => {
  it('does nothing when the box is blank and Enter is pressed', async () => {
    const user = await renderApp()
    await user.type(box(), '   {Enter}')

    expect(searchCalls()).toHaveLength(0)
    expect(screen.getByRole('group', { name: 'Hiring pipeline' })).toBeTruthy()
  })

  it('returns to the board, without a request, when the text is cleared', async () => {
    const user = await renderApp()
    await searchFor(user, 'sharam')
    await screen.findByRole('heading', { name: '1 candidate found' })
    expect(searchCalls()).toHaveLength(1)

    await user.clear(box())

    expect(screen.getByRole('group', { name: 'Hiring pipeline' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Search results' })).toBeNull()
    expect(searchCalls()).toHaveLength(1)
  })

  it('"Show all candidates" and the × both clear the text and return to the board', async () => {
    const user = await renderApp()
    await searchFor(user, 'sharam')
    await screen.findByRole('heading', { name: '1 candidate found' })

    await user.click(screen.getByRole('button', { name: 'Show all candidates' }))
    expect(box().value).toBe('')
    expect(screen.getByRole('group', { name: 'Hiring pipeline' })).toBeTruthy()

    await searchFor(user, 'sharam')
    await screen.findByRole('heading', { name: '1 candidate found' })
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(box().value).toBe('')
    expect(screen.getByRole('group', { name: 'Hiring pipeline' })).toBeTruthy()
  })
})

describe('debouncing', () => {
  async function renderWithFakeTimers() {
    await renderApp()
    // Only after the board has loaded: Testing Library's polling can't run on fake timers.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  }
  const type = (value: string) => fireEvent.change(box(), { target: { value } })
  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

  it('does not search on every keystroke — one request, after the user pauses', async () => {
    await renderWithFakeTimers()
    answerWithReal('sharam')

    type('s'); await advance(100)
    type('sh'); await advance(100)
    type('sha'); await advance(100)
    type('shar'); await advance(100)
    type('sharam')
    expect(searchCalls()).toHaveLength(0)

    await advance(SEARCH_DEBOUNCE_MS - 1)
    expect(searchCalls()).toHaveLength(0)
    await advance(1)
    expect(searchCalls()).toHaveLength(1)
    expect(searchCalls()[0].path).toBe('/api/search?q=sharam')
  })

  it('searches immediately on Enter, and the pending debounce does not send it a second time', async () => {
    await renderWithFakeTimers()
    answerWithReal('sharam')

    type('sharam')
    fireEvent.submit(box().closest('form')!)
    await advance(0)
    expect(searchCalls()).toHaveLength(1)

    await advance(SEARCH_DEBOUNCE_MS * 2)
    expect(searchCalls()).toHaveLength(1)
  })

  it('does not resend a query that is already showing', async () => {
    await renderWithFakeTimers()
    answerWithReal('sharam')
    type('sharam'); await advance(SEARCH_DEBOUNCE_MS)
    expect(searchCalls()).toHaveLength(1)

    type('sharam '); await advance(SEARCH_DEBOUNCE_MS * 2) // only whitespace changed
    type('sharamx'); type('sharam'); await advance(SEARCH_DEBOUNCE_MS * 2) // typed and reverted
    expect(searchCalls()).toHaveLength(1)
  })

  it('cancels a pending search when the box is emptied', async () => {
    await renderWithFakeTimers()
    type('sharam'); await advance(SEARCH_DEBOUNCE_MS - 50)
    type(''); await advance(SEARCH_DEBOUNCE_MS * 2)

    expect(searchCalls()).toHaveLength(0)
  })

  it('only the last query’s results are shown when the user keeps typing', async () => {
    await renderWithFakeTimers()
    api.override('GET /api/search', () => json({ success: true, query: 'a', parsedQuery: { name: { query: 'a' } }, results: [] }))
    type('a'); await advance(SEARCH_DEBOUNCE_MS)
    answerWithReal('sharam')
    type('sharam'); await advance(SEARCH_DEBOUNCE_MS)
    await advance(0)

    expect(searchCalls().map((c) => c.path)).toEqual(['/api/search?q=a', '/api/search?q=sharam'])
    expect(screen.getByRole('heading', { name: '1 candidate found' })).toBeTruthy()
    expect(cards()).toEqual(['Priya Sharma'])
  })
})

describe('loading and slow networks', () => {
  it('shows what is being searched for, and a busy Search button, while waiting', async () => {
    const user = await renderApp()
    const release = api.hold('GET /api/search')

    await user.type(box(), 'priya{Enter}')

    expect(await screen.findByText(/Searching for “priya”…/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Searching…' }) as HTMLButtonElement).disabled).toBe(true)
    expect(results().getAttribute('aria-busy')).toBe('true')

    release()
    expect(await screen.findByRole('heading', { name: '1 candidate found' })).toBeTruthy()
    expect(screen.queryByText(/Searching for/)).toBeNull()
  })

  it('keeps the previous results (dimmed) while a newer search is running', async () => {
    const user = await renderApp()
    await searchFor(user, "Who's in Interview right now?")
    await screen.findByRole('heading', { name: '2 candidates found' })

    api.hold('GET /api/search')
    await user.type(box(), ' today{Enter}') // extend the query rather than clear it (clearing leaves search)

    expect(await screen.findByText(/Searching for “Who's in Interview right now\? today”…/)).toBeTruthy()
    expect(cards()).toEqual(['Sneha Reddy', 'Vikram Nair'])
    expect(screen.getByRole('heading', { name: '2 candidates found' })).toBeTruthy()
  })

  it('tells the user when a search is taking unusually long', async () => {
    await renderApp()
    api.hold('GET /api/search')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })

    fireEvent.change(box(), { target: { value: 'sharam' } })
    fireEvent.submit(box().closest('form')!)
    await act(async () => { await vi.advanceTimersByTimeAsync(SLOW_SEARCH_MS - 600) })
    expect(screen.queryByText(/taking longer than usual/)).toBeNull()

    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(screen.getByText(/taking longer than usual/)).toBeTruthy()
  })

  it('gives up after the timeout, saying so, and lets the user retry', async () => {
    await renderApp()
    api.hold('GET /api/search')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })

    fireEvent.change(box(), { target: { value: 'sharam' } })
    fireEvent.submit(box().closest('form')!)
    await act(async () => { await vi.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS + 100) })

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Search isn’t working right now')
    expect(alert.textContent).toContain('took too long')
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText(/Searching for/)).toBeNull()
  })

  it('cancels the in-flight request when a newer search starts', async () => {
    const user = await renderApp()
    api.hold('GET /api/search') // the first search never answers
    await user.type(box(), 'first{Enter}')
    await screen.findByText(/Searching for “first”…/)

    answerWithReal('sharam')
    await user.clear(box())
    await user.type(box(), 'sharam{Enter}')

    expect(await screen.findByRole('heading', { name: '1 candidate found' })).toBeTruthy()
    expect(screen.queryByText(/first/)).toBeNull()
  })
})

describe('failures', () => {
  it('shows the server’s message when the backend fails, and retrying recovers', async () => {
    const user = await renderApp()
    api.override('GET /api/search', () => json({ error: 'Search is down' }, 500))
    await user.type(box(), 'sharam{Enter}')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Search isn’t working right now')
    expect(alert.textContent).toContain('Search is down')
    expect(screen.queryByText('Try searching by:')).toBeNull() // not a "you typed it wrong" situation

    answerWithReal('sharam')
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: '1 candidate found' })).toBeTruthy()
  })

  it('reports an unreachable server', async () => {
    const user = await renderApp()
    api.override('GET /api/search', () => Promise.reject(new TypeError('Failed to fetch')))
    await user.type(box(), 'sharam{Enter}')

    expect((await screen.findByRole('alert')).textContent).toContain("Can't reach the server")
  })

  it('treats a response without a parsed query as a failure rather than crashing', async () => {
    const user = await renderApp()
    api.override('GET /api/search', () => json({ success: true, query: 'x', results: [] }))
    await user.type(box(), 'sharam{Enter}')

    expect((await screen.findByRole('alert')).textContent).toContain('could not read')
    expect(screen.getByRole('button', { name: 'Show all candidates' })).toBeTruthy()
  })

  it('lets the user leave a failed search and get back to the board', async () => {
    const user = await renderApp()
    api.override('GET /api/search', () => json({ error: 'Search is down' }, 500))
    await user.type(box(), 'sharam{Enter}')
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: 'Show all candidates' }))
    expect(screen.getByRole('group', { name: 'Hiring pipeline' })).toBeTruthy()
    expect(box().value).toBe('')
  })

  it('search still works when the board itself failed to load', async () => {
    api = installFakeApi([])
    api.override('GET /api/candidates', () => json({ error: 'Database is down' }, 500))
    render(<App />)
    await screen.findByText('Database is down')
    answerWithReal('sharam')

    await userEvent.setup().type(box(), 'sharam{Enter}')
    expect(await screen.findByRole('heading', { name: '1 candidate found' })).toBeTruthy()
  })
})
