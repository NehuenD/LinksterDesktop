import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../../src/main/auth/supabase', () => ({
  supabase: { rpc, from: vi.fn() }
}))

import { listLinks } from '../../src/main/data/link-repository'

describe('listLinks full-text search', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('routes a search query to the search_links rpc', async () => {
    rpc.mockResolvedValue({ data: [], error: null })

    await listLinks({
      search: 'quantum',
      filter: 'all',
      searchContent: false,
      limit: 10,
      offset: 20
    })

    expect(rpc).toHaveBeenCalledWith(
      'search_links',
      expect.objectContaining({
        p_term: 'quantum',
        p_include_content: false,
        p_limit: 10,
        p_offset: 20
      })
    )
  })

  it('defaults content search on when the flag is omitted', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    await listLinks({ search: 'quantum' })
    expect(rpc).toHaveBeenCalledWith(
      'search_links',
      expect.objectContaining({ p_include_content: true })
    )
  })

  it('defaults the sort to newest and forwards an explicit sort', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    await listLinks({ search: 'quantum' })
    expect(rpc).toHaveBeenCalledWith(
      'search_links',
      expect.objectContaining({ p_sort: 'newest' })
    )

    rpc.mockClear()
    await listLinks({ search: 'quantum', sort: 'title' })
    expect(rpc).toHaveBeenCalledWith('search_links', expect.objectContaining({ p_sort: 'title' }))
  })

  it('scopes search to the library kind by default and forwards an explicit kind', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    await listLinks({ search: 'quantum' })
    expect(rpc).toHaveBeenCalledWith(
      'search_links',
      expect.objectContaining({ p_kind: 'link' })
    )

    rpc.mockClear()
    await listLinks({ search: 'quantum', kind: 'x-post' })
    expect(rpc).toHaveBeenCalledWith(
      'search_links',
      expect.objectContaining({ p_kind: 'x-post' })
    )

    rpc.mockClear()
    await listLinks({ search: 'quantum', kind: 'all' })
    expect(rpc).toHaveBeenCalledWith('search_links', expect.objectContaining({ p_kind: 'all' }))
  })

  it('throws when the rpc returns an error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(listLinks({ search: 'x' })).rejects.toThrow('boom')
  })
})
