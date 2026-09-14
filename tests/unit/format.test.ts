import { describe, expect, it } from 'vitest'
import { domainOf, formatRelativeTime } from '@shared/lib/format'

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
