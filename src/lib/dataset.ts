import { prioritise } from './aggregate'
import { type MachineRow, type ParsedReport } from '../types'
import { efficiencyTarget } from './unit'

function roundMap(m: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(m || {})) out[k] = Math.round(v)
  return out
}

/**
 * Excel formula cells (e.g. 8hrs plan = 28800/cycle, efficiency = ach/run×100) hold
 * long floats that are only *displayed* rounded. Round every numeric field so the whole
 * app shows whole pieces / whole-% — this also cleans data restored from an older save.
 */
export function roundRow(r: MachineRow): MachineRow {
  const efficiency = r.efficiency === null ? null : Math.round(r.efficiency)
  return {
    ...r,
    cycleTime: r.cycleTime === null ? null : Math.round(r.cycleTime * 10) / 10,
    planQty: Math.round(r.planQty),
    runningPlan: Math.round(r.runningPlan),
    achQty: Math.round(r.achQty),
    backlog: Math.round(r.backlog),
    efficiency,
    rework: Math.round(r.rework),
    rejection: Math.round(r.rejection),
    turningRejection: Math.round(r.turningRejection),
    totalDowntime: Math.round(r.totalDowntime),
    downtime: roundMap(r.downtime),
    isCritical: efficiency !== null && efficiency < efficiencyTarget(),
  }
}

/** Top-bar shift selection. */
export type ShiftSel = 'both' | '1' | '2'
/** Per-import shift tag. */
export type ShiftOverride = 'auto' | '1' | '2'

export interface ImportedFile {
  id: string
  fileName: string
  importedAt: number
  shiftOverride: ShiftOverride
  /** Production day this report belongs to (YYYY-MM-DD). Same date's shifts combine. */
  reportDate?: string
  report: ParsedReport
}

export interface DatasetMeta {
  groups: string[]
  reasons: string[]
  fileName: string
}

/**
 * Classify a shift label to 1 or 2 (defaults to 1).
 *
 * Unit 1 writes "1st Shift" / "2nd Shift", but Unit 2 and Unit 3 use Roman numerals in the
 * sheet itself — and "II" contains no "2", so a plain digit check filed every second-shift
 * row under Shift 1.
 */
export function shiftNum(shift: string): 1 | 2 {
  const s = String(shift).trim().toLowerCase()
  if (/(^|[^a-z])ii([^a-z]|$)/.test(s)) return 2
  return s.includes('2') ? 2 : 1
}

export function shiftLabel(sel: ShiftSel): string {
  if (sel === '1') return 'Shift 1'
  if (sel === '2') return 'Shift 2'
  return 'Shift 1 & 2'
}

/** The effective shift string for a row, applying the import's override. */
export function effectiveShift(imp: ImportedFile, rowShift: string): string {
  if (imp.shiftOverride === '1') return '1st Shift'
  if (imp.shiftOverride === '2') return '2nd Shift'
  return rowShift || '1st Shift'
}

/** Which shifts (1/2) are present in an import, after override. */
export function importShifts(imp: ImportedFile): number[] {
  if (imp.shiftOverride === '1') return [1]
  if (imp.shiftOverride === '2') return [2]
  const set = new Set<number>()
  for (const r of imp.report.rows) set.add(shiftNum(r.shift))
  return Array.from(set).sort()
}

/** Flatten every import into one editable, re-identified, prioritised row list. */
export function buildRows(imports: ImportedFile[]): MachineRow[] {
  let id = 0
  const out: MachineRow[] = []
  for (const imp of imports) {
    for (const r of imp.report.rows) {
      out.push(roundRow({ ...r, id: id++, shift: effectiveShift(imp, r.shift) }))
    }
  }
  return prioritise(out)
}

/** Union groups + downtime reasons across imports, and a display file name. */
export function combineMeta(imports: ImportedFile[]): DatasetMeta {
  const groups: string[] = []
  const reasons: string[] = []
  for (const imp of imports) {
    for (const g of imp.report.groups) if (!groups.includes(g)) groups.push(g)
    for (const rn of imp.report.downtimeReasons) if (!reasons.includes(rn)) reasons.push(rn)
  }
  const fileName =
    imports.length === 0
      ? ''
      : imports.length === 1
        ? imports[0].fileName
        : `${imports.length} files`
  return { groups, reasons, fileName }
}

export function filterByShift(rows: MachineRow[], sel: ShiftSel): MachineRow[] {
  if (sel === 'both') return rows
  const want = sel === '1' ? 1 : 2
  return rows.filter((r) => shiftNum(r.shift) === want)
}

export function makeImport(report: ParsedReport, shiftOverride: ShiftOverride = 'auto'): ImportedFile {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName: report.fileName,
    importedAt: Date.now(),
    shiftOverride,
    report,
  }
}

// ---- Persist the active dashboard so a refresh restores it (empty until first import) ----
const ACTIVE_KEY = 'mm.active.v1'

export function loadActiveImports(): ImportedFile[] {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY)
    const list = raw ? (JSON.parse(raw) as ImportedFile[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function saveActiveImports(list: ImportedFile[]) {
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(list))
  } catch {
    /* quota / disabled */
  }
}
