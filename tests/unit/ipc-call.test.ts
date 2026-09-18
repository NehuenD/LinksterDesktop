import { describe, expect, it } from 'vitest'
import { settleIpc } from '@shared/lib/ipc-call'

describe('settleIpc', () => {
  it('passes a resolved IpcResult through untouched', async () => {
    await expect(settleIpc(async () => ({ ok: true as const, data: 42 }))).resolves.toEqual({
      ok: true,
      data: 42
    })
    await expect(
      settleIpc(async () => ({ ok: false as const, error: { code: 'X', message: 'boom' } }))
    ).resolves.toEqual({ ok: false, error: { code: 'X', message: 'boom' } })
  })

  it('converts a rejected invoke into a failed IpcResult instead of rejecting', async () => {
    await expect(
      settleIpc<never>(async () => {
        throw new Error('No handler registered for links:delete')
      })
    ).resolves.toEqual({
      ok: false,
      error: { code: 'IPC_INVOKE_FAILED', message: 'No handler registered for links:delete' }
    })
  })

  it('stringifies non-Error rejections', async () => {
    await expect(
      settleIpc<never>(async () => {
        throw 'nope'
      })
    ).resolves.toEqual({
      ok: false,
      error: { code: 'IPC_INVOKE_FAILED', message: 'nope' }
    })
  })
})
