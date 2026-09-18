/**
 * Minimal RFC-4180 CSV reader (quoted fields, escaped quotes, CRLF, embedded
 * newlines). No dependency, so it is trivially unit-testable and shared by the
 * Pocket/Instapaper/Raindrop mappers.
 */

export type CsvRow = Record<string, string>

export interface ParsedCsv {
  headers: string[]
  rows: CsvRow[]
}

export function parseCsv(input: string): ParsedCsv {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input

  const cells: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let index = 0

  const endField = (): void => {
    row.push(field)
    field = ''
  }
  const endRow = (): void => {
    endField()
    cells.push(row)
    row = []
  }

  while (index < text.length) {
    const char = text[index]

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        inQuotes = false
        index += 1
        continue
      }
      field += char
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = true
      index += 1
      continue
    }
    if (char === ',') {
      endField()
      index += 1
      continue
    }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      endRow()
      index += 1
      continue
    }

    field += char
    index += 1
  }

  if (field.length > 0 || row.length > 0) endRow()

  const meaningful = cells.filter((line) => line.some((cell) => cell.trim().length > 0))
  if (meaningful.length === 0) return { headers: [], rows: [] }

  const headers = meaningful[0].map((header) => header.trim())
  const rows = meaningful.slice(1).map((line) => {
    const record: CsvRow = {}
    headers.forEach((header, column) => {
      if (header.length > 0) record[header] = line[column] ?? ''
    })
    return record
  })

  return { headers, rows }
}

/** Case-insensitive field lookup; returns the first non-empty match. */
export function getField(row: CsvRow, ...names: string[]): string | null {
  const wanted = names.map((name) => name.toLowerCase())
  for (const [key, value] of Object.entries(row)) {
    if (wanted.includes(key.toLowerCase()) && value.trim().length > 0) {
      return value.trim()
    }
  }
  return null
}
