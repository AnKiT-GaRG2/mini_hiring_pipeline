import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StageHistoryEntry } from '../api/types'
import { formatEventDate } from '../domain/history'
import { installFakeApi, json, makeCandidate } from '../test/fakeApi'
import { CandidateDetailsDrawer } from './CandidateDetailsDrawer'

// 3 days 7 hours after the Interview move below.
const NOW = Date.parse('2026-10-01T16:00:00.000Z')

const CREATED = '2026-09-20T10:00:00.000Z'
const toScreening: StageHistoryEntry = { id: 'h1', fromStage: 'APPLIED', toStage: 'SCREENING', changedAt: '2026-09-22T10:00:00.000Z' }
const toInterview: StageHistoryEntry = { id: 'h2', fromStage: 'SCREENING', toStage: 'INTERVIEW', changedAt: '2026-09-28T09:00:00.000Z' }

const priya = (overrides = {}) =>
  makeCandidate('Priya Sharma', {
    id: 'priya',
    currentStage: 'INTERVIEW',
    createdAt: CREATED,
    phone: '+91-98765-43210',
    ...overrides,
  })

let api: ReturnType<typeof installFakeApi>
afterEach(() => api.restore())

async function openDrawer(options: { history?: StageHistoryEntry[]; candidate?: ReturnType<typeof priya>; now?: number } = {}) {
  const candidate = options.candidate ?? priya()
  api = installFakeApi([candidate])
  api.setHistory('priya', options.history ?? [toScreening, toInterview])
  const onClose = vi.fn()
  const view = render(<CandidateDetailsDrawer candidateId="priya" now={options.now ?? NOW} onClose={onClose} />)
  await screen.findByRole('list', { name: 'Stage history' })
  return { onClose, ...view }
}

const timelineItems = () => within(screen.getByRole('list', { name: 'Stage history' })).getAllByRole('listitem')

describe('candidate information', () => {
  it('shows a loading state, then the candidate’s details', async () => {
    api = installFakeApi([priya()])
    api.setHistory('priya', [toScreening, toInterview])
    render(<CandidateDetailsDrawer candidateId="priya" now={NOW} onClose={() => {}} />)

    expect(screen.getByRole('status').textContent).toContain('Loading candidate')
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('list', { name: 'Stage history' })

    expect(within(dialog).getByRole('heading', { name: 'Priya Sharma', level: 2 })).toBeTruthy()
    expect(within(dialog).getByRole('link', { name: 'priya@example.com' }).getAttribute('href')).toBe('mailto:priya@example.com')
    expect(within(dialog).getByText('+91-98765-43210')).toBeTruthy()
    expect(within(dialog).getByText('Interview', { selector: 'dd *' })).toBeTruthy() // current stage badge
    expect(within(dialog).getByText(formatEventDate(CREATED, NOW), { selector: 'dd' })).toBeTruthy() // date added
  })

  it('says so when there is no phone number', async () => {
    await openDrawer({ candidate: priya({ phone: null }) })
    expect(screen.getByText('Not provided')).toBeTruthy()
  })

  it('fetches the candidate and history from the server by id', async () => {
    await openDrawer()
    expect(api.callsTo('GET /api/candidates/priya')).toHaveLength(1)
    expect(api.callsTo('GET /api/candidates/priya/history')).toHaveLength(1)
  })
})

describe('current stage duration', () => {
  it('reads "Currently in Interview for 3 days 7 hours"', async () => {
    await openDrawer()
    expect(screen.getByText('Currently in Interview for 3 days 7 hours')).toBeTruthy()
  })

  it('is measured from the latest transition timestamp the server returned', async () => {
    // Server-side truth says the last move was 1h30m ago, regardless of what any card said.
    await openDrawer({ now: Date.parse('2026-09-28T10:30:00.000Z') })
    expect(screen.getByText('Currently in Interview for 1 hour 30 minutes')).toBeTruthy()
  })

  it('uses the audit trail, not the candidate’s own currentStageSince', async () => {
    await openDrawer({ candidate: priya({ currentStageSince: '2020-01-01T00:00:00.000Z', daysInCurrentStage: 2000 }) })
    expect(screen.getByText('Currently in Interview for 3 days 7 hours')).toBeTruthy()
  })

  it('keeps counting as the clock advances', async () => {
    const { rerender } = await openDrawer()
    expect(screen.getByText('Currently in Interview for 3 days 7 hours')).toBeTruthy()

    rerender(<CandidateDetailsDrawer candidateId="priya" now={NOW + 60 * 60_000} onClose={() => {}} />)
    expect(screen.getByText('Currently in Interview for 3 days 8 hours')).toBeTruthy()
  })
})

describe('history timeline', () => {
  it('renders Applied, then each move, as a timeline', async () => {
    await openDrawer()
    const items = timelineItems()

    expect(items).toHaveLength(3)
    expect(items[0].textContent).toContain('Applied')
    expect(items[1].textContent).toContain('Moved from Applied → Screening')
    expect(items[2].textContent).toContain('Moved from Screening → Interview')
  })

  it('shows each entry’s date, taken from the server timestamps', async () => {
    await openDrawer()
    const items = timelineItems()

    expect(within(items[0]).getByText(formatEventDate(CREATED, NOW))).toBeTruthy()
    expect(within(items[1]).getByText(formatEventDate(toScreening.changedAt, NOW))).toBeTruthy()
    expect(within(items[2]).getByText(formatEventDate(toInterview.changedAt, NOW))).toBeTruthy()
    expect(items.map((li) => li.querySelector('time')?.getAttribute('datetime'))).toEqual([
      CREATED,
      toScreening.changedAt,
      toInterview.changedAt,
    ])
  })

  it('is in chronological order, oldest first', async () => {
    await openDrawer()
    const times = timelineItems().map((li) => Date.parse(li.querySelector('time')!.getAttribute('datetime')!))
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it('stays chronological even if the server returns history out of order', async () => {
    await openDrawer({ history: [toInterview, toScreening] })
    const items = timelineItems()

    expect(items.map((li) => li.querySelector('time')?.getAttribute('datetime'))).toEqual([
      CREATED,
      toScreening.changedAt,
      toInterview.changedAt,
    ])
    expect(items[2].textContent).toContain('Moved from Screening → Interview')
    expect(screen.getByText('Currently in Interview for 3 days 7 hours')).toBeTruthy()
  })

  it('marks only the latest entry as current', async () => {
    await openDrawer()
    const items = timelineItems()
    expect(items.map((li) => li.textContent?.includes('Current'))).toEqual([false, false, true])
  })

  it('shows a rejection as the final step', async () => {
    const rejected: StageHistoryEntry = { id: 'h3', fromStage: 'INTERVIEW', toStage: 'REJECTED', changedAt: '2026-09-30T00:00:00.000Z' }
    await openDrawer({ candidate: priya({ currentStage: 'REJECTED' }), history: [toScreening, toInterview, rejected] })

    expect(timelineItems().at(-1)?.textContent).toContain('Moved from Interview → Rejected')
    expect(screen.getByText('Currently in Rejected for 1 day 16 hours')).toBeTruthy()
  })
})

describe('a candidate with no history', () => {
  async function openApplied() {
    return openDrawer({
      candidate: priya({ currentStage: 'APPLIED' }),
      history: [],
      now: Date.parse('2026-09-22T12:15:00.000Z'),
    })
  }

  it('shows just the Applied entry and an explanation, not an empty or broken list', async () => {
    await openApplied()

    const items = timelineItems()
    expect(items).toHaveLength(1)
    expect(items[0].textContent).toContain('Applied')
    expect(items[0].textContent).toContain('Current')
    expect(screen.getByText('No stage changes yet.')).toBeTruthy()
  })

  it('measures time in stage from the date added', async () => {
    await openApplied()
    expect(screen.getByText('Currently in Applied for 2 days 2 hours')).toBeTruthy()
  })

  it('does not show the empty-history note when there is history', async () => {
    await openDrawer()
    expect(screen.queryByText('No stage changes yet.')).toBeNull()
  })
})

describe('read-only', () => {
  it('offers no way to edit, delete or revert history', async () => {
    await openDrawer()
    const dialog = screen.getByRole('dialog')

    const buttons = within(dialog).getAllByRole('button').map((b) => b.textContent)
    expect(buttons).toEqual(['Close'])
    expect(within(dialog).queryAllByRole('textbox')).toHaveLength(0)
    expect(within(dialog).queryAllByRole('button', { name: /edit|delete|remove|undo|revert|change/i })).toHaveLength(0)
  })

  it('never sends anything other than GET requests', async () => {
    await openDrawer()
    expect(api.calls.every((c) => c.method === 'GET')).toBe(true)
  })
})

describe('failures', () => {
  it('shows the server’s message when the candidate does not exist', async () => {
    api = installFakeApi([])
    render(<CandidateDetailsDrawer candidateId="ghost" now={NOW} onClose={() => {}} />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Candidate ghost not found')
  })

  it('offers a retry that recovers', async () => {
    api = installFakeApi([priya()])
    api.setHistory('priya', [toScreening, toInterview])
    api.override('GET /api/candidates/priya/history', () => json({ error: 'History is unavailable' }, 500))
    const user = userEvent.setup()
    render(<CandidateDetailsDrawer candidateId="priya" now={NOW} onClose={() => {}} />)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('History is unavailable')

    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('list', { name: 'Stage history' })).toBeTruthy()
  })

  it('fetches again if a move lands between the two requests, instead of showing a contradiction', async () => {
    api = installFakeApi([priya()])
    api.setHistory('priya', [toScreening, toInterview])
    // First candidate response is from just before the Interview move.
    api.override('GET /api/candidates/priya', () => json(priya({ currentStage: 'SCREENING' })))
    render(<CandidateDetailsDrawer candidateId="priya" now={NOW} onClose={() => {}} />)

    await screen.findByRole('list', { name: 'Stage history' })
    expect(api.callsTo('GET /api/candidates/priya')).toHaveLength(2)
    expect(screen.getByText('Currently in Interview for 3 days 7 hours')).toBeTruthy()
  })

  it('gives up re-fetching after a few attempts rather than looping forever', async () => {
    api = installFakeApi([priya()])
    api.setHistory('priya', [toScreening, toInterview])
    for (let i = 0; i < 5; i++) {
      api.override('GET /api/candidates/priya', () => json(priya({ currentStage: 'SCREENING' })))
    }
    render(<CandidateDetailsDrawer candidateId="priya" now={NOW} onClose={() => {}} />)

    await screen.findByRole('list', { name: 'Stage history' })
    expect(api.callsTo('GET /api/candidates/priya')).toHaveLength(3)
  })
})

describe('closing', () => {
  it('closes from the Close button', async () => {
    const { onClose } = await openDrawer()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', async () => {
    const { onClose } = await openDrawer()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
