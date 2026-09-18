import type { Link } from '@shared/contract/ipc'

type MetadataFields = Pick<
  Link,
  | 'title'
  | 'description'
  | 'thumbnailUrl'
  | 'author'
  | 'siteName'
  | 'durationSeconds'
  | 'channelUrl'
>

/** Whether a metadata refresh actually discovered something new. */
export function hasMetadataChanges(before: MetadataFields, after: MetadataFields): boolean {
  return (
    before.title !== after.title ||
    before.description !== after.description ||
    before.thumbnailUrl !== after.thumbnailUrl ||
    before.author !== after.author ||
    before.siteName !== after.siteName ||
    (before.durationSeconds ?? null) !== (after.durationSeconds ?? null) ||
    (before.channelUrl ?? null) !== (after.channelUrl ?? null)
  )
}
