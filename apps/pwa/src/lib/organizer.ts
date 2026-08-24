/**
 * Batch date organizer — the PWA counterpart of PhotoGallery's
 * "sort messy folders into YYYY-MM-DD hierarchies" with duplicate skipping.
 * Moves are performed via File System Access (write copy + remove source),
 * including .xmp sidecars. Original files are never edited in place.
 */

import type { PhotoRecord } from './db'
import { library, updatePhotoPath } from '../stores/library'
import { readFileByPath, getFileHandleByPath } from './fs'

export interface OrganizePlan {
  photo: PhotoRecord
  destDir: string
}

export interface OrganizeResult {
  moved: number
  skipped: number
  errors: string[]
  done: boolean
}

function dateOf(photo: PhotoRecord): Date {
  const ms = photo.takenAt ?? photo.mtimeMs
  return new Date(ms)
}

export function destFolderFor(photo: PhotoRecord): string {
  const d = dateOf(photo)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Plan grouping for photos currently in view (skips already-correct locations). */
export function buildPlan(photos: PhotoRecord[]): OrganizePlan[] {
  return photos
    .filter((p) => p.dir !== destFolderFor(p))
    .map((photo) => ({ photo, destDir: destFolderFor(photo) }))
}

async function resolveDir(root: FileSystemDirectoryHandle, parts: string[]): Promise<FileSystemDirectoryHandle> {
  let dir = root
  for (const part of parts) dir = await dir.getDirectoryHandle(part)
  return dir
}

async function ensureDir(root: FileSystemDirectoryHandle, segments: string[]): Promise<FileSystemDirectoryHandle> {
  let dir = root
  for (const seg of segments) dir = await dir.getDirectoryHandle(seg, { create: true })
  return dir
}

/** Copy file bytes to dest; returns false when an identical target exists. */
async function copyIfNew(
  root: FileSystemDirectoryHandle,
  srcRel: string,
  destDirH: FileSystemDirectoryHandle,
  name: string,
): Promise<boolean> {
  try {
    const existing = await destDirH.getFileHandle(name)
    const existingFile = await existing.getFile()
    const srcFile = await readFileByPath(root, srcRel)
    if (existingFile.size === srcFile.size) return false // same name+size → assume dup, skip
  } catch {
    /* target does not exist */
  }
  const srcFile = await readFileByPath(root, srcRel)
  const writable = await (await destDirH.getFileHandle(name, { create: true })).createWritable()
  await writable.write(srcFile)
  await writable.close()
  return true
}

async function removeByRelPath(root: FileSystemDirectoryHandle, rel: string): Promise<void> {
  const parts = rel.split('/')
  const name = parts.pop()!
  const dir = await resolveDir(root, parts)
  await (await dir.getFileHandle(name)).remove()
}

/** Move one photo (+ sidecar) into its date folder under the root. */
export async function applyPlanEntry(entry: OrganizePlan): Promise<'moved' | 'skipped' | 'error'> {
  const root = library.rootHandle
  if (!root) return 'error'

  const parts = entry.photo.path.split('/')
  const name = parts.pop()!

  const destDirH = await ensureDir(root, entry.destDir.split('/'))
  let movedBytes = false
  try {
    movedBytes = await copyIfNew(root, entry.photo.path, destDirH, name)
    if (!movedBytes) return 'skipped'

    const srcSidecar = `${entry.photo.path}.xmp`
    try {
      await getFileHandleByPath(root, srcSidecar)
      const scName = `${name}.xmp`
      const scMoved = await copyIfNew(root, srcSidecar, destDirH, scName)
      if (scMoved) await removeByRelPath(root, srcSidecar)
    } catch {
      /* no sidecar */
    }

    await removeByRelPath(root, entry.photo.path)
  } catch (err) {
    console.error('move failed', entry.photo.path, err)
    return 'error'
  }

  updatePhotoPath(entry.photo, `${entry.destDir}/${name}`)
  return 'moved'
}
