import { describe, expect, it } from 'vitest'
import { domainOf, formatDuration, formatRelativeTime, formatShortDate } from '@shared/lib/format'

const now = Date.parse('2026-01-01T12:00:00.000Z')

describe('formatRelativeTime', () => {
  it('collapses very recent times to "just now"', () => {
    expect(formatRelativeTime('2026-01-01T11:59:40.000Z', now)).toBe('just now')
  })

  it('formats minutes, hours and days', () => {
    expect(formatRelativeTime('2026-01-01T11:55:00.000Z', now)).toBe('5m ago')
    expect(formatRelativeTime('2026-01-01T09:00:00.000Z', now)).toBe('3h ago')
    expect(formatRelativeTime('2025-12-30T12:00:00.000Z', now)).toBe('2d ago')
  })

  it('returns an empty string for invalid input', () => {
    expect(formatRelativeTime('nope', now)).toBe('')
  })
})

describe('domainOf', () => {
  it('strips the www prefix', () => {
    expect(domainOf('https://www.example.com/x')).toBe('example.com')
  })

  it('falls back to the raw value for invalid URLs', () => {
    expect(domainOf('nope')).toBe('nope')
  })
})

describe('formatShortDate', () => {
  it('renders an absolute short date', () => {
    expect(formatShortDate('2006-03-21T00:00:00.000Z')).toBe('Mar 21, 2006')
  })

  it('returns an empty string for invalid input', () => {
    expect(formatShortDate('nope')).toBe('')
  })
})

describe('formatDuration', () => {
  it('formats seconds as m:ss and h:mm:ss', () => {
    expect(formatDuration(253)).toBe('4:13')
    expect(formatDuration(59)).toBe('0:59')
    expect(formatDuration(3725)).toBe('1:02:05')
  })

  it('returns null for missing or non-positive durations', () => {
    expect(formatDuration(null)).toBeNull()
    expect(formatDuration(undefined)).toBeNull()
    expect(formatDuration(0)).toBeNull()
  })
})
