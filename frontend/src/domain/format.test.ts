import { describe, it, expect } from 'vitest'
import { firstName, formatDate, formatPercent, greeting, initials, plural, timeAgo } from './format'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('timeAgo', () => {
  const now = Date.parse('2026-06-15T12:00:00.000Z')

  it('graduates through minutes, hours, days and weeks', () => {
    expect(timeAgo(new Date(now - 10_000).toISOString(), now)).toBe('just now')
    expect(timeAgo(new Date(now - 5 * MIN).toISOString(), now)).toBe('5 minutes ago')
    expect(timeAgo(new Date(now - 3 * HOUR).toISOString(), now)).toBe('3 hours ago')
    expect(timeAgo(new Date(now - 2 * DAY).toISOString(), now)).toBe('2 days ago')
    expect(timeAgo(new Date(now - 20 * DAY).toISOString(), now)).toBe('2 weeks ago')
  })

  it('falls back to a plain date once it is more than about two months old', () => {
    expect(timeAgo(new Date(now - 90 * DAY).toISOString(), now)).toBe(formatDate(new Date(now - 90 * DAY).toISOString()))
  })

  it('uses singular units for exactly one', () => {
    expect(timeAgo(new Date(now - MIN).toISOString(), now)).toBe('1 minute ago')
    expect(timeAgo(new Date(now - HOUR).toISOString(), now)).toBe('1 hour ago')
    expect(timeAgo(new Date(now - DAY).toISOString(), now)).toBe('1 day ago')
  })
})

describe('plural', () => {
  it('adds an s except for exactly one', () => {
    expect(plural(1, 'day')).toBe('1 day')
    expect(plural(0, 'day')).toBe('0 days')
    expect(plural(2, 'day')).toBe('2 days')
  })
})

describe('initials', () => {
  it('takes the first letter of the first and last word for a full name', () => {
    expect(initials('Priya Sharma')).toBe('PS')
    expect(initials('Ada Lovelace Byron')).toBe('AB')
  })

  it('takes the first two letters of a single word', () => {
    expect(initials('Madonna')).toBe('MA')
  })

  it('falls back for empty or whitespace-only input', () => {
    expect(initials('   ')).toBe('?')
    expect(initials('')).toBe('?')
  })
})

describe('firstName', () => {
  it('takes the text before the first space', () => {
    expect(firstName('Priya Sharma')).toBe('Priya')
    expect(firstName('  Priya   Sharma')).toBe('Priya')
  })

  it('returns the whole thing when there is no space', () => {
    expect(firstName('Cher')).toBe('Cher')
  })
})

describe('greeting', () => {
  it('picks morning, afternoon or evening by the hour', () => {
    expect(greeting(6)).toBe('Good morning')
    expect(greeting(11)).toBe('Good morning')
    expect(greeting(12)).toBe('Good afternoon')
    expect(greeting(16)).toBe('Good afternoon')
    expect(greeting(17)).toBe('Good evening')
    expect(greeting(23)).toBe('Good evening')
  })
})

describe('formatPercent', () => {
  it('shows the magnitude without a sign, and a dash for null', () => {
    expect(formatPercent(12)).toBe('12%')
    expect(formatPercent(-12)).toBe('12%')
    expect(formatPercent(null)).toBe('—')
  })
})
