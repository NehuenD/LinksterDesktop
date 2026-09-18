import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readMigration(name: string): string {
  return readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
}

describe('supabase migrations: X post archive state (0011)', () => {
  const sql = readMigration('0011_x_post_archive.sql')

  it('republishes x_post_list with the archived flag in the result set', () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.x_post_list/)
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.x_post_list\(/)
    expect(sql).toMatch(/is_archived\s+boolean/)
    expect(sql).toMatch(/l\.is_archived/)
  })

  it('reloads the schema cache', () => {
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema'/)
  })
})
