import { describe, expect, it } from 'vitest'
import { isProtectedLabel, normalizeLabelName } from '@shared/lib/labels'

describe('isProtectedLabel', () => {
  it('protects General case-insensitively', () => {
    expect(isProtectedLabel('General')).toBe(true)
    expect(isProtectedLabel('general')).toBe(true)
    expect(isProtectedLabel('  GENERAL ')).toBe(true)
  })

  it('does not protect other labels', () => {
    expect(isProtectedLabel('News')).toBe(false)
    expect(isProtectedLabel('Generally')).toBe(false)
  })
})

describe('normalizeLabelName', () => {
  it('trims valid names', () => {
    expect(normalizeLabelName('  Work  ')).toBe('Work')
  })

  it('rejects blank names', () => {
    expect(() => normalizeLabelName('   ')).toThrow()
  })
})
