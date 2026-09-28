import { describe, expect, it } from 'vitest'
import { STAGES, type Stage } from '../api/types'
import { canReject, formatTimeInStage, nextStage, PIPELINE_STAGES } from './stages'

describe('nextStage', () => {
  it.each<[Stage, Stage | null]>([
    ['APPLIED', 'SCREENING'],
    ['SCREENING', 'INTERVIEW'],
    ['INTERVIEW', 'OFFER'],
    ['OFFER', 'HIRED'],
    ['HIRED', null],
    ['REJECTED', null],
  ])('%s -> %s', (from, expected) => {
    expect(nextStage(from)).toBe(expected)
  })

  it('only ever offers the single next step: no skipping, no going back', () => {
    for (const stage of STAGES) {
      const next = nextStage(stage)
      if (next) expect(PIPELINE_STAGES.indexOf(next)).toBe(PIPELINE_STAGES.indexOf(stage) + 1)
    }
  })
})

describe('canReject', () => {
  it.each<[Stage, boolean]>([
    ['APPLIED', true],
    ['SCREENING', true],
    ['INTERVIEW', true],
    ['OFFER', true],
    ['HIRED', false],
    ['REJECTED', false],
  ])('%s -> %s', (stage, expected) => {
    expect(canReject(stage)).toBe(expected)
  })
})

describe('formatTimeInStage', () => {
  const now = Date.parse('2026-09-28T12:00:00.000Z')
  const ago = (ms: number) => new Date(now - ms).toISOString()
  const MIN = 60_000
  const HOUR = 60 * MIN
  const DAY = 24 * HOUR

  it.each([
    [0, 'under a minute'],
    [59_000, 'under a minute'],
    [MIN, '1 minute'],
    [45 * MIN, '45 minutes'],
    [HOUR, '1 hour'],
    [23 * HOUR + 59 * MIN, '23 hours'],
    [DAY, '1 day'],
    [8 * DAY + 5 * HOUR, '8 days'],
  ])('%d ms -> %s', (elapsed, expected) => {
    expect(formatTimeInStage(ago(elapsed), now)).toBe(expected)
  })

  it('never goes negative when the server clock is slightly ahead', () => {
    expect(formatTimeInStage(new Date(now + 5_000).toISOString(), now)).toBe('under a minute')
  })
})
