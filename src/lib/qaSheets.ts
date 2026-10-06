// Every sheet of the QA workbook, read generically.
//
// The workbook is not one report — it is ~22 sheets built around two source sheets
// ("Customer Goods Return 25-26" and "MRS Observation_Return good"). Everything else is a
// view someone built on top of those two: item-wise return matrices (Races, CRB), per-item
// defect matrices named after a SHORT item code (9916, 11684 …), OK-vs-received summaries,
// and Excel pivots. Rather than hand-code 22 parsers, this reads any sheet into one of two
// generic shapes and lets the UI chart whichever the user picks.
import * as XLSX from 'xlsx'

export type Cell = string | number | Date | null | undefined

/** A "<label> × month" grid — Races, CRB, Dispatch Data_Graph, and every defect sheet. */
export interface MatrixSheet {
  kind: 'matrix'
  name: string
  title: string
  /** What the first text column holds: "Item Name", "Defect", "Customer Observation"… */
  labelHeader: string
  /** Month columns as YYYY-MM, ascending. */
  months: string[]
  monthLabels: string[]
  rows: { name: string; cells: number[]; total: number }[]
  colTotals: number[]
  grandTotal: number
}

/** Anything else — the two source sheets, OK-against-received, the Excel pivots. */
export interface FlatSheet {
  kind: 'flat'
  name: string
  title: string
  columns: string[]
  /** Numeric columns, by index — the ones worth summing or charting. */
  numericCols: number[]
  rows: Cell[][]
}

export type QaSheet = MatrixSheet | FlatSheet

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Excel dates arrive as Date objects, serial numbers, or "Apr-25" text. Normalise to YYYY-MM. */
export function cellMonth(v: Cell): string | null {
  if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}`
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  }
  const s = String(v ?? '').trim()
  const m = s.match(/^([A-Za-z]{3})[a-z]*[-\s/]?(\d{2,4})$/)
  if (m) {
    const mi = MON.findIndex((x) => x.toLowerCase() === m[1].toLowerCase())
    if (mi >= 0) {
      const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])
      return `${y}-${String(mi + 1).padStart(2, '0')}`
    }
  }
  return null
}
export const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-')
  return `${MON[Number(m) - 1]}-${y.slice(2)}`
}

/**
 * These sheets write "nothing here" several ways: an empty cell, a hyphen, an em-dash, or
 * "N/A". None of them is a category, so none should become a bar or a pivot row.
 */
export const isBlankLabel = (v: unknown): boolean => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim()
  return s === '' || /^[-–—.]+$/.test(s) || /^(n\/?a|na|nil|none|blank)$/i.test(s)
}

const num = (v: Cell): number => {
  if (v == null || v === '' || v === '-') return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}
const txt = (v: Cell): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').replace(/\s+/g, ' ').trim())

/**
 * Item codes in the source sheets are long (OWBA19916A, IRBC11684). The workbook names each
 * item's defect sheet after the digits in the middle — 9916, 11684 — so a row in Races/CRB
 * can be linked straight to the sheet that explains it.
 */
export function shortCodeOf(item: string): string | null {
  const digits = String(item || '').replace(/[^0-9]/g, '')
  if (digits.length < 4) return null
  // The sheet names use the last 4–5 digits of the code (9916, 19913 → 9913, 11684).
  return digits.length >= 5 ? digits.slice(-5) : digits
}
/** Find the sheet that details one item, trying the 5- then 4-digit form. */
export function detailSheetFor(item: string, names: string[]): string | null {
  const digits = String(item || '').replace(/[^0-9]/g, '')
  if (digits.length < 4) return null
  for (const n of [digits.slice(-5), digits.slice(-4)]) {
    const hit = names.find((s) => s.trim() === n)
    if (hit) return hit
  }
  return null
}

/** Read one worksheet into a matrix or flat shape. */
function readSheet(name: string, ws: XLSX.WorkSheet): QaSheet | null {
  // Some exports blow the range out to the full XFD width; clamp so we don't walk millions
  // of empty cells and hang the tab.
  if (ws['!ref']) {
    const r = XLSX.utils.decode_range(ws['!ref'])
    if (r.e.c > 60) {
      r.e.c = 60
      ws['!ref'] = XLSX.utils.encode_range(r)
    }
  }
  const grid = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: '' })
  const rows = grid.filter((r) => r.some((c) => txt(c) !== ''))
  if (rows.length < 2) return null
  // Trim columns nobody filled — these sheets carry a long tail of empty cells that would
  // otherwise be reported as real columns.
  let last = 0
  for (const r of rows) for (let i = 0; i < r.length; i++) if (txt(r[i]) !== '') last = Math.max(last, i)
  for (let i = 0; i < rows.length; i++) rows[i] = rows[i].slice(0, last + 1)

  // The header is the row in the first few with the most filled cells — the row above it,
  // when it holds a single long string, is the sheet's own title.
  let hi = 0
  let best = -1
  for (let i = 0; i < Math.min(4, rows.length); i++) {
    const filled = rows[i].filter((c) => txt(c) !== '').length
    if (filled > best) {
      best = filled
      hi = i
    }
  }
  const title = hi > 0 ? txt(rows[hi - 1].find((c) => txt(c) !== '')) : ''
  const header = rows[hi]
  const body = rows.slice(hi + 1)

  // Which header cells are months?
  const monthCols: { i: number; ym: string }[] = []
  header.forEach((c, i) => {
    const ym = cellMonth(c)
    if (ym) monthCols.push({ i, ym })
  })

  const twoLevel = /return vs actual dispatch/i.test(name) || /return goods actual dispatch/i.test(title)
  if (monthCols.length >= 2 && !twoLevel) {
    // ---- matrix: label column + month columns ----
    const labelIdx = header.findIndex(
      (c, i) => !monthCols.some((m) => m.i === i) && txt(c) !== '' && !/^sr[._ ]?no/i.test(txt(c)),
    )
    const li = labelIdx >= 0 ? labelIdx : 1
    const ordered = [...monthCols].sort((a, b) => a.ym.localeCompare(b.ym))
    const out: MatrixSheet['rows'] = []
    for (const r of body) {
      const nm = txt(r[li])
      if (!nm || /^(total|grand total)$/i.test(nm)) continue
      const cells = ordered.map((m) => num(r[m.i]))
      const total = cells.reduce((s, v) => s + v, 0)
      if (total === 0 && cells.every((v) => v === 0)) continue // a label with no numbers
      out.push({ name: nm, cells, total })
    }
    if (!out.length) return null
    out.sort((a, b) => b.total - a.total)
    const colTotals = ordered.map((_, ci) => out.reduce((s, r) => s + r.cells[ci], 0))
    return {
      kind: 'matrix',
      name,
      title,
      labelHeader: txt(header[li]) || 'Item',
      months: ordered.map((m) => m.ym),
      monthLabels: ordered.map((m) => monthLabel(m.ym)),
      rows: out,
      colTotals,
      grandTotal: colTotals.reduce((s, v) => s + v, 0),
    }
  }

  // ---- flat: whatever columns the sheet has ----
  const columns = header.map((c, i) => txt(c) || `Col ${i + 1}`)
  const width = columns.length
  const data = body.map((r) => Array.from({ length: width }, (_, i) => (r[i] instanceof Date ? txt(r[i]) : (r[i] ?? ''))))
  // A column counts as numeric when most of its filled cells are numbers.
  const numericCols: number[] = []
  for (let i = 0; i < width; i++) {
    let filled = 0
    let nums = 0
    for (const r of data) {
      if (txt(r[i]) === '') continue
      filled++
      if (typeof r[i] === 'number') nums++
    }
    if (filled >= 3 && nums / filled > 0.8) numericCols.push(i)
  }
  return { kind: 'flat', name, title, columns, numericCols, rows: data }
}

/** Read EVERY sheet of the workbook. Sheets that hold nothing usable are dropped. */
export function parseQaSheets(buf: ArrayBuffer): QaSheet[] {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const out: QaSheet[] = []
  for (const name of wb.SheetNames) {
    try {
      const s = readSheet(name, wb.Sheets[name])
      if (s) out.push(s)
    } catch {
      /* one unreadable sheet must not lose the other twenty-one */
    }
  }
  return out
}

/** Months present across every matrix sheet — feeds the Month / Year filters. */
export function sheetMonths(sheets: QaSheet[]): string[] {
  const set = new Set<string>()
  for (const s of sheets) if (s.kind === 'matrix') s.months.forEach((m) => set.add(m))
  return [...set].sort()
}
