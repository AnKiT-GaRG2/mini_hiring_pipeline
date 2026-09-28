import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'
import type { Candidate, Stage } from './api/types'
import { installFakeApi, json, makeCandidate } from './test/fakeApi'

let api: ReturnType<typeof installFakeApi>
afterEach(() => api.restore())

async function renderApp(candidates: Candidate[]) {
  api = installFakeApi(candidates)
  const user = userEvent.setup()
  render(<App />)
  await screen.findByRole('group', { name: 'Hiring pipeline' })
  return user
}

const column = (name: string) => screen.getByRole('region', { name })
const card = (name: string) => screen.getByRole('article', { name })
const stage = (name: string, currentStage: Stage) => makeCandidate(name, { currentStage })

/** Browsers fire `cancel` on a modal <dialog> when Escape is pressed; jsdom doesn't, so we do it. */
function pressEscapeIn(dialog: HTMLElement) {
  const notCancelled = fireEvent(dialog, new Event('cancel', { cancelable: true }))
  return { defaultPrevented: !notCancelled }
}

describe('loading, error and empty states', () => {
  it('shows a skeleton while loading, then the candidates', async () => {
    api = installFakeApi([makeCandidate('Priya')])
    render(<App />)
    expect(screen.getByRole('status', { name: 'Loading candidates' })).toBeTruthy()
    expect(await screen.findByRole('article', { name: 'Priya' })).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'Loading candidates' })).toBeNull()
  })

  it('shows the error with a retry that recovers', async () => {
    api = installFakeApi([makeCandidate('Priya')])
    api.override('GET /api/candidates', () => json({ error: 'Database is down' }, 500))
    const user = userEvent.setup()
    render(<App />)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Database is down')).toBeTruthy()

    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('article', { name: 'Priya' })).toBeTruthy()
  })

  it('tells the user when the server is unreachable', async () => {
    api = installFakeApi([])
    api.override('GET /api/candidates', () => Promise.reject(new TypeError('Failed to fetch')))
    render(<App />)
    expect(await screen.findByText(/Can't reach the server/)).toBeTruthy()
  })

  it('shows an empty state with a way to add the first candidate', async () => {
    api = installFakeApi([])
    const user = userEvent.setup()
    render(<App />)

    await screen.findByText('No candidates yet')
    await user.click(screen.getAllByRole('button', { name: '+ Add candidate' })[1])
    expect(screen.getByRole('dialog', { name: 'Add candidate' })).toBeTruthy()
  })
})

describe('the board', () => {
  it('groups candidates into stage columns, with Rejected as its own section', async () => {
    await renderApp([
      stage('Priya', 'APPLIED'),
      stage('Rahul', 'SCREENING'),
      stage('Vikram', 'INTERVIEW'),
      stage('Arjun', 'OFFER'),
      stage('Karan', 'HIRED'),
      stage('Ritu', 'REJECTED'),
    ])

    for (const [col, name] of [
      ['Applied', 'Priya'],
      ['Screening', 'Rahul'],
      ['Interview', 'Vikram'],
      ['Offer', 'Arjun'],
      ['Hired', 'Karan'],
      ['Rejected', 'Ritu'],
    ]) {
      expect(within(column(col)).getByRole('article', { name })).toBeTruthy()
    }
  })

  it('shows name, email, stage and time in stage on each card', async () => {
    await renderApp([makeCandidate('Priya', { currentStage: 'SCREENING' })])
    const priya = within(card('Priya'))

    expect(priya.getByText('priya@example.com')).toBeTruthy()
    expect(priya.getByText('Screening')).toBeTruthy()
    expect(priya.getByText('3 days')).toBeTruthy()
  })

  it('puts the longest-waiting candidate at the top of a column', async () => {
    const day = 24 * 60 * 60 * 1000
    const since = (days: number) => new Date(Date.now() - days * day).toISOString()
    await renderApp([
      makeCandidate('Recent', { currentStage: 'SCREENING', currentStageSince: since(1) }),
      makeCandidate('Oldest', { currentStage: 'SCREENING', currentStageSince: since(9) }),
      makeCandidate('Middle', { currentStage: 'SCREENING', currentStageSince: since(4) }),
    ])

    const names = within(column('Screening'))
      .getAllByRole('article')
      .map((a) => a.getAttribute('aria-label'))
    expect(names).toEqual(['Oldest', 'Middle', 'Recent'])
  })

  it.each<[Stage, string[]]>([
    ['APPLIED', ['Move to Screening', 'Open', 'Reject']],
    ['SCREENING', ['Move to Interview', 'Open', 'Reject']],
    ['INTERVIEW', ['Move to Offer', 'Open', 'Reject']],
    ['OFFER', ['Move to Hired', 'Open', 'Reject']],
    ['HIRED', ['Open']],
    ['REJECTED', ['Open']],
  ])('a %s card offers only %j', async (currentStage, expected) => {
    await renderApp([stage('Priya', currentStage)])
    const buttons = within(card('Priya'))
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(buttons.sort()).toEqual([...expected].sort())
  })
})

describe('moving a candidate', () => {
  it('shows a loading state, calls the API, then updates the board and confirms', async () => {
    const user = await renderApp([stage('Priya', 'APPLIED')])
    const release = api.hold('POST /api/candidates/priya/transition')

    await user.click(within(card('Priya')).getByRole('button', { name: 'Move to Screening' }))

    const moving = await within(card('Priya')).findByRole('button', { name: 'Moving…' })
    expect((moving as HTMLButtonElement).disabled).toBe(true)
    expect((within(card('Priya')).getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(column('Applied')).getByRole('article', { name: 'Priya' })).toBeTruthy() // not optimistic

    release()

    expect(await screen.findByText('Moved Priya to Screening.')).toBeTruthy()
    expect(within(column('Screening')).getByRole('article', { name: 'Priya' })).toBeTruthy()
    expect(within(column('Applied')).queryByRole('article')).toBeNull()
    expect(api.callsTo('POST /api/candidates/priya/transition')[0].body).toEqual({ toStage: 'SCREENING' })
  })

  it('shows the server’s message and resyncs when the backend refuses', async () => {
    const user = await renderApp([stage('Priya', 'APPLIED')])
    // Meanwhile, someone else moved Priya on; the UI doesn't know yet.
    api.setCandidates([stage('Priya', 'SCREENING')])
    api.override('POST /api/candidates/priya/transition', () =>
      json({ error: 'Candidate is already in the SCREENING stage.' }, 409),
    )

    await user.click(within(card('Priya')).getByRole('button', { name: 'Move to Screening' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Couldn’t move Priya')
    expect(alert.textContent).toContain('Candidate is already in the SCREENING stage.')
    expect(alert.textContent).toContain('The board has been refreshed.')
    await waitFor(() => expect(within(column('Screening')).getByRole('article', { name: 'Priya' })).toBeTruthy())
  })

  it('re-enables the card after a failure', async () => {
    const user = await renderApp([stage('Priya', 'APPLIED')])
    api.override('POST /api/candidates/priya/transition', () => json({ error: 'Internal server error' }, 500))

    await user.click(within(card('Priya')).getByRole('button', { name: 'Move to Screening' }))
    await screen.findByRole('alert')

    const button = within(card('Priya')).getByRole('button', { name: 'Move to Screening' }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
    expect(api.callsTo('GET /api/candidates')).toHaveLength(1) // a 500 is not a stale-state signal
  })
})

describe('rejecting a candidate', () => {
  it('asks for confirmation and does nothing if cancelled', async () => {
    const user = await renderApp([stage('Rahul', 'SCREENING')])

    await user.click(within(card('Rahul')).getByRole('button', { name: 'Reject' }))
    const dialog = screen.getByRole('dialog', { name: 'Reject Rahul?' })
    expect(within(dialog).getByText(/Rejection is final/)).toBeTruthy()

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.calls.some((c) => c.path.endsWith('/reject'))).toBe(false)
    expect(within(column('Screening')).getByRole('article', { name: 'Rahul' })).toBeTruthy()
  })

  it('cancels on Escape', async () => {
    const user = await renderApp([stage('Rahul', 'SCREENING')])
    await user.click(within(card('Rahul')).getByRole('button', { name: 'Reject' }))
    pressEscapeIn(screen.getByRole('dialog'))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.calls.some((c) => c.path.endsWith('/reject'))).toBe(false)
  })

  it('shows progress, blocks dismissal, then moves the card to Rejected', async () => {
    const user = await renderApp([stage('Rahul', 'SCREENING')])
    const release = api.hold('POST /api/candidates/rahul/reject')

    await user.click(within(card('Rahul')).getByRole('button', { name: 'Reject' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Reject candidate' }))

    const busy = await within(dialog).findByRole('button', { name: 'Rejecting…' })
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    expect((within(dialog).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)

    pressEscapeIn(dialog)
    expect(screen.getByRole('dialog')).toBeTruthy() // cannot be dismissed mid-request

    release()

    expect(await screen.findByText('Rejected Rahul.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(column('Rejected')).getByRole('article', { name: 'Rahul' })).toBeTruthy()
  })

  it('reports a refusal from the server and closes the dialog', async () => {
    const user = await renderApp([stage('Rahul', 'SCREENING')])
    api.setCandidates([stage('Rahul', 'HIRED')])
    api.override('POST /api/candidates/rahul/reject', () =>
      json({ error: 'Hired is a final stage and cannot be changed.' }, 409),
    )

    await user.click(within(card('Rahul')).getByRole('button', { name: 'Reject' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reject candidate' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Hired is a final stage and cannot be changed.')
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(within(column('Hired')).getByRole('article', { name: 'Rahul' })).toBeTruthy())
  })
})

describe('adding a candidate', () => {
  async function openForm(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: '+ Add candidate' }))
    return screen.getByRole('dialog', { name: 'Add candidate' })
  }

  it('validates before sending anything', async () => {
    const user = await renderApp([makeCandidate('Priya')])
    const dialog = await openForm(user)

    await user.click(within(dialog).getByRole('button', { name: 'Add candidate' }))
    expect(within(dialog).getByText('Name is required.')).toBeTruthy()
    expect(within(dialog).getByText('Email is required.')).toBeTruthy()

    await user.type(within(dialog).getByLabelText('Name'), 'Ada')
    await user.type(within(dialog).getByLabelText('Email'), 'not-an-email')
    await user.click(within(dialog).getByRole('button', { name: 'Add candidate' }))
    expect(within(dialog).getByText('Enter a valid email address.')).toBeTruthy()

    expect(api.callsTo('POST /api/candidates')).toHaveLength(0)
  })

  it('clears a field’s error as soon as the user edits it', async () => {
    const user = await renderApp([makeCandidate('Priya')])
    const dialog = await openForm(user)
    await user.click(within(dialog).getByRole('button', { name: 'Add candidate' }))
    expect(within(dialog).getByText('Name is required.')).toBeTruthy()

    await user.type(within(dialog).getByLabelText('Name'), 'A')
    expect(within(dialog).queryByText('Name is required.')).toBeNull()
  })

  it('creates the candidate in Applied, trimming input and omitting an empty phone', async () => {
    const user = await renderApp([makeCandidate('Priya')])
    const dialog = await openForm(user)

    await user.type(within(dialog).getByLabelText('Name'), '  Ada Lovelace ')
    await user.type(within(dialog).getByLabelText('Email'), ' ada@example.com ')
    await user.click(within(dialog).getByRole('button', { name: 'Add candidate' }))

    expect(await screen.findByText('Added Ada Lovelace to Applied.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(column('Applied')).getByRole('article', { name: 'Ada Lovelace' })).toBeTruthy()
    expect(api.callsTo('POST /api/candidates')[0].body).toEqual({ name: 'Ada Lovelace', email: 'ada@example.com' })
  })

  it('sends the phone when one is given', async () => {
    const user = await renderApp([makeCandidate('Priya')])
    const dialog = await openForm(user)
    await user.type(within(dialog).getByLabelText('Name'), 'Ada')
    await user.type(within(dialog).getByLabelText('Email'), 'ada@example.com')
    await user.type(within(dialog).getByLabelText(/Phone/), '+44 20 7946 0000')
    await user.click(within(dialog).getByRole('button', { name: 'Add candidate' }))

    await screen.findByText('Added Ada to Applied.')
    expect(api.callsTo('POST /api/candidates')[0].body).toMatchObject({ phone: '+44 20 7946 0000' })
  })

  it('shows progress while saving and blocks a double submit', async () => {
    const user = await renderApp([makeCandidate('Priya')])
    const release = api.hold('POST /api/candidates')
    const dialog = await openForm(user)
    await user.type(within(dialog).getByLabelText('Name'), 'Ada')
    await user.type(within(dialog).getByLabelText('Email'), 'ada@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Add candidate' }))

    const busy = await within(dialog).findByRole('button', { name: 'Adding…' })
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    release()
    await screen.findByText('Added Ada to Applied.')
    expect(api.callsTo('POST /api/candidates')).toHaveLength(1)
  })

  it('puts the server’s duplicate-email error on the email field and keeps the form open', async () => {
    const user = await renderApp([makeCandidate('Priya', { email: 'priya@example.com' })])
    const dialog = await openForm(user)
    await user.type(within(dialog).getByLabelText('Name'), 'Someone Else')
    await user.type(within(dialog).getByLabelText('Email'), 'priya@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Add candidate' }))

    const error = await within(dialog).findByText(/already exists/)
    expect(error.textContent).toContain('priya@example.com')
    expect(within(dialog).getByLabelText('Email').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('dialog', { name: 'Add candidate' })).toBeTruthy()
    expect((within(dialog).getByRole('button', { name: 'Add candidate' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('maps server validation details back onto their fields', async () => {
    const user = await renderApp([makeCandidate('Priya')])
    api.override('POST /api/candidates', () =>
      json({ error: 'Validation failed', details: [{ path: 'name', message: 'name is too long' }] }, 400),
    )
    const dialog = await openForm(user)
    await user.type(within(dialog).getByLabelText('Name'), 'Ada')
    await user.type(within(dialog).getByLabelText('Email'), 'ada@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Add candidate' }))

    expect(await within(dialog).findByText('name is too long')).toBeTruthy()
  })

  it('shows a form-level error for other failures', async () => {
    const user = await renderApp([makeCandidate('Priya')])
    api.override('POST /api/candidates', () => json({ error: 'Internal server error' }, 500))
    const dialog = await openForm(user)
    await user.type(within(dialog).getByLabelText('Name'), 'Ada')
    await user.type(within(dialog).getByLabelText('Email'), 'ada@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Add candidate' }))

    expect((await within(dialog).findByRole('alert')).textContent).toBe('Internal server error')
  })

  it('closes on Cancel without sending anything', async () => {
    const user = await renderApp([makeCandidate('Priya')])
    const dialog = await openForm(user)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.callsTo('POST /api/candidates')).toHaveLength(0)
  })
})

describe('opening a candidate', () => {
  const openCard = async (user: Awaited<ReturnType<typeof renderApp>>, name: string) => {
    await user.click(within(card(name)).getByRole('button', { name: 'Open' }))
    const dialog = screen.getByRole('dialog', { name: /./ })
    await within(dialog).findByRole('list', { name: 'Stage history' }) // wait for the server data
    return dialog
  }

  it('opens the details drawer with the candidate’s details and history from the server', async () => {
    const user = await renderApp([makeCandidate('Priya', { phone: '+91-98765-43210', currentStage: 'INTERVIEW' })])
    api.setHistory('priya', [
      { id: 'h1', fromStage: 'APPLIED', toStage: 'SCREENING', changedAt: '2026-09-22T10:00:00.000Z' },
      { id: 'h2', fromStage: 'SCREENING', toStage: 'INTERVIEW', changedAt: '2026-09-28T09:00:00.000Z' },
    ])

    const dialog = await openCard(user, 'Priya')

    expect(within(dialog).getByRole('heading', { name: 'Priya', level: 2 })).toBeTruthy()
    expect(within(dialog).getByRole('link', { name: 'priya@example.com' }).getAttribute('href')).toBe('mailto:priya@example.com')
    expect(within(dialog).getByText('+91-98765-43210')).toBeTruthy()
    expect(within(dialog).getByText(/^Currently in Interview for /)).toBeTruthy()
    expect(within(dialog).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Applied'),
      expect.stringContaining('Moved from Applied → Screening'),
      expect.stringContaining('Moved from Screening → Interview'),
    ])
    expect(api.callsTo('GET /api/candidates/priya')).toHaveLength(1)
    expect(api.callsTo('GET /api/candidates/priya/history')).toHaveLength(1)
  })

  it('shows the server’s truth even when the board is stale', async () => {
    const user = await renderApp([makeCandidate('Priya', { currentStage: 'APPLIED' })])
    // Someone else moved her on; the board hasn't refreshed.
    api.setCandidates([makeCandidate('Priya', { currentStage: 'SCREENING' })])
    api.setHistory('priya', [{ id: 'h1', fromStage: 'APPLIED', toStage: 'SCREENING', changedAt: new Date().toISOString() }])
    expect(within(column('Applied')).getByRole('article', { name: 'Priya' })).toBeTruthy()

    const dialog = await openCard(user, 'Priya')

    expect(within(dialog).getByText(/^Currently in Screening for /)).toBeTruthy()
    expect(within(dialog).getByText('Moved from Applied → Screening')).toBeTruthy()
  })

  it('includes a move made from the board in the history', async () => {
    const user = await renderApp([makeCandidate('Priya')])
    await user.click(within(card('Priya')).getByRole('button', { name: 'Move to Screening' }))
    await screen.findByText('Moved Priya to Screening.')

    const dialog = await openCard(user, 'Priya')

    expect(within(dialog).getByText('Moved from Applied → Screening')).toBeTruthy()
    expect(within(dialog).getByText(/^Currently in Screening for /)).toBeTruthy()
  })

  it('handles a candidate with no history', async () => {
    const user = await renderApp([makeCandidate('Priya')])
    const dialog = await openCard(user, 'Priya')

    expect(within(dialog).getByText('No stage changes yet.')).toBeTruthy()
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(1)
    expect(within(dialog).getByText('Not provided')).toBeTruthy()
  })

  it('is read-only and closes cleanly', async () => {
    const user = await renderApp([makeCandidate('Priya')])
    const dialog = await openCard(user, 'Priya')

    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['Close'])
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.calls.filter((c) => c.method !== 'GET' && c.path.includes('history'))).toHaveLength(0)
  })
})
