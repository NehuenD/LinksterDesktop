import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPollingWatcher } from '../../src/main/services/clipboard/watcher'

describe('createPollingWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits only when the clipboard content changes', async () => {
    let value = 'a'
    const onChange = vi.fn()
    const watcher = createPollingWatcher({
      readText: () => value,
      onChange,
      intervalMs: 1000
    })

    watcher.start()
    expect(watcher.isRunning()).toBe(true)

    await vi.advanceTimersByTimeAsync(1000)
    expect(onChange).toHaveBeenCalledWith('a')

    await vi.advanceTimersByTimeAsync(1000)
    expect(onChange).toHaveBeenCalledTimes(1)

    value = 'b'
    await vi.advanceTimersByTimeAsync(1000)
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith('b')

    watcher.stop()
    expect(watcher.isRunning()).toBe(false)

    await vi.advanceTimersByTimeAsync(3000)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('supports an async clipboard reader', async () => {
    const onChange = vi.fn()
    const watcher = createPollingWatcher({
      readText: async () => 'https://example.com',
      onChange,
      intervalMs: 1000
    })

    watcher.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(onChange).toHaveBeenCalledWith('https://example.com')

    watcher.stop()
  })

  it('does not emit empty clipboard content', async () => {
    const onChange = vi.fn()
    const watcher = createPollingWatcher({
      readText: () => '',
      onChange,
      intervalMs: 1000
    })

    watcher.start()
    await vi.advanceTimersByTimeAsync(3000)
    expect(onChange).not.toHaveBeenCalled()

    watcher.stop()
  })
})
