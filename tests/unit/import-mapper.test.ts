import { describe, expect, it } from 'vitest'
import {
  detectSource,
  mapBookmarks,
  mapInstapaper,
  mapPocket,
  mapRaindrop,
  mapRaindropJson
} from '../../src/main/services/import-mapper'

describe('mapBookmarks', () => {
  it('uses the nearest folder as the label and drops invalid urls', () => {
    const records = mapBookmarks([
      { title: 'A', url: 'https://example.com/a', folderPath: ['Bar', 'News'] },
      { title: 'Unsafe', url: 'javascript:alert(1)', folderPath: [] }
    ])
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      url: 'https://example.com/a',
      label: 'News',
      source: 'bookmarks-html'
    })
  })
})

describe('mapPocket', () => {
  it('maps tags to the first tag, status to archived, and time_added to createdAt', () => {
    const [record] = mapPocket([
      { title: 'T', url: 'https://example.com', tags: 'tech|news', status: 'archive', time_added: '1700000000' }
    ])
    expect(record).toMatchObject({
      label: 'tech',
      isRead: true,
      isArchived: true,
      createdAt: '2023-11-14T22:13:20.000Z',
      source: 'pocket'
    })
  })

  it('falls back to the default label when there are no tags', () => {
    const [record] = mapPocket([{ title: 'T', url: 'https://example.com' }])
    expect(record.label).toBe('General')
  })

  it('honours a caller-supplied default label', () => {
    const [record] = mapPocket([{ title: 'T', url: 'https://example.com' }], {
      source: 'pocket',
      defaultLabel: 'Later'
    })
    expect(record.label).toBe('Later')
  })
})

describe('mapInstapaper', () => {
  it('maps the folder to the label and timestamp to createdAt', () => {
    const [record] = mapInstapaper([
      { URL: 'https://example.com', Title: 'T', Folder: 'Later', Timestamp: '1700000000' }
    ])
    expect(record).toMatchObject({ label: 'Later', createdAt: '2023-11-14T22:13:20.000Z' })
  })
})

describe('mapRaindrop', () => {
  it('maps folder/or tag and created', () => {
    const [record] = mapRaindrop([
      { title: 'T', url: 'https://example.com', folder: '', tags: 'design,misc', created: '2024-01-02T00:00:00Z' }
    ])
    expect(record).toMatchObject({ label: 'design', createdAt: '2024-01-02T00:00:00.000Z' })
  })

  it('maps JSON items and skips non-link types', () => {
    const records = mapRaindropJson([
      { type: 'link', title: 'A', link: 'https://example.com/a', collection: { title: 'Reading' } },
      { type: 'article', title: 'skip', link: 'https://example.com/skip' }
    ])
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ label: 'Reading', source: 'raindrop' })
  })
})

describe('detectSource', () => {
  it('detects by extension and header sniffing', () => {
    expect(detectSource('bookmarks.html', '')).toBe('bookmarks-html')
    expect(detectSource('pocket.csv', 'title,url,time_added')).toBe('pocket')
    expect(detectSource('Instapaper-Export.csv', 'URL,Title,Selection,Timestamp')).toBe('instapaper')
    expect(detectSource('raindrop.csv', 'title,url,excerpt,highlights')).toBe('raindrop')
    expect(detectSource('linkster-backup-1.json', '')).toBe('linkster-backup')
    expect(detectSource('unknown.csv', 'a,b,c')).toBe('auto')
  })
})
