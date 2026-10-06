import type { MachineRow } from '../types'
import { authHeaders } from './auth'
import { apiUrl, getUnit, unitKey } from './unit'
import type { Unit } from './unit'
import { clientId } from './realtime'
import { cacheList } from './cacheLimit'

/** One record per Excel file that was converted onto the dashboard. */
export interface UploadRecord {
  id: string
  savedAt: number
  uploadDate: string // YYYY-MM-DD
  shift: string // 'Shift 1' | 'Shift 2' | 'Shift 1 & 2'
  fileName: string
  machines: number
  groups: string[]
  downtimeReasons: string[]
  rows: MachineRow[]
  by?: string
}

const KEY_BASE = 'mm.uploads.v1'
/** Cache key for the ACTIVE unit — each workspace caches separately. */
const KEY = (unit: Unit) => unitKey(KEY_BASE, unit)
const API = '/api/uploads'

const sortBySaved = (list: UploadRecord[]) =>
  [...list].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// ---- localStorage: offline cache / fallback when the server isn't reachable ----
function readLocal(unit: Unit): UploadRecord[] {
  try {
    const raw = localStorage.getItem(KEY(unit))
    return raw ? sortBySaved(JSON.parse(raw) as UploadRecord[]) : []
  } catch {
    return []
  }
}
function writeLocal(list: UploadRecord[], unit: Unit) {
  try {
    cacheList(KEY(unit), list)
  } catch {
    /* quota / disabled */
  }
}

/** Load upload history from the shared server; fall back to this device's cache. */
export async function fetchUploads(): Promise<UploadRecord[]> {
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(API, unit), { cache: 'no-store' })
    if (!r.ok) throw new Error('bad status')
    const list = (await r.json()) as UploadRecord[]
    writeLocal(list, unit)
    return sortBySaved(list)
  } catch {
    return readLocal(unit)
  }
}

/** Record an uploaded Excel (all devices get it live). A stable `id` overwrites in place. */
export async function saveUpload(u: Omit<UploadRecord, 'id' | 'savedAt'> & { id?: string }): Promise<UploadRecord> {
  const unit = getUnit()
  const entry: UploadRecord = { ...u, id: u.id || genId(), savedAt: Date.now(), by: clientId() }
  const response = await fetch(apiUrl(API, unit), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(entry),
  })
  if (!response.ok) {
    let message = `Could not save the Excel report to the database (HTTP ${response.status}).`
    try {
      const body = (await response.json()) as { error?: unknown }
      if (typeof body.error === 'string') message = body.error
    } catch {
      // Keep the status message when the server did not return JSON.
    }
    throw new Error(message)
  }
  return (await response.json()) as UploadRecord
}

export async function deleteUpload(id: string): Promise<void> {
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(`${API}/${id}`, unit), { method: 'DELETE', headers: authHeaders(false) })
    if (!r.ok) throw new Error('bad status')
  } catch {
    writeLocal(readLocal(unit).filter((u) => u.id !== id), unit)
  }
}

/** Cache the latest uploads list locally (called from the realtime subscription). */
export function cacheUploads(list: UploadRecord[]) {
  const unit = getUnit()
  writeLocal(list, unit)
}
