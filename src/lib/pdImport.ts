import { useSyncExternalStore } from 'react'
import type { PdReport, PdRow } from './pdReport'
import { deletePdReport, fetchPdReports, savePdReport, upsertPdReport, type PdRecord } from './pdStore'
import { getUnit } from './unit'

/**
 * The PD Report import flow, in one place.
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
export interface PdImport extends PdRecord {
  stats?: ImportStats
  /**
   * Left over from the "convert to KPI" step, which promoted one import to be the single
   * KPI source. Records saved back then still carry it; nothing sets or reads it now — the
   * KPI page reads whichever import covers the month picked in its header.
   */
  convertedAt?: number
}

let records: PdImport[] = []
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
export const useImports = (): PdImport[] => useSyncExternalStore(subscribe, () => records, () => records)
export const useImportModal = (): boolean => useSyncExternalStore(subscribe, () => modalOpen, () => modalOpen)

export const openImportModal = () => {
  modalOpen = true
  notify()
}
export const closeImportModal = () => {
  modalOpen = false
  notify()
}

/** The newest import held, whichever month it covers. */
export const activeImport = (): PdImport | null =>
  [...records].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0] ?? null

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
  const list = (await fetchPdReports()) as PdImport[]
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
export const isEmptyRow = (r: PdRow): boolean => !r.total && !r.good && !r.workingMin && !r.reasonTotal

/** Those rows themselves, so the import screen can say exactly where they are. */
export const emptyRowsOf = (rep: PdReport): PdRow[] => rep.rows.filter(isEmptyRow)

export function statsFor(rep: PdReport): ImportStats {
  let withData = 0
  let empty = 0
  for (const r of rep.rows) {
    if (isEmptyRow(r)) empty++
    else withData++
  }
  return { total: rep.rows.length, withData, empty }
}

/**
 * The month a parsed report covers, by weight of rows.
 *
 * A report can spill a day or two into the next month, so the month holding the most rows
 * wins rather than the first date found. Empty when the sheet carries no usable dates —
 * then the month the uploader chose is used instead.
 */
export function monthOfReport(rep: PdReport): string {
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

export async function addImport(rep: PdReport, stats: ImportStats, month?: string): Promise<PdImport> {
  const rec = (await savePdReport({ ...rep, stats, month: monthOfReport(rep) || month || undefined })) as PdImport
  records = [rec, ...records]
  notify()
  return rec
}

/** Re-file an import under a different month. */
export async function setImportMonth(id: string, month: string) {
  const target = records.find((r) => r.id === id)
  if (!target) return
  const next = { ...target, month }
  records = records.map((r) => (r.id === id ? next : r))
  notify()
  await upsertPdReport(next)
}

export async function removeImport(id: string) {
  records = records.filter((r) => r.id !== id)
  notify()
  await deletePdReport(id)
}

export async function removeAllImports() {
  const ids = records.map((r) => r.id)
  records = []
  notify()
  for (const id of ids) await deletePdReport(id)
}
