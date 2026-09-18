import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/auth/supabase', () => ({ supabase: { from: vi.fn() } }))

import {
  DatabaseError,
  bulkInsertLinks,
  type NewLinkRecord
} from '../../src/main/data/link-repository'

function record(url: string): NewLinkRecord {
  return { url, title: null, label: 'General', isRead: false, isArchived: false }
}

describe('bulkInsertLinks', () => {
  it('counts a fully inserted chunk as added', async () => {
    const insertBatch = vi.fn().mockResolvedValue(undefined)
    const result = await bulkInsertLinks([record('a'), record('b'), record('c')], {
      chunkSize: 2,
      insertBatch
    })

    expect(insertBatch).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ processed: 3, added: 3, skipped: 0, failed: 0, cancelled: false })
  })

  it('falls back per-row on a failing chunk, counting duplicate skips and hard failures', async () => {
    const insertBatch = vi.fn(async (records: readonly NewLinkRecord[]) => {
      if (records.length > 1) throw new Error('chunk rejected')
      const url = records[0].url
      if (url === 'dup') throw new DatabaseError('duplicate', '23505')
      if (url === 'bad') throw new Error('boom')
    })

    const result = await bulkInsertLinks([record('ok'), record('dup'), record('bad')], {
      chunkSize: 3,
      insertBatch
    })

    expect(result).toMatchObject({ processed: 3, added: 1, skipped: 1, failed: 1 })
  })

  it('mints a fresh id when a backup id collides with an unrelated row', async () => {
    const insertBatch = vi.fn(async (records: readonly NewLinkRecord[]) => {
      if (records.length > 1) throw new Error('chunk rejected')
      if (records[0].id) {
        throw new DatabaseError(
          'duplicate key value violates unique constraint "links_pkey"',
          '23505'
        )
      }
    })

    const result = await bulkInsertLinks([{ ...record('a'), id: 'taken-id' }], { insertBatch })

    expect(result).toMatchObject({ processed: 1, added: 1, skipped: 0, failed: 0 })
    // 1) chunk attempt, 2) per-row attempt with the id, 3) retry without it.
    expect(insertBatch).toHaveBeenCalledTimes(3)
    expect(insertBatch.mock.calls[2][0][0].id).toBeUndefined()
  })

  it('stops before the next chunk once aborted', async () => {
    const controller = new AbortController()
    const insertBatch = vi.fn(async () => {
      controller.abort()
    })

    const result = await bulkInsertLinks(
      [record('a'), record('b'), record('c'), record('d')],
      { chunkSize: 2, signal: controller.signal, insertBatch }
    )

    expect(insertBatch).toHaveBeenCalledTimes(1)
    expect(result.cancelled).toBe(true)
    expect(result.added).toBe(2)
  })
})
