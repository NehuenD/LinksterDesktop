import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readMigration(name: string): string {
  return readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
}

describe('supabase migrations: isolated sections repair (0010)', () => {
  const sql = readMigration('0010_isolated_sections_repair.sql')

  it('keeps one guarded kind constraint that accepts every kind', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS links_kind_check/)
    expect(sql).toMatch(/CHECK \(kind IN \('link', 'x-post', 'youtube'\)\)/)
  })

  it('grants the side table to authenticated while RLS keeps rows owner-scoped', () => {
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.link_x_posts TO authenticated/)
  })

  it('backfills missed X shapes and canonicalizes to the handle-free URL without collisions', () => {
    expect(sql).toMatch(/\(web\/\)\?status\(es\)\?/)
    expect(sql).toMatch(/https:\/\/x\.com\/i\/status\//)
    expect(sql).toMatch(/NOT EXISTS/)
  })

  it('un-classifies playlist embeds and backfills the /v/ video shape', () => {
    expect(sql).toMatch(/SET kind = 'link'/)
    expect(sql).toMatch(/videoseries/)
    expect(sql).toMatch(/shorts\|embed\|live\|v/)
  })

  it('canonicalizes YouTube rows to the watch URL', () => {
    expect(sql).toMatch(/https:\/\/www\.youtube\.com\/watch\?v=/)
  })

  it('provides a server-side mark-all-read that accepts a raw search term', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.linkster_mark_all_read\(/)
    expect(sql).toMatch(/p_term/)
    expect(sql).toMatch(/UPDATE public\.links/)
  })

  it('gates search rank on content search and reloads the schema cache', () => {
    expect(sql).toMatch(/CASE\s+WHEN p_include_content THEN ts_rank/)
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema'/)
  })
})
