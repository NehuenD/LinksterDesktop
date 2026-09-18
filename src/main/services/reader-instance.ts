import { join } from 'node:path'
import { app } from 'electron'
import { createFileContentCache } from '../data/content-cache'
import { getLinkById, getLinkContent as getLinkContentRow } from '../data/link-repository'
import { createReaderService } from './reader-service'

/** Production reader service: Supabase-backed content with a file cache for offline. */
export const readerService = createReaderService({
  getLink: getLinkById,
  getContentRow: getLinkContentRow,
  cache: createFileContentCache(join(app.getPath('userData'), 'reader-content'))
})
