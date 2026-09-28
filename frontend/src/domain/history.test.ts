import { describe, it, expect } from 'vitest'
import type { StageHistoryEntry } from '../api/types'
import { buildTimeline, describeCurrentStage, formatDetailedDuration, sortHistory } from './history'

const entry = (over: Partial<StageHistoryEntry>): StageHistoryEntry => ({
  id: 'h1',
  fromStage: 'APPLIED',
  toStage: 'SCREENING',
  changedAt: '2026-01-02T00:00:00.000Z',
  changedBy: null,
  ...over,
})

describe('sortHistory', () => {
  it('orders oldest first, and keeps input order for a tie', () => {
    const a = entry({ id: 'a', changedAt: '2026-01-03T00:00:00.000Z' })
    const b = entry({ id: 'b', changedAt: '2026-01-01T00:00:00.000Z' })
    const c = entry({ id: 'c', changedAt: '2026-01-01T00:00:00.000Z' })
    expect(sortHistory([a, b, c]).map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('buildTimeline', () => {
  it('starts with the Applied entry from createdAt, then the transitions in order', () => {
    const timeline = buildTimeline('2026-01-01T00:00:00.000Z', [
      entry({ id: 'h1', fromStage: 'APPLIED', toStage: 'SCREENING', changedAt: '2026-01-02T00:00:00.000Z' }),
      entry({ id: 'h2', fromStage: 'SCREENING', toStage: 'INTERVIEW', changedAt: '2026-01-03T00:00:00.000Z' }),
    ])
    expect(timeline.map((e) => e.key)).toEqual(['created', 'h1', 'h2'])
    expect(timeline.map((e) => e.stage)).toEqual(['APPLIED', 'SCREENING', 'INTERVIEW'])
  })

  it('marks only the last entry as current', () => {
    const timeline = buildTimeline('2026-01-01T00:00:00.000Z', [entry({})])
    expect(timeline.map((e) => e.isCurrent)).toEqual([false, true])
  })

  it('is just the Applied entry, marked current, when there is no history yet', () => {
    const timeline = buildTimeline('2026-01-01T00:00:00.000Z', [])
    expect(timeline).toHaveLength(1)
    expect(timeline[0]).toMatchObject({ key: 'created', stage: 'APPLIED', isCurrent: true })
  })

  it('names who made each move, when known', () => {
    const timeline = buildTimeline('2026-01-01T00:00:00.000Z', [entry({ changedBy: { id: 'u1', name: 'Priya Sharma' } })])
    expect(timeline[1].by).toBe('Priya Sharma')
  })
})

describe('formatDetailedDuration', () => {
  it('combines days and hours, or hours and minutes, dropping a zero unit', () => {
    expect(formatDetailedDuration(3 * 86_400_000 + 7 * 3_600_000)).toBe('3 days 7 hours')
    expect(formatDetailedDuration(3 * 86_400_000)).toBe('3 days')
    expect(formatDetailedDuration(5 * 3_600_000 + 12 * 60_000)).toBe('5 hours 12 minutes')
    expect(formatDetailedDuration(5 * 3_600_000)).toBe('5 hours')
    expect(formatDetailedDuration(12 * 60_000)).toBe('12 minutes')
  })

  it('reads "less than a minute" for anything under a minute or negative', () => {
    expect(formatDetailedDuration(30_000)).toBe('less than a minute')
    expect(formatDetailedDuration(-5)).toBe('less than a minute')
  })

  it('uses singular units for exactly one', () => {
    expect(formatDetailedDuration(86_400_000)).toBe('1 day')
    expect(formatDetailedDuration(3_600_000)).toBe('1 hour')
    expect(formatDetailedDuration(60_000)).toBe('1 minute')
  })
})

describe('describeCurrentStage', () => {
  it('names the stage and how long they have been in it', () => {
    const since = '2026-01-01T00:00:00.000Z'
    const now = Date.parse('2026-01-04T05:00:00.000Z')
    expect(describeCurrentStage('INTERVIEW', since, now)).toBe('Currently in Interview for 3 days 5 hours')
  })
})
