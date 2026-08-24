/**
 * File System Access layer.
 * Opens a user-picked photo root folder (Edge/Chrome), scans it recursively
 * for RAW/JPEG files, persists the directory handle in IndexedDB so the
 * library can be re-attached on next launch without re-picking.
 */

export const RAW_EXTENSIONS = new Set(['arw', 'cr2', 'cr3', 'nef', 'dng', 'raf', 'orf', 'rw2'])
export const JPEG_EXTENSIONS = new Set(['jpg', 'jpeg'])
export const PHOTO_EXTENSIONS = new Set([...RAW_EXTENSIONS, ...JPEG_EXTENSIONS])

export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

export interface ScannedFile {
  /** Path relative to library root, e.g. "2025-01-01/POG02258.ARW" */
  path: string
  name: string
  ext: string
  size: number
  mtimeMs: number
}

export async function pickLibraryRoot(mode: 'read' | 'readwrite' = 'readwrite'): Promise<FileSystemDirectoryHandle | null> {
  if (!window.showDirectoryPicker) return null
  try {
    return await window.showDirectoryPicker({ id: 'photo-forge-root', mode })
  } catch {
    return null // user cancelled
  }
}

/** Recursively collect photo files under a directory handle. */
export async function scanLibrary(
  root: FileSystemDirectoryHandle,
  onProgress?: (found: number, currentDir: string) => void,
): Promise<ScannedFile[]> {
  const out: ScannedFile[] = []
  let dirs = 0

  async function walk(dir: FileSystemDirectoryHandle, prefix: string) {
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'directory') {
        dirs++
        await walk(handle as FileSystemDirectoryHandle, prefix ? `${prefix}/${name}` : name)
      } else {
        const ext = extOf(name)
        if (!PHOTO_EXTENSIONS.has(ext)) continue
        const file = await (handle as FileSystemFileHandle).getFile()
        out.push({
          path: prefix ? `${prefix}/${name}` : name,
          name,
          ext,
          size: file.size,
          mtimeMs: file.lastModified,
        })
        if (onProgress && out.length % 50 === 0) onProgress(out.length, prefix)
      }
    }
  }

  await walk(root, '')
  return out
}

// ---------------------------------------------------------------------------
// Handle persistence (IndexedDB) so the picked root survives reloads.
// ---------------------------------------------------------------------------

const HANDLE_DB = 'photo-forge-handles'
const HANDLE_STORE = 'handles'

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(HANDLE_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openHandleDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readwrite')
    tx.objectStore(HANDLE_STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openHandleDb()
  const result = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readonly')
    const rq = tx.objectStore(HANDLE_STORE).get(key)
    rq.onsuccess = () => resolve(rq.result as T | undefined)
    rq.onerror = () => reject(rq.error)
  })
  db.close()
  return result
}

export async function saveRootHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await idbPut('root', handle)
}

export async function loadRootHandle(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await idbGet<FileSystemDirectoryHandle>('root')
  if (!handle) return null
  const perm = await handle.queryPermission?.({ mode: 'readwrite' })
  if (perm === 'granted') return handle
  return null // needs re-authorization via requestRootPermission()
}

export async function requestRootPermission(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await idbGet<FileSystemDirectoryHandle>('root')
  if (!handle) return null
  const state = await handle.requestPermission?.({ mode: 'readwrite' })
  return state === 'granted' ? handle : null
}

export async function clearRootHandle(): Promise<void> {
  await idbPut('root', undefined)
}

/** Read whole file content by relative path within the root. */
export async function readFileByPath(
  root: FileSystemDirectoryHandle,
  relPath: string,
): Promise<File> {
  const parts = relPath.split('/')
  const fileName = parts.pop()!
  let dir = root
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part)
  }
  const fh = await dir.getFileHandle(fileName)
  return fh.getFile()
}

export function getFileHandleByPath(
  root: FileSystemDirectoryHandle,
  relPath: string,
): Promise<FileSystemFileHandle> {
  const parts = relPath.split('/')
  const fileName = parts.pop()!
  return (async () => {
    let dir = root
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part)
    }
    return dir.getFileHandle(fileName)
  })()
}
