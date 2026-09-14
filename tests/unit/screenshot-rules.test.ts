import { describe, expect, it } from 'vitest'
import {
  isImageFile,
  isScreenshotName,
  sortNewestFirst
} from '../../src/main/services/screenshot-rules'

describe('isImageFile', () => {
  it('accepts common image extensions case-insensitively', () => {
    expect(isImageFile('a.PNG')).toBe(true)
    expect(isImageFile('a.jpeg')).toBe(true)
    expect(isImageFile('a.webp')).toBe(true)
    expect(isImageFile('a.txt')).toBe(false)
  })
})

describe('isScreenshotName', () => {
  it('requires an image extension', () => {
    expect(isScreenshotName('notes.txt', true)).toBe(false)
  })

  it('matches OS screenshot naming by default', () => {
    expect(isScreenshotName('Screenshot 2026-01-01.png', false)).toBe(true)
    expect(isScreenshotName('Screen Shot 2026-01-01.png', false)).toBe(true)
    expect(isScreenshotName('holiday.png', false)).toBe(false)
  })

  it('accepts every image when the folder is a manual override', () => {
    expect(isScreenshotName('holiday.png', true)).toBe(true)
  })
})

describe('sortNewestFirst', () => {
  it('orders by capturedAt descending', () => {
    const sorted = sortNewestFirst([
      { capturedAt: '2026-01-01T00:00:00.000Z' },
      { capturedAt: '2026-02-01T00:00:00.000Z' },
      { capturedAt: '2025-12-01T00:00:00.000Z' }
    ])
    expect(sorted.map((item) => item.capturedAt)).toEqual([
      '2026-02-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
      '2025-12-01T00:00:00.000Z'
    ])
  })
})
