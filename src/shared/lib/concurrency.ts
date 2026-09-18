/**
 * Maps over `items` running at most `limit` mappers concurrently, preserving
 * input order in the result. Used to generate screenshot thumbnails without
 * decoding hundreds of images at once (or one at a time).
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []

  const results = new Array<R>(items.length)
  const workerCount = Math.max(1, Math.min(Math.floor(limit) || 1, items.length))
  let cursor = 0

  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await mapper(items[index], index)
    }
  })

  await Promise.all(workers)
  return results
}
