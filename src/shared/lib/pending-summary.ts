import type { PendingCapture } from '@shared/contract/ipc'
import { classifyLinkKind } from './link-url'

const KIND_LABELS: Record<string, { one: string; many: string }> = {
  'x-post': { one: 'X post', many: 'X posts' },
  youtube: { one: 'video', many: 'videos' },
  link: { one: 'link', many: 'links' }
}

/** Human summary of a failed outbox set, naming each isolated section. */
export function describePendingFailures(
  items: readonly Pick<PendingCapture, 'url'>[]
): string {
  const order: string[] = []
  const counts = new Map<string, number>()

  for (const item of items) {
    const kind = classifyLinkKind(item.url)
    if (!counts.has(kind)) order.push(kind)
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }

  return order
    .map((kind) => {
      const count = counts.get(kind) ?? 0
      const labels = KIND_LABELS[kind] ?? KIND_LABELS.link
      return `${count} ${count === 1 ? labels.one : labels.many}`
    })
    .join(', ')
}
