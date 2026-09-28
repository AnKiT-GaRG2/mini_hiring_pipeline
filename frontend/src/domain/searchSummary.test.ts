import { describe, it, expect } from 'vitest'
import type { ParsedQuery } from '../api/types'
import { countLabel, describeFilters, describeMatch, extraParseDetail, isNameOnly } from './searchSummary'

describe('describeFilters', () => {
  it('describes each recognised filter in plain English', () => {
    const parsed: ParsedQuery = {
      name: { query: 'priya' },
      currentStage: 'SCREENING',
      currentStageDuration: { operator: '>', durationDays: 7 },
      movedToStage: { stage: 'INTERVIEW', since: '2026-01-05T00:00:00.000Z' },
      reachedStageNotHired: 'OFFER',
      excludeStages: ['REJECTED'],
    }
    const labels = describeFilters(parsed)
    expect(labels).toEqual([
      'Name similar to “priya”',
      'Current stage = Screening',
      'More than 7 days in current stage',
      'Moved to Interview since Jan 5, 2026',
      'Reached Offer but not hired',
      'Excluding Rejected',
    ])
  })

  it('is empty for an empty filter set', () => {
    expect(describeFilters({})).toEqual([])
  })

  it('uses singular "day" for exactly one', () => {
    expect(describeFilters({ currentStageDuration: { operator: '=', durationDays: 1 } })).toEqual(['Exactly 1 day in current stage'])
  })
})

describe('describeMatch', () => {
  it('explains each match type', () => {
    expect(describeMatch('exact', 'priya')).toBe('Exact name match')
    expect(describeMatch('prefix', 'pri')).toBe('Name starts with “pri”')
    expect(describeMatch('word', 'sharma')).toBe('Name contains “sharma”')
    expect(describeMatch('fuzzy', 'sharam')).toBe('Fuzzy name match')
  })
})

describe('isNameOnly', () => {
  it('is true only when name is the sole filter understood', () => {
    expect(isNameOnly({ name: { query: 'priya' } })).toBe(true)
    expect(isNameOnly({ name: { query: 'priya' }, currentStage: 'SCREENING' })).toBe(false)
    expect(isNameOnly({ currentStage: 'SCREENING' })).toBe(false)
    expect(isNameOnly({})).toBe(false)
  })
})

describe('countLabel', () => {
  it('pluralises correctly', () => {
    expect(countLabel(0)).toBe('0 candidates found')
    expect(countLabel(1)).toBe('1 candidate found')
    expect(countLabel(5)).toBe('5 candidates found')
  })
})

describe('extraParseDetail', () => {
  it('strips the generic opening sentence, case- and punctuation-insensitively', () => {
    expect(extraParseDetail("I couldn't understand this search. Unknown stage: banana")).toBe('Unknown stage: banana')
    expect(extraParseDetail('I couldn’t understand this search.')).toBe('')
  })

  it('leaves an unrelated message alone', () => {
    expect(extraParseDetail('Something else entirely.')).toBe('Something else entirely.')
  })
})
