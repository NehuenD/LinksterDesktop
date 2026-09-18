import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readMigration(name: string): string {
  return readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
}

describe('supabase migrations: X post section query (0012)', () => {
  const sql = readMigration('0012_x_post_filters.sql')

  it('republishes x_post_list with search, filter and sort parameters', () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.x_post_list/)
    expect(sql).toMatch(/p_search/)
    expect(sql).toMatch(/p_filter/)
    expect(sql).toMatch(/p_sort/)
  })

  it('searches tweet text, author name and handle', () => {
    expect(sql).toMatch(/ILIKE/)
    expect(sql).toMatch(/author_name/)
    expect(sql).toMatch(/author_handle/)
    expect(sql).toMatch(/"text"/)
  })

  it('supports unread, archived, has-link and failed filters', () => {
    expect(sql).toMatch(/is_read = false/)
    expect(sql).toMatch(/is_archived = true/)
    expect(sql).toMatch(/related_url IS NOT NULL/)
    expect(sql).toMatch(/capture_status = 'failed'/)
  })

  it('reloads the schema cache', () => {
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema'/)
  })
})
