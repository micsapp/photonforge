import { reactive, computed } from 'vue'
import {
  RAW_EXTENSIONS,

  pickLibraryRoot,
  scanLibrary,
  saveRootHandle,
  loadRootHandle,
  requestRootPermission,
  clearRootHandle,
  readFileByPath,
} from '../lib/fs'
import { RawExtractor } from '../lib/raw'
import { db, type PhotoRecord } from '../lib/db'

export interface LibraryState {
  rootName: string
  rootHandle: FileSystemDirectoryHandle | null
  scanning: boolean
  extracting: boolean
  scanFound: number
  extractDone: number
  photos: PhotoRecord[]
  selectedId: string | null
  viewerIndex: number | null
  filter: 'all' | 'rated' | 'unrated' | 'rejected' | 'picks'
}

const extractor = new RawExtractor()
const previewCache = new Map<string, string>()

export const libraryRoot = computed(() => library.rootHandle)

export const library = reactive<LibraryState>({
  rootName: '',
  rootHandle: null,
  scanning: false,
  extracting: false,
  scanFound: 0,
  extractDone: 0,
  photos: [],
  selectedId: null,
  viewerIndex: null,
  filter: 'all',
})

const byPath = computed(() => new Map(library.photos.map((p) => [p.path, p])))

function recordId(path: string, size: number, mtimeMs: number) {
  return `${path}::${size}::${mtimeMs}`
}

export async function attachSavedRoot(): Promise<boolean> {
  const handle = await loadRootHandle()
  if (!handle) return false
  library.rootHandle = handle
  library.rootName = handle.name
  return true
}

export async function reauthorizeRoot(): Promise<boolean> {
  const handle = await requestRootPermission()
  if (!handle) return false
  library.rootHandle = handle
  library.rootName = handle.name
  return true
}

export async function chooseRoot(): Promise<boolean> {
  const handle = await pickLibraryRoot('readwrite')
  if (!handle) return false
  await saveRootHandle(handle)
  library.rootHandle = handle
  library.rootName = handle.name
  await rescan()
  return true
}

export function forgetRoot(): Promise<void> {
  return clearRootHandle()
}

/** Scan the picked tree and merge file metadata into the catalog. */
export async function rescan(): Promise<void> {
  if (!library.rootHandle || library.scanning) return
  library.scanning = true
  library.scanFound = 0
  try {
    const files = await scanLibrary(library.rootHandle, (found) => {
      library.scanFound = found
    })

    const existing = new Map((await db.photos.toArray()).map((p) => [p.id, p]))
    const { readSidecar } = await import('../lib/xmp')
    const records: PhotoRecord[] = []
    for (const f of files) {
      const id = recordId(f.path, f.size, f.mtimeMs)
      let rec = existing.get(id)
      if (!rec) {
        rec = {
          id,
          path: f.path,
          dir: f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '',
          name: f.name,
          ext: f.ext,
          size: f.size,
          mtimeMs: f.mtimeMs,
          rating: 0,
          rejected: false,
          tags: [],
          takenAt: null,
          hasPreview: false,
          previewMethod: 'pending',
          hash: null,
        }
        const sidecar = await readSidecar(library.rootHandle!, f).catch(() => null)
        if (sidecar) {
          rec.rating = sidecar.rating
          rec.rejected = sidecar.rejected
          rec.tags = sidecar.tags
        }
      }
      records.push(rec)
    }
    await db.photos.bulkPut(records)
    await loadPhotos()
    void extractPending()
  } finally {
    library.scanning = false
  }
}

async function loadPhotos() {
  library.photos = await db.photos.orderBy('path').toArray()
}

/**
 * Extract embedded previews for every photo that lacks one.
 * JPEGs already have a native "preview"; RAWs go through the worker pool.
 */
export async function extractPending(): Promise<void> {
  const root = library.rootHandle
  if (!root || library.extracting) return

  const pending = library.photos.filter(
    (p) => !p.hasPreview && p.previewMethod !== 'failed',
  )
  if (!pending.length) return

  library.extracting = true
  library.extractDone = 0
  const concurrency = Math.max(4, (navigator.hardwareConcurrency || 4) * 2)
  let cursor = 0

  async function runOne(photo: PhotoRecord) {
    try {
      const file = await readFileByPath(root!, photo.path)
      const result = await extractor.extract(file)
      const updated: Partial<PhotoRecord> = {
        hasPreview: result.ok,
        previewMethod: result.method,
      }
      if (result.thumb) {
        await db.thumbs.put({ id: photo.id, blob: result.thumb })
        if (!photo.takenAt && result.preview) {
          updated.takenAt = await fileDate(file).catch(() => null)
        }
      } else if (result.ok) {
        await db.thumbs.put({ id: photo.id, blob: result.preview! })
      }
      await db.photos.update(photo.id, updated)
      const idx = library.photos.findIndex((p) => p.id === photo.id)
      if (idx >= 0) Object.assign(library.photos[idx], updated)
    } catch {
      await db.photos.update(photo.id, { previewMethod: 'failed' })
    } finally {
      library.extractDone++
    }
  }

  await new Promise<void>((resolve) => {
    let inFlight = 0
    const pump = () => {
      while (inFlight < concurrency && cursor < pending.length) {
        const photo = pending[cursor++]
        inFlight++
        runOne(photo).then(() => {
          inFlight--
          if (!inFlight && cursor >= pending.length) resolve()
          else pump()
        })
      }
      if (cursor >= pending.length && !inFlight) resolve()
    }
    pump()
  })

  library.extracting = false
}

async function fileDate(file: File): Promise<number | null> {
  const { parse } = await import('exifr')
  const data = await parse(file, { pick: ['DateTimeOriginal'] }).catch(() => null)
  const d = (data as { DateTimeOriginal?: unknown } | null)?.DateTimeOriginal
  return d instanceof Date ? d.getTime() : null
}

// --- Ratings -----------------------------------------------------------------

export function setRating(id: string, rating: number) {
  const idx = library.photos.findIndex((p) => p.id === id)
  if (idx < 0) return
  const photo = library.photos[idx]
  photo.rating = rating
  photo.rejected = false
  db.photos.update(id, { rating, rejected: false }).then(() => writeSidecarFor(photo))
}

export function toggleReject(id: string) {
  const idx = library.photos.findIndex((p) => p.id === id)
  if (idx < 0) return
  const photo = library.photos[idx]
  photo.rejected = !photo.rejected
  if (photo.rejected) photo.rating = 0
  db.photos.update(id, { rejected: photo.rejected, rating: photo.rating }).then(() => writeSidecarFor(photo))
}

async function writeSidecarFor(photo: PhotoRecord) {
  const { writeSidecar } = await import('../lib/xmp')
  if (!library.rootHandle) return
  await writeSidecar(library.rootHandle, photo, photo.rating, photo.rejected, photo.tags)
}

// --- Selection & filtering -----------------------------------------------------

/**
 * Re-key a record after the underlying file moved (organizer / dedupe).
 * Migrates the cached thumbnail and patches the reactive list in place.
 */
export function updatePhotoPath(photo: PhotoRecord, newPath: string) {
  const newId = `${newPath}::${photo.size}::${photo.mtimeMs}`
  void (async () => {
    const thumb = await db.thumbs.get(photo.id)
    if (thumb) {
      await db.thumbs.delete(photo.id)
      await db.thumbs.put({ id: newId, blob: thumb.blob })
    }
    await db.photos.delete(photo.id)
    await db.photos.put({ ...photo, path: newPath, id: newId })
  })()
  previewCache.delete(photo.id)
  photo.path = newPath
  photo.dir = newPath.includes('/') ? newPath.slice(0, newPath.lastIndexOf('/')) : ''
  photo.id = newId
}

export const filteredPhotos = computed(() => {
  switch (library.filter) {
    case 'rated':
      return library.photos.filter((p) => p.rating > 0)
    case 'picks':
      return library.photos.filter((p) => p.rating >= 3 && !p.rejected)
    case 'rejected':
      return library.photos.filter((p) => p.rejected)
    case 'unrated':
      return library.photos.filter((p) => p.rating === 0 && !p.rejected)
    default:
      return library.photos
  }
})

export function thumbUrl(photo: PhotoRecord): Promise<string | null> {
  return db.thumbs
    .get(photo.id)
    .then((t) => (t ? URL.createObjectURL(t.blob) : null))
    .catch(() => null)
}

export function getPhotoByPath(path: string): PhotoRecord | undefined {
  return byPath.value.get(path)
}

export async function fullPreviewUrl(photo: PhotoRecord): Promise<string | null> {
  const cached = previewCache.get(photo.id)
  if (cached) return cached
  const root = library.rootHandle
  if (!root) return null
  try {
    const file = await readFileByPath(root, photo.path)
    let url: string
    if (!RAW_EXTENSIONS.has(photo.ext)) {
      url = URL.createObjectURL(file)
    } else {
      const result = await extractor.extract(file)
      if (!result.preview) return null
      url = URL.createObjectURL(result.preview)
    }
    if (previewCache.size >= 40) {
      const oldest = previewCache.keys().next().value
      if (oldest != null) {
        const old = previewCache.get(oldest)!
        URL.revokeObjectURL(old)
        previewCache.delete(oldest)
      }
    }
    previewCache.set(photo.id, url)
    return url
  } catch {
    return null
  }
}
