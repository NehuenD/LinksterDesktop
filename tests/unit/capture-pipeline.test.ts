import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClipboardCapturePipeline } from '../../src/main/services/clipboard/capture-pipeline'

describe('ClipboardCapturePipeline', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('captures a valid URL after the debounce window', () => {
    const onCapture = vi.fn()
    const pipeline = new ClipboardCapturePipeline({ onCapture, debounceMs: 300 })

    pipeline.handle('https://example.com')
    expect(onCapture).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(onCapture).toHaveBeenCalledWith('https://example.com/')
  })

  it('ignores duplicate clipboard content', () => {
    const onCapture = vi.fn()
    const pipeline = new ClipboardCapturePipeline({ onCapture, debounceMs: 300 })

    pipeline.handle('https://example.com')
    pipeline.handle('https://example.com')
    vi.advanceTimersByTime(300)

    expect(onCapture).toHaveBeenCalledTimes(1)
  })

  it('captures only the most recent URL when text changes rapidly', () => {
    const onCapture = vi.fn()
    const pipeline = new ClipboardCapturePipeline({ onCapture, debounceMs: 300 })

    pipeline.handle('https://a.example')
    vi.advanceTimersByTime(100)
    pipeline.handle('https://b.example')
    vi.advanceTimersByTime(300)

    expect(onCapture).toHaveBeenCalledTimes(1)
    expect(onCapture).toHaveBeenCalledWith('https://b.example/')
  })

  it('ignores non-URL text', () => {
    const onCapture = vi.fn()
    const pipeline = new ClipboardCapturePipeline({ onCapture, debounceMs: 300 })

    pipeline.handle('just some words with no link')
    vi.advanceTimersByTime(1000)

    expect(onCapture).not.toHaveBeenCalled()
  })

  it('ignores private hosts', () => {
    const onCapture = vi.fn()
    const pipeline = new ClipboardCapturePipeline({ onCapture, debounceMs: 300 })

    pipeline.handle('http://localhost:3000')
    vi.advanceTimersByTime(1000)

    expect(onCapture).not.toHaveBeenCalled()
  })

  it('does not re-capture a URL once it is accepted into the outbox', async () => {
    const onCapture = vi.fn().mockResolvedValue({ accepted: true, retryable: false })
    const pipeline = new ClipboardCapturePipeline({ onCapture, debounceMs: 300 })

    pipeline.handle('https://example.com')
    await vi.advanceTimersByTimeAsync(300)
    pipeline.handle('https://example.com')
    await vi.advanceTimersByTimeAsync(300)

    expect(onCapture).toHaveBeenCalledTimes(1)
  })

  it('allows retrying a URL after a retryable capture failure', async () => {
    const onCapture = vi.fn().mockResolvedValue({ accepted: false, retryable: true })
    const pipeline = new ClipboardCapturePipeline({ onCapture, debounceMs: 300 })

    pipeline.handle('https://example.com')
    await vi.advanceTimersByTimeAsync(300)
    pipeline.handle('https://example.com')
    await vi.advanceTimersByTimeAsync(300)

    expect(onCapture).toHaveBeenCalledTimes(2)
  })
})
