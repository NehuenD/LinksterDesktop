import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, clipboard } from 'electron'
import type { ExportFormat, ExportResult } from '@shared/contract/ipc'
import { listLinks } from '../data/link-repository'
import { linksToCsv, linksToJson, linksToText } from './export-format'

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

export async function exportLinks(format: ExportFormat): Promise<ExportResult> {
  const links = await listLinks({})
  const directory = join(app.getPath('documents'), 'Linkster')
  await mkdir(directory, { recursive: true })

  const path = join(directory, `linkster-links-${timestamp()}.${format}`)
  const content = format === 'csv' ? linksToCsv(links) : linksToJson(links)
  await writeFile(path, content, 'utf8')

  return { path, count: links.length }
}

export async function copyAllLinks(): Promise<number> {
  const links = await listLinks({})
  await clipboard.writeText(linksToText(links))
  return links.length
}
