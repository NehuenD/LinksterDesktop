import { describe, expect, it } from 'vitest'
import { getField, parseCsv } from '../../src/main/services/csv'

describe('parseCsv', () => {
  it('parses headers and rows with quoted commas and escaped quotes', () => {
    const { headers, rows } = parseCsv('title,url\n"Has, comma","He said ""hi"""')
    expect(headers).toEqual(['title', 'url'])
    expect(rows[0]).toEqual({ title: 'Has, comma', url: 'He said "hi"' })
  })

  it('handles CRLF and embedded newlines inside quotes', () => {
    const { rows } = parseCsv('a,b\r\n"line1\nline2",x\r\n')
    expect(rows).toEqual([{ a: 'line1\nline2', b: 'x' }])
  })

  it('strips a UTF-8 BOM and ignores fully empty rows', () => {
    const { headers, rows } = parseCsv('\uFEFFa,b\n\n1,2\n')
    expect(headers).toEqual(['a', 'b'])
    expect(rows).toEqual([{ a: '1', b: '2' }])
  })
})

describe('getField', () => {
  it('matches column names case-insensitively and ignores blanks', () => {
    const row = { URL: '', Url: 'https://example.com' }
    expect(getField(row, 'url')).toBe('https://example.com')
    expect(getField(row, 'title')).toBeNull()
  })
})
