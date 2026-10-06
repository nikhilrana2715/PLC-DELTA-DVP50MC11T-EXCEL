import * as XLSX from 'xlsx'
import { authHeaders } from './auth'
import { apiUrl, getUnit, unitKey } from './unit'
import type { Unit } from './unit'
import { clientId } from './realtime'
import { cacheList } from './cacheLimit'

// ---- Types ---------------------------------------------------------------

/** One line/operation row from the Assembly "Production Report" sheet. */
export interface AssemblyRow {
  process: string // "Manually" | "M/C" | ""
  line: number | null // 1..N for production lines; null for aux operations (Packing, Marking…)
  lineLeader: string // who leads that line (new format column)
  family: string // DGBB, NRB, Washer, CRB, MCG, Packing (01)…
  itemName: string
  itemCode: string
  planQty: number
  /** "PLAN Operator" — how many operators the line was planned with. Absent on reports
   *  saved before the sheet gained the column, so every read of it defaults to 0. */
  planOperators: number
  /** "USE Operator" — how many actually worked the line. Older sheets had only this one. */
  operators: number
  achQty: number // OK qty
  backlogQty: number
  rework: number // new format column
  rejection: number // new format column
  remark: string
  poorQualityBacklog: number
}

export interface AssemblyReport {
  date: string // YYYY-MM-DD
  fileName: string
  presentManpower: number
  totalWip: number | null // Total WIP ring Qty.
  totalReceived: number | null // Total Received Qty in Production
  todayRingAchievement: number | null // Today Ring Achievement Quantity (top summary)
  assemblyBalance: number | null // = (WIP + Received) − Today Ring Achievement
  poorQualityPct: number | null
  rows: AssemblyRow[]
}

// ---- Parsing -------------------------------------------------------------

type Cell = string | number | boolean | null
type Grid = Cell[][]

const norm = (v: Cell) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
function toNum(v: Cell): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}
function toNumOrNull(v: Cell): number | null {
  if (v === null || v === undefined || v === '' || v === '-') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/** "21.07.2026" / "21-07-2026" / a Date / Excel serial -> YYYY-MM-DD. */
function parseDate(v: Cell): string {
  const s = String(v ?? '').trim()
  const m = s.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/)
  if (m) {
    const [, d, mo, y] = m
    const yr = y.length === 2 ? `20${y}` : y
    return `${yr}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  if (typeof v === 'number' && v > 20000) {
    // Excel serial date
    const dt = XLSX.SSF ? new Date(Math.round((v - 25569) * 86400 * 1000)) : null
    if (dt && !Number.isNaN(dt.getTime())) return dt.toLocaleDateString('en-CA')
  }
  return new Date().toLocaleDateString('en-CA')
}

/** True when the cell holds a real number (or numeric text like "13,113"), not a text label. */
function isNumericCell(v: Cell): boolean {
  if (v === null || v === undefined || v === '') return false
  if (typeof v === 'number') return Number.isFinite(v)
  const s = String(v)
  if (!/\d/.test(s)) return false
  return Number.isFinite(parseFloat(s.replace(/,/g, '')))
}

/**
 * Find a labelled scalar in the top summary block.
 *
 * The report header is a merged-cell grid, so a label's value is not always to its
 * right: some values sit to the right of the merged label (e.g. "Total WIP ring Qty."
 * → next cell, "Today Ring Achievement Quantity" → next cell), while others sit
 * directly BELOW the label (e.g. "Total Received Qty in Production", whose right
 * neighbour is another label). So we: (1) take the first non-empty cell to the right
 * and use it if it's numeric; (2) otherwise look directly below the label; (3) only
 * then fall back to the right cell (covers date text and "-" placeholders).
 */
function findScalar(grid: Grid, label: string, maxRow = 4): Cell {
  const want = label.toLowerCase()
  for (let r = 0; r < Math.min(maxRow, grid.length); r++) {
    const row = grid[r] || []
    for (let c = 0; c < row.length; c++) {
      if (norm(row[c]).includes(want)) {
        // 1) first non-empty cell to the right on this row
        let right: Cell = ''
        for (let k = c + 1; k < row.length; k++) {
          if (row[k] !== '' && row[k] !== null && row[k] !== undefined) {
            right = row[k]
            break
          }
        }
        if (isNumericCell(right)) return right
        // 2) value placed directly below the label (vertical merged layout)
        const below = grid[r + 1] || []
        if (isNumericCell(below[c])) return below[c]
        // 3) fall back to whatever sat to the right (date text, "-" placeholder, …)
        if (right !== '' && right !== null && right !== undefined) return right
      }
    }
  }
  return ''
}

/** Parse the Assembly Production Report workbook into a structured report. */
export function parseAssemblyWorkbook(buf: ArrayBuffer, fileName: string): AssemblyReport {
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const grid = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, defval: '', raw: true }) as Grid

  const date = parseDate(findScalar(grid, 'date'))
  const presentManpower = toNum(findScalar(grid, 'total present manpower'))
  const totalWip = toNumOrNull(findScalar(grid, 'total wip ring'))
  const totalReceived = toNumOrNull(findScalar(grid, 'total received qty in production'))
  const todayRingAchievement = toNumOrNull(findScalar(grid, 'today ring achievement quantity'))
  const assemblyBalance = toNumOrNull(findScalar(grid, 'assembly balance'))
  const poorQualityPct = toNumOrNull(findScalar(grid, 'poor quality %'))

  // Locate the header row that carries "PLAN Qty" — data starts on the next row.
  //
  // This used to demand an exact `=== 'plan qty'`, so a sheet that wrote "PLAN Qty." or
  // "Plan Qty (Nos)" produced headerRow = -1 → zero rows → an all-zero dashboard with no
  // error at all. Now the match is a prefix, and the row that also carries the most other
  // item-column headers wins. The "ring" guard keeps the summary label "Today RIng plan
  // qty." (which sits on a merged row above) from being mistaken for the header row.
  const isPlanQty = (h: string) => /^plan\s*qty/.test(h) && !h.includes('ring')
  const SIBLINGS = [/^item name/, /^item code/, /^ach/, /back\s*log|backlog/, /operator/, /rework/, /reject/, /^family/, /^line/]
  let headerRow = -1
  let bestScore = -1
  for (let r = 0; r < grid.length; r++) {
    const cells = (grid[r] || []).map(norm)
    if (!cells.some(isPlanQty)) continue
    const score = SIBLINGS.reduce((s, re) => s + (cells.some((c) => re.test(c)) ? 1 : 0), 0)
    if (score > bestScore) {
      headerRow = r
      bestScore = score
    }
  }
  if (headerRow < 0) {
    // Fail loudly with what the sheet actually contains — a silent empty dashboard gave
    // the user no way to tell a bad file from a bad parse.
    const seen = grid
      .slice(0, 30)
      .map((row) => (row || []).map(norm).filter(Boolean).join(' | '))
      .filter(Boolean)
      .slice(0, 8)
    throw new Error(
      `Could not find the "PLAN Qty" column header in sheet "${wb.SheetNames[0]}".\n\n` +
        `Make sure the sheet has a header row containing a "Plan Qty" column.\n\n` +
        `First rows found in the file:\n${seen.join('\n')}`,
    )
  }
  const rows: AssemblyRow[] = []
  if (headerRow >= 0) {
    // Column headers are split across two rows: the section labels (Process, Line, Line
    // Leader, Family, Re-Marks, Poor quality) sit merged on the row ABOVE, while the
    // per-column names (Item Name, Item Code, Plan Qty, Use Operator, Ach.Qty., Back Log,
    // Rework, Rejection) sit on the header row. Prefer the header-row cell; fall back to
    // the row above only when it's empty. This makes column detection robust to BOTH the
    // old and the new (Line Leader / Rework / Rejection) formats — no fixed positions.
    const above = grid[headerRow - 1] || []
    const hdr = grid[headerRow] || []
    const width = Math.max(above.length, hdr.length)
    const H: string[] = []
    for (let c = 0; c < width; c++) H[c] = norm(hdr[c]) || norm(above[c])

    const find = (pred: (h: string) => boolean) => H.findIndex(pred)
    const cProcess = find((h) => h.includes('process'))
    const cLineLeader = find((h) => h.includes('leader'))
    const cLine = find((h) => h.includes('line') && !h.includes('leader') && !h.includes('item'))
    const cFamily = find((h) => h.includes('family'))
    const cItemName = find((h) => h.includes('item name'))
    const cItemCode = find((h) => h.includes('item code'))
    const cPlan = find((h) => h.includes('plan qty'))
    // The sheet now carries BOTH "PLAN Operator" and "USE Operator". Matching a bare
    // 'operator' would grab whichever comes first (PLAN), silently swapping the meaning of
    // every operator figure, so each is matched by its own qualifier. Sheets that predate
    // the split have exactly one operator column — that one has always meant USE.
    const cPlanOperators = find((h) => h.includes('operator') && h.includes('plan'))
    const cUseOperators = find((h) => h.includes('operator') && (h.includes('use') || h.includes('used')))
    const cAnyOperator = find((h) => h.includes('operator'))
    const cOperators = cUseOperators >= 0 ? cUseOperators : cPlanOperators >= 0 ? -1 : cAnyOperator
    const cAch = find((h) => h.includes('ach') && h.includes('qty'))
    const cBacklog = find((h) => (h.includes('back log') || h.includes('backlog')) && !h.includes('poor'))
    const cRework = find((h) => h.includes('rework'))
    const cRejection = find((h) => h.includes('reject'))
    const cRemark = find((h) => h.includes('mark'))
    const cPqBacklog = find((h) => h.includes('poor'))

    const str = (row: Cell[], i: number) => (i >= 0 ? String(row[i] ?? '').trim() : '')
    const num = (row: Cell[], i: number) => (i >= 0 ? toNum(row[i]) : 0)

    for (let r = headerRow + 1; r < grid.length; r++) {
      const row = grid[r] || []
      // explicit "Total" label anywhere in the row (old format puts it in col A)
      if (row.some((c) => norm(c) === 'total')) break
      const process = str(row, cProcess)
      const lineVal = cLine >= 0 ? toNumOrNull(row[cLine]) : null
      const family = str(row, cFamily)
      const itemName = str(row, cItemName)
      const itemCode = str(row, cItemCode)
      const planQty = num(row, cPlan)
      const planOperators = num(row, cPlanOperators)
      const operators = num(row, cOperators)
      // A row with NO descriptive fields (no process/line/family/item) is not a real
      // item. If it carries numbers it's the summary/Total row → stop (it's always last);
      // if it's fully blank it's just a separator → skip. This is what makes the parser
      // ignore the new-format Total row, which has no "Total" text — only the sums.
      if (!process && lineVal === null && !family && !itemName && !itemCode) {
        if (planQty || operators || planOperators || num(row, cAch) || num(row, cBacklog)) break
        continue
      }
      const achQty = num(row, cAch)
      const rework = num(row, cRework)
      const rejection = num(row, cRejection)
      const pqBacklog = num(row, cPqBacklog)
      // Backlog is left blank on rows the sheet did not fill in, even where plan ≠ achievement
      // (a planned item with nothing produced yet). The sheet's own Total compensates by
      // computing plan − achievement, so derive the same thing here when the cell is empty —
      // otherwise those rows silently drop out of the backlog total. A cell that *does* hold a
      // value (including a "-" that means zero) is always trusted as written.
      const rawBacklog = cBacklog >= 0 ? row[cBacklog] : undefined
      const backlogGiven = rawBacklog !== undefined && rawBacklog !== null && String(rawBacklog).trim() !== ''
      const backlogQty = backlogGiven ? num(row, cBacklog) : planQty - achQty

      // Keep any row that carries a quantity. Lines that are only booking achievement against
      // an earlier day's plan have no family, no plan and no operators — dropping them lost
      // their achievement AND their (negative) backlog, which is what made the KPI cards
      // disagree with the sheet's own Total row.
      const hasNumbers = planQty !== 0 || operators !== 0 || planOperators !== 0 || achQty !== 0 || backlogQty !== 0 || rework !== 0 || rejection !== 0 || pqBacklog !== 0
      if (!family && !hasNumbers) continue // genuinely empty row
      rows.push({
        process,
        line: lineVal,
        lineLeader: str(row, cLineLeader),
        family,
        itemName,
        itemCode,
        planQty,
        planOperators,
        operators,
        achQty,
        backlogQty,
        rework,
        rejection,
        remark: str(row, cRemark),
        poorQualityBacklog: pqBacklog,
      })
    }
  }

  // Header found but nothing under it — previewing an all-zero dashboard looks identical
  // to "the upload did nothing", so say what happened instead.
  if (rows.length === 0) {
    throw new Error(
      `Found the header row in sheet "${wb.SheetNames[0]}", but there are no item rows under it.\n\n` +
        `Check that the data starts on the row directly below the "PLAN Qty" header and that ` +
        `each row has a Process / Line / Family / Item value.`,
    )
  }

  return { date, fileName, presentManpower, totalWip, totalReceived, todayRingAchievement, assemblyBalance, poorQualityPct, rows }
}

// ---- Derived KPIs & chart data ------------------------------------------

export interface AssemblyKpis {
  totalPlan: number
  presentManpower: number
  operatorsUsed: number
  /** Operators the plan asked for — compare against operatorsUsed. */
  operatorsPlanned: number
  achievementQty: number
  backlogQty: number
  achievementPct: number
  rework: number
  rejection: number
  poorQualityPct: number | null
  assemblyBalance: number | null
}

export function assemblyKpis(rep: AssemblyReport): AssemblyKpis {
  const totalPlan = rep.rows.reduce((s, r) => s + r.planQty, 0)
  const operatorsUsed = rep.rows.reduce((s, r) => s + r.operators, 0)
  const operatorsPlanned = rep.rows.reduce((s, r) => s + (r.planOperators || 0), 0)
  const achievementQty = rep.rows.reduce((s, r) => s + r.achQty, 0)
  // Backlog comes straight from the sheet's "Back Log Qty." column — it is NOT re-derived
  // as Plan − OK. The two disagree in practice (the sheet carries pending work rolled over
  // from earlier days) and the sheet is the number the shop floor works to. Negatives are
  // kept as-is: a negative cell means that line cleared more than it was planned.
  const backlogQty = rep.rows.reduce((s, r) => s + r.backlogQty, 0)
  return {
    totalPlan,
    presentManpower: rep.presentManpower,
    operatorsUsed,
    operatorsPlanned,
    achievementQty,
    backlogQty,
    achievementPct: totalPlan > 0 ? Math.round((achievementQty / totalPlan) * 100) : 0,
    rework: rep.rows.reduce((s, r) => s + (r.rework || 0), 0),
    rejection: rep.rows.reduce((s, r) => s + (r.rejection || 0), 0),
    poorQualityPct: rep.poorQualityPct === null ? null : Math.round(rep.poorQualityPct),
    assemblyBalance: rep.assemblyBalance,
  }
}

export interface LineDatum {
  line: string
  lineLeader: string
  plan: number
  ach: number
  planOperators: number
  operators: number
  backlog: number
  rework: number
  rejection: number
  poorQualityBacklog: number
  achPct: number
}

/** Catch-all bucket for rows the sheet left without a Line / Line Leader. */
export const NO_LINE = 'No Line'

/**
 * Per-line aggregates. Normally grouped by the sheet's Line number. Some reports leave
 * the Line column blank — then we fall back to grouping by Line Leader (each assembly
 * line is run by one leader) so the per-line charts still render instead of going empty.
 * Rows with neither, but with numbers on them, land in the NO_LINE bucket so the charts
 * always add up to the KPI totals.
 */
export function byLine(rep: AssemblyReport): LineDatum[] {
  const byNumber = rep.rows.some((r) => r.line !== null)
  const map = new Map<string, LineDatum & { _n: number }>()
  let seq = 0
  for (const r of rep.rows) {
    let key = byNumber ? (r.line === null ? '' : String(r.line)) : r.lineLeader.trim()
    if (!key) {
      // The sheet often leaves Line (or Leader) blank on rows that still carry plan and
      // backlog. Dropping them made every by-line chart under-report against the KPIs —
      // e.g. 10,000 of 18,082 backlog vanished on 23/07. Bucket them instead, and only
      // when they actually carry a number (blank separator rows still drop out).
      if (!r.planQty && !r.achQty && !r.operators && !(r.planOperators || 0) && !r.backlogQty && !r.rework && !r.rejection && !r.poorQualityBacklog) continue
      key = NO_LINE
    }
    let cur = map.get(key)
    if (!cur) {
      cur = {
        line: key === NO_LINE ? NO_LINE : byNumber ? `Line ${key}` : key,
        lineLeader: '',
        plan: 0,
        ach: 0,
        planOperators: 0,
        operators: 0,
        backlog: 0,
        rework: 0,
        rejection: 0,
        poorQualityBacklog: 0,
        achPct: 0,
        // Keep sheet order when grouping by leader; park the catch-all bucket last.
        _n: key === NO_LINE ? Number.MAX_SAFE_INTEGER : byNumber ? Number(key) : ++seq,
      }
      map.set(key, cur)
    }
    if (r.lineLeader) cur.lineLeader = r.lineLeader
    cur.plan += r.planQty
    cur.ach += r.achQty
    cur.planOperators += r.planOperators || 0
    cur.operators += r.operators
    cur.backlog += r.backlogQty
    cur.rework += r.rework || 0
    cur.rejection += r.rejection || 0
    cur.poorQualityBacklog += r.poorQualityBacklog
  }
  return [...map.values()]
    .sort((a, b) => a._n - b._n)
    // Backlog is the sheet's own "Back Log Qty." column (summed above), matching the
    // Total Backlog KPI. Negatives are preserved — see assemblyKpis().
    .map(({ _n, ...d }) => ({ ...d, achPct: d.plan > 0 ? Math.round((d.ach / d.plan) * 100) : 0 }))
}

/** "Line 1 – Rahul" labels for every line that has a leader (leader name alone when
 *  the sheet has no Line numbers). */
export function lineLeaders(rep: AssemblyReport): { line: string; leader: string }[] {
  const byNumber = rep.rows.some((r) => r.line !== null)
  if (!byNumber) {
    const seen: { line: string; leader: string }[] = []
    for (const r of rep.rows) {
      const l = r.lineLeader.trim()
      if (l && !seen.some((s) => s.leader === l)) seen.push({ line: '', leader: l })
    }
    return seen
  }
  const seen = new Map<number, string>()
  for (const r of rep.rows) {
    if (r.line !== null && r.lineLeader && !seen.has(r.line)) seen.set(r.line, r.lineLeader)
  }
  return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([line, leader]) => ({ line: `Line ${line}`, leader }))
}

export interface FamilyDatum {
  family: string
  plan: number
}

/** Per-family plan totals (for the pie), biggest first. */
export function byFamily(rep: AssemblyReport): FamilyDatum[] {
  const map = new Map<string, number>()
  for (const r of rep.rows) {
    if (!r.family || r.planQty === 0) continue
    map.set(r.family, (map.get(r.family) ?? 0) + r.planQty)
  }
  return [...map.entries()].map(([family, plan]) => ({ family, plan })).sort((a, b) => b.plan - a.plan)
}

export interface RemarkDatum {
  line: number | null
  family: string
  remark: string
  poorQualityBacklog: number
}

/** Family/line-wise remark summary (only rows that actually carry a remark). */
export function remarksByFamily(rep: AssemblyReport): RemarkDatum[] {
  const out: RemarkDatum[] = []
  const seen = new Set<string>()
  for (const r of rep.rows) {
    if (!r.remark) continue
    const key = `${r.line}|${r.family}|${r.remark}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ line: r.line, family: r.family, remark: r.remark, poorQualityBacklog: r.poorQualityBacklog })
  }
  return out.sort((a, b) => (a.line ?? 99) - (b.line ?? 99))
}

// ---- Persistence (server-synced, one record per date) --------------------

export interface AssemblyRecord extends AssemblyReport {
  id: string // `asm-<date>`
  savedAt: number
  by?: string
}

const API = '/api/assembly'
const KEY_BASE = 'mm.assembly.v1'
/** Cache key for the ACTIVE unit — each workspace caches separately. */
const KEY = (unit: Unit) => unitKey(KEY_BASE, unit)

const sortBySaved = (list: AssemblyRecord[]) => [...list].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))

function readLocal(unit: Unit): AssemblyRecord[] {
  try {
    return sortBySaved(JSON.parse(localStorage.getItem(KEY(unit)) || '[]') as AssemblyRecord[])
  } catch {
    return []
  }
}
function writeLocal(list: AssemblyRecord[], unit: Unit) {
  try {
    cacheList(KEY(unit), list)
  } catch {
    /* ignore */
  }
}

export async function fetchAssembly(): Promise<AssemblyRecord[]> {
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(API, unit), { cache: 'no-store' })
    if (!r.ok) throw new Error('bad')
    const list = (await r.json()) as AssemblyRecord[]
    writeLocal(list, unit)
    return sortBySaved(list)
  } catch {
    return readLocal(unit)
  }
}

/** Save (overwrite) a day's assembly report. Stable id per date → same date overwrites. */
export async function saveAssembly(rep: AssemblyReport): Promise<AssemblyRecord> {
  const unit = getUnit()
  const rec: AssemblyRecord = { ...rep, id: `asm-${rep.date}`, savedAt: Date.now(), by: clientId() }
  try {
    const r = await fetch(apiUrl(API, unit), { method: 'POST', headers: authHeaders(), body: JSON.stringify(rec) })
    if (!r.ok) throw new Error('bad')
    return (await r.json()) as AssemblyRecord
  } catch {
    writeLocal([rec, ...readLocal(unit).filter((x) => x.id !== rec.id)], unit)
    return rec
  }
}

export async function deleteAssembly(id: string): Promise<void> {
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(`${API}/${id}`, unit), { method: 'DELETE', headers: authHeaders(false) })
    if (!r.ok) throw new Error('bad')
  } catch {
    writeLocal(readLocal(unit).filter((x) => x.id !== id), unit)
  }
}

export function availableAssemblyDates(list: AssemblyRecord[]): string[] {
  return [...new Set(list.map((r) => r.date))].sort().reverse()
}

/**
 * Combine several days' assembly reports into one — quantities (plan / achievement /
 * backlog / operators / poor-quality) are summed per line+family+item, while the
 * daily scalars (manpower, WIP, balance, poor-quality %) come from the latest day.
 */
export function combineAssemblyReports(records: AssemblyRecord[]): AssemblyReport {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted[sorted.length - 1]
  const merged = new Map<string, AssemblyRow>()
  for (const rec of sorted) {
    for (const r of rec.rows) {
      const key = `${r.line}|${r.family}|${r.itemCode}|${r.itemName}`
      const cur = merged.get(key)
      if (!cur) {
        merged.set(key, { ...r, lineLeader: r.lineLeader || '', rework: r.rework || 0, rejection: r.rejection || 0 })
        continue
      }
      cur.planQty += r.planQty
      cur.planOperators += r.planOperators || 0
      cur.operators += r.operators
      cur.achQty += r.achQty
      cur.backlogQty += r.backlogQty
      cur.rework += r.rework || 0
      cur.rejection += r.rejection || 0
      cur.poorQualityBacklog += r.poorQualityBacklog
      if (r.remark) cur.remark = r.remark
      if (r.process) cur.process = r.process
      if (r.lineLeader) cur.lineLeader = r.lineLeader
    }
  }
  return {
    date: latest?.date ?? '',
    fileName: `Combined · ${records.length} report${records.length > 1 ? 's' : ''}`,
    presentManpower: latest?.presentManpower ?? 0,
    totalWip: latest?.totalWip ?? null,
    totalReceived: latest?.totalReceived ?? null,
    todayRingAchievement: latest?.todayRingAchievement ?? null,
    assemblyBalance: latest?.assemblyBalance ?? null,
    poorQualityPct: latest?.poorQualityPct ?? null,
    rows: [...merged.values()],
  }
}
