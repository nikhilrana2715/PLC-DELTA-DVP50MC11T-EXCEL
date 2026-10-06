import type { MachineRow } from '../types'
import { authHeaders } from './auth'
import { apiUrl, getUnit, unitKey } from './unit'
import type { Unit } from './unit'
import { clientId } from './realtime'
import { cacheList } from './cacheLimit'

export interface MeetingSummary {
  machines: number
  running: number
  planned: number
  achievement: number
  backlog: number
  avgEfficiency: number
  overallEfficiency: number
  criticalCount: number
}

export interface SavedMeeting {
  id: string
  savedAt: number
  meetingDate: string // YYYY-MM-DD
  shift: string
  fileName: string
  note: string
  groups: string[]
  downtimeReasons: string[]
  rows: MachineRow[]
  summary: MeetingSummary
  by?: string
}

const KEY_BASE = 'mm.history.v1'
/** Cache key for the ACTIVE unit — each workspace caches separately. */
const KEY = (unit: Unit) => unitKey(KEY_BASE, unit)
const API = '/api/meetings'

const sortBySaved = (list: SavedMeeting[]) =>
  [...list].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// ---- localStorage: offline cache / fallback when the server isn't reachable ----
function readLocal(unit: Unit): SavedMeeting[] {
  try {
    const raw = localStorage.getItem(KEY(unit))
    return raw ? sortBySaved(JSON.parse(raw) as SavedMeeting[]) : []
  } catch {
    return []
  }
}
function writeLocal(list: SavedMeeting[], unit: Unit) {
  try {
    cacheList(KEY(unit), list)
  } catch {
    /* quota / disabled */
  }
}

/** Load meetings from the shared server; fall back to this device's cache. */
export async function fetchMeetings(): Promise<SavedMeeting[]> {
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(API, unit), { cache: 'no-store' })
    if (!r.ok) throw new Error('bad status')
    const list = (await r.json()) as SavedMeeting[]
    writeLocal(list, unit)
    return sortBySaved(list)
  } catch {
    return readLocal(unit)
  }
}

/** Save a meeting to the shared server (all devices get it live). A stable `id`
 * (e.g. for the daily auto-save) overwrites in place instead of duplicating. */
export async function saveMeeting(
  m: Omit<SavedMeeting, 'id' | 'savedAt'> & { id?: string },
): Promise<SavedMeeting> {
  const unit = getUnit()
  const entry: SavedMeeting = { ...m, id: m.id || genId(), savedAt: Date.now(), by: clientId() }
  try {
    const r = await fetch(apiUrl(API, unit), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(entry),
    })
    if (!r.ok) throw new Error('bad status')
    return (await r.json()) as SavedMeeting
  } catch {
    writeLocal([entry, ...readLocal(unit)], unit)
    return entry
  }
}

export async function deleteMeeting(id: string): Promise<void> {
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(`${API}/${id}`, unit), { method: 'DELETE', headers: authHeaders(false) })
    if (!r.ok) throw new Error('bad status')
  } catch {
    writeLocal(readLocal(unit).filter((m) => m.id !== id), unit)
  }
}

/** Cache the latest meetings list locally (called from the realtime subscription). */
export function cacheMeetings(list: SavedMeeting[]) {
  const unit = getUnit()
  writeLocal(list, unit)
}
