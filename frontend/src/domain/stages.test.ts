import { describe, it, expect } from 'vitest'
import type { Stage } from '../api/types'
import { canReject, formatTimeInStage, nextStage, PIPELINE_STAGES } from './stages'

describe('PIPELINE_STAGES', () => {
  it('lists the board columns in forward order, excluding Rejected', () => {
    expect(PIPELINE_STAGES).toEqual(['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED'])
  })
})

describe('nextStage', () => {
  it('steps forward one stage at a time', () => {
    expect(nextStage('APPLIED')).toBe('SCREENING')
    expect(nextStage('SCREENING')).toBe('INTERVIEW')
    expect(nextStage('INTERVIEW')).toBe('OFFER')
    expect(nextStage('OFFER')).toBe('HIRED')
  })

  it('is null for final stages', () => {
    expect(nextStage('HIRED')).toBeNull()
    expect(nextStage('REJECTED')).toBeNull()
  })
})

describe('canReject', () => {
  it('allows rejecting from any non-final stage', () => {
    const nonFinal: Stage[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER']
    for (const s of nonFinal) expect(canReject(s)).toBe(true)
  })

  it('refuses once Hired or Rejected', () => {
    expect(canReject('HIRED')).toBe(false)
    expect(canReject('REJECTED')).toBe(false)
  })
})

describe('formatTimeInStage', () => {
  const now = Date.parse('2026-01-10T00:00:00.000Z')

  it('graduates through minutes, hours and days', () => {
    expect(formatTimeInStage(new Date(now - 30_000).toISOString(), now)).toBe('under a minute')
    expect(formatTimeInStage(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5 minutes')
    expect(formatTimeInStage(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe('3 hours')
    expect(formatTimeInStage(new Date(now - 2 * 86_400_000).toISOString(), now)).toBe('2 days')
  })

  it('never goes negative for a timestamp in the future', () => {
    expect(formatTimeInStage(new Date(now + 60_000).toISOString(), now)).toBe('under a minute')
  })
})
