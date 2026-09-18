import { describe, expect, it } from 'vitest'
import {
  LABEL_COLOR_NAMES,
  LABEL_PALETTE,
  autoColor,
  isValidLabelColor,
  labelColor,
  withLabelColor,
  withLabelMerged,
  withLabelRenamed,
  withoutLabelColor
} from '@shared/lib/label-color'

describe('autoColor', () => {
  it('is deterministic for the same label', () => {
    expect(autoColor('General')).toBe(autoColor('General'))
  })

  it('always returns a palette color', () => {
    for (const label of ['News', '', 'Work', 'a very long label name']) {
      expect(LABEL_PALETTE).toContain(autoColor(label))
    }
  })
})

describe('labelColor', () => {
  it('matches autoColor when no custom color is set', () => {
    expect(labelColor('News')).toBe(autoColor('News'))
  })

  it('is deterministic for the same label', () => {
    expect(labelColor('General')).toBe(labelColor('General'))
  })

  it('returns a hex color', () => {
    expect(labelColor('News')).toMatch(/^#[0-9A-F]{6}$/i)
  })

  it('handles an empty label', () => {
    expect(labelColor('')).toMatch(/^#[0-9A-F]{6}$/i)
  })

  it('prefers a custom color when one is provided', () => {
    expect(labelColor('News', { News: '#123456' })).toBe('#123456')
  })

  it('falls back to the hash color for labels without a custom color', () => {
    expect(labelColor('News', { Other: '#123456' })).toBe(labelColor('News'))
  })
})

describe('isValidLabelColor', () => {
  it('accepts a 6-digit hex color', () => {
    expect(isValidLabelColor('#10B981')).toBe(true)
    expect(isValidLabelColor('#abcdef')).toBe(true)
  })

  it('rejects malformed values', () => {
    expect(isValidLabelColor('red')).toBe(false)
    expect(isValidLabelColor('#12345')).toBe(false)
    expect(isValidLabelColor(null)).toBe(false)
    expect(isValidLabelColor(123)).toBe(false)
  })
})

describe('LABEL_PALETTE', () => {
  it('contains only valid hex colors', () => {
    expect(LABEL_PALETTE.length).toBeGreaterThan(0)
    for (const color of LABEL_PALETTE) {
      expect(isValidLabelColor(color)).toBe(true)
    }
  })
})

describe('LABEL_COLOR_NAMES', () => {
  it('names every palette color', () => {
    for (const color of LABEL_PALETTE) {
      expect(LABEL_COLOR_NAMES[color]).toBeTruthy()
    }
  })
})

describe('withLabelColor', () => {
  it('sets a color without mutating the input', () => {
    const colors = { News: '#111111' }
    const next = withLabelColor(colors, 'Work', '#10B981')
    expect(next).toEqual({ News: '#111111', Work: '#10B981' })
    expect(colors).toEqual({ News: '#111111' })
  })

  it('removes a color when passed null', () => {
    expect(withLabelColor({ Work: '#10B981' }, 'Work', null)).toEqual({})
  })
})

describe('withoutLabelColor', () => {
  it('drops a label color', () => {
    expect(withoutLabelColor({ Work: '#10B981', News: '#123456' }, 'Work')).toEqual({
      News: '#123456'
    })
  })

  it('returns the same reference when nothing changes', () => {
    const colors = { Work: '#10B981' }
    expect(withoutLabelColor(colors, 'Missing')).toBe(colors)
  })
})

describe('withLabelRenamed', () => {
  it('moves the color to the new name', () => {
    expect(withLabelRenamed({ Old: '#10B981' }, 'Old', 'New')).toEqual({ New: '#10B981' })
  })

  it('keeps the target color when the new name already has one', () => {
    expect(withLabelRenamed({ Old: '#111111', New: '#222222' }, 'Old', 'New')).toEqual({
      New: '#222222'
    })
  })

  it('does nothing when the old name has no color', () => {
    const colors = { New: '#222222' }
    expect(withLabelRenamed(colors, 'Old', 'New')).toBe(colors)
  })
})

describe('withLabelMerged', () => {
  it('adopts the source color when the target has none', () => {
    expect(withLabelMerged({ Source: '#10B981' }, 'Source', 'Target')).toEqual({
      Target: '#10B981'
    })
  })

  it('keeps the target color when both have one', () => {
    expect(withLabelMerged({ Source: '#111111', Target: '#222222' }, 'Source', 'Target')).toEqual({
      Target: '#222222'
    })
  })

  it('does nothing when the source has no color', () => {
    const colors = { Target: '#222222' }
    expect(withLabelMerged(colors, 'Source', 'Target')).toBe(colors)
  })
})
