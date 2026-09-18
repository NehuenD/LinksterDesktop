import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const handlersDir = new URL('../../src/main/ipc/handlers/', import.meta.url)
const files = readdirSync(handlersDir).filter((name) => name.endsWith('.ts'))

// AC2: every IPC handler must run behind `secureHandle`, which guarantees the
// renderer always receives an IpcResult instead of a rejected invoke.
describe('ipc handlers use the guarded envelope', () => {
  it('found handler modules to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('registers every handler via secureHandle and never raw ipcMain.handle', () => {
    for (const name of files) {
      const source = readFileSync(new URL(name, handlersDir), 'utf8')
      expect(source, `${name} must not call ipcMain.handle`).not.toMatch(/\bipcMain\.handle\(/)
      expect(source, `${name} must use secureHandle`).toMatch(/\bsecureHandle\(/)
    }
  })
})
