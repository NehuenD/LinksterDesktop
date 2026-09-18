import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOutboxDrainer } from '../../src/main/services/outbox-drainer'

describe('createOutboxDrainer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('drains once per trigger', async () => {
    const drain = vi.fn().mockResolvedValue(undefined)
    const drainer = createOutboxDrainer({ drain })

    await drainer.trigger()

    expect(drain).toHaveBeenCalledTimes(1)
  })

  it('coalesces concurrent triggers into at most one queued pass', async () => {
    let resolve!: () => void
    const gate = new Promise<void>((done) => {
      resolve = done
    })
    const drain = vi.fn().mockImplementation(() => gate)
    const drainer = createOutboxDrainer({ drain })

    const first = drainer.trigger()
    const second = drainer.trigger()
    const third = drainer.trigger()
    resolve()
    await Promise.all([first, second, third])

    expect(drain).toHaveBeenCalledTimes(2)
  })

  it('drains on an interval while started and stops on stop', async () => {
    const drain = vi.fn().mockResolvedValue(undefined)
    const drainer = createOutboxDrainer({ drain, intervalMs: 1000 })

    drainer.start()
    await vi.advanceTimersByTimeAsync(3000)
    expect(drain).toHaveBeenCalledTimes(3)

    drainer.stop()
    await vi.advanceTimersByTimeAsync(3000)
    expect(drain).toHaveBeenCalledTimes(3)
  })

  it('skips scheduled passes while offline but resumes when back online', async () => {
    const drain = vi.fn().mockResolvedValue(undefined)
    let online = false
    const drainer = createOutboxDrainer({ drain, intervalMs: 1000, canDrain: () => online })

    drainer.start()
    await vi.advanceTimersByTimeAsync(2000)
    expect(drain).not.toHaveBeenCalled()

    online = true
    await vi.advanceTimersByTimeAsync(1000)
    expect(drain).toHaveBeenCalledTimes(1)

    drainer.stop()
  })

  it('honours manual triggers even while offline', async () => {
    const drain = vi.fn().mockResolvedValue(undefined)
    const drainer = createOutboxDrainer({ drain, canDrain: () => false })

    await drainer.trigger()

    expect(drain).toHaveBeenCalledTimes(1)
  })

  it('keeps draining after a failure', async () => {
    const drain = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined)
    const drainer = createOutboxDrainer({ drain })

    await drainer.trigger()
    await drainer.trigger()

    expect(drain).toHaveBeenCalledTimes(2)
  })
})
