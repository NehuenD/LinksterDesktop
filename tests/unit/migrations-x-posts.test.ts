import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readMigration(name: string): string {
  return readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
}

describe('supabase migrations: X posts', () => {
  const sql = readMigration('0008_x_posts.sql')

  it('adds links.kind idempotently, constrained to known kinds', () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.links ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'link'/
    )
    expect(sql).toMatch(/CHECK \(kind IN \('link', 'x-post', 'youtube'\)\)/)
  })

  it('backfills existing X links as x-post', () => {
    expect(sql).toMatch(/UPDATE public\.links\s+SET kind = 'x-post'/)
    expect(sql).toMatch(/status\(es\)\?/)
  })

  it('creates the link_x_posts side table with owner RLS', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.link_x_posts')
    expect(sql).toMatch(/link_id\s+uuid PRIMARY KEY REFERENCES public\.links\(id\) ON DELETE CASCADE/)
    expect(sql).toMatch(/UNIQUE INDEX IF NOT EXISTS uq_link_x_posts_user_tweet/)
    expect(sql).toMatch(/ALTER TABLE public\.link_x_posts ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/CREATE POLICY link_x_posts_owner/)
    expect(sql).toMatch(/user_id = auth\.uid\(\)/)
  })

  it('adds a kind filter to search_links after dropping the previous signature', () => {
    const dropAt = sql.indexOf('DROP FUNCTION IF EXISTS public.search_links')
    const createAt = sql.indexOf('CREATE OR REPLACE FUNCTION public.search_links')
    expect(dropAt).toBeGreaterThanOrEqual(0)
    expect(createAt).toBeGreaterThan(dropAt)
    expect(sql).toMatch(/p_kind\s+text DEFAULT 'link'/)
    expect(sql).toMatch(/l\.kind = p_kind/)
  })

  it('reports the X post count from link_stats without counting them as library links', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.link_stats\(\)/)
    expect(sql).toMatch(/x_posts\s+bigint/)
    expect(sql).toMatch(/WHERE kind = 'link'/)
  })

  it('defines the X list and relation-resolution helpers', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.x_post_list\(/)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.linkster_resolve_x_related_links\(/)
  })

  it('is idempotent so re-running the chain cannot abort later migrations', () => {
    expect(sql).not.toMatch(/\bCREATE FUNCTION public\./)
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema'/)
  })
})
