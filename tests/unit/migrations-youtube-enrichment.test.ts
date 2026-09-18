import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readMigration(name: string): string {
  return readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
}

describe('supabase migrations: YouTube enrichment (0014)', () => {
  const sql = readMigration('0014_youtube_enrichment.sql')

  it('adds the duration, channel, origin and playlist columns idempotently', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS duration_seconds int/)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS channel_url text/)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS origin text/)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS playlist_id text/)
  })

  it('reloads the schema cache', () => {
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema'/)
  })
})
