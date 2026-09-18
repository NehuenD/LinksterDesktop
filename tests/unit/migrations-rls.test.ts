import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readMigration(name: string): string {
  return readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
}

// AC1 of the security hardening pass: per-user isolation must be reproducible
// from the in-repo migrations, not left to out-of-repo SQL.
describe('supabase migrations: row level security', () => {
  const sql = readMigration('0005_rls.sql')

  it('enables RLS on both user-owned tables', () => {
    expect(sql).toMatch(/ALTER TABLE public\.links ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/ALTER TABLE public\.labels ENABLE ROW LEVEL SECURITY/)
  })

  it('scopes every verb on links to auth.uid()', () => {
    for (const verb of ['select', 'insert', 'update', 'delete']) {
      expect(sql).toMatch(new RegExp(`POLICY links_owner_${verb} ON public\\.links`, 'i'))
    }
    expect(sql).toMatch(/links_owner_select[\s\S]*?user_id = auth\.uid\(\)/)
  })

  it('scopes every verb on labels to auth.uid()', () => {
    for (const verb of ['select', 'insert', 'update', 'delete']) {
      expect(sql).toMatch(new RegExp(`POLICY labels_owner_${verb} ON public\\.labels`, 'i'))
    }
    expect(sql).toMatch(/labels_owner_select[\s\S]*?user_id = auth\.uid\(\)/)
  })

  it('enforces unique label names per user', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_labels_user_name/)
    expect(sql).toMatch(/uq_labels_user_name\s*\n?\s*ON public\.labels \(user_id, name\)/)
  })
})

describe('supabase migrations: baseline', () => {
  const baseline = readMigration('0000_baseline.sql')

  it('documents the base tables so the chain applies to a fresh project', () => {
    expect(baseline).toMatch(/CREATE TABLE IF NOT EXISTS public\.links/)
    expect(baseline).toMatch(/CREATE TABLE IF NOT EXISTS public\.labels/)
  })
})
