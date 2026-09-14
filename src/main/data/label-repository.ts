import { DEFAULT_LABEL } from '@shared/contract/ipc'
import { supabase } from '../auth/supabase'

interface LabelRow {
  name: string | null
}

export async function listLabels(): Promise<string[]> {
  const { data, error } = await supabase.from('labels').select('name').order('name')
  if (error) throw new Error(error.message)

  const names = (data as LabelRow[])
    .map((row) => (row.name ?? '').trim())
    .filter((name) => name.length > 0)

  if (!names.includes(DEFAULT_LABEL)) {
    names.unshift(DEFAULT_LABEL)
  }

  return [...new Set(names)]
}
