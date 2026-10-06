import { authHeaders } from './auth'
import { apiUrl, getUnit, unitKey } from './unit'
import type { Unit } from './unit'
import type { ProdSummary } from './prodSummary'
import { cacheList } from './cacheLimit'

/**
 * Saving and loading the Production Summary Sheet — the Unit 2 (Shell) and Unit 3 (Roller)
 * workbook. One record per upload; the KPI page reads whichever one was converted. It goes to
 * the server so every device in the unit sees the same report, with a device-local copy as the
 * offline fallback — the same shape every other upload here uses.
 *
 * Separate from the Unit 1 PD Report store on purpose: the two workbooks have different
 * columns, so keeping one resource per format means a record can never be read with the
 * wrong parser.
 */

export interface ProdRecord extends ProdSummary {
  id: string
  savedAt: number
  by?: string
  /** Row counts shown in Recent Imports. */
  stats?: { total: number; withData: number; empty: number }
  /**
   * The month this summary belongs to, 'YYYY-MM'.
   *
   * Read from the sheet's own dates when it has them, chosen on upload when it does not —
   * the same rule the PD Report follows, so the two import screens read alike.
   */
  month?: string
  /** Set when this import was promoted to be the KPI source. */
  convertedAt?: number
}

const API = '/api/prodsummary'
const KEY_BASE = 'mm.prodsummary.v1'
/** Cache key for the ACTIVE unit — each workspace caches separately. */
const KEY = (unit: Unit) => unitKey(KEY_BASE, unit)

function readLocal(unit: Unit): ProdRecord[] {
  try {
    const raw = localStorage.getItem(KEY(unit))
    return raw ? (JSON.parse(raw) as ProdRecord[]) : []
  } catch {
    return []
  }
}
function writeLocal(list: ProdRecord[], unit: Unit) {
  try {
    cacheList(KEY(unit), list)
  } catch {
    /* quota — the server copy is the real one */
  }
}

export async function fetchProdSummarys(): Promise<ProdRecord[]> {
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(API, unit), { cache: 'no-store' })
    if (!r.ok) throw new Error(String(r.status))
    const list = (await r.json()) as ProdRecord[]
    writeLocal(list, unit)
    return list
  } catch {
    return readLocal(unit)
  }
}

export async function saveProdSummary(rep: ProdSummary & Partial<Omit<ProdRecord, keyof ProdSummary>>): Promise<ProdRecord> {
  const unit = getUnit()
  const rec: ProdRecord = { ...rep, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, savedAt: Date.now() }
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
export async function upsertProdSummary(rec: ProdRecord): Promise<ProdRecord> {
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

export async function deleteProdSummary(id: string) {
  const unit = getUnit()
  try {
    await fetch(apiUrl(`${API}/${id}`, unit), { method: 'DELETE', headers: authHeaders(false) })
  } catch {
    /* ignore — the local copy still goes */
  }
  writeLocal(readLocal(unit).filter((x) => x.id !== id), unit)
}
