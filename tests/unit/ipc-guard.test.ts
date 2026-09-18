import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { handle, fromWebContents } = vi.hoisted(() => ({
  handle: vi.fn(),
  fromWebContents: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle },
  BrowserWindow: { fromWebContents }
}))

import { ok } from '@shared/contract/ipc'
import { isTrustedSender, secureHandle } from '../../src/main/ipc/guard'

type InvokeEvent = Parameters<typeof isTrustedSender>[0]

function eventFor(url: string): InvokeEvent {
  return { sender: { id: 1 }, senderFrame: { url } } as unknown as InvokeEvent
}

const originalDevUrl = process.env['ELECTRON_RENDERER_URL']

beforeEach(() => {
  handle.mockReset()
  fromWebContents.mockReset()
  fromWebContents.mockReturnValue({})
})

afterEach(() => {
  if (originalDevUrl === undefined) delete process.env['ELECTRON_RENDERER_URL']
  else process.env['ELECTRON_RENDERER_URL'] = originalDevUrl
})

describe('isTrustedSender', () => {
  it('accepts a file document in production', () => {
    delete process.env['ELECTRON_RENDERER_URL']
    expect(isTrustedSender(eventFor('file:///app/out/renderer/index.html'))).toBe(true)
  })

  it('accepts the dev origin and rejects others', () => {
    process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173'
    expect(isTrustedSender(eventFor('http://localhost:5173/quick-capture.html'))).toBe(true)
    expect(isTrustedSender(eventFor('https://evil.example/index.html'))).toBe(false)
  })

  it('rejects when the sender has no window', () => {
    delete process.env['ELECTRON_RENDERER_URL']
    fromWebContents.mockReturnValue(null)
    expect(isTrustedSender(eventFor('file:///app/index.html'))).toBe(false)
  })

  it('rejects a non-URL frame', () => {
    delete process.env['ELECTRON_RENDERER_URL']
    expect(isTrustedSender(eventFor('about:blank'))).toBe(false)
  })
})

describe('secureHandle', () => {
  function registered(): (event: InvokeEvent, ...args: unknown[]) => Promise<unknown> {
    const call = handle.mock.calls.at(-1)
    if (!call) throw new Error('no handler registered')
    return call[1]
  }

  it('rejects an untrusted sender before the handler runs', async () => {
    const handler = vi.fn(() => ok('x'))
    secureHandle('test:untrusted', handler)
    fromWebContents.mockReturnValue(null)

    const result = await registered()(eventFor('file:///app/index.html'))
    expect(result).toEqual({
      ok: false,
      error: { code: 'UNTRUSTED_SENDER', message: expect.any(String) }
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns the handler result for a trusted sender', async () => {
    delete process.env['ELECTRON_RENDERER_URL']
    const handler = vi.fn(() => ok(42))
    secureHandle('test:trusted', handler)

    const result = await registered()(eventFor('file:///app/index.html'), 'arg')
    expect(result).toEqual({ ok: true, data: 42 })
    expect(handler).toHaveBeenCalledWith(expect.anything(), 'arg')
  })

  it('converts a thrown handler error into an IpcResult failure', async () => {
    delete process.env['ELECTRON_RENDERER_URL']
    secureHandle('test:boom', () => {
      throw new Error('kaboom')
    })

    const result = await registered()(eventFor('file:///app/index.html'))
    expect(result).toEqual({
      ok: false,
      error: { code: 'IPC_HANDLER_FAILED', message: 'kaboom' }
    })
  })
})
