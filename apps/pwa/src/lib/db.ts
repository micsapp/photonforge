import Dexie, { type Table } from 'dexie'

export interface PhotoRecord {
  /** `${path}::${size}::${mtimeMs}` — stable while the file is untouched */
  id: string
  path: string
  dir: string
  name: string
  ext: string
  size: number
  mtimeMs: number
  rating: number // 0..5, 0 = unrated
  rejected: boolean
  tags: string[]
  takenAt: number | null
  hasPreview: boolean
  previewMethod: string
  hash: string | null
}

export interface ThumbRecord {
  id: string
  blob: Blob
}

export interface SettingRecord {
  key: string
  value: unknown
}

class PhotoForgeDb extends Dexie {
  photos!: Table<PhotoRecord, string>
  thumbs!: Table<ThumbRecord, string>
  settings!: Table<SettingRecord, string>

  constructor() {
    super('photo-forge')
    this.version(1).stores({
      photos: 'id, path, dir, rating, rejected, takenAt',
      thumbs: 'id',
      settings: 'key',
    })
  }
}

export const db = new PhotoForgeDb()

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row ? (row.value as T) : fallback
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}
