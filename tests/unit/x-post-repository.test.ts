import { beforeEach, describe, expect, it, vi } from 'vitest'

const CLOUDFLARE_522 =
  '<!DOCTYPE html><html class="no-js" lang="en-US"><head><title>supabase.co | 522: Connection timed out</title></head><body><p>Error code 522</p></body></html>'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../../src/main/auth/supabase', () => ({
  supabase: { rpc, from: vi.fn() }
}))

import { listXPosts, resolveXRelatedLinks } from '../../src/main/data/x-post-repository'

describe('listXPosts', () => {
  beforeEach(() => rpc.mockReset())

  it('forwards pagination and the section query to the x_post_list rpc', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    await listXPosts(50, { offset: 10, search: 'quantum', filter: 'failed', sort: 'author' })
    expect(rpc).toHaveBeenCalledWith('x_post_list', {
      p_limit: 50,
      p_offset: 10,
      p_search: 'quantum',
      p_filter: 'failed',
      p_sort: 'author'
    })
  })

  it('defaults to the unfiltered newest view', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    await listXPosts()
    expect(rpc).toHaveBeenCalledWith('x_post_list', {
      p_limit: 100,
      p_offset: 0,
      p_search: null,
      p_filter: 'all',
      p_sort: 'newest'
    })
  })

  it('collapses an HTML gateway error into a short message', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: CLOUDFLARE_522 } })
    await expect(listXPosts()).rejects.toThrow(
      'Server request failed: supabase.co | 522: Connection timed out'
    )
  })

  it('throws the database message for a normal PostgREST error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied for table links' } })
    await expect(listXPosts()).rejects.toThrow('permission denied for table links')
  })
})

describe('resolveXRelatedLinks', () => {
  beforeEach(() => rpc.mockReset())

  it('returns the resolved count', async () => {
    rpc.mockResolvedValue({ data: 2, error: null })
    await expect(resolveXRelatedLinks()).resolves.toBe(2)
    expect(rpc).toHaveBeenCalledWith('linkster_resolve_x_related_links')
  })
})
