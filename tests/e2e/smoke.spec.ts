import { _electron as electron, expect, test } from '@playwright/test'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '../..')

test('boots the Linkster window and answers IPC', async () => {
  const app = await electron.launch({ args: [appRoot] })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  await expect(window).toHaveTitle('Linkster')
  await expect(window.getByRole('heading', { name: 'Linkster' })).toBeVisible()

  await window.getByRole('button', { name: 'Ping main process' }).click()
  await expect(window.getByTestId('ping-result')).toContainText('pong')

  expect(app.windows()).toHaveLength(1)
  await app.close()
})
