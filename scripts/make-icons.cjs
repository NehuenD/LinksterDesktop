const { deflateSync } = require('node:zlib')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const radius = size * 0.22
  const accent = [220, 38, 38]

  const inRoundedRect = (x, y) => {
    const r = radius
    const cx = Math.min(Math.max(x, r), size - r)
    const cy = Math.min(Math.max(y, r), size - r)
    const dx = x - cx
    const dy = y - cy
    return dx * dx + dy * dy <= r * r
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      if (!inRoundedRect(x + 0.5, y + 0.5)) continue
      rgba[offset] = accent[0]
      rgba[offset + 1] = accent[1]
      rgba[offset + 2] = accent[2]
      rgba[offset + 3] = 255
    }
  }
  return rgba
}

function writePng(path, size) {
  const png = encodePng(size, size, drawIcon(size))
  writeFileSync(path, png)
  console.log('wrote', path, png.length, 'bytes')
}

const root = join(__dirname, '..')
mkdirSync(join(root, 'resources'), { recursive: true })
mkdirSync(join(root, 'build'), { recursive: true })
writePng(join(root, 'resources', 'tray.png'), 32)
writePng(join(root, 'resources', 'icon.png'), 256)
writePng(join(root, 'build', 'icon.png'), 512)
