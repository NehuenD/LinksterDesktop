import { DEFAULT_LABEL } from '@shared/contract/ipc'
import { isProtectedLabel, normalizeLabelName } from '@shared/lib/labels'
import { supabase } from '../auth/supabase'

interface LabelRow {
  name: string | null
}

const SECOND_DEFAULT_LABEL = 'News'

async function seedDefaultLabels(): Promise<void> {
  const { error } = await supabase
    .from('labels')
    .insert([{ name: DEFAULT_LABEL }, { name: SECOND_DEFAULT_LABEL }])
  if (error && error.code !== '23505') throw new Error(error.message)
}

export async function listLabels(): Promise<string[]> {
  const { data, error } = await supabase.from('labels').select('name').order('name')
  if (error) throw new Error(error.message)

  const names = (data as LabelRow[])
    .map((row) => (row.name ?? '').trim())
    .filter((name) => name.length > 0)

  if (names.length === 0) {
    await seedDefaultLabels()
    return [DEFAULT_LABEL, SECOND_DEFAULT_LABEL]
  }

  if (!names.includes(DEFAULT_LABEL)) names.unshift(DEFAULT_LABEL)
  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
}

export async function createLabel(rawName: string): Promise<string[]> {
  const name = normalizeLabelName(rawName)
  const { error } = await supabase.from('labels').insert({ name })
  if (error && error.code !== '23505') throw new Error(error.message)
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
  if (linkError) throw new Error(linkError.message)

  const { error } = await supabase.from('labels').update({ name: target }).eq('name', oldName)
  if (error) throw new Error(error.message)

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
  if (linkError) throw new Error(linkError.message)

  const { error } = await supabase.from('labels').delete().eq('name', from)
  if (error) throw new Error(error.message)

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
  if (linkError) throw new Error(linkError.message)

  const { error } = await supabase.from('labels').delete().eq('name', target)
  if (error) throw new Error(error.message)

  return listLabels()
}
