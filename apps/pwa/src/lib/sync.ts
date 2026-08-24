/**
 * PhotonForge / PhotoPrism sync client.
 * POST /api/v1/session  → authenticate, receive session id
 * POST /api/v1/index    → trigger server-side indexing of the shared folder
 */

import { getSetting, setSetting } from './db'

export interface SyncConfig {
  baseUrl: string
  username: string
  password: string
}

export interface SyncState {
  config: SyncConfig
  sessionId: string | null
  status: 'idle' | 'connecting' | 'connected' | 'error'
  message: string
}

export const sync: SyncState = {
  config: { baseUrl: '', username: 'admin', password: '' },
  sessionId: null,
  status: 'idle',
  message: '',
}

export async function loadSyncConfig(): Promise<void> {
  const saved = await getSetting<SyncConfig | null>('syncConfig', null)
  if (saved) {
    sync.config = { ...saved }
    if (sync.sessionId == null && saved.password) await connect(false)
  }
}

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export async function connect(showMessages = true): Promise<boolean> {
  const { baseUrl, username, password } = sync.config
  if (!baseUrl || !username || !password) {
    sync.status = 'error'
    sync.message = 'Fill in server URL, user and password.'
    return false
  }
  sync.status = 'connecting'
  if (showMessages) sync.message = 'Connecting…'
  try {
    const res = await fetch(`${normalize(baseUrl)}/api/v1/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      sync.status = 'error'
      sync.message = `Auth failed (${res.status})`
      return false
    }
    const data = (await res.json()) as { id?: string }
    sync.sessionId = data.id ?? null
    sync.status = sync.sessionId ? 'connected' : 'error'
    sync.message = sync.sessionId ? 'Connected to PhotonForge.' : 'No session id in response.'
    await setSetting('syncConfig', sync.config)
    return !!sync.sessionId
  } catch (err) {
    sync.status = 'error'
    const e = err as Error
    sync.message =
      e.message === 'Failed to fetch'
        ? 'Network/CORS error — is the server reachable from this origin?'
        : e.message
    return false
  }
}

export async function triggerIndex(): Promise<string> {
  if (!sync.sessionId && !(await connect())) return sync.message
  try {
    const res = await fetch(`${normalize(sync.config.baseUrl)}/api/v1/index`, {
      method: 'POST',
      headers: { 'X-Session-ID': sync.sessionId! },
    })
    if (!res.ok) return `Index trigger failed (${res.status})`
    sync.message = 'Indexing started on the server.'
    return ''
  } catch (err) {
    return (err as Error).message
  }
}

export async function saveSyncConfig(): Promise<void> {
  await setSetting('syncConfig', sync.config)
}
