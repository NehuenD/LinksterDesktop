import { beforeEach, describe, expect, it, vi } from 'vitest'

const { insert, from } = vi.hoisted(() => {
  const insert = vi.fn()
  return { insert, from: vi.fn(() => ({ insert })) }
})

vi.mock('../../src/main/auth/supabase', () => ({
  supabase: { from }
}))

import { restoreLinks } from '../../src/main/data/link-repository'

const snapshot = {
  id: '0d1f5b1e-2b1a-4c3d-8e4f-5a6b7c8d9e0f',
  url: 'https://example.com/post',
  title: 'Post',
  description: null,
  thumbnailUrl: null,
  author: null,
  siteName: null,
  label: 'General',
  note: 'keep me',
  isRead: true,
  isArchived: true,
  createdAt: '2020-01-01T00:00:00.000Z',
  updatedAt: '2020-02-01T00:00:00.000Z'
}

describe('restoreLinks', () => {
  beforeEach(() => {
    from.mockClear()
    insert.mockReset()
  })

  it('re-inserts with the original id, timestamps and read/archive state', async () => {
    insert.mockResolvedValue({ error: null })

    const result = await restoreLinks([snapshot])

    expect(result).toEqual({ requested: 1, restored: 1, skipped: 0, failed: 0 })
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({
        id: snapshot.id,
        url: snapshot.url,
        label: 'General',
        note: 'keep me',
        is_read: true,
        is_archived: true,
        created_at: snapshot.createdAt,
        updated_at: snapshot.updatedAt
      })
    ])
  })

  it('reports a unique-url conflict as skipped instead of failed', async () => {
    insert.mockResolvedValue({ error: { message: 'duplicate key', code: '23505' } })

    const result = await restoreLinks([snapshot])

    expect(result).toEqual({ requested: 1, restored: 0, skipped: 1, failed: 0 })
  })
})
