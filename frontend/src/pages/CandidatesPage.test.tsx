import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CandidatePage, SearchResponse } from '../api/types'
import { DataVersionProvider } from '../app/DataVersion'
import { RouterProvider } from '../app/router'
import { ToastProvider } from '../components/ui/ToastProvider'
import { FAKE_JOB, installFakeApi, makeCandidate } from '../test/fakeApi'
import CandidatesPage from './CandidatesPage'

function renderPage() {
  return render(
    <ToastProvider>
      <RouterProvider>
        <DataVersionProvider>
          <CandidatesPage />
        </DataVersionProvider>
      </RouterProvider>
    </ToastProvider>,
  )
}

beforeEach(() => {
  window.history.replaceState({}, '', '/candidates')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CandidatesPage', () => {
  it('loads and shows the filtered, paginated list on first render', async () => {
    const api = installFakeApi()
    const page: CandidatePage = { items: [makeCandidate('Priya Sharma'), makeCandidate('Rahul Mehta')], total: 2, page: 1, pageSize: 12 }
    api.on(api.path('/api/jobs'), () => api.calls && new Response(JSON.stringify([FAKE_JOB]), { status: 200 }))
    api.on(api.path('/api/tags'), () => new Response(JSON.stringify([]), { status: 200 }))
    api.on(api.path('/api/candidates'), () => new Response(JSON.stringify(page), { status: 200 }))

    renderPage()

    await screen.findByText('Priya Sharma')
    expect(screen.getByText('Rahul Mehta')).toBeTruthy()
    expect(screen.getByText(/showing 1–2 of 2 candidates/i)).toBeTruthy()

    const listCall = api.calls.find((c) => c.method === 'GET' && c.url.pathname === '/api/candidates')!
    expect(listCall.url.searchParams.get('page')).toBe('1')
    expect(listCall.url.searchParams.get('pageSize')).toBe('12')
  })

  it('runs a natural-language search and shows the filters the server understood', async () => {
    const user = userEvent.setup()
    const api = installFakeApi()
    api.on(api.path('/api/jobs'), () => new Response(JSON.stringify([FAKE_JOB]), { status: 200 }))
    api.on(api.path('/api/tags'), () => new Response(JSON.stringify([]), { status: 200 }))
    api.on(api.path('/api/candidates'), () => new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 12 }), { status: 200 }))
    api.on(api.path('/api/search'), (url) => {
      const q = url.searchParams.get('q')
      const res: SearchResponse = {
        success: true,
        query: q ?? '',
        parsedQuery: { currentStage: 'SCREENING' },
        results: [{ ...makeCandidate('Ananya Iyer', { currentStage: 'SCREENING' }), score: null, matchType: null }],
      }
      return new Response(JSON.stringify(res), { status: 200 })
    })

    renderPage()
    await screen.findByPlaceholderText(/ask anything/i)

    await user.type(screen.getByPlaceholderText(/ask anything/i), 'who is in screening')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    await screen.findByText('Ananya Iyer')
    expect(screen.getByText('1 candidate found')).toBeTruthy()
    expect(screen.getByText('Current stage = Screening')).toBeTruthy()

    // "Show all candidates" clears the search and goes back to the browse list.
    await user.click(screen.getByRole('button', { name: /show all candidates/i }))
    await waitFor(() => expect(screen.queryByText('Ananya Iyer')).toBeNull())
  })

  it('shows the search-help panel when the query cannot be understood', async () => {
    const user = userEvent.setup()
    const api = installFakeApi()
    api.on(api.path('/api/jobs'), () => new Response(JSON.stringify([FAKE_JOB]), { status: 200 }))
    api.on(api.path('/api/tags'), () => new Response(JSON.stringify([]), { status: 200 }))
    api.on(api.path('/api/candidates'), () => new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 12 }), { status: 200 }))
    api.on(api.path('/api/search'), () => {
      const res: SearchResponse = { success: false, query: 'purple elephants', message: "I couldn't understand this search.", supportedFilters: [], results: [] }
      return new Response(JSON.stringify(res), { status: 200 })
    })

    renderPage()
    await user.type(await screen.findByPlaceholderText(/ask anything/i), 'purple elephants')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    await screen.findByText(/i couldn.t understand that search/i)
    expect(screen.getByText(/candidate name/i)).toBeTruthy()
  })

  it('moves a candidate forward and reflects the refreshed list', async () => {
    const user = userEvent.setup()
    const api = installFakeApi()
    let stage: 'APPLIED' | 'SCREENING' = 'APPLIED'
    api.on(api.path('/api/jobs'), () => new Response(JSON.stringify([FAKE_JOB]), { status: 200 }))
    api.on(api.path('/api/tags'), () => new Response(JSON.stringify([]), { status: 200 }))
    api.on(
      api.path('/api/candidates'),
      () => new Response(JSON.stringify({ items: [makeCandidate('Priya Sharma', { currentStage: stage })], total: 1, page: 1, pageSize: 12 }), { status: 200 }),
    )
    api.on(
      (m, u) => m === 'POST' && u.pathname === '/api/candidates/priya.sharma/transition',
      () => {
        stage = 'SCREENING'
        return new Response(JSON.stringify(makeCandidate('Priya Sharma', { currentStage: stage })), { status: 200 })
      },
    )

    renderPage()
    const card = await screen.findByRole('article', { name: 'Priya Sharma' })
    await user.click(within(card).getByRole('button', { name: /move forward/i }))

    await waitFor(() => expect(within(screen.getByRole('article', { name: 'Priya Sharma' })).getByText('Screening')).toBeTruthy())
  })
})
