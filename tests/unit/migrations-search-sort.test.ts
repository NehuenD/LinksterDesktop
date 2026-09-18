import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readMigration(name: string): string {
  return readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
}

describe('supabase migrations: search sort', () => {
  const sql = readMigration('0006_search_sort.sql')

  it('drops the previous RPC signature before recreating it', () => {
    const dropAt = sql.indexOf('DROP FUNCTION IF EXISTS public.search_links')
    const createAt = sql.indexOf('CREATE OR REPLACE FUNCTION public.search_links')
    expect(dropAt).toBeGreaterThanOrEqual(0)
    expect(createAt).toBeGreaterThan(dropAt)
  })

  it('is idempotent so re-running the chain cannot abort before later migrations', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.search_links')
    // A bare CREATE FUNCTION errors ("already exists") on a second run.
    expect(sql).not.toMatch(/\bCREATE FUNCTION public\.search_links/)
  })

  it('accepts a sort parameter', () => {
    expect(sql).toMatch(/p_sort\s+text DEFAULT 'newest'/)
  })

  it('orders by the requested sort while keeping relevance first', () => {
    expect(sql).toMatch(/rank DESC NULLS LAST/)
    expect(sql).toMatch(/CASE p_sort WHEN 'title'/)
    expect(sql).toMatch(/CASE p_sort WHEN 'domain'/)
    expect(sql).toMatch(/CASE p_sort WHEN 'oldest'/)
  })
})

describe('supabase migrations: PostgREST schema cache', () => {
  it('reloads the schema cache after redefining the search RPC', () => {
    expect(readMigration('0006_search_sort.sql')).toMatch(/NOTIFY pgrst, 'reload schema'/)
  })

  it('reloads the schema cache after defining link_stats', () => {
    expect(readMigration('0007_stats_and_label_color.sql')).toMatch(
      /NOTIFY pgrst, 'reload schema'/
    )
  })
})
