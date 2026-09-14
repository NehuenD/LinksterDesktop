import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createChangeCoalescer } from '../../src/main/services/change-coalescer'

describe('createChangeCoalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('collapses a burst into a single flush', () => {
    const onFlush = vi.fn()
    const coalescer = createChangeCoalescer(onFlush, 250)

    coalescer.schedule()
    coalescer.schedule()
    coalescer.schedule()
    expect(onFlush).not.toHaveBeenCalled()

    vi.advanceTimersByTime(250)
    expect(onFlush).toHaveBeenCalledTimes(1)
  })

  it('flushes immediately when asked', () => {
    const onFlush = vi.fn()
    const coalescer = createChangeCoalescer(onFlush, 250)

    coalescer.schedule()
    coalescer.flush()
    expect(onFlush).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(250)
    expect(onFlush).toHaveBeenCalledTimes(1)
  })

  it('drops pending flushes when disposed', () => {
    const onFlush = vi.fn()
    const coalescer = createChangeCoalescer(onFlush, 250)

    coalescer.schedule()
    coalescer.dispose()
    vi.advanceTimersByTime(1000)

    expect(onFlush).not.toHaveBeenCalled()
  })
})
