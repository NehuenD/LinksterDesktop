import type { LabelColors } from '@shared/contract/ipc'
import { isValidLabelColor, withLabelColor } from '@shared/lib/label-color'
import { listLabelColors, setLabelColorRecord } from '../data/label-repository'
import { store } from '../store/store'

function readCache(): LabelColors {
  return store.get('labelColors') ?? {}
}

/**
 * Server colors are authoritative so they sync across devices; the local
 * electron-store copy is a cache/fallback used while offline.
 */
export async function getLabelColors(): Promise<LabelColors> {
  let remote: LabelColors
  try {
    remote = await listLabelColors()
  } catch {
    return readCache()
  }
  // The server response is authoritative: cleared colors are absent from it, so
  // merging with the cache would keep showing a color removed on another device.
  store.set('labelColors', remote)
  return remote
}

export async function setLabelColor(label: string, color: string | null): Promise<LabelColors> {
  if (color !== null && !isValidLabelColor(color)) {
    throw new Error('A label color must be a 6-digit hex value.')
  }
  await setLabelColorRecord(label, color)
  store.set('labelColors', withLabelColor(readCache(), label, color))
  return getLabelColors()
}
