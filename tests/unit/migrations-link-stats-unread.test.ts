import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readMigration(name: string): string {
  return readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
}

describe('supabase migrations: per-kind queue counts (0013)', () => {
  const sql = readMigration('0013_section_unread_counts.sql')

  it('republishes link_stats with unread counts per isolated kind', () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.link_stats\(\)/)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.link_stats\(\)/)
    expect(sql).toMatch(/x_posts_unread\s+bigint/)
    expect(sql).toMatch(/youtube_unwatched\s+bigint/)
  })

  it('counts only unread, unarchived rows of each kind', () => {
    expect(sql).toMatch(
      /kind = 'x-post' AND is_read = false AND is_archived = false/
    )
    expect(sql).toMatch(
      /kind = 'youtube' AND is_read = false AND is_archived = false/
    )
  })

  it('keeps library totals scoped to kind = link', () => {
    expect(sql).toMatch(/WHERE kind = 'link'/)
  })

  it('reloads the schema cache', () => {
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema'/)
  })
})
