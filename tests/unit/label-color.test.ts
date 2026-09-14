import { describe, expect, it } from 'vitest'
import { labelColor } from '@shared/lib/label-color'

describe('labelColor', () => {
  it('is deterministic for the same label', () => {
    expect(labelColor('General')).toBe(labelColor('General'))
  })

  it('returns a hex color', () => {
    expect(labelColor('News')).toMatch(/^#[0-9A-F]{6}$/i)
  })

  it('handles an empty label', () => {
    expect(labelColor('')).toMatch(/^#[0-9A-F]{6}$/i)
  })
})
