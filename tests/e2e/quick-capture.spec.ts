import { _electron as electron, expect, test, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '../..')

test('pre-warms a hidden quick-capture overlay that renders', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'linkster-e2e-'))
  const args = [appRoot]
  if (process.platform === 'linux') args.push('--no-sandbox')

  const app = await electron.launch({
    args,
    env: { ...process.env, LINKSTER_USER_DATA_DIR: userDataDir }
  })

  try {
    await app.firstWindow()

    const findOverlay = (): Page | undefined =>
      app.windows().find((candidate) => candidate.url().includes('quick-capture'))

    let overlay = findOverlay()
    for (let attempt = 0; attempt < 20 && !overlay; attempt += 1) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
      overlay = findOverlay()
    }

    expect(overlay).toBeTruthy()
    await overlay?.waitForSelector('text=Quick capture', { timeout: 10_000 })
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
