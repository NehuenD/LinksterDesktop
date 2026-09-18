import type { Link } from '@shared/contract/ipc'

export interface DirtyLinkFields {
  fields: Array<keyof Link>
  at: number
}

export interface MergeResult {
  link: Link
  /** Remote changed a locally-edited field after the edit; keep local and flag. */
  conflict: boolean
  /** At least one dirty field was preserved over the remote value. */
  reapplied: boolean
}

export interface MergeLinksResult {
  links: Link[]
  conflicts: string[]
}

function timestampOf(link: Link): number {
  const value = link.updatedAt ?? link.createdAt
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function assignField<K extends keyof Link>(target: Link, source: Link, field: K): void {
  target[field] = source[field]
}

/**
 * Non-destructive reconciliation: remote wins for untouched fields, but a
 * locally-edited field is preserved (and badged on ambiguity) instead of being
 * silently truncated by a stale server snapshot.
 */
export function mergeLink(local: Link, remote: Link, dirty?: DirtyLinkFields): MergeResult {
  if (!dirty || dirty.fields.length === 0) {
    return { link: remote, conflict: false, reapplied: false }
  }

  const merged: Link = { ...remote }
  const remoteTime = timestampOf(remote)
  let conflict = false
  let reapplied = false

  for (const field of dirty.fields) {
    if (local[field] === remote[field]) continue
    assignField(merged, local, field)
    reapplied = true
    if (remoteTime > dirty.at) conflict = true
  }

  return { link: merged, conflict, reapplied }
}

export function mergeLinks(
  local: readonly Link[],
  remote: readonly Link[],
  dirty: ReadonlyMap<string, DirtyLinkFields>
): MergeLinksResult {
  const localById = new Map(local.map((link) => [link.id, link]))
  const conflicts: string[] = []

  const links = remote.map((row) => {
    const existing = localById.get(row.id)
    if (!existing) return row

    const result = mergeLink(existing, row, dirty.get(row.id))
    if (result.conflict) conflicts.push(row.id)
    return result.link
  })

  return { links, conflicts }
}
