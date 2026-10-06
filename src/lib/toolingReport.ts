import * as XLSX from 'xlsx'
import { apiUrl, getUnit, unitKey } from './unit'
import type { Unit } from './unit'
import { cacheList } from './cacheLimit'
import { toISODate } from './monthlyPlan'

export interface ToolingSheet {
  /** Tab name as it appears in Excel. */
  name: string
  /** The header row, in sheet order. Blank headings are kept so columns stay aligned. */
  columns: string[]
  /** Body rows, in sheet order. */
  cells: string[][]
  /** Column indexes that hold numbers, so the screen can right-align them. */
  numericCols: number[]
  /** Anything printed above the header row — shown as a caption. */
  preamble: string
}

export interface ToolingReport {
  /** 'YYYY-MM-DD' or 'YYYY-MM' — chosen on upload. */
  date: string
  month: string
  /** '14 Sep 2026' — how the date/month is printed. */
  title: string
  fileName: string
  /** Every visible tab in the workbook, in tab order. */
  sheets: ToolingSheet[]
  /** Body rows across all tabs. */
  rowCount: number
}

export interface ToolingReportRecord extends ToolingReport {
  id: string
  savedAt: number
  unit?: Unit
}

export interface ToolingCols {
  date: number
  machine: number
  issue: number
  expectedDate: number
  actualDate: number
  remark: number
}

export type ToolingRowStatus = 'completed' | 'delayed' | 'pending' | 'overdue' | 'none'

type Cell = string | number | null | undefined
type Grid = Cell[][]

const S = (v: Cell) => String(v ?? '').replace(/\s+/g, ' ').trim()
const isNum = (v: string) => v !== '' && Number.isFinite(Number(v.replace(/,/g, '')))

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2026-09-14' → '14 Sep 2026' or '2026-08' → 'Aug-2026'. */
export const toolingDateLabel = (dateStr: string): string => {
  if (!dateStr) return ''
  const dmy = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (dmy) {
    return `${dmy[3]} ${MONTH_LABELS[+dmy[2] - 1] ?? dmy[2]} ${dmy[1]}`
  }
  const m = /^(\d{4})-(\d{2})$/.exec(dateStr)
  return m ? `${MONTH_LABELS[+m[2] - 1] ?? m[2]}-${m[1]}` : dateStr
}

export const toolingMonthLabel = (month: string): string => toolingDateLabel(month)

/** Today as 'YYYY-MM-DD'. */
export const currentDateISO = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The month a fresh upload defaults to — the local month. */
export const currentMonth = (): string => currentDateISO()

const clean = (h: string) => h.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

export function toolingColumns(columns: string[]): ToolingCols {
  const heads = columns.map(clean)
  const find = (test: (h: string) => boolean) => heads.findIndex((h) => h !== '' && test(h))

  const expectedDate = find((h) => h.includes('expected') || h.includes('target') || h.includes('due'))
  const actualDate = find((h) => (h.includes('actual') || h.includes('done') || h.includes('closed')) && h !== expectedDate.toString())
  const machine = find((h) => h.includes('machine') || h.includes('mc') || h === 'equipment')
  const issue = find((h) => h.includes('issue') || h.includes('problem') || h.includes('breakdown') || h.includes('description'))
  const remark = find((h) => h.includes('remark') || h.includes('note') || h.includes('comment'))
  const date = find((h) => (h === 'date' || h.includes('date')) && heads[find((x) => x === h)] !== undefined && find((x) => x === h) !== expectedDate && find((x) => x === h) !== actualDate)

  return {
    date: date >= 0 ? date : 0,
    machine,
    issue,
    expectedDate,
    actualDate,
    remark,
  }
}

export function rowToolingStatus(row: string[], cols: ToolingCols, todayISO: string): ToolingRowStatus {
  if (cols.actualDate < 0 && cols.expectedDate < 0) return 'none'

  const actualVal = cols.actualDate >= 0 ? (row[cols.actualDate] ?? '').trim() : ''
  const expectedVal = cols.expectedDate >= 0 ? (row[cols.expectedDate] ?? '').trim() : ''

  const actualISO = toISODate(actualVal)
  const expectedISO = toISODate(expectedVal)

  if (actualVal !== '' || actualISO !== '') {
    if (expectedISO && actualISO && actualISO > expectedISO) {
      return 'delayed'
    }
    return 'completed'
  }

  if (expectedISO) {
    if (todayISO > expectedISO) return 'overdue'
    return 'pending'
  }

  return 'pending'
}

export function toolingSummary(sheets: ToolingSheet[], todayISO: string) {
  let total = 0
  let completed = 0
  let delayed = 0
  let pending = 0
  let overdue = 0

  for (const sheet of sheets) {
    const cols = toolingColumns(sheet.columns)
    for (const row of sheet.cells) {
      if (!row.some((c) => S(c) !== '')) continue
      total++
      const st = rowToolingStatus(row, cols, todayISO)
      if (st === 'completed') completed++
      else if (st === 'delayed') {
        completed++
        delayed++
      } else if (st === 'overdue') overdue++
      else if (st === 'pending') pending++
    }
  }

  return { total, completed, delayed, pending, overdue }
}

function trimBlankColumns(grid: Grid): { grid: Grid; width: number } {
  const width = grid.reduce((w, r) => Math.max(w, r?.length ?? 0), 0)
  const used: number[] = []
  for (let c = 0; c < width; c++) if (grid.some((r) => S(r?.[c]) !== '')) used.push(c)
  if (used.length === 0) return { grid: [], width: 0 }
  return { grid: grid.map((r) => used.map((c) => r?.[c] ?? '')), width: used.length }
}

function findHeaderRow(grid: Grid, width: number): number {
  let best = -1
  let bestCount = 0
  const limit = Math.min(grid.length, 25)
  for (let r = 0; r < limit; r++) {
    const count = (grid[r] ?? []).filter((c) => S(c) !== '').length
    const filled = (grid[r] ?? []).map(S).filter((v) => v !== '')
    const numeric = filled.filter(isNum).length
    if (filled.length && numeric > filled.length / 2) continue
    if (count > bestCount) {
      bestCount = count
      best = r
    }
  }
  return bestCount >= Math.max(2, Math.ceil(width * 0.4)) ? best : 0
}

function readSheet(name: string, ws: XLSX.WorkSheet): ToolingSheet | null {
  if (!ws?.['!ref']) return null
  const raw = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, defval: '', raw: false, blankrows: false }) as Grid
  const { grid, width } = trimBlankColumns(raw.filter((r) => (r ?? []).some((c) => S(c) !== '')))
  if (!grid.length || !width) return null

  const h = findHeaderRow(grid, width)
  const columns = (grid[h] ?? []).map(S)
  const cells = grid.slice(h + 1).map((r) => Array.from({ length: width }, (_, c) => S(r?.[c])))
  const preamble = grid
    .slice(0, h)
    .map((r) => (r ?? []).map(S).filter(Boolean).join(' · '))
    .filter(Boolean)
    .join(' — ')

  const numericCols: number[] = []
  for (let c = 0; c < width; c++) {
    const vals = cells.map((r) => r[c]).filter((v) => v !== '')
    if (vals.length >= 2 && vals.filter(isNum).length >= vals.length * 0.6) numericCols.push(c)
  }
  return { name, columns, cells, numericCols, preamble }
}

/** Read every visible sheet of a tooling workbook. */
export function parseToolingWorkbook(buf: ArrayBuffer, fileName: string, dateOrMonth: string): ToolingReport {
  const wb = XLSX.read(buf, { type: 'array' })
  const hidden = new Set((wb.Workbook?.Sheets ?? []).filter((m) => m && m.Hidden).map((m) => String(m.name)))
  const sheets: ToolingSheet[] = []

  for (const sheetName of wb.SheetNames) {
    if (hidden.has(sheetName)) continue
    const s = readSheet(sheetName, wb.Sheets[sheetName])
    if (s) sheets.push(s)
  }

  if (sheets.length === 0) throw new Error('No readable sheets found in this tooling report workbook.')

  const rowCount = sheets.reduce((sum, s) => sum + s.cells.length, 0)
  const month = dateOrMonth.slice(0, 7)
  return {
    date: dateOrMonth,
    month,
    title: toolingDateLabel(dateOrMonth),
    fileName,
    sheets,
    rowCount,
  }
}

const API = '/api/toolingreport'
const KEY_BASE = 'mm.toolingreport.v1'
const KEY = (unit: Unit) => unitKey(KEY_BASE, unit)

const sortBySaved = (list: ToolingReportRecord[]) => [...list].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))

function readLocal(unit: Unit): ToolingReportRecord[] {
  try {
    return sortBySaved(JSON.parse(localStorage.getItem(KEY(unit)) || '[]') as ToolingReportRecord[])
  } catch {
    return []
  }
}

function writeLocal(list: ToolingReportRecord[], unit: Unit) {
  try {
    cacheList(KEY(unit), list)
  } catch {
    /* quota — ignore */
  }
}

const authHeaders = (json = true): Record<string, string> => {
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  try {
    const tok = localStorage.getItem('mm.auth.token')
    if (tok) h.Authorization = `Bearer ${tok}`
  } catch {
    /* ignore */
  }
  return h
}

export async function loadToolingReports(): Promise<ToolingReportRecord[]> {
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(API, unit), { headers: authHeaders(false) })
    if (!r.ok) throw new Error('bad')
    const list = (await r.json()) as ToolingReportRecord[]
    writeLocal(list, unit)
    return sortBySaved(list)
  } catch {
    return readLocal(unit)
  }
}

export async function saveToolingReport(report: ToolingReport): Promise<ToolingReportRecord> {
  const unit = getUnit()
  const recId = `tool-${report.date || report.month}`
  const rec: ToolingReportRecord = { ...report, id: recId, savedAt: Date.now() }
  try {
    const r = await fetch(apiUrl(API, unit), { method: 'POST', headers: authHeaders(), body: JSON.stringify(rec) })
    if (!r.ok) throw new Error('bad')
    return (await r.json()) as ToolingReportRecord
  } catch {
    writeLocal([rec, ...readLocal(unit).filter((x) => x.id !== rec.id)], unit)
    return rec
  }
}

export async function deleteToolingReport(id: string): Promise<void> {
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(`${API}/${id}`, unit), { method: 'DELETE', headers: authHeaders(false) })
    if (!r.ok) throw new Error('bad')
  } catch {
    writeLocal(readLocal(unit).filter((x) => x.id !== id), unit)
  }
}
