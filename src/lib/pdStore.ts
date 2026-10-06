import { authHeaders } from './auth'
import { apiUrl, getUnit, unitKey } from './unit'
import type { Unit } from './unit'
import type { PdReport } from './pdReport'
import { cacheList } from './cacheLimit'

/**
 * Saving and loading the PD Report. One record per uploaded workbook, newest first — the
 * KPI page reads the newest. It goes to the server (so every device in the unit sees the
 * same report) with a device-local copy as the offline fallback, the same shape the other
 * uploads use.
 */

export interface PdRecord extends PdReport {
  id: string
  savedAt: number
  by?: string
  /** Row counts shown in Recent Imports. */
  stats?: { total: number; withData: number; empty: number }
  /**
   * The month this report belongs to, 'YYYY-MM'.
   *
   * Read from the sheet's own dates when it has them, chosen on upload when it does not,
   * and editable afterwards — a file named "8.PD REPORT AUG-2026" says nothing to the app,
   * and two imports side by side are otherwise told apart only by when they were uploaded.
   */
  month?: string
  /** Set when this import was promoted to be the KPI source. */
  convertedAt?: number
}

const API = '/api/pdreport'
const KEY_BASE = 'mm.pdreport.v1'
/** Cache key for the ACTIVE unit — each workspace caches separately. */
const KEY = (unit: Unit) => unitKey(KEY_BASE, unit)

function readLocal(unit: Unit): PdRecord[] {
  try {
    const raw = localStorage.getItem(KEY(unit))
    return raw ? (JSON.parse(raw) as PdRecord[]) : []
  } catch {
    return []
  }
}
function writeLocal(list: PdRecord[], unit: Unit) {
  try {
    cacheList(KEY(unit), list)
  } catch {
    /* quota — the server copy is the real one */
  }
}

export async function fetchPdReports(): Promise<PdRecord[]> {
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(API, unit), { cache: 'no-store' })
    if (!r.ok) throw new Error(String(r.status))
    const list = (await r.json()) as PdRecord[]
    writeLocal(list, unit)
    return list
  } catch {
    return readLocal(unit)
  }
}

export async function savePdReport(rep: PdReport & Partial<Omit<PdRecord, keyof PdReport>>): Promise<PdRecord> {
  const unit = getUnit()
  const rec: PdRecord = { ...rep, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, savedAt: Date.now() }
  try {
    const r = await fetch(apiUrl(API, unit), { method: 'POST', headers: authHeaders(), body: JSON.stringify(rec) })
    if (!r.ok) throw new Error(String(r.status))
  } catch {
    /* offline — keep it on this device so the page still works */
  }
  writeLocal([rec, ...readLocal(unit).filter((x) => x.id !== rec.id)], unit)
  return rec
}

/** Write a record back under the SAME id — used when an import is converted or renamed. */
export async function upsertPdReport(rec: PdRecord): Promise<PdRecord> {
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(API, unit), { method: 'POST', headers: authHeaders(), body: JSON.stringify(rec) })
    if (!r.ok) throw new Error(String(r.status))
  } catch {
    /* offline — the device copy below still reflects the change */
  }
  writeLocal([rec, ...readLocal(unit).filter((x) => x.id !== rec.id)], unit)
  return rec
}

export async function deletePdReport(id: string) {
  const unit = getUnit()
  try {
    await fetch(apiUrl(`${API}/${id}`, unit), { method: 'DELETE', headers: authHeaders(false) })
  } catch {
    /* ignore — the local copy still goes */
  }
  writeLocal(readLocal(unit).filter((x) => x.id !== id), unit)
}
