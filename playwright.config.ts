import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  retries: process.env['CI'] ? 1 : 0,
  use: {
    trace: 'retain-on-failure'
  }
})
