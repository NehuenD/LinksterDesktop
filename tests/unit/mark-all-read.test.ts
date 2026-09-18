import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../../src/main/auth/supabase', () => ({
  supabase: { rpc, from: vi.fn() }
}))

import { markAllRead } from '../../src/main/data/link-repository'

describe('markAllRead kind scoping', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('scopes a section mark-all to the isolated kind and the active filter', async () => {
    rpc.mockResolvedValue({ data: 4, error: null })

    const result = await markAllRead({ kind: 'youtube', filter: 'unread' })

    expect(rpc).toHaveBeenCalledWith(
      'linkster_mark_all_read',
      expect.objectContaining({ p_kind: 'youtube', p_filter: 'unread' })
    )
    expect(result).toEqual({ updated: 4 })
  })

  it('defaults to library links so isolated kinds are never touched', async () => {
    rpc.mockResolvedValue({ data: 2, error: null })

    await markAllRead()

    expect(rpc).toHaveBeenCalledWith(
      'linkster_mark_all_read',
      expect.objectContaining({ p_kind: 'link', p_filter: 'all' })
    )
  })
})
