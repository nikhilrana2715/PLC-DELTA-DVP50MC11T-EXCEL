// Monthly Planning — parse the "Plan Confirmation Sheet" workbook, derive its KPIs, and
// persist one record per month (server-synced, localStorage fallback).
//
// Sheet shape (Aug-2026_Plan Confirmation Sheet_R01.xlsx):
//   row 1  summary strip — "Plan Aug-2026" | "Require to process Qty." <total>
//                          "Plan Confirmation Qty." <total> | then one total per day
//   row 2  header        — Sr.No. | SAP Code | Item Code | Name of Item | Plan Qty. |
//                          Plan Confirmation Qty. | Pending Qty. | Planing status |
//                          Date From | Date To | 1/Aug/2026 … 31/Aug/2026
//   row 3+ one item per row, its confirmed quantity spread across the day columns.
import * as XLSX from 'xlsx'
import { apiUrl, getUnit, unitKey } from './unit'
import type { Unit } from './unit'
import { cacheList } from './cacheLimit'

export interface MonthPlanRow {
  srNo: string
  sapCode: string
  itemCode: string
  itemName: string
  planQty: number
  confirmQty: number
  pendingQty: number
  status: string
  dateFrom: string // as printed in the sheet
  dateTo: string
  /** One entry per day column, in sheet order. */
  days: number[]
  /** Row total across `days` — equals confirmQty when the sheet is internally consistent. */
  daysTotal: number
}

/**
 * A machine tab, kept as the sheet has it.
 *
 * `columns` is the tab's own header row and `cells` its rows, both in sheet order, so the
 * page can print the sheet rather than a chosen subset of it. The totals below are picked out
 * by finding those columns — they drive the summary line, they do not narrow what is shown.
 */
export interface MachinePlan {
  /** Sheet name — the machine, e.g. 'CG-06'. */
  machine: string
  columns: string[]
  cells: string[][]
  /** Column indexes that hold numbers, so the page can right-align them. */
  numericCols: number[]
  batchQty: number
  qtyToProcess: number
  hoursRequired: number
  daysRequired: number
}

export interface MonthlyPlan {
  /** 'YYYY-MM' — the month the day columns belong to. */
  month: string
  /** 'Aug-2026' as printed on the sheet (falls back to the derived month). */
  title: string
  /** The plan sheet's own tab name in the workbook, e.g. 'Unit 3 (Roller)'. */
  sheetName: string
  fileName: string
  /** ISO date of each day column, in sheet order. */
  dayDates: string[]
  /**
   * What the quantities are counted in.
   *
   * Unit 1 plans in pieces under "Plan Qty."; the Roller sheet plans in kilograms under
   * "Plan K.G" and leaves the pieces column empty. Same layout, different measure — so the
   * screens can label the numbers instead of printing a bare figure that means two things.
   */
  measure: 'pcs' | 'kg'
  /** Sheet's own summary strip. */
  requireToProcess: number
  planConfirmation: number
  rows: MonthPlanRow[]
  /** Column totals across all rows, aligned to `dayDates`. */
  dayTotals: number[]
  /**
   * One entry per machine tab in the workbook, in tab order.
   *
   * Machines with a tab but nothing queued are kept with zero rows on purpose — a machine
   * that disappears from the list reads as "not in this plan" rather than "nothing booked".
   */
  machines: MachinePlan[]
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
type Cell = string | number | null | undefined
type Grid = Cell[][]

const S = (v: Cell) => String(v ?? '').replace(/\s+/g, ' ').trim()
const norm = (v: Cell) => S(v).toLowerCase()
const num = (v: Cell): number => {
  if (v == null || v === '' || v === '-') return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** '1/Aug/2026', '01.08.2026', '2026-08-01' or an Excel serial → ISO, else ''. */
export function toISODate(v: Cell): string {
  if (typeof v === 'number' && v > 20000) return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10)
  const s = S(v)
  if (!s) return ''
  // 1/Aug/2026 · 1-Aug-2026 · 1 Aug 2026
  const named = s.match(/^(\d{1,2})[\s./-]+([A-Za-z]{3,})[\s./-]+(\d{4})$/)
  if (named) {
    const m = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase())
    if (m >= 0) return `${named[3]}-${String(m + 1).padStart(2, '0')}-${named[1].padStart(2, '0')}`
  }
  // 01.08.2026 · 01/08/2026 · 1-8-2026  (day first, as the sheet writes them)
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]
    return `${y}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }
  // 2026-08-01
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return ''
}

export const monthLabelOf = (month: string) => {
  const m = +String(month).slice(5, 7)
  return m >= 1 && m <= 12 ? `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)}-${String(month).slice(0, 4)}` : month
}

/**
 * Does this sheet look like a machine tab?
 *
 * A filled tab is recognised by its own header — Item Code together with the batch or rate
 * columns. An EMPTY tab has no header to go on, so the sheet name decides: 'CG-06', 'WC-01',
 * 'QE-133' are machines; 'Drop down sheet' is not.
 */
const MACHINE_NAME = /^[A-Z]{1,3}-\s*\d+/i

function parseMachineTab(machine: string, grid: Grid): MachinePlan {
  const empty: MachinePlan = {
    machine, columns: [], cells: [], numericCols: [],
    batchQty: 0, qtyToProcess: 0, hoursRequired: 0, daysRequired: 0,
  }
  const headerRow = grid.findIndex((r) => (r || []).some((c) => /^item code$/.test(norm(c))))
  if (headerRow < 0) return empty

  const header = (grid[headerRow] || []).map((c) => S(c))
  // Trailing blank headers are Excel's empty margin, not columns of the sheet.
  let width = header.length
  while (width > 0 && !header[width - 1]) width--
  const columns = header.slice(0, width)

  const H = columns.map((h) => norm(h))
  const at = (re: RegExp) => H.findIndex((h) => re.test(h))
  const cItem = at(/^item code$/)
  const cBatchQty = at(/total batch quantity/)
  const cProcess = at(/quantity to process/)
  const cHours = at(/total hours required/)
  const cDays = at(/number of days required/)

  const cells: string[][] = []
  let batchQty = 0
  let qtyToProcess = 0
  let hoursRequired = 0
  let daysRequired = 0
  const numeric = new Array(width).fill(0)
  const filled = new Array(width).fill(0)

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] || []
    if (cItem >= 0 && !S(row[cItem])) continue
    const out: string[] = []
    for (let c = 0; c < width; c++) {
      const text = S(row[c])
      out.push(text)
      if (text) {
        filled[c]++
        if (/^-?[\d,]+(\.\d+)?$/.test(text)) numeric[c]++
      }
    }
    cells.push(out)
    if (cBatchQty >= 0) batchQty += num(row[cBatchQty])
    if (cProcess >= 0) qtyToProcess += num(row[cProcess])
    if (cHours >= 0) hoursRequired += num(row[cHours])
    if (cDays >= 0) daysRequired += num(row[cDays])
  }

  // A column counts as numeric when nearly everything in it reads as a number.
  const numericCols: number[] = []
  for (let c = 0; c < width; c++) if (filled[c] > 0 && numeric[c] / filled[c] > 0.8) numericCols.push(c)

  return { machine, columns, cells, numericCols, batchQty, qtyToProcess, hoursRequired, daysRequired }
}

/** Parse the Plan Confirmation workbook. Throws a message the UI can show as-is. */
export function parseMonthlyPlanWorkbook(buf: ArrayBuffer, fileName: string): MonthlyPlan {
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames.find((n) => /plan/i.test(n)) ?? wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const grid = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, defval: '', raw: false, blankrows: true }) as Grid

  // Every OTHER sheet that is a machine — the plan sheet says what to make, these say where.
  const hidden = new Set(
    (wb.Workbook?.Sheets ?? []).filter((meta) => meta && meta.Hidden).map((meta) => String(meta.name)),
  )
  const machines: MachinePlan[] = []
  for (const name of wb.SheetNames) {
    if (name === sheetName) continue
    const tab = wb.Sheets[name]
    const tabGrid = tab?.['!ref']
      ? (XLSX.utils.sheet_to_json<Cell[]>(tab, { header: 1, defval: '', raw: false, blankrows: true }) as Grid)
      : []
    // A sheet the author hid in Excel is working material, not something to put on screen.
    if (hidden.has(name)) continue
    // Item Code alone is not enough — the reference sheet has one too. A machine tab also
    // carries the capacity columns that make it a machine tab.
    const hasCapacityHeader = tabGrid.some((r) => {
      const cells = (r || []).map(norm)
      return (
        cells.some((cell) => /^item code$/.test(cell)) &&
        cells.some((cell) => /total batch quantity|quantity to process|^pph/.test(cell))
      )
    })
    const looksLikeMachine = MACHINE_NAME.test(name.trim()) || hasCapacityHeader
    if (!looksLikeMachine) continue
    machines.push(parseMachineTab(name.trim(), tabGrid))
  }

  /*
   * Header row = the one naming an item column and some kind of planned quantity.
   *
   * The quantity gets spelled differently from sheet to sheet — "Plan Qty.", "Plan K.G",
   * "Plan Confirmation Qty." — and a unit that works in kilograms may not carry the pieces
   * column at all. Matching one exact spelling meant a sheet that dropped it stopped being
   * recognised as a plan at all, so any of them will do.
   */
  const PLAN_QTY_HEAD = /^plan\s*(qty|quantity|k\.?\s*g|confirmation)/
  let headerRow = -1
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const cells = (grid[r] || []).map(norm)
    if (cells.some((c) => PLAN_QTY_HEAD.test(c)) && cells.some((c) => /item/.test(c))) {
      headerRow = r
      break
    }
  }
  if (headerRow < 0) {
    const seen = grid.slice(0, 8).map((row) => (row || []).map(S).filter(Boolean).join(' | ')).filter(Boolean)
    throw new Error(
      `Could not find the header row (a row with an item column and a planned quantity — ` +
        `"Plan Qty.", "Plan K.G" or "Plan Confirmation Qty.") in sheet "${sheetName}".\n\n` +
        `First rows found:\n${seen.join('\n')}`,
    )
  }

  const H = (grid[headerRow] || []).map(norm)
  const find = (pred: (h: string) => boolean) => H.findIndex(pred)
  const cSr = find((h) => /^sr\.?\s*no/.test(h))
  const cSap = find((h) => /sap/.test(h))
  const cItemCode = find((h) => /item code/.test(h))
  const cItemName = find((h) => /name of item|item name/.test(h))
  // The quantity column: pieces on Unit 1, kilograms on the Roller sheet. Both headers can
  // be present with only one of them filled in, so the column that actually carries figures
  // wins rather than whichever appears first.
  const cPlanQty = find((h) => /^plan qty/.test(h))
  const cPlanKg = find((h) => /^plan\s*k\.?\s*g/.test(h))
  const cConfirm = find((h) => /confirmation qty/.test(h))
  const cPending = find((h) => /pending qty/.test(h))
  const cStatus = find((h) => /stat(u|i)s/.test(h))
  const cFrom = find((h) => /date from/.test(h))
  const cTo = find((h) => /date to/.test(h))

  // Day columns: every header cell that reads as a date.
  const dayCols: number[] = []
  const dayDates: string[] = []
  for (let c = 0; c < (grid[headerRow] || []).length; c++) {
    const iso = toISODate((grid[headerRow] || [])[c])
    if (iso) {
      dayCols.push(c)
      dayDates.push(iso)
    }
  }
  if (dayDates.length === 0) throw new Error(`No day columns found in sheet "${sheetName}" — the header row should carry one date per day (e.g. 1/Aug/2026).`)

  const month = dayDates[0].slice(0, 7)
  // Sheet title cell, e.g. "Plan Aug-2026" on the summary strip above the header.
  const titleCell = headerRow > 0 ? S((grid[headerRow - 1] || [])[0]).replace(/^plan\s+/i, '') : ''
  const title = titleCell || monthLabelOf(month)

  // Summary strip: the value sits to the right of each label.
  const strip = headerRow > 0 ? grid[headerRow - 1] || [] : []
  const afterLabel = (re: RegExp): number => {
    for (let c = 0; c < strip.length; c++) {
      if (re.test(norm(strip[c]))) {
        for (let k = c + 1; k < strip.length; k++) if (S(strip[k])) return num(strip[k])
      }
    }
    return 0
  }

  const columnSum = (c: number) => {
    if (c < 0) return 0
    let total = 0
    for (let r = headerRow + 1; r < grid.length; r++) total += num((grid[r] || [])[c])
    return total
  }
  const kgSum = columnSum(cPlanKg)
  const qtySum = columnSum(cPlanQty)
  const useKg = kgSum > 0 && qtySum === 0
  const cPlan = useKg ? cPlanKg : cPlanQty >= 0 ? cPlanQty : cPlanKg
  const measure: 'pcs' | 'kg' = useKg ? 'kg' : 'pcs'

  const rows: MonthPlanRow[] = []
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] || []
    const itemCode = cItemCode >= 0 ? S(row[cItemCode]) : ''
    const itemName = cItemName >= 0 ? S(row[cItemName]) : ''
    if (!itemCode && !itemName) continue // blank separator / trailing rows
    const days = dayCols.map((c) => num(row[c]))
    rows.push({
      srNo: cSr >= 0 ? S(row[cSr]) : String(rows.length + 1),
      sapCode: cSap >= 0 ? S(row[cSap]) : '',
      itemCode,
      itemName,
      planQty: cPlan >= 0 ? num(row[cPlan]) : 0,
      confirmQty: cConfirm >= 0 ? num(row[cConfirm]) : 0,
      pendingQty: cPending >= 0 ? num(row[cPending]) : 0,
      status: cStatus >= 0 ? S(row[cStatus]) : '',
      dateFrom: cFrom >= 0 ? S(row[cFrom]) : '',
      dateTo: cTo >= 0 ? S(row[cTo]) : '',
      days,
      daysTotal: days.reduce((s, n) => s + n, 0),
    })
  }
  if (rows.length === 0) throw new Error(`Found the header row in sheet "${sheetName}", but no item rows under it.`)

  return {
    month,
    title,
    sheetName,
    measure,
    fileName,
    dayDates,
    requireToProcess: afterLabel(/require to process/) || rows.reduce((s, r) => s + r.planQty, 0),
    planConfirmation: afterLabel(/confirmation qty/) || rows.reduce((s, r) => s + r.confirmQty, 0),
    rows,
    dayTotals: dayDates.map((_, i) => rows.reduce((s, r) => s + r.days[i], 0)),
    machines,
  }
}

// ---- KPIs ---------------------------------------------------------------

/** Rework / rejection / backlog actually recorded for the month, summed from the saved
 *  daily production reports. The plan sheet itself carries none of these. */
export interface MonthActuals {
  rework: number
  rejection: number
  backlog: number
  /** Dates that contributed — shown so the user can see the figure is partial. */
  dates: string[]
}

export interface MonthlyPlanKpis {
  todayPlan: number
  todayDate: string
  todayInMonth: boolean
  totalPlan: number
  totalConfirm: number
  totalPending: number
  items: number
  daysPlanned: number
}

export function monthlyPlanKpis(plan: MonthlyPlan, todayISO: string): MonthlyPlanKpis {
  const idx = plan.dayDates.indexOf(todayISO)
  return {
    todayPlan: idx >= 0 ? plan.dayTotals[idx] : 0,
    todayDate: todayISO,
    todayInMonth: idx >= 0,
    totalPlan: plan.rows.reduce((s, r) => s + r.planQty, 0),
    totalConfirm: plan.rows.reduce((s, r) => s + r.confirmQty, 0),
    totalPending: plan.rows.reduce((s, r) => s + r.pendingQty, 0),
    items: plan.rows.length,
    daysPlanned: plan.dayTotals.filter((n) => n > 0).length,
  }
}

/**
 * Re-file a parsed plan under a different month.
 *
 * The month of a Plan Confirmation sheet is not a label — it IS the day columns, so simply
 * relabelling one would leave Today Planning looking up a date the plan does not contain and
 * the whole month reading empty. Re-filing therefore moves the days: 1/Aug becomes 1/Sep,
 * 2/Aug becomes 2/Sep, and a day the target month does not have (a 31st that lands in a
 * 30-day month) is dropped along with its column, rather than quietly folded into another day.
 *
 * Used only when someone explicitly picks a month on the import screen — a sheet left on
 * "from the sheet" is never touched.
 */
export function shiftPlanToMonth(plan: MonthlyPlan, month: string): MonthlyPlan {
  if (!/^\d{4}-\d{2}$/.test(month) || month === plan.month) return plan
  const [ty, tm] = month.split('-').map(Number)
  /** Days in the target month, so a 31st with nowhere to go is dropped, not clamped. */
  const lastDay = new Date(ty, tm, 0).getDate()

  const keep: number[] = []
  const dayDates: string[] = []
  plan.dayDates.forEach((iso, i) => {
    const day = Number(iso.slice(8, 10))
    if (day < 1 || day > lastDay) return
    keep.push(i)
    dayDates.push(`${month}-${String(day).padStart(2, '0')}`)
  })

  /** The sheet's own printed From / To, moved by the same number of months. */
  const shiftText = (text: string): string => {
    const iso = toISODate(text)
    if (!iso) return text
    const d = new Date(iso + 'T00:00:00')
    const moved = new Date(ty, tm - 1 + (d.getMonth() - (Number(plan.month.slice(5, 7)) - 1)), 1)
    const day = Math.min(d.getDate(), new Date(moved.getFullYear(), moved.getMonth() + 1, 0).getDate())
    const p2 = (n: number) => String(n).padStart(2, '0')
    return `${p2(day)}.${p2(moved.getMonth() + 1)}.${moved.getFullYear()}`
  }

  const rows = plan.rows.map((r) => {
    const days = keep.map((i) => r.days[i] ?? 0)
    return {
      ...r,
      days,
      daysTotal: days.reduce((n, v) => n + v, 0),
      dateFrom: shiftText(r.dateFrom),
      dateTo: shiftText(r.dateTo),
    }
  })

  return {
    ...plan,
    month,
    title: monthLabelOf(month),
    dayDates,
    dayTotals: keep.map((i) => plan.dayTotals[i] ?? 0),
    rows,
  }
}

// ---- Persistence (server-synced, one record per month) -------------------

export interface MonthlyPlanRecord extends MonthlyPlan {
  id: string // `mplan-<YYYY-MM>`
  savedAt: number
  by?: string
}

const API = '/api/monthlyplan'
const KEY_BASE = 'mm.monthlyplan.v1'
/** Cache key for the ACTIVE unit — each workspace caches separately. */
const KEY = (unit: Unit) => unitKey(KEY_BASE, unit)

const sortBySaved = (list: MonthlyPlanRecord[]) => [...list].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))

function readLocal(unit: Unit): MonthlyPlanRecord[] {
  try {
    return sortBySaved(JSON.parse(localStorage.getItem(KEY(unit)) || '[]') as MonthlyPlanRecord[])
  } catch {
    return []
  }
}
function writeLocal(list: MonthlyPlanRecord[], unit: Unit) {
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

export async function loadMonthlyPlans(): Promise<MonthlyPlanRecord[]> {
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(API, unit), { headers: authHeaders(false) })
    if (!r.ok) throw new Error('bad')
    const list = (await r.json()) as MonthlyPlanRecord[]
    writeLocal(list, unit)
    return sortBySaved(list)
  } catch {
    return readLocal(unit)
  }
}

/** Save (overwrite) a month's plan. Stable id per month → re-uploading replaces it. */
export async function saveMonthlyPlan(plan: MonthlyPlan): Promise<MonthlyPlanRecord> {
  const unit = getUnit()
  const rec: MonthlyPlanRecord = { ...plan, id: `mplan-${plan.month}`, savedAt: Date.now() }
  try {
    const r = await fetch(apiUrl(API, unit), { method: 'POST', headers: authHeaders(), body: JSON.stringify(rec) })
    if (!r.ok) throw new Error('bad')
    return (await r.json()) as MonthlyPlanRecord
  } catch {
    writeLocal([rec, ...readLocal(unit).filter((x) => x.id !== rec.id)], unit)
    return rec
  }
}

export async function deleteMonthlyPlan(id: string): Promise<void> {
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(`${API}/${id}`, unit), { method: 'DELETE', headers: authHeaders(false) })
    if (!r.ok) throw new Error('bad')
  } catch {
    writeLocal(readLocal(unit).filter((x) => x.id !== id), unit)
  }
}
