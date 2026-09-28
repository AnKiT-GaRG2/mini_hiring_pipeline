import { describe, it, expect } from 'vitest'
import {
  addDays, addMonths, compareDays, daysRange, dayOfWeek, formatRangeLabel, formatTime, formatTimeRange,
  isValidZone, monthGrid, parseYmdKey, sameDay, shortZoneName, startOfWeek, ymdKey, ymdOf, zonedTimeToInstant,
} from './time'

describe('zonedTimeToInstant / ymdOf', () => {
  it('round-trips a wall-clock time through a fixed-offset zone', () => {
    const instant = zonedTimeToInstant({ y: 2026, m: 9, d: 29 }, 9, 30, 'Asia/Kolkata')
    // IST is UTC+5:30, so 09:30 IST is 04:00 UTC.
    expect(instant.toISOString()).toBe('2026-09-29T04:00:00.000Z')
  })

  it('handles a UTC offset that is not a whole hour', () => {
    const instant = zonedTimeToInstant({ y: 2026, m: 1, d: 1 }, 0, 0, 'Asia/Kolkata')
    expect(instant.toISOString()).toBe('2025-12-31T18:30:00.000Z')
  })

  it('is the inverse of ymdOf for a plain UTC zone', () => {
    const day = { y: 2026, m: 3, d: 15 }
    const instant = zonedTimeToInstant(day, 14, 0, 'UTC')
    expect(ymdOf(instant, 'UTC')).toEqual(day)
  })

  it('crosses a daylight-saving change correctly', () => {
    // US spring-forward 2026: clocks jump from 2:00 to 3:00 on Mar 8, so the
    // hour between 2:00 and 3:00 never happens on the wall clock that day.
    const before = zonedTimeToInstant({ y: 2026, m: 3, d: 8 }, 1, 30, 'America/New_York')
    const after = zonedTimeToInstant({ y: 2026, m: 3, d: 8 }, 3, 30, 'America/New_York')
    // Two hours apart on the wall clock, but only one hour of real time passed.
    expect(after.getTime() - before.getTime()).toBe(60 * 60 * 1000)
  })
})

describe('addDays / addMonths', () => {
  it('adds days across a month boundary', () => {
    expect(addDays({ y: 2026, m: 1, d: 30 }, 3)).toEqual({ y: 2026, m: 2, d: 2 })
  })

  it('adds months, clamping the day to a shorter month', () => {
    expect(addMonths({ y: 2026, m: 1, d: 31 }, 1)).toEqual({ y: 2026, m: 2, d: 28 })
  })

  it('adds months across a year boundary', () => {
    expect(addMonths({ y: 2026, m: 11, d: 15 }, 3)).toEqual({ y: 2027, m: 2, d: 15 })
  })

  it('subtracts with a negative count', () => {
    expect(addDays({ y: 2026, m: 3, d: 1 }, -1)).toEqual({ y: 2026, m: 2, d: 28 })
    expect(addMonths({ y: 2026, m: 1, d: 5 }, -1)).toEqual({ y: 2025, m: 12, d: 5 })
  })
})

describe('dayOfWeek / startOfWeek', () => {
  it('knows 2026-09-29 is a Tuesday', () => {
    expect(dayOfWeek({ y: 2026, m: 9, d: 29 })).toBe(2)
  })

  it('finds the Sunday on or before a day, including Sunday itself', () => {
    expect(startOfWeek({ y: 2026, m: 9, d: 29 })).toEqual({ y: 2026, m: 9, d: 27 })
    expect(startOfWeek({ y: 2026, m: 9, d: 27 })).toEqual({ y: 2026, m: 9, d: 27 })
  })
})

describe('monthGrid', () => {
  it('covers the whole month in whole weeks starting on Sunday', () => {
    const grid = monthGrid({ y: 2026, m: 9, d: 1 })
    expect(grid.length % 7).toBe(0)
    expect(dayOfWeek(grid[0])).toBe(0)
    expect(grid.some((d) => d.y === 2026 && d.m === 9 && d.d === 1)).toBe(true)
    expect(grid.some((d) => d.y === 2026 && d.m === 9 && d.d === 30)).toBe(true)
  })

  it('includes the leading and trailing days from neighbouring months', () => {
    const grid = monthGrid({ y: 2026, m: 9, d: 15 })
    expect(grid[0].m).toBe(8)
    expect(grid.at(-1)!.m).toBe(10)
  })
})

describe('sameDay / compareDays', () => {
  it('compares by calendar day, not by reference', () => {
    expect(sameDay({ y: 2026, m: 1, d: 1 }, { y: 2026, m: 1, d: 1 })).toBe(true)
    expect(sameDay({ y: 2026, m: 1, d: 1 }, { y: 2026, m: 1, d: 2 })).toBe(false)
  })

  it('orders days chronologically', () => {
    expect(compareDays({ y: 2026, m: 1, d: 1 }, { y: 2026, m: 1, d: 2 })).toBeLessThan(0)
    expect(compareDays({ y: 2026, m: 2, d: 1 }, { y: 2026, m: 1, d: 31 })).toBeGreaterThan(0)
  })
})

describe('ymdKey / parseYmdKey', () => {
  it('round-trips a valid key, zero-padded', () => {
    const day = { y: 2026, m: 3, d: 5 }
    expect(ymdKey(day)).toBe('2026-03-05')
    expect(parseYmdKey('2026-03-05')).toEqual(day)
  })

  it('rejects a malformed or impossible date', () => {
    expect(parseYmdKey('not-a-date')).toBeNull()
    expect(parseYmdKey('2026-02-31')).toBeNull()
    expect(parseYmdKey('2026-13-01')).toBeNull()
  })
})

describe('daysRange', () => {
  it('spans midnight of the first day to midnight after the last, in the given zone', () => {
    const r = daysRange({ y: 2026, m: 9, d: 27 }, { y: 2026, m: 10, d: 3 }, 'Asia/Kolkata')
    expect(r.from.toISOString()).toBe('2026-09-26T18:30:00.000Z')
    expect(r.to.toISOString()).toBe('2026-10-03T18:30:00.000Z')
  })
})

describe('formatting', () => {
  it('formats a time in a given zone with AM/PM', () => {
    expect(formatTime('2026-09-29T04:00:00.000Z', 'Asia/Kolkata')).toBe('9:30 AM')
    expect(formatTime('2026-09-29T04:00:00.000Z', 'UTC')).toBe('4:00 AM')
  })

  it('collapses a same-meridiem range and keeps both for a range crossing noon', () => {
    expect(formatTimeRange('2026-01-01T04:00:00Z', '2026-01-01T04:45:00Z', 'Asia/Kolkata')).toBe('9:30 – 10:15 AM')
    expect(formatTimeRange('2026-01-01T06:00:00Z', '2026-01-01T07:00:00Z', 'Asia/Kolkata')).toBe('11:30 AM – 12:30 PM')
  })

  it('formats a date range label', () => {
    expect(formatRangeLabel({ y: 2026, m: 9, d: 27 }, { y: 2026, m: 10, d: 3 })).toBe('Sep 27 – Oct 3, 2026')
    expect(formatRangeLabel({ y: 2026, m: 9, d: 27 }, { y: 2026, m: 9, d: 27 })).toBe('Sep 27, 2026')
  })
})

describe('zone helpers', () => {
  it('validates real and fake IANA zone names', () => {
    expect(isValidZone('Asia/Kolkata')).toBe(true)
    expect(isValidZone('Nowhere/Fake')).toBe(false)
  })

  it('gives a short label for a known zone', () => {
    expect(shortZoneName('Asia/Kolkata')).toBe('IST')
  })
})
