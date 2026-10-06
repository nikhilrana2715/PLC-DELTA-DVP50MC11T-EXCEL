import * as XLSX from 'xlsx'
import { isoFromExcel } from './xlsxDate'
import { downtimeCategory } from './downtime'

/**
 * The "PD REPORT" sheet — one row per machine, per shift, per item, per day.
 *
 * It is the raw production log the shift reports are summarised from: 87 columns, of which
 * ~36 are named downtime reasons and the rest are identity (date / shift / machine / item /
 * operators) and output (Good, Rework, Running Rejection, T.R) plus the sheet's own
 * Availability / Performance / Quality / OEE columns.
 *
 * Columns are matched BY HEADER TEXT, never by position: the sheet carries two different
 * "M/C" columns and several blank ones, so a fixed index would silently read the wrong
 * field the first time someone inserts a column.
 */

export interface PdRow {
  /** 1-based row in the worksheet, so a reader can open the file and find this line. */
  excelRow: number
  sr: number
  date: string // YYYY-MM-DD
  shift: string // 'I' | 'II'
  group: string // FG / CG / EG / IG / HO
  machine: string // FG.03
  operation: string // RFG / FG / SFODG …
  operators: string[] // Name 1..3, blanks dropped
  sapItemCode: string
  itemCode: string
  itemName: string
  batchNo: string
  orIr: string
  cycleTime: number
  php: number
  pass: number
  good: number
  rework: number
  runningRej: number
  turningRej: number
  total: number
  workingMin: number
  /** Downtime minutes by reason name, only the non-zero ones. */
  downtime: Record<string, number>
  /** Every reason column added up. Same thing as downtimeTotal — kept for older records. */
  reasonTotal: number
  /**
   * Total downtime: every reason column added up.
   *
   * This is the app's one definition of downtime, shared with the Dashboard — see
   * `lib/downtime.ts`. Nothing is netted off: the sheet's own AD reasons (New Setting, Wheel
   * Change, M/c Cleaning, Not In Plan) are downtime too, and land in the Management bucket.
   */
  downtimeTotal: number
  /** The sheet's AD minutes, reported for reference — NOT subtracted from downtimeTotal. */
  allowedMin: number
  /** Minutes the shift had on this machine (working + downtime) = Plan Hrs × 60. */
  availableMin: number
  planHrs: number
  runHrs: number
  /** The sheet's AD column, between O.E.E and M/C Plan Qty. */
  ad: number
  availability: number // %
  performance: number // %
  quality: number // %
  oee: number // %
  planQty: number
  downtimeHrs: number
  lossQty: number
  operatorInefficiency: number
  machineInefficiency: number
  /** The sheet's last column, `Good x PASS` — it appears after MI. */
  cgGoods: number
}

/** A quantity the sheet stores as text rather than a number. */
export interface TextNumberCell {
  /** Excel reference, e.g. "S738" — so it can be found and fixed at source. */
  ref: string
  column: string
  value: number
}

export interface PdReport {
  fileName: string
  /** Every row, in sheet order. */
  rows: PdRow[]
  dates: string[] // ascending, unique
  shifts: string[]
  machines: string[]
  groups: string[]
  /** Downtime reason names present in the sheet, in sheet order. */
  reasons: string[]
  /**
   * The reasons the sheet's own AD formula excludes from downtime. Read out of the formula
   * rather than hard-coded, so a plant that changes which stoppages are "allowed" is followed
   * automatically.
   */
  adReasons: string[]
  /**
   * Quantities typed with a leading zero ("03") land in the sheet as TEXT. Excel's SUM skips
   * those cells while its `+` operator counts them, so a column footer can disagree with the
   * sheet's own Total column. This app counts them — they are real production — and lists them
   * here so the source cells can be corrected.
   */
  textNumbers: TextNumberCell[]
}

type Cell = string | number | boolean | Date | null | undefined

const txt = (v: Cell): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').replace(/\s+/g, ' ').trim()
const num = (v: Cell): number => {
  if (v === null || v === undefined || v === '' || v === '-') return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}
const norm = (h: string) => h.replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * The identity/output columns, by the header text they carry. Everything NOT in this list
 * and sitting between "Working MINUTES" and "TOTAL" is a downtime reason, which is how the
 * parser picks up reasons it has never seen without needing a hard-coded list.
 */
const FIELD_MATCH: { key: keyof PdRow | 'skip'; test: (h: string) => boolean }[] = [
  { key: 'sr', test: (h) => h === 'sr no' },
  { key: 'date', test: (h) => h === 'date' },
  { key: 'shift', test: (h) => h === 'shift' },
  { key: 'group', test: (h) => h === 'm/c' },
  { key: 'machine', test: (h) => h === 'm/c' }, // second "M/c" — resolved below
  { key: 'operation', test: (h) => h === 'opt' },
  { key: 'sapItemCode', test: (h) => h.includes('sap') && h.includes('item') },
  { key: 'itemCode', test: (h) => h === 'item code' },
  { key: 'itemName', test: (h) => h.includes('item') && h.includes('name') },
  { key: 'batchNo', test: (h) => h.includes('batch') },
  { key: 'orIr', test: (h) => h.replace(/[^a-z/]/g, '') === 'or/ir' },
  { key: 'cycleTime', test: (h) => h.includes('cycle time') },
  { key: 'php', test: (h) => h === 'p.h.p' },
  { key: 'pass', test: (h) => h === 'pass' },
  { key: 'good', test: (h) => h === 'good' },
  { key: 'rework', test: (h) => h === 'rework' },
  { key: 'runningRej', test: (h) => h.includes('running') && h.includes('rej') },
  { key: 'turningRej', test: (h) => h === 't.r' },
  { key: 'total', test: (h) => h === 'total' },
  { key: 'workingMin', test: (h) => h.includes('working') && h.includes('minute') },
  { key: 'planHrs', test: (h) => h.includes('plan hrs') },
  { key: 'availability', test: (h) => h.includes('availability') },
  { key: 'performance', test: (h) => h.includes('performance') },
  { key: 'quality', test: (h) => h.includes('quality rate') },
  { key: 'oee', test: (h) => h.startsWith('o.e.e') || h.includes('oee') },
  { key: 'ad', test: (h) => h === 'ad' },
  { key: 'planQty', test: (h) => h.includes('m/c plan qty') },
  { key: 'downtimeHrs', test: (h) => h.includes('down time') && h.includes('hrs') },
  { key: 'lossQty', test: (h) => h.includes('total loss') },
  { key: 'operatorInefficiency', test: (h) => h.includes('operator in efficiency') },
  { key: 'machineInefficiency', test: (h) => h.includes('machine in efficiency') },
  { key: 'cgGoods', test: (h) => h.replace(/[^a-z]/g, '') === 'cggoods' },
]

/** Parse the workbook. Throws with a readable message when the sheet isn't a PD Report. */
export function parsePdReport(buf: ArrayBuffer, fileName: string): PdReport {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames.find((n) => norm(n).includes('pd')) || wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error('The workbook has no sheets.')
  // The sheet declares A1:CI1048573 — a million mostly-empty rows, which made a plain read
  // take about a minute. Clamp to the rows that actually carry cells.
  if (ws['!ref']) {
    const rng = XLSX.utils.decode_range(ws['!ref'])
    let lastRow = rng.s.r
    for (const key of Object.keys(ws)) {
      if (key[0] === '!') continue
      const cell = XLSX.utils.decode_cell(key)
      if (cell.r > lastRow) lastRow = cell.r
    }
    rng.e.r = Math.min(rng.e.r, lastRow)
    rng.e.c = Math.min(rng.e.c, 120)
    ws['!ref'] = XLSX.utils.encode_range(rng)
  }
  const grid = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: '' })

  // The header is the row carrying "SR NO" — a title/merge row usually sits above it.
  const headerRow = grid.findIndex((r) => (r || []).some((c) => norm(txt(c)) === 'sr no'))
  if (headerRow < 0) {
    throw new Error(
      `Could not find the "SR NO" header row in sheet "${sheetName}".\n\n` +
        'This upload expects the PD Report layout (SR NO · Date · Shift · M/C · Item Code · Good · Rework …).',
    )
  }
  const header = (grid[headerRow] || []).map((c) => txt(c))
  const H = header.map(norm)

  // Resolve each field to a column index. "M/C" appears twice — the FIRST is the machine
  // group (FG), the SECOND the machine itself (FG.03).
  const idx: Partial<Record<keyof PdRow, number>> = {}
  const used = new Set<number>()
  for (const { key, test } of FIELD_MATCH) {
    if (key === 'skip') continue
    const i = H.findIndex((h, n) => h !== '' && test(h) && !used.has(n))
    if (i >= 0) {
      idx[key as keyof PdRow] = i
      used.add(i)
    }
  }
  const iWork = idx.workingMin ?? -1
  // The column named TOTAL after Working MINUTES holds the shift's AVAILABLE minutes
  // (working + downtime) — it equals Plan Hrs × 60. Downtime is the sum of the reasons.
  const iTotalMin = H.findIndex((h, n) => h === 'total' && n > iWork)
  // Everything between Working MINUTES and that TOTAL is a named downtime reason.
  const reasonCols: { i: number; name: string }[] = []
  if (iWork >= 0 && iTotalMin > iWork) {
    for (let i = iWork + 1; i < iTotalMin; i++) {
      const name = header[i]
      if (name) reasonCols.push({ i, name })
    }
  }
  /*
   * Which stoppages does the plant NOT charge as downtime?
   *
   * Its own AD column answers this in a formula — `AD = (X4+AQ4+BF4+BG4)/60` — naming the
   * reason columns that are planned for. `Down Time (Hrs)` is then `SUM(reasons)/60 - AD`.
   * Reading the formula instead of hard-coding four names means a plant that re-classifies a
   * stoppage is followed without a code change. On this workbook it resolves to New Setting
   * 10, Wheel Change 17, M/c Cleaning 29 and Not In Plan 30 — 82,215 of the month's 207,210
   * reason minutes, which is why summing every reason overstated downtime by two thirds.
   */
  const adCols = new Set<number>()
  if (idx.ad !== undefined) {
    // The row right under the header is a spacer with no formulas, so walk down until a real
    // one turns up rather than trusting a fixed offset.
    for (let r = headerRow + 1; r < Math.min(headerRow + 40, grid.length); r++) {
      const formula = ws[XLSX.utils.encode_cell({ r, c: idx.ad as number })]?.f
      if (!formula) continue
      for (const ref of String(formula).match(/\$?([A-Z]{1,3})\$?\d+/g) || []) {
        const n = XLSX.utils.decode_col(ref.replace(/[^A-Z]/g, ''))
        // Only reason columns count; the formula also divides by 60.
        if (n >= 0 && reasonCols.some((c) => c.i === n)) adCols.add(n)
      }
      if (adCols.size) break
    }
  }

  // Run Hrs is the "x" in the sheet's own Availability = x/a. Its header cell reads "0", so
  // there is no text to match on — it is identified by sitting between Plan Hrs and
  // Availability, which is exactly where the formula puts it.
  const iPlanHrs = idx.planHrs ?? -1
  const iAvail = idx.availability ?? -1
  const iRunHrs = iPlanHrs >= 0 && iAvail === iPlanHrs + 2 ? iPlanHrs + 1 : -1

  // Operator name columns ("Name 1", "Name 2", …).
  const nameCols = H.map((h, i) => (/^name\s*\d+$/.test(h) ? i : -1)).filter((i) => i >= 0)

  const rows: PdRow[] = []
  /** Grid rows that became data — the short-code strip under the header is not one of them. */
  const dataRows = new Set<number>()
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] || []
    const machine = txt(row[idx.machine ?? -1])
    const date = isoFromExcel(row[idx.date ?? -1])
    // The sheet carries a spacer row (SR NO 0, everything else blank) right under the header.
    if (!machine || !date) continue

    const downtime: Record<string, number> = {}
    for (const { i, name } of reasonCols) {
      const v = num(row[i])
      if (v) downtime[name] = (downtime[name] || 0) + v
    }
    const g = (k: keyof PdRow) => (idx[k] === undefined ? 0 : num(row[idx[k] as number]))
    const s = (k: keyof PdRow) => (idx[k] === undefined ? '' : txt(row[idx[k] as number]))

    dataRows.add(r)
    rows.push({
      excelRow: r + 1,
      sr: g('sr'),
      date,
      shift: s('shift'),
      group: s('group'),
      machine,
      operation: s('operation'),
      operators: nameCols.map((i) => txt(row[i])).filter(Boolean),
      sapItemCode: s('sapItemCode'),
      itemCode: s('itemCode'),
      itemName: s('itemName'),
      batchNo: s('batchNo'),
      orIr: s('orIr'),
      cycleTime: g('cycleTime'),
      php: g('php'),
      pass: g('pass'),
      good: g('good'),
      rework: g('rework'),
      runningRej: g('runningRej'),
      turningRej: g('turningRej'),
      total: g('total'),
      workingMin: g('workingMin'),
      downtime,
      reasonTotal: reasonCols.reduce((a, { i }) => a + num(row[i]), 0),
      downtimeTotal: reasonCols.reduce((a, { i }) => a + num(row[i]), 0),
      allowedMin: reasonCols.reduce((a, { i }) => a + (adCols.has(i) ? num(row[i]) : 0), 0),
      availableMin: iTotalMin >= 0 ? num(row[iTotalMin]) : g('planHrs') * 60,
      planHrs: g('planHrs'),
      runHrs: iRunHrs >= 0 ? num(row[iRunHrs]) : 0,
      availability: g('availability'),
      performance: g('performance'),
      quality: g('quality'),
      oee: g('oee'),
      ad: g('ad'),
      planQty: g('planQty'),
      downtimeHrs: g('downtimeHrs'),
      lossQty: g('lossQty'),
      operatorInefficiency: g('operatorInefficiency'),
      machineInefficiency: g('machineInefficiency'),
      // Older workbooks leave this column unnamed; derive it so the field is never a silent 0.
      cgGoods: idx.cgGoods !== undefined ? g('cgGoods') : g('good') * g('pass'),
    })
  }
  if (rows.length === 0) throw new Error(`Sheet "${sheetName}" has a PD Report header but no data rows.`)

  // One pass over the cells that exist, flagging numeric columns holding text.
  const numericCols = new Map<number, string>()
  for (const key of ['pass', 'good', 'rework', 'runningRej', 'turningRej', 'total', 'workingMin'] as const) {
    const i = idx[key]
    if (i !== undefined) numericCols.set(i, header[i] || key)
  }
  for (const { i, name } of reasonCols) numericCols.set(i, name)
  const textNumbers: TextNumberCell[] = []
  for (const key of Object.keys(ws)) {
    if (key[0] === '!') continue
    const cell = ws[key] as { t?: string; v?: unknown }
    if (cell.t !== 's' && cell.t !== 'str') continue
    const { r, c } = XLSX.utils.decode_cell(key)
    // The row under the header carries each downtime column's short code ("11", "14I") as
    // text. It is not data, so it must not be reported as a mistyped quantity.
    if (!dataRows.has(r) || !numericCols.has(c)) continue
    const v = parseFloat(String(cell.v ?? '').replace(/,/g, ''))
    if (!Number.isFinite(v) || v === 0) continue
    textNumbers.push({ ref: key, column: numericCols.get(c) as string, value: v })
  }
  textNumbers.sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }))

  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))]
  return {
    fileName,
    rows,
    dates: uniq(rows.map((r) => r.date)).sort(),
    shifts: uniq(rows.map((r) => r.shift)),
    machines: uniq(rows.map((r) => r.machine)).sort(),
    groups: uniq(rows.map((r) => r.group)),
    reasons: reasonCols.map((c) => c.name),
    adReasons: reasonCols.filter((c) => adCols.has(c.i)).map((c) => c.name),
    textNumbers,
  }
}

// ---- aggregates -----------------------------------------------------------

export interface PdKpis {
  planQty: number
  /**
   * Pieces actually made good.
   *
   * NOT the sheet's Total column: that is `Good + Running Rejection + T.R`, so it counts
   * scrap as output. It is the Good column for FG/EG/IG/HO, and the CG Goods According to
   * PASS column for CG — see rowAchievement.
   */
  achievement: number
  good: number
  rework: number
  rejection: number
  turningRej: number
  workingMin: number
  /** Downtime the plant charges — AD excluded, matching its own Down Time (Hrs) column. */
  downtimeMin: number
  /** Planned stoppages (AD): set up, wheel change, cleaning, not-in-plan. */
  allowedMin: number
  planMin: number
  /**
   * The sheet leaves M/C Plan Qty at 0 whenever CYCLE TIME is blank, so a plain
   * achievement-over-plan across every row is meaningless. These split the two populations
   * apart, letting the page report attainment on the rows that actually carry a plan and say
   * plainly how much output sits outside it.
   */
  plannedRows: number
  plannedAchievement: number
  unplannedRows: number
  unplannedAchievement: number
  availability: number // %
  performance: number // %
  quality: number // %
  oee: number // %
  /**
   * The three factors, split by the app's shared classifier so the KPI page, the Dashboard and
   * the Downtime page all put a reason in the same bucket.
   */
  operatorMin: number
  maintenanceMin: number
  managementMin: number
  rows: number
}

/**
 * What one row contributed to achievement.
 *
 * FG, EG, IG and HO report it in the Good column. CG does not: its output is counted per
 * PASS, so the sheet keeps a separate "CG Goods According to PASS" column and Good alone
 * understates that group. Every achievement figure on the page goes through here so the two
 * conventions can never drift apart.
 */
/**
 * CG Goods for one row.
 *
 * The sheet's own column wins. But a record imported before that column was being read carries
 * 0 for it, and reporting a whole CG machine as having produced nothing is worse than being
 * one stale cell out — so fall back to the formula the sheet itself uses, `Good x PASS`.
 * A row that genuinely made nothing has Good 0, so the fallback still gives 0.
 */
export const cgGoodsOf = (r: PdRow): number =>
  Number.isFinite(r.cgGoods) && r.cgGoods > 0 ? r.cgGoods : (r.good || 0) * (r.pass || 0)

/**
 * What one row contributed to achievement.
 *
 * FG, EG, IG and HO report it in the Good column. CG does not: its output is counted per
 * PASS, so the sheet keeps a separate "CG Goods According to PASS" column and Good alone
 * understates that group. Every achievement figure on the page goes through here so the two
 * conventions can never drift apart.
 */
export const rowAchievement = (r: PdRow): number => (r.group === 'CG' ? cgGoodsOf(r) : r.good)

export function pdKpis(rows: PdRow[]): PdKpis {
  const sum = (f: (r: PdRow) => number) => rows.reduce((s, r) => s + f(r), 0)
  const planQty = sum((r) => r.planQty)
  const good = sum((r) => r.good)
  const achievement = sum(rowAchievement)
  const rework = sum((r) => r.rework)
  const rejection = sum((r) => r.runningRej)
  const turningRej = sum((r) => r.turningRej)
  const workingMin = sum((r) => r.workingMin)
  const downtimeMin = sum((r) => r.downtimeTotal)
  const allowedMin = sum((r) => r.allowedMin)
  const planMin = sum((r) => r.availableMin || r.planHrs * 60)

  const planned = rows.filter((r) => r.planQty > 0)
  const unplanned = rows.filter((r) => !(r.planQty > 0))

  let operatorMin = 0
  let maintenanceMin = 0
  let managementMin = 0
  for (const r of rows) {
    for (const [reason, min] of Object.entries(r.downtime)) {
      const b = downtimeCategory(reason)
      if (b === 'operator') operatorMin += min
      else if (b === 'maintenance') maintenanceMin += min
      else managementMin += min
    }
  }

  // Availability / Performance / Quality / OEE are the SHEET's own columns, averaged with
  // each row weighted by the minutes it covers. Rows the sheet leaves blank are excluded
  // rather than counted as zero, which would drag every average down.
  const weighted = (pick: (r: PdRow) => number) => {
    let w = 0
    let acc = 0
    for (const r of rows) {
      const v = pick(r)
      const m = r.availableMin || r.planHrs * 60
      if (m > 0 && v > 0) {
        w += m
        acc += v * m
      }
    }
    return w > 0 ? acc / w : 0
  }
  const availability = weighted((r) => r.availability)
  const performance = weighted((r) => r.performance)
  const quality = weighted((r) => r.quality)
  const oee = weighted((r) => r.oee)

  return {
    planQty,
    achievement,
    good,
    rework,
    rejection,
    turningRej,
    workingMin,
    downtimeMin,
    allowedMin,
    planMin,
    plannedRows: planned.length,
    plannedAchievement: planned.reduce((a, r) => a + rowAchievement(r), 0),
    unplannedRows: unplanned.length,
    unplannedAchievement: unplanned.reduce((a, r) => a + rowAchievement(r), 0),
    availability,
    performance,
    quality,
    oee,
    operatorMin,
    maintenanceMin,
    managementMin,
    rows: rows.length,
  }
}
