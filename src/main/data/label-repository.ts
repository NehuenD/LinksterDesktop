import { DEFAULT_LABEL } from '@shared/contract/ipc'
import type { LabelColors } from '@shared/lib/label-color'
import { isProtectedLabel, normalizeLabelName } from '@shared/lib/labels'
import { supabase } from '../auth/supabase'
import { dbErrorMessage } from './db-error'

interface LabelRow {
  name: string | null
}

interface LabelColorRow {
  name: string | null
  color: string | null
}

const SECOND_DEFAULT_LABEL = 'News'

async function seedDefaultLabels(): Promise<void> {
  const { error } = await supabase
    .from('labels')
    .insert([{ name: DEFAULT_LABEL }, { name: SECOND_DEFAULT_LABEL }])
  if (error && error.code !== '23505') throw new Error(dbErrorMessage(error))
}

/** Every custom label color for the user, keyed by label name. */
export async function listLabelColors(): Promise<LabelColors> {
  const { data, error } = await supabase
    .from('labels')
    .select('name,color')
    .not('color', 'is', null)
  if (error) throw new Error(dbErrorMessage(error))

  const colors: LabelColors = {}
  for (const row of data as LabelColorRow[]) {
    const name = (row.name ?? '').trim()
    if (name.length > 0 && row.color) colors[name] = row.color
  }
  return colors
}

/** Persists a label color (or clears it with `null`). */
export async function setLabelColorRecord(name: string, color: string | null): Promise<void> {
  const target = normalizeLabelName(name)

  const { data, error } = await supabase
    .from('labels')
    .update({ color })
    .eq('name', target)
    .select('id')
  if (error) throw new Error(dbErrorMessage(error))

  if (!data || data.length === 0) {
    const { error: insertError } = await supabase
      .from('labels')
      .insert({ name: target, color })
    if (insertError && insertError.code !== '23505') throw new Error(dbErrorMessage(insertError))
  }
}

export async function listLabels(): Promise<string[]> {
  const { data, error } = await supabase.from('labels').select('name').order('name')
  if (error) throw new Error(dbErrorMessage(error))

  const names = (data as LabelRow[])
    .map((row) => (row.name ?? '').trim())
    .filter((name) => name.length > 0)

  // Seed only on a brand-new account. Seeding from a read resurrected a "News"
  // label the user had deliberately deleted, on every device that reconciled.
  if (names.length === 0) {
    await seedDefaultLabels()
    return [DEFAULT_LABEL, SECOND_DEFAULT_LABEL].sort((a, b) => a.localeCompare(b))
  }

  if (!names.includes(DEFAULT_LABEL)) names.unshift(DEFAULT_LABEL)
  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
}

export async function createLabel(rawName: string): Promise<string[]> {
  const name = normalizeLabelName(rawName)
  const { error } = await supabase.from('labels').insert({ name })
  if (error && error.code !== '23505') throw new Error(dbErrorMessage(error))
  return listLabels()
}

export async function renameLabel(oldName: string, newName: string): Promise<string[]> {
  if (isProtectedLabel(oldName)) {
    throw new Error('The General label cannot be renamed.')
  }

  const target = normalizeLabelName(newName)
  if (isProtectedLabel(target)) {
    throw new Error('A label cannot be renamed to General.')
  }
  if (target === oldName.trim()) return listLabels()

  const { data: existing } = await supabase
    .from('labels')
    .select('id')
    .eq('name', target)
    .maybeSingle()
  if (existing) return mergeLabels(oldName, target)

  const { error: linkError } = await supabase
    .from('links')
    .update({ label: target })
    .eq('label', oldName)
  if (linkError) throw new Error(dbErrorMessage(linkError))

  const { error } = await supabase.from('labels').update({ name: target }).eq('name', oldName)
  if (error) throw new Error(dbErrorMessage(error))

  return listLabels()
}

export async function mergeLabels(source: string, target: string): Promise<string[]> {
  const from = normalizeLabelName(source)
  const to = normalizeLabelName(target)

  if (isProtectedLabel(from)) {
    throw new Error('The General label cannot be merged away.')
  }
  if (from === to) {
    throw new Error('Choose a different target label.')
  }

  const { error: linkError } = await supabase
    .from('links')
    .update({ label: to })
    .eq('label', from)
  if (linkError) throw new Error(dbErrorMessage(linkError))

  // Preserve the source label's color on the target when the target has none.
  const { data: colorRows } = await supabase
    .from('labels')
    .select('name,color')
    .in('name', [from, to])
  const rows = (colorRows ?? []) as LabelColorRow[]
  const sourceColor = rows.find((row) => row.name === from)?.color ?? null
  const targetColor = rows.find((row) => row.name === to)?.color ?? null
  if (sourceColor && !targetColor) {
    await supabase.from('labels').update({ color: sourceColor }).eq('name', to)
  }

  const { error } = await supabase.from('labels').delete().eq('name', from)
  if (error) throw new Error(dbErrorMessage(error))

  return listLabels()
}

export async function deleteLabel(name: string): Promise<string[]> {
  const target = normalizeLabelName(name)

  if (isProtectedLabel(target)) {
    throw new Error('The General label cannot be deleted.')
  }

  const { error: linkError } = await supabase
    .from('links')
    .update({ label: DEFAULT_LABEL })
    .eq('label', target)
  if (linkError) throw new Error(dbErrorMessage(linkError))

  const { error } = await supabase.from('labels').delete().eq('name', target)
  if (error) throw new Error(dbErrorMessage(error))

  return listLabels()
}
