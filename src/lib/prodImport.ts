import { useSyncExternalStore } from 'react'
import type { ProdSummary, ProdRow } from './prodSummary'
import { deleteProdSummary, fetchProdSummarys, saveProdSummary, upsertProdSummary, type ProdRecord } from './prodStore'
import { getUnit } from './unit'

/**
 * The Production Summary import flow (Unit 2 Shell / Unit 3 Roller), in one place.
 *
 * The header's upload button and the KPI page both need this: the button opens the modal,
 * the page renders whichever import was converted. Keeping it in a small external store
 * avoids threading the same six props through App → KpiPage → modal.
 *
 * An upload does NOT become the KPI source on its own. It lands in "Recent imports", where
 * it can be inspected column by column, and only "Convert to KPI" promotes it — so a wrong
 * file never silently replaces the numbers the morning meeting is reading.
 */

export interface ImportStats {
  /** Every data row read from the sheet. */
  total: number
  /** Rows carrying production or downtime. */
  withData: number
  /** Rows the sheet lists but leaves entirely blank. They ARE imported — see statsFor. */
  empty: number
}

/** A saved import, plus the counts the Recent Imports table shows. */
export interface ProdImport extends ProdRecord {
  stats?: ImportStats
  /** When set, this import is what the KPI cards are computed from. */
  convertedAt?: number
}

let records: ProdImport[] = []
/** The workspace `records` belongs to — null until something is loaded. */
let loadedUnit: string | null = null
let modalOpen = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

// useSyncExternalStore needs a stable snapshot — these are reassigned, never mutated.
export const useImports = (): ProdImport[] => useSyncExternalStore(subscribe, () => records, () => records)
export const useImportModal = (): boolean => useSyncExternalStore(subscribe, () => modalOpen, () => modalOpen)

export const openImportModal = () => {
  modalOpen = true
  notify()
}
export const closeImportModal = () => {
  modalOpen = false
  notify()
}

/** The import the KPI cards read: the newest converted one. */
export const activeImport = (): ProdImport | null =>
  records.filter((r) => r.convertedAt).sort((a, b) => (b.convertedAt || 0) - (a.convertedAt || 0))[0] ?? null

export async function loadImports(force = false) {
  const unit = getUnit()
  if (loadedUnit === unit && !force) return records
  if (loadedUnit !== unit) {
    // Drop the previous workspace's imports at once — showing them for even a moment
    // while this one loads is how one unit's sheet ended up on another unit's page.
    records = []
    loadedUnit = unit
    notify()
  }
  const list = (await fetchProdSummarys()) as ProdImport[]
  // A second switch may have happened while this was in flight; that load owns the store now.
  if (getUnit() !== unit) return records
  records = list
  loadedUnit = unit
  notify()
  return records
}

/**
 * Describe what the sheet held.
 *
 * NOTHING is dropped — every row parsed is stored and shown in the table. These counts only
 * separate the rows that carry production or downtime from the ones the sheet lists with every
 * figure blank (a machine that stood idle and had nothing written against it). The old wording
 * called those "skipped", which read as data loss.
 */
/** True for a row the sheet lists with every figure blank. */
export const isEmptyRow = (r: ProdRow): boolean => !r.totalQty && !r.goodQty && !r.workingMin && !r.downtimeTotal

/** Those rows themselves, so the import screen can say exactly where they are. */
export const emptyRowsOf = (rep: ProdSummary): ProdRow[] => rep.rows.filter(isEmptyRow)

export function statsFor(rep: ProdSummary): ImportStats {
  let withData = 0
  let empty = 0
  for (const r of rep.rows) {
    if (isEmptyRow(r)) empty++
    else withData++
  }
  return { total: rep.rows.length, withData, empty }
}

/**
 * The month a parsed summary covers, by weight of rows.
 *
 * A sheet can spill a day or two into the next month, so the month holding the most rows
 * wins rather than the first date found. Empty when the sheet carries no usable dates.
 */
export function monthOfReport(rep: { rows: { date?: string }[] }): string {
  const count = new Map<string, number>()
  for (const r of rep.rows) {
    const m = String(r.date || '').slice(0, 7)
    if (/^\d{4}-\d{2}$/.test(m)) count.set(m, (count.get(m) ?? 0) + 1)
  }
  let best = ''
  let most = 0
  for (const [m, n] of count) if (n > most) ((most = n), (best = m))
  return best
}

/** Re-file an import under a different month. */
export async function setImportMonth(id: string, month: string) {
  const target = records.find((r) => r.id === id)
  if (!target) return
  const next = { ...target, month }
  records = records.map((r) => (r.id === id ? next : r))
  notify()
  await upsertProdSummary(next)
}

export async function addImport(rep: ProdSummary, stats: ImportStats, month?: string): Promise<ProdImport> {
  const rec = (await saveProdSummary({ ...rep, stats, month: monthOfReport(rep) || month || undefined })) as ProdImport
  records = [rec, ...records]
  notify()
  return rec
}

/** Promote one import to be the KPI source; any previous one steps down. */
export async function convertToKpi(id: string) {
  const target = records.find((r) => r.id === id)
  if (!target) return
  const at = Date.now()
  records = records.map((r) => ({ ...r, convertedAt: r.id === id ? at : undefined }))
  notify()
  // Written back under the same id, so converting replaces rather than duplicates. Any
  // import that WAS the source is written back too, with the flag cleared.
  for (const r of records) await upsertProdSummary(r)
  await loadImports(true)
}

export async function removeImport(id: string) {
  records = records.filter((r) => r.id !== id)
  notify()
  await deleteProdSummary(id)
}

export async function removeAllImports() {
  const ids = records.map((r) => r.id)
  records = []
  notify()
  for (const id of ids) await deleteProdSummary(id)
}
