import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createXCaptureFiles } from '../../src/main/services/x-capture-files'

describe('createXCaptureFiles', () => {
  const dir = mkdtempSync(join(tmpdir(), 'linkster-x-captures-'))

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes, stats, reads and removes a capture', () => {
    const files = createXCaptureFiles(dir)
    const png = Buffer.from('fake-png')

    expect(files.exists('link-1')).toBe(false)
    files.write('link-1', png)

    expect(files.exists('link-1')).toBe(true)
    expect(files.read('link-1')?.toString()).toBe('fake-png')
    expect(files.stat('link-1')?.size).toBe(png.length)

    files.remove('link-1')
    expect(files.exists('link-1')).toBe(false)
    expect(files.read('link-1')).toBeNull()
  })

  it('rejects unsafe link ids for every path-based operation', () => {
    const files = createXCaptureFiles(dir)

    expect(() => files.write('../evil', Buffer.from('x'))).toThrow()
    expect(() => files.read('a/b')).toThrow()
    expect(() => files.remove('..')).toThrow()
    expect(() => files.pathFor('')).toThrow()
  })

  it('creates the directory lazily and removes many ids', () => {
    const nested = join(dir, 'nested', 'captures')
    const files = createXCaptureFiles(nested)

    files.write('a', Buffer.from('1'))
    files.write('b', Buffer.from('2'))
    files.removeMany(['a', 'b'])

    expect(files.exists('a')).toBe(false)
    expect(files.exists('b')).toBe(false)
  })
})
