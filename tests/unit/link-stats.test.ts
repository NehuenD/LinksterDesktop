import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../../src/main/auth/supabase', () => ({
  supabase: { rpc, from: vi.fn() }
}))

import { getLinkStats } from '../../src/main/data/link-repository'

describe('getLinkStats', () => {
  beforeEach(() => rpc.mockReset())

  it('maps the link_stats rpc row without fetching rows', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          total: 3,
          unread: 2,
          archived: 1,
          by_label: { General: 2, News: 1 },
          x_posts: 4,
          youtube: 2,
          x_posts_unread: 3,
          youtube_unwatched: 1
        }
      ],
      error: null
    })

    await expect(getLinkStats()).resolves.toEqual({
      total: 3,
      unread: 2,
      archived: 1,
      byLabel: { General: 2, News: 1 },
      xPosts: 4,
      youtube: 2,
      xPostsUnread: 3,
      youtubeUnwatched: 1
    })
    expect(rpc).toHaveBeenCalledWith('link_stats')
  })

  it('coerces bigint counts returned as strings', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          total: '12000',
          unread: '40',
          archived: '3',
          by_label: null,
          x_posts: '7',
          youtube: '9',
          x_posts_unread: '5',
          youtube_unwatched: '6'
        }
      ],
      error: null
    })
    await expect(getLinkStats()).resolves.toEqual({
      total: 12000,
      unread: 40,
      archived: 3,
      byLabel: {},
      xPosts: 7,
      youtube: 9,
      xPostsUnread: 5,
      youtubeUnwatched: 6
    })
  })

  it('returns empty stats when the rpc yields no row', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    await expect(getLinkStats()).resolves.toEqual({
      total: 0,
      unread: 0,
      archived: 0,
      byLabel: {},
      xPosts: 0,
      youtube: 0,
      xPostsUnread: 0,
      youtubeUnwatched: 0
    })
  })

  it('throws when the rpc errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(getLinkStats()).rejects.toThrow('boom')
  })
})
