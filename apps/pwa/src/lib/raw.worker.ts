/**
 * RAW embedded-preview extraction worker.
 * Pulls the manufacturer-embedded JPEG out of TIFF-family RAWs
 * (ARW/CR2/NEF/DNG/RW2/ORF) and ISO-BMFF CR3 files without full demosaic,
 * mirroring PhotoGallery's ExifReader.GetEmbeddedPreview on the web platform.
 * Falls back to a byte-scan for SOI..EOI spans when structured parsing fails.
 */

type ParserResult = {
  preview: Blob | null
  thumb: Blob | null
  method: string
  takenAt?: string | null
}

const THUMB_MAX = 512

self.onmessage = async (e: MessageEvent) => {
  const { id, file } = e.data as { id: number; file: File }
  try {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let result: ParserResult = { preview: null, thumb: null, method: 'none' }

    const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
    if (ext === 'cr3') result = parseIsoBmff(bytes)
    else if (isTiff(bytes)) result = parseTiff(bytes)

    if (!result.preview) {
      const span = scanLargestJpeg(bytes)
      if (span) {
        result.preview = asBlob(bytes.subarray(span.start, span.end))
        result.method = `${result.method}+bytescan`
      }
    }

    if (result.preview) {
      result.thumb = await makeThumb(result.preview).catch(() => null)
    }
    ;(self as unknown as Worker).postMessage({ id, ...result })
  } catch (err) {
    ;(self as unknown as Worker).postMessage({
      id,
      preview: null,
      thumb: null,
      method: `error:${(err as Error).message}`,
    })
  }
}

function asBlob(u: Uint8Array): Blob {
  return new Blob([u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer], {
    type: 'image/jpeg',
  })
}

export function isTiff(b: Uint8Array): boolean {
  return b.length > 8 && ((b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4d && b[1] === 0x4d))
}

/**
 * Classifies the JPEG at `off` by walking its marker segments up to SOF/SOS.
 * Returns 'sof' for DCT-huffman/arithmetic (real previews), 'lossless' for
 * SOF3-family streams (Sony/Canon lossless-compressed RAW masquerading as
 * JPEG), 'none' when the structure does not parse.
 */
export function sofKind(b: Uint8Array, off: number): 'sof' | 'lossless' | 'none' {
  if (off + 4 > b.byteLength || b[off] !== 0xff || b[off + 1] !== 0xd8) return 'none'
  let i = off + 2
  while (i + 4 <= b.byteLength) {
    if (b[i] !== 0xff) return 'none'
    let marker = b[i + 1]
    i += 2
    while (marker === 0xff && i < b.byteLength) marker = b[i++]
    if (marker === 0xd8) continue
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) continue
    if ((marker & 0xf0) === 0xc0) {
      const lossless =
        marker === 0xc3 || marker === 0xc7 || marker === 0xcb || marker === 0xcf || marker === 0xc8
      return lossless ? 'lossless' : 'sof'
    }
    if (marker === 0xda) return 'none'
    const len = (b[i] << 8) | b[i + 1]
    if (len < 2) return 'none'
    i += len
  }
  return 'none'
}

// --- TIFF-family -------------------------------------------------------------

export function parseTiff(b: Uint8Array): ParserResult {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const le = b[0] === 0x49
  const u16 = (o: number) => view.getUint16(o, le)
  const u32 = (o: number) => view.getUint32(o, le)

  let best: { start: number; length: number; marked: boolean } | null = null
  let takenAt: string | null = null
  const visited = new Set<number>()

  const readValue = (entryOff: number): number[] => {
    const type = u16(entryOff + 2)
    const count = u32(entryOff + 4)
    const sizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }
    const unit = sizes[type] ?? 1
    const total = unit * count
    const valOff = total <= 4 ? entryOff + 8 : u32(entryOff + 8)
    const out: number[] = []
    for (let i = 0; i < count && i < 4096; i++) {
      const o = valOff + i * unit
      if (o + unit > b.byteLength) break
      if (type === 3) out.push(u16(o))
      else if (type === 4 || type === 9) out.push(u32(o))
      else out.push(b[o])
    }
    return out
  }

  const readAscii = (entryOff: number): string | null => {
    const type = u16(entryOff + 2)
    const count = u32(entryOff + 4)
    if (type !== 2) return null
    const valOff = count <= 4 ? entryOff + 8 : u32(entryOff + 8)
    if (valOff + count > b.byteLength) return null
    let s = ''
    for (let i = 0; i < count - 1 && b[valOff + i]; i++) s += String.fromCharCode(b[valOff + i])
    return s.trim()
  }

  const walkIfd = (off: number, depth: number) => {
    if (depth > 4 || off < 8 || off + 2 > b.byteLength || visited.has(off)) return
    visited.add(off)
    const nEntries = u16(off)
    if (nEntries > 512) return

    let jpegStart = -1
    let jpegLength = -1
    let compression = -1
    let stripStart = -1
    let stripLength = -1
    let subFileType = -1
    let subIfds: number[] = []
    let exifIfd = -1

    for (let i = 0; i < nEntries; i++) {
      const entryOff = off + 2 + i * 12
      if (entryOff + 12 > b.byteLength) return
      const tag = u16(entryOff)
      if (tag === 0x0201) jpegStart = readValue(entryOff)[0] ?? -1
      else if (tag === 0x0202) jpegLength = readValue(entryOff)[0] ?? -1
      else if (tag === 0x0103) compression = readValue(entryOff)[0] ?? -1
      else if (tag === 0x00fe) subFileType = readValue(entryOff)[0] ?? -1
      else if (tag === 0x0111) stripStart = readValue(entryOff)[0] ?? -1
      else if (tag === 0x0117) stripLength = readValue(entryOff)[0] ?? -1
      else if (tag === 0x014a) subIfds = subIfds.concat(readValue(entryOff))
      else if (tag === 0x8769) exifIfd = readValue(entryOff)[0] ?? -1
    }

    const consider = (start: number, length: number, marked: boolean) => {
      if (
        start <= 0 ||
        length <= 1000 ||
        start + length > b.byteLength ||
        sofKind(b, start) !== 'sof'
      )
        return
      if (
        !best ||
        (marked && !best.marked) ||
        (marked === best.marked && length > best.length)
      ) {
        best = { start, length, marked }
      }
    }

    if (jpegStart > 0 && jpegLength > 0) consider(jpegStart, jpegLength, subFileType === 1)
    if ((compression === 6 || compression === 7) && stripStart > 0 && stripLength > 0) {
      consider(stripStart, stripLength, subFileType === 1 || subFileType === 0x10001)
    }

    if (exifIfd > 8 && !visited.has(exifIfd)) {
      visited.add(exifIfd)
      const en = u16(exifIfd)
      for (let i = 0; i < en && i < 256; i++) {
        const eo = exifIfd + 2 + i * 12
        if (eo + 12 > b.byteLength) break
        if (u16(eo) === 0x9003) takenAt = readAscii(eo)
      }
    }

    for (const s of subIfds) walkIfd(s, depth + 1)
    const nextOff = off + 2 + nEntries * 12
    if (nextOff + 4 <= b.byteLength) {
      const next = u32(nextOff)
      if (next) walkIfd(next, depth + 1)
    }
  }

  walkIfd(u32(4), 0)

  let preview: Blob | null = null
  const found = best as { start: number; length: number; marked: boolean } | null
  if (found && b[found.start] === 0xff && b[found.start + 1] === 0xd8) {
    preview = asBlob(b.subarray(found.start, found.start + found.length))
  }

  return { preview, thumb: null, method: preview ? 'tiff-ifd' : 'tiff-miss', takenAt }
}

// --- ISO-BMFF / CR3 ----------------------------------------------------------

function boxType(b: Uint8Array, off: number): string {
  return String.fromCharCode(b[off + 4], b[off + 5], b[off + 6], b[off + 7])
}

function findBox(b: Uint8Array, start: number, end: number, path: string[]): { off: number; size: number } | null {
  let pos = start
  while (pos + 8 <= end) {
    let size = (b[pos] << 24) | (b[pos + 1] << 16) | (b[pos + 2] << 8) | b[pos + 3]
    const headerSize = 8
    if (size === 1) {
      const hi = (b[pos + 8] << 24) >>> 0
      const lo = (b[pos + 12] << 24) >>> 0
      size = hi * 4294967296 + lo
      pos += 8
    } else if (size === 0) size = end - pos
    const type = boxType(b, pos)
    const bodyStart = pos + headerSize
    if (size < headerSize || bodyStart > end) return null
    if (path[0] === type) {
      if (path.length === 1) return { off: bodyStart, size: size - headerSize }
      const inner = findBox(b, bodyStart, Math.min(pos + size, end), path.slice(1))
      if (inner) return inner
    }
    pos += size
  }
  return null
}

function parseIsoBmff(b: Uint8Array): ParserResult {
  try {
    const meta = findBox(b, 0, b.length, ['meta'])
    if (!meta) return { preview: null, thumb: null, method: 'cr3-nometa' }
    const items = cr3CollectItems(b, meta.off, meta.off + meta.size)
    const candidates = items.filter((i) => i.type === 'Prvw' || i.type === 'Thmb')
    candidates.sort((x, y) => y.length - x.length)
    const pick = candidates[0]
    if (!pick) return { preview: null, thumb: null, method: 'cr3-noitem' }
    const slice = b.subarray(pick.offset, pick.offset + pick.length)
    if (slice[0] !== 0xff || slice[1] !== 0xd8) return { preview: null, thumb: null, method: 'cr3-badjpeg' }
    return {
      preview: asBlob(slice),
      thumb: null,
      method: pick.type === 'Prvw' ? 'cr3-preview' : 'cr3-thumb',
    }
  } catch {
    return { preview: null, thumb: null, method: 'cr3-error' }
  }
}

function u(b: Uint8Array, o: number, n: number): number {
  let v = 0
  for (let i = 0; i < n; i++) v = v * 256 + b[o + i]
  return v
}

function cr3CollectItems(
  b: Uint8Array,
  start: number,
  end: number,
): Array<{ item: number; type: string; offset: number; length: number }> {
  const types = new Map<number, string>()
  const locs = new Map<number, Array<{ offset: number; length: number }>>()

  let pos = start + 4 // skip version/flags of meta (fullbox)
  while (pos + 8 <= end) {
    let size = u(b, pos, 4)
    const type = boxType(b, pos)
    let body = pos + 8
    if (size === 1) {
      body += 8
      size -= 8
    }
    if (size < 8) break
    const boxEnd = Math.min(pos + size, end)

    if (type === 'iinf') {
      let p = body + 4 // version/flags
      const count = b[p + 2] === undefined ? 0 : u(b, p, 2) // version 0: 16-bit
      p += 2
      for (let i = 0; i < count && p + 8 <= boxEnd; i++) {
        const infeSize = u(b, p, 4)
        const infeType = boxType(b, p + 4)
        if (infeType === 'infe') {
          const version = b[p + 8]
          let q = p + 12
          const itemId = version >= 2 ? u(b, q, 2) : u(b, q, 2)
          q += 2 + 2 // protection index
          if (version >= 2) {
            const itemType = String.fromCharCode(b[q], b[q + 1], b[q + 2], b[q + 3])
            types.set(itemId, itemType)
          }
        }
        p += infeSize
      }
    } else if (type === 'iloc') {
      const p = body + 4
      const sizesByte = b[p]
      const offsetSize = sizesByte >> 4
      const lengthSize = sizesByte & 0xf
      const baseSize = b[p + 1] >> 4
      const indexSize = b[p + 1] & 0xf
      const version = b[p - 4]
      let q = p + 2
      const count = version < 2 ? u(b, q, 2) : u(b, q, 4)
      q += version < 2 ? 2 : 4
      for (let i = 0; i < count && q + 6 <= boxEnd; i++) {
        const itemId = version < 2 ? u(b, q, 2) : u(b, q, 4)
        q += version < 2 ? 2 : 4
        q += 2 // data reference index
        q += baseSize
        const extentCount = u(b, q, 2)
        q += 2
        const extents: Array<{ offset: number; length: number }> = []
        for (let j = 0; j < extentCount; j++) {
          if (indexSize) q += indexSize
          const eo = u(b, q, offsetSize)
          q += offsetSize
          const el = u(b, q, lengthSize)
          q += lengthSize
          if (eo + el <= b.length) extents.push({ offset: eo, length: el })
        }
        if (extents.length) locs.set(itemId, extents)
      }
    }
    pos += size
  }

  const items: Array<{ item: number; type: string; offset: number; length: number }> = []
  for (const [item, type] of types) {
    const ext = locs.get(item)?.[0]
    if (ext) items.push({ item, type, offset: ext.offset, length: ext.length })
  }
  return items
}

// --- Fallback byte scan ------------------------------------------------------

export function scanLargestJpeg(b: Uint8Array): { start: number; end: number } | null {
  let best: { start: number; end: number } | null = null
  const limit = Math.min(b.length - 2, 128 * 1024 * 1024)
  for (let i = 0; i < limit; i++) {
    if (b[i] === 0xff && b[i + 1] === 0xd8 && b[i + 2] === 0xff) {
      for (let j = i + 2; j < b.length - 1; j++) {
        if (b[j] === 0xff && b[j + 1] === 0xd9) {
          const len = j + 2 - i
          if (!best || len > best.end - best.start) best = { start: i, end: j + 2 }
          i = j + 1
          break
        }
      }
    }
  }
  return best && best.end - best.start > 30_000 ? best : null
}

async function makeThumb(jpeg: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(jpeg)
  const scale = Math.min(1, THUMB_MAX / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = new OffscreenCanvas(w, h)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 })
}
