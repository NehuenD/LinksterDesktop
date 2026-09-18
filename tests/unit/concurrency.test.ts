import { describe, expect, it } from 'vitest'
import { mapLimit } from '@shared/lib/concurrency'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('mapLimit', () => {
  it('preserves input order', async () => {
    const result = await mapLimit([3, 1, 2], 2, async (value) => {
      await delay(value * 5)
      return value * 10
    })
    expect(result).toEqual([30, 10, 20])
  })

  it('never exceeds the concurrency limit', async () => {
    let active = 0
    let peak = 0
    await mapLimit(Array.from({ length: 20 }, (_, index) => index), 3, async (value) => {
      active += 1
      peak = Math.max(peak, active)
      await delay(2)
      active -= 1
      return value
    })
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('handles empty input and a limit larger than the item count', async () => {
    expect(await mapLimit([], 4, async (value) => value)).toEqual([])
    expect(await mapLimit([1, 2], 10, async (value) => value + 1)).toEqual([2, 3])
  })
})
