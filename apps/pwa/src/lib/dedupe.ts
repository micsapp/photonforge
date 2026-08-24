/**
 * Byte-exact duplicate finder (SHA-256 over full file contents),
 * mirroring PhotoGallery's dedupe. "Deletion" uses a quarantine folder
 * because browsers cannot access the Recycle Bin.
 */

import type { PhotoRecord } from './db'
import { library, updatePhotoPath } from '../stores/library'
import { readFileByPath } from './fs'
import { sha256Hex } from './hash'

export interface HashProgress {
  done: number
  total: number
  running: boolean
}

export const hashProgress: HashProgress = { done: 0, total: 0, running: false }

export function duplicateGroups(photos: PhotoRecord[]): PhotoRecord[][] {
  const byHash = new Map<string, PhotoRecord[]>()
  for (const p of photos) {
    if (!p.hash || p.rejected) continue
    const list = byHash.get(p.hash)
    if (list) list.push(p)
    else byHash.set(p.hash, [p])
  }
  return [...byHash.values()].filter((g) => g.length > 1)
}

/** Hash every photo that lacks a stored hash. Safe to re-run; incremental. */
export async function hashMissing(onTick?: () => void): Promise<number> {
  const root = library.rootHandle
  if (!root || hashProgress.running) return -1
  const pending = library.photos.filter((p) => !p.hash)
  if (!pending.length) return 0

  hashProgress.running = true
  hashProgress.done = 0
  hashProgress.total = pending.length

  const { db } = await import('./db')
  const concurrency = Math.max(2, Math.min(navigator.hardwareConcurrency || 4, 8))
  let cursor = 0

  const runOne = async (photo: PhotoRecord) => {
    try {
      const file = await readFileByPath(root, photo.path)
      const hex = await sha256Hex(file)
      photo.hash = hex
      await db.photos.update(photo.id, { hash: hex })
    } catch {
      photo.hash = 'unavailable'
    } finally {
      hashProgress.done++
      onTick?.()
    }
  }

  await new Promise<void>((resolve) => {
    let inFlight = 0
    const pump = () => {
      while (inFlight < concurrency && cursor < pending.length) {
        const photo = pending[cursor++]
        inFlight++
        void runOne(photo).then(() => {
          inFlight--
          if (!inFlight && cursor >= pending.length) resolve()
          else pump()
        })
      }
      if (cursor >= pending.length && !inFlight) resolve()
    }
    pump()
  })

  hashProgress.running = false
  return pending.filter((p) => p.hash && p.hash !== 'unavailable').length
}

async function resolveDir(root: FileSystemDirectoryHandle, parts: string[]): Promise<FileSystemDirectoryHandle> {
  let dir = root
  for (const part of parts) dir = await dir.getDirectoryHandle(part)
  return dir
}

/**
 * Move a file (+ its sidecar) into _quarantine/<folder>/ instead of deleting,
 * because the browser cannot touch the Windows Recycle Bin.
 */
export async function quarantine(photo: PhotoRecord, folder: string): Promise<boolean> {
  const root = library.rootHandle
  if (!root) return false
  try {
    const parts = photo.path.split('/')
    const name = parts.pop()!
    const srcDir = await resolveDir(root, parts)
    const destDir = await (await resolveDir(root, ['_quarantine'])).getDirectoryHandle(folder, { create: true })
    const file = await (await srcDir.getFileHandle(name)).getFile()

    const writable = await (await destDir.getFileHandle(name, { create: true })).createWritable()
    await writable.write(file)
    await writable.close()
    await (await srcDir.getFileHandle(name)).remove()

    try {
      const scName = `${name}.xmp`
      const scFile = await (await srcDir.getFileHandle(scName)).getFile()
      const scW = await (await destDir.getFileHandle(scName, { create: true })).createWritable()
      await scW.write(scFile)
      await scW.close()
      await (await srcDir.getFileHandle(scName)).remove()
    } catch {
      /* no sidecar */
    }

    updatePhotoPath(photo, `_quarantine/${folder}/${name}`)
    return true
  } catch (err) {
    console.error('quarantine failed', photo.path, err)
    return false
  }
}

/** Keep one member of a group, quarantine the rest. Returns quarantined count. */
export async function quarantineDuplicates(group: PhotoRecord[], keepId: string): Promise<number> {
  const folder = `dedupe-${new Date().toISOString().slice(0, 10)}`
  let n = 0
  for (const p of group) {
    if (p.id === keepId) continue
    if (await quarantine(p, folder)) n++
  }
  return n
}
