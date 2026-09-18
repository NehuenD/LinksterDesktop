import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readMigration(name: string): string {
  return readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
}

describe('supabase migrations: 0015 RPC hardening', () => {
  const sql = readMigration('0015_search_rpc_hardening.sql')

  it('defines a shared LIKE escaper and uses it with ESCAPE in every RPC', () => {
    expect(sql).toContain('FUNCTION public.linkster_escape_like')
    expect(sql.match(/ESCAPE '\\'/g)?.length ?? 0).toBeGreaterThanOrEqual(5)
  })

  it('recreates search_links with the YouTube enrichment columns', () => {
    expect(sql).toContain('duration_seconds')
    expect(sql).toContain('channel_url')
    expect(sql).toContain('origin')
    expect(sql).toContain('playlist_id')
  })

  it('only ranks rows whose content actually matches', () => {
    expect(sql).toMatch(/p_include_content AND lc\.content_tsv @@/)
  })

  it('adds a unique tiebreaker to every paged RPC sort', () => {
    expect(sql).toMatch(/l\.created_at DESC,\s*l\.id DESC/)
  })

  it('makes mark-all-read content-aware and owner-scoped', () => {
    expect(sql).toMatch(/p_include_content boolean DEFAULT true/)
    expect(sql).toMatch(/l\.user_id = auth\.uid\(\)/)
  })

  it('publishes link_x_posts and adds its updated_at trigger', () => {
    expect(sql).toMatch(/ADD TABLE public\.link_x_posts/)
    expect(sql).toMatch(/touch_link_x_posts_updated_at/)
  })

  it('reloads the PostgREST schema cache', () => {
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema'/)
  })
})
