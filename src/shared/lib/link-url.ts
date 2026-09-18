import type { LinkKind } from '@shared/contract/ipc'
import { parseXPostUrl } from './x-url'
import { parseYouTubeVideoUrl } from './youtube-url'

/** Isolated-link canonicalization: X mirrors and YouTube variants get one stable URL. */
export function canonicalizeLinkUrl(raw: string): string {
  return parseXPostUrl(raw)?.canonicalUrl ?? parseYouTubeVideoUrl(raw)?.canonicalUrl ?? raw
}

/** Classifies a URL into the library or one of the isolated sections. */
export function classifyLinkKind(rawUrl: string): LinkKind {
  if (parseXPostUrl(rawUrl)) return 'x-post'
  if (parseYouTubeVideoUrl(rawUrl)) return 'youtube'
  return 'link'
}
