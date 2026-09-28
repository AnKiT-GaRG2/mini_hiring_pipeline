import { describe, expect, it } from 'vitest'
import type { ParsedQuery } from '../api/types'
import {
  countLabel,
  describeFilters,
  describeMatch,
  extraParseDetail,
  isNameOnly,
  SEARCH_HELP,
} from './searchSummary'

const NOW = Date.parse('2026-10-01T12:00:00.000Z')

describe('describeFilters', () => {
  it('describes a current-stage filter', () => {
    expect(describeFilters({ currentStage: 'INTERVIEW' }, NOW)).toEqual(['Current stage = Interview'])
  })

  it('describes stage plus time in stage, as in "stuck in Screening for more than a week"', () => {
    expect(
      describeFilters(
        { currentStage: 'SCREENING', currentStageDuration: { operator: '>', durationDays: 7 } },
        NOW,
      ),
    ).toEqual(['Current stage = Screening', 'More than 7 days in current stage'])
  })

  it.each([
    ['>', 'More than'],
    ['>=', 'At least'],
    ['<', 'Less than'],
    ['<=', 'At most'],
    ['=', 'Exactly'],
  ] as const)('spells the %s operator as "%s"', (operator, words) => {
    expect(describeFilters({ currentStageDuration: { operator, durationDays: 3 } }, NOW)).toEqual([
      `${words} 3 days in current stage`,
    ])
  })

  it('uses the singular for one day', () => {
    expect(describeFilters({ currentStageDuration: { operator: '<', durationDays: 1 } }, NOW)).toEqual([
      'Less than 1 day in current stage',
    ])
  })

  it('describes movement with and without a date', () => {
    expect(
      describeFilters({ movedToStage: { stage: 'INTERVIEW', since: '2026-09-21T00:00:00.000Z' } }, NOW),
    ).toEqual([`Moved to Interview since ${new Date('2026-09-21T00:00:00.000Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`])
    expect(describeFilters({ movedToStage: { stage: 'OFFER' } }, NOW)).toEqual(['Moved to Offer'])
  })

  it('describes outcome, exclusion and name filters', () => {
    expect(describeFilters({ reachedStageNotHired: 'OFFER' }, NOW)).toEqual(['Reached Offer but not hired'])
    expect(describeFilters({ excludeStages: ['REJECTED'] }, NOW)).toEqual(['Excluding Rejected'])
    expect(describeFilters({ excludeStages: ['REJECTED', 'HIRED'] }, NOW)).toEqual(['Excluding Rejected, Hired'])
    expect(describeFilters({ name: { query: 'sharam' } }, NOW)).toEqual(['Name similar to “sharam”'])
  })

  it('lists every filter of a combined query', () => {
    const parsed: ParsedQuery = {
      name: { query: 'Priya' },
      currentStage: 'SCREENING',
      currentStageDuration: { operator: '>', durationDays: 7 },
    }
    expect(describeFilters(parsed, NOW)).toEqual([
      'Name similar to “Priya”',
      'Current stage = Screening',
      'More than 7 days in current stage',
    ])
  })

  it('returns nothing when there are no filters (a "show everyone" query)', () => {
    expect(describeFilters({}, NOW)).toEqual([])
  })
})

describe('describeMatch', () => {
  it.each([
    ['exact', 'Exact name match'],
    ['prefix', 'Name starts with “priya”'],
    ['word', 'Name contains “priya”'],
    ['fuzzy', 'Fuzzy name match'],
  ] as const)('%s -> %s', (type, text) => {
    expect(describeMatch(type, 'priya')).toBe(text)
  })
})

describe('isNameOnly', () => {
  it('is true only when the name is the sole thing understood', () => {
    expect(isNameOnly({ name: { query: 'purple elephants' } })).toBe(true)
    expect(isNameOnly({ name: { query: 'Priya' }, currentStage: 'SCREENING' })).toBe(false)
    expect(isNameOnly({ currentStage: 'INTERVIEW' })).toBe(false)
    expect(isNameOnly({})).toBe(false)
  })

  it('ignores keys that are present but undefined', () => {
    expect(isNameOnly({ name: { query: 'x' }, currentStage: undefined })).toBe(true)
  })
})

describe('countLabel', () => {
  it.each([
    [0, '0 candidates found'],
    [1, '1 candidate found'],
    [3, '3 candidates found'],
  ])('%d -> %s', (n, text) => {
    expect(countLabel(n)).toBe(text)
  })
})

describe('extraParseDetail', () => {
  it('drops the generic sentence the heading already says', () => {
    expect(extraParseDetail("I couldn't understand this search.")).toBe('')
    expect(extraParseDetail('I couldn’t understand this search.')).toBe('')
  })

  it('keeps what follows it', () => {
    expect(extraParseDetail("I couldn't understand this search. The query was empty.")).toBe('The query was empty.')
  })

  it('keeps a specific message untouched', () => {
    const message = 'I understood you\'re referring to a stage ("Bananas"), but that\'s not a valid stage.'
    expect(extraParseDetail(message)).toBe(message)
  })
})

describe('SEARCH_HELP', () => {
  it('covers every kind of search the brief lists, each with an example', () => {
    const topics = SEARCH_HELP.map((h) => h.topic.toLowerCase())
    for (const expected of ['candidate name', 'current stage', 'time in stage', 'stage movement', 'hiring outcome']) {
      expect(topics).toContain(expected)
    }
    expect(SEARCH_HELP.every((h) => h.example.length > 0)).toBe(true)
  })
})
