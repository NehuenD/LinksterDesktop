import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '../..')

test('boots to the login gate in a single window', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'linkster-e2e-'))
  const args = [appRoot]
  if (process.platform === 'linux') args.push('--no-sandbox')

  const app = await electron.launch({
    args,
    env: { ...process.env, LINKSTER_USER_DATA_DIR: userDataDir }
  })

  try {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await expect(window).toHaveTitle('Linkster')
    await expect(window.getByRole('heading', { name: 'Linkster' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    expect(app.windows()).toHaveLength(1)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
