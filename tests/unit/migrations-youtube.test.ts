import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readMigration(name: string): string {
  return readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
}

describe('supabase migrations: YouTube section', () => {
  const sql = readMigration('0009_youtube_section.sql')

  it('extends the links.kind check to allow youtube idempotently', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS links_kind_check/)
    expect(sql).toMatch(/CHECK \(kind IN \('link', 'x-post', 'youtube'\)\)/)
  })

  it('backfills existing YouTube rows without touching other kinds', () => {
    expect(sql).toMatch(/UPDATE public\.links\s+SET kind = 'youtube'/)
    expect(sql).toMatch(/WHERE kind = 'link'/)
    expect(sql).toMatch(/youtu\\?\.be/)
    expect(sql).toMatch(/shorts/)
  })

  it('exposes the YouTube count from link_stats alongside x_posts', () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.link_stats\(\)/)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.link_stats\(\)/)
    expect(sql).toMatch(/x_posts\s+bigint/)
    expect(sql).toMatch(/youtube\s+bigint/)
    expect(sql).toMatch(/kind = 'youtube'/)
  })

  it('is idempotent and reloads the PostgREST schema cache', () => {
    expect(sql).not.toMatch(/\bCREATE FUNCTION public\./)
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema'/)
  })
})
