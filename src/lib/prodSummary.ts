import * as XLSX from 'xlsx'
import { isoFromExcel } from './xlsxDate'

/**
 * The "Production Summary Sheet" workbook — Unit 2 (Shell) and Unit 3 (Roller).
 *
 * One parser serves both: the two files carry the same columns in the same order, and their
 * per-row formulas are identical bar one detail (Roller takes No Plan out of available hours,
 * Shell does not). Only three things differ on the surface:
 *
 *   • column 7 is "Roller Size" on one and "Item Name" on the other — both are descriptive
 *   • Roller ends with two extra columns, DIE and PUNCH
 *   • columns 24-26 are MISLABELLED in the Shell file
 *
 * That last one matters. Shell heads them "DOWN TIME", "IDEAL PRODUCTION" and "QUALITY", but
 * its own formulas say otherwise:
 *
 *   Y = J*Z            → ideal production QUANTITY (cycle rate x available hours)
 *   Z = X/60           → available HOURS
 *   AA = Z - downtime  → actual RUN hours
 *
 * Roller names the same three PDN / AVL. / ACT RUN, which is what they really are. So those
 * three are read by POSITION relative to the Total column, never by their header text —
 * trusting the labels would put downtime minutes where a quantity belongs.
 */

export interface ProdRow {
  /** 1-based row in the worksheet, so a reader can open the file and find this line. */
  excelRow: number
  sr: number
  date: string // yyyy-mm-dd
  shift: string
  machine: string
  operator: string
  itemCode: string
  routecard: string
  /** "Item Name" on the Shell sheet, "Roller Size" on the Roller one. */
  description: string
  process: string
  /** kg per hour. */
  cycleRate: number
  goodQty: number
  rework: number
  rejection: number
  totalQty: number
  workingMin: number
  /** Minutes by reason name, only the non-zero ones. */
  downtime: Record<string, number>
  downtimeTotal: number
  /** Working + downtime, the sheet's own Total column. */
  availableMin: number
  idealQty: number
  availableHrs: number
  runHrs: number
  availability: number // %
  performance: number // %
  quality: number // %
  oee: number // %
}

export interface ProdSummary {
  fileName: string
  rows: ProdRow[]
  dates: string[]
  shifts: string[]
  machines: string[]
  /** Downtime reason names, in sheet order. */
  reasons: string[]
  /** The label the sheet gives column 7, so the table can head it the way the unit does. */
  descriptionLabel: string
}

type Cell = string | number | boolean | Date | null | undefined

const txt = (v: Cell): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').replace(/\s+/g, ' ').trim()

const num = (v: Cell): number => {
  if (v === null || v === undefined || v === '' || v === '-') return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()


/**
 * Percentages arrive as fractions here (0.207 = 20.7%), unlike the Unit 1 report which stores
 * whole percents. A value above 1.5 is already a percent — Performance legitimately exceeds
 * 100%, so the cut-off leaves room for that rather than sitting at 1.
 */
const pctOf = (v: Cell): number => {
  const n = num(v)
  return n > 1.5 ? n : n * 100
}

/** Parse the workbook. Throws with a readable message when it isn't a Production Summary. */
export function parseProdSummary(buf: ArrayBuffer, fileName: string): ProdSummary {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames.find((n) => norm(n).includes('production summary')) || wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error('The workbook has no sheets.')

  // Clamp to the cells that exist — these files declare far more than they use.
  if (ws['!ref']) {
    const rng = XLSX.utils.decode_range(ws['!ref'])
    let lastRow = rng.s.r
    let lastCol = rng.s.c
    for (const key of Object.keys(ws)) {
      if (key[0] === '!') continue
      const cell = XLSX.utils.decode_cell(key)
      if (cell.r > lastRow) lastRow = cell.r
      if (cell.c > lastCol) lastCol = cell.c
    }
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: Math.min(lastCol, 60) } })
  }

  const grid = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, defval: '' })

  // The header is the row naming the machine column; a title row sits above it.
  const headerRow = grid.findIndex((r) => (r || []).some((c) => norm(c) === 'm/c name'))
  if (headerRow < 0)
    throw new Error(`Sheet "${sheetName}" does not look like a Production Summary — no "M/C Name" column found.`)

  const header = (grid[headerRow] || []).map((c) => txt(c))
  const H = header.map((h) => norm(h))
  const at = (test: (h: string) => boolean) => H.findIndex((h) => h !== '' && test(h))

  const iDate = at((h) => h === 'date')
  const iShift = at((h) => h === 'shift')
  const iMachine = at((h) => h === 'm/c name')
  const iWorking = at((h) => h.startsWith('working hours'))
  const iTotalMin = H.findIndex((h, n) => h === 'total' && n > iWorking)
  if (iWorking < 0 || iTotalMin < 0)
    throw new Error(`Sheet "${sheetName}" is missing the Working Hours / Total columns.`)

  // Everything between Working Hours and Total is a named downtime reason.
  const reasonCols: { i: number; name: string }[] = []
  for (let i = iWorking + 1; i < iTotalMin; i++) if (header[i]) reasonCols.push({ i, name: header[i] })

  // The three after Total are ideal qty / available hrs / run hrs — by position, see the note
  // at the top of this file. The four after those are A, P, Q, OEE.
  const iIdealQty = iTotalMin + 1
  const iAvailHrs = iTotalMin + 2
  const iRunHrs = iTotalMin + 3
  const iA = iTotalMin + 4
  const iP = iTotalMin + 5
  const iQ = iTotalMin + 6
  const iOee = iTotalMin + 7

  const iOperator = at((h) => h.includes('opretor') || h.includes('operator name'))
  const iItem = at((h) => h === 'item code')
  const iRoute = at((h) => h.includes('routecard'))
  const iDesc = at((h) => h.includes('roller size') || h === 'item name')
  const iProcess = at((h) => h === 'process')
  const iCycle = at((h) => h.startsWith('cycle time'))
  const iGood = at((h) => h.startsWith('good qty'))
  const iRework = at((h) => h === 'rework')
  const iRej = at((h) => h.startsWith('rej'))
  const iTotalQty = at((h) => h.startsWith('total qty'))
  const iSr = 0

  const rows: ProdRow[] = []
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] || []
    const date = isoFromExcel(row[iDate])
    const machine = txt(row[iMachine])
    // A numbered strip sits under the header and blank spacers between months; both lack a date.
    if (!date || !machine) continue

    const downtime: Record<string, number> = {}
    for (const { i, name } of reasonCols) {
      const v = num(row[i])
      if (v) downtime[name] = (downtime[name] || 0) + v
    }

    rows.push({
      excelRow: r + 1,
      sr: num(row[iSr]),
      date,
      shift: txt(row[iShift]),
      machine,
      operator: txt(row[iOperator]),
      itemCode: txt(row[iItem]),
      routecard: txt(row[iRoute]),
      description: txt(row[iDesc]),
      process: txt(row[iProcess]),
      cycleRate: num(row[iCycle]),
      goodQty: num(row[iGood]),
      rework: num(row[iRework]),
      rejection: num(row[iRej]),
      totalQty: num(row[iTotalQty]),
      workingMin: num(row[iWorking]),
      downtime,
      downtimeTotal: reasonCols.reduce((a, { i }) => a + num(row[i]), 0),
      availableMin: num(row[iTotalMin]),
      idealQty: num(row[iIdealQty]),
      availableHrs: num(row[iAvailHrs]),
      runHrs: num(row[iRunHrs]),
      availability: pctOf(row[iA]),
      performance: pctOf(row[iP]),
      quality: pctOf(row[iQ]),
      oee: pctOf(row[iOee]),
    })
  }
  if (rows.length === 0) throw new Error(`Sheet "${sheetName}" has a Production Summary header but no data rows.`)

  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))]
  return {
    fileName,
    rows,
    dates: uniq(rows.map((r) => r.date)).sort(),
    shifts: uniq(rows.map((r) => r.shift)),
    machines: uniq(rows.map((r) => r.machine)).sort(),
    reasons: reasonCols.map((c) => c.name),
    descriptionLabel: iDesc >= 0 ? header[iDesc] : 'Description',
  }
}

// ---- aggregates ------------------------------------------------------------

export interface ProdKpis {
  idealQty: number
  achievement: number
  rework: number
  rejection: number
  totalQty: number
  workingMin: number
  downtimeMin: number
  availableMin: number
  availability: number // %
  performance: number // %
  quality: number // %
  oee: number // %
  operatorMin: number
  maintenanceMin: number
  managementMin: number
  rows: number
}

/**
 * These eight reasons map onto the app's three factors. The shared classifier in lib/downtime
 * is keyed to the Unit 1 wording, which does not cover "Re-setting" or "No Power /Utility", so
 * this sheet's own eight are listed explicitly rather than half-matched.
 */
export function prodDowntimeCategory(reason: string): 'operator' | 'maintenance' | 'management' {
  const r = norm(reason)
  if (r.includes('maintenance')) return 'maintenance'
  if (r.includes('setting')) return 'operator' // New Setting, Re-setting
  return 'management' // No Plan, Other Time, No Material, No Power/Utility, No operator
}

export function prodKpis(rows: ProdRow[]): ProdKpis {
  const sum = (f: (r: ProdRow) => number) => rows.reduce((s, r) => s + f(r), 0)

  let operatorMin = 0
  let maintenanceMin = 0
  let managementMin = 0
  for (const r of rows) {
    for (const [reason, min] of Object.entries(r.downtime)) {
      const b = prodDowntimeCategory(reason)
      if (b === 'operator') operatorMin += min
      else if (b === 'maintenance') maintenanceMin += min
      else managementMin += min
    }
  }

  // A/P/Q/OEE are the sheet's own columns, weighted by the minutes each row covers. Rows the
  // sheet leaves blank are skipped rather than counted as zero, which would drag every average
  // down — the same treatment the Unit 1 report gets.
  const weighted = (pick: (r: ProdRow) => number) => {
    let w = 0
    let acc = 0
    for (const r of rows) {
      const v = pick(r)
      const m = r.availableMin
      if (m > 0 && v > 0) {
        w += m
        acc += v * m
      }
    }
    return w > 0 ? acc / w : 0
  }

  return {
    idealQty: sum((r) => r.idealQty),
    achievement: sum((r) => r.goodQty),
    rework: sum((r) => r.rework),
    rejection: sum((r) => r.rejection),
    totalQty: sum((r) => r.totalQty),
    workingMin: sum((r) => r.workingMin),
    downtimeMin: sum((r) => r.downtimeTotal),
    availableMin: sum((r) => r.availableMin),
    availability: weighted((r) => r.availability),
    performance: weighted((r) => r.performance),
    quality: weighted((r) => r.quality),
    oee: weighted((r) => r.oee),
    operatorMin,
    maintenanceMin,
    managementMin,
    rows: rows.length,
  }
}
