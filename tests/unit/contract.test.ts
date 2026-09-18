import { describe, expect, it } from 'vitest'
import {
  IPC,
  LinkQuerySchema,
  ThemeModeSchema,
  createPingResponse,
  fail,
  ok
} from '@shared/contract/ipc'

describe('createPingResponse', () => {
  it('returns pong with the supplied timestamp', () => {
    expect(createPingResponse(1234)).toEqual({ pong: true, ts: 1234 })
  })

  it('defaults the timestamp to now', () => {
    const before = Date.now()
    const response = createPingResponse()
    expect(response.pong).toBe(true)
    expect(response.ts).toBeGreaterThanOrEqual(before)
  })
})

describe('IpcResult helpers', () => {
  it('wraps data as success', () => {
    expect(ok({ value: 1 })).toEqual({ ok: true, data: { value: 1 } })
  })

  it('wraps errors as failure', () => {
    expect(fail('E_TEST', 'boom')).toEqual({
      ok: false,
      error: { code: 'E_TEST', message: 'boom' }
    })
  })
})

describe('IPC channel names', () => {
  const channels = Object.values(IPC.system)

  it('are unique', () => {
    expect(new Set(channels).size).toBe(channels.length)
  })

  it('are namespaced', () => {
    for (const channel of channels) {
      expect(channel).toMatch(/^system:[a-z-]+$/)
    }
  })
})

describe('ThemeModeSchema', () => {
  it('accepts known modes', () => {
    expect(ThemeModeSchema.parse('system')).toBe('system')
    expect(ThemeModeSchema.parse('light')).toBe('light')
    expect(ThemeModeSchema.parse('dark')).toBe('dark')
  })

  it('rejects unknown modes', () => {
    expect(() => ThemeModeSchema.parse('blue')).toThrow()
  })
})

describe('LinkQuerySchema kind filter', () => {
  it('accepts every isolated section kind', () => {
    expect(LinkQuerySchema.parse({ kind: 'link' }).kind).toBe('link')
    expect(LinkQuerySchema.parse({ kind: 'x-post' }).kind).toBe('x-post')
    expect(LinkQuerySchema.parse({ kind: 'youtube' }).kind).toBe('youtube')
    expect(LinkQuerySchema.parse({ kind: 'all' }).kind).toBe('all')
    expect(LinkQuerySchema.parse({}).kind).toBeUndefined()
  })

  it('rejects unknown kinds', () => {
    expect(() => LinkQuerySchema.parse({ kind: 'vimeo' })).toThrow()
  })
})
