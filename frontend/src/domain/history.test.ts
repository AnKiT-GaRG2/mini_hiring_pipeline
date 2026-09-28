import { describe, expect, it } from 'vitest'
import type { Candidate, Stage, StageHistoryEntry } from '../api/types'
import {
  buildTimeline,
  currentStageStartedAt,
  describeCurrentStage,
  formatDetailedDuration,
  formatEventDate,
  isSnapshotConsistent,
  sortHistory,
} from './history'

const at = (iso: string) => Date.parse(iso)
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

function candidate(currentStage: Stage, overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'c1',
    name: 'Priya Sharma',
    email: 'priya@example.com',
    phone: null,
    currentStage,
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-20T10:00:00.000Z',
    currentStageSince: '2026-09-20T10:00:00.000Z',
    daysInCurrentStage: 0,
    ...overrides,
  }
}

function move(id: string, fromStage: Stage, toStage: Stage, changedAt: string): StageHistoryEntry {
  return { id, fromStage, toStage, changedAt }
}

const toScreening = move('h1', 'APPLIED', 'SCREENING', '2026-09-22T10:00:00.000Z')
const toInterview = move('h2', 'SCREENING', 'INTERVIEW', '2026-09-28T09:00:00.000Z')

describe('formatDetailedDuration', () => {
  it.each([
    [0, 'less than a minute'],
    [59_000, 'less than a minute'],
    [MIN, '1 minute'],
    [12 * MIN, '12 minutes'],
    [HOUR, '1 hour'],
    [HOUR + MIN, '1 hour 1 minute'],
    [5 * HOUR + 12 * MIN, '5 hours 12 minutes'],
    [23 * HOUR + 59 * MIN, '23 hours 59 minutes'],
    [DAY, '1 day'],
    [DAY + HOUR, '1 day 1 hour'],
    [3 * DAY + 7 * HOUR, '3 days 7 hours'],
    [3 * DAY + 7 * HOUR + 40 * MIN, '3 days 7 hours'], // minutes are dropped once days are shown
    [3 * DAY + 30 * MIN, '3 days'], // zero hours is omitted rather than "0 hours"
    [40 * DAY, '40 days'],
  ])('%d ms -> %s', (elapsed, expected) => {
    expect(formatDetailedDuration(elapsed)).toBe(expected)
  })

  it('clamps a negative span (server clock slightly ahead) to zero', () => {
    expect(formatDetailedDuration(-5 * MIN)).toBe('less than a minute')
  })
})

describe('describeCurrentStage', () => {
  it('produces "Currently in Interview for 3 days 7 hours" from the latest transition', () => {
    const now = at('2026-10-01T16:00:00.000Z')
    expect(describeCurrentStage(candidate('INTERVIEW'), [toScreening, toInterview], now)).toBe(
      'Currently in Interview for 3 days 7 hours',
    )
  })

  it('measures from the latest transition, not the first or the creation date', () => {
    const now = at('2026-09-28T10:30:00.000Z') // 1h30m after the Interview move
    expect(describeCurrentStage(candidate('INTERVIEW'), [toScreening, toInterview], now)).toBe(
      'Currently in Interview for 1 hour 30 minutes',
    )
  })

  it('uses the audit trail rather than the candidate’s own currentStageSince', () => {
    const misleading = candidate('INTERVIEW', { currentStageSince: '2020-01-01T00:00:00.000Z', daysInCurrentStage: 2000 })
    const now = at('2026-10-01T16:00:00.000Z')
    expect(describeCurrentStage(misleading, [toScreening, toInterview], now)).toBe(
      'Currently in Interview for 3 days 7 hours',
    )
  })

  it('measures from when the candidate was added if they have never moved', () => {
    const now = at('2026-09-22T12:15:00.000Z')
    expect(describeCurrentStage(candidate('APPLIED'), [], now)).toBe('Currently in Applied for 2 days 2 hours')
  })

  it('is not thrown off by history that arrives out of order', () => {
    const now = at('2026-10-01T16:00:00.000Z')
    expect(describeCurrentStage(candidate('INTERVIEW'), [toInterview, toScreening], now)).toBe(
      'Currently in Interview for 3 days 7 hours',
    )
  })

  it('keeps counting as time passes', () => {
    const c = candidate('INTERVIEW')
    const start = at('2026-10-01T16:00:00.000Z')
    expect(describeCurrentStage(c, [toScreening, toInterview], start)).toContain('3 days 7 hours')
    expect(describeCurrentStage(c, [toScreening, toInterview], start + HOUR)).toContain('3 days 8 hours')
  })

  it('names the final stage for Hired and Rejected candidates', () => {
    const rejected = move('h3', 'INTERVIEW', 'REJECTED', '2026-09-30T00:00:00.000Z')
    expect(describeCurrentStage(candidate('REJECTED'), [toScreening, toInterview, rejected], at('2026-10-02T00:00:00.000Z'))).toBe(
      'Currently in Rejected for 2 days',
    )
  })
})

describe('currentStageStartedAt', () => {
  it('is the latest transition, or creation when there are none', () => {
    expect(currentStageStartedAt(candidate('INTERVIEW'), [toScreening, toInterview])).toBe(toInterview.changedAt)
    expect(currentStageStartedAt(candidate('APPLIED'), [])).toBe('2026-09-20T10:00:00.000Z')
  })
})

describe('sortHistory', () => {
  it('orders oldest first without mutating its input', () => {
    const input = [toInterview, toScreening]
    expect(sortHistory(input).map((h) => h.id)).toEqual(['h1', 'h2'])
    expect(input.map((h) => h.id)).toEqual(['h2', 'h1'])
  })

  it('keeps the server’s order for rows with identical timestamps', () => {
    const same = '2026-09-22T10:00:00.000Z'
    const a = move('a', 'APPLIED', 'SCREENING', same)
    const b = move('b', 'SCREENING', 'INTERVIEW', same)
    expect(sortHistory([a, b]).map((h) => h.id)).toEqual(['a', 'b'])
  })
})

describe('buildTimeline', () => {
  it('starts with Applied at the date added, then one entry per transition, oldest first', () => {
    const timeline = buildTimeline(candidate('INTERVIEW'), [toScreening, toInterview])

    expect(timeline.map((e) => e.text)).toEqual([
      'Applied',
      'Moved from Applied → Screening',
      'Moved from Screening → Interview',
    ])
    expect(timeline.map((e) => e.at)).toEqual([
      '2026-09-20T10:00:00.000Z',
      '2026-09-22T10:00:00.000Z',
      '2026-09-28T09:00:00.000Z',
    ])
  })

  it('is chronological even when the server order is not', () => {
    const timeline = buildTimeline(candidate('INTERVIEW'), [toInterview, toScreening])
    const times = timeline.map((e) => Date.parse(e.at))
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(timeline.map((e) => e.text)[2]).toBe('Moved from Screening → Interview')
  })

  it('marks only the latest entry as current', () => {
    const timeline = buildTimeline(candidate('INTERVIEW'), [toScreening, toInterview])
    expect(timeline.map((e) => e.isCurrent)).toEqual([false, false, true])
  })

  it('has a single, current entry when there is no history', () => {
    const timeline = buildTimeline(candidate('APPLIED'), [])
    expect(timeline).toHaveLength(1)
    expect(timeline[0]).toMatchObject({ text: 'Applied', isCurrent: true, at: '2026-09-20T10:00:00.000Z' })
  })

  it('records a rejection from any stage', () => {
    const rejected = move('h3', 'OFFER', 'REJECTED', '2026-10-01T00:00:00.000Z')
    const last = buildTimeline(candidate('REJECTED'), [toScreening, rejected]).at(-1)
    expect(last).toMatchObject({ text: 'Moved from Offer → Rejected', stage: 'REJECTED', isCurrent: true })
  })

  it('does not include any timestamp the server did not provide', () => {
    const timeline = buildTimeline(candidate('SCREENING'), [toScreening])
    const provided = new Set(['2026-09-20T10:00:00.000Z', toScreening.changedAt])
    expect(timeline.every((e) => provided.has(e.at))).toBe(true)
  })
})

describe('isSnapshotConsistent', () => {
  it('is true when the stage matches the latest history row', () => {
    expect(isSnapshotConsistent(candidate('INTERVIEW'), [toScreening, toInterview])).toBe(true)
    expect(isSnapshotConsistent(candidate('INTERVIEW'), [toInterview, toScreening])).toBe(true)
  })

  it('is true for a candidate still in Applied with no history', () => {
    expect(isSnapshotConsistent(candidate('APPLIED'), [])).toBe(true)
  })

  it('is false when a transition landed between the two requests', () => {
    expect(isSnapshotConsistent(candidate('SCREENING'), [toScreening, toInterview])).toBe(false)
    expect(isSnapshotConsistent(candidate('INTERVIEW'), [toScreening])).toBe(false)
    expect(isSnapshotConsistent(candidate('SCREENING'), [])).toBe(false)
  })
})

describe('formatEventDate', () => {
  const now = at('2026-10-01T12:00:00.000Z')

  it('omits the year within the current year', () => {
    expect(formatEventDate('2026-09-20T10:00:00.000Z', now, 'en-US')).toBe('Sep 20')
  })

  it('includes the year for earlier years', () => {
    expect(formatEventDate('2025-09-20T10:00:00.000Z', now, 'en-US')).toBe('Sep 20, 2025')
  })
})
