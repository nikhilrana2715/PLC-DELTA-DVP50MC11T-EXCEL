// Route Card — the workbook that travels with a batch through its operations.
//
// Unlike the Plan Confirmation sheet, there is no agreed layout here: a route card is
// whatever the shop floor prints, and the columns move between revisions. So nothing in this
// file looks for a named column. Each sheet is read as a grid, its header row is found by
// shape rather than by title, and everything is kept in the sheet's own order — the screen
// prints the workbook instead of a chosen subset of it. A new column added in Excel simply
// appears; a renamed one keeps working.
//
// The month is NOT derived from the sheet for the same reason. It is picked on upload, which
// is also what lets one card be filed under a month the sheet never mentions.
import * as XLSX from 'xlsx'
import { toISODate } from './monthlyPlan'
import { apiUrl, getUnit, unitKey } from './unit'
import type { Unit } from './unit'
import { cacheList } from './cacheLimit'

/** One tab of the workbook, kept as Excel has it. */
export interface RouteSheet {
  /** Tab name as it appears in Excel. */
  name: string
  /** The header row, in sheet order. Blank headings are kept so the columns stay aligned. */
  columns: string[]
  /** Body rows, in sheet order. */
  cells: string[][]
  /** Column indexes that hold numbers, so the screen can right-align them. */
  numericCols: number[]
  /** Anything printed above the header row (titles, a customer line) — shown as a caption. */
  preamble: string
}

export interface RouteCard {
  /** 'YYYY-MM' — chosen on upload, not read from the sheet. */
  month: string
  /** 'Aug-2026' — how the month is printed. */
  title: string
  fileName: string
  /** Every visible tab in the workbook, in tab order. */
  sheets: RouteSheet[]
  /** Body rows across all tabs — the one figure worth showing without opening a tab. */
  rowCount: number
}

type Cell = string | number | null | undefined
type Grid = Cell[][]

const S = (v: Cell) => String(v ?? '').replace(/\s+/g, ' ').trim()
const isNum = (v: string) => v !== '' && Number.isFinite(Number(v.replace(/,/g, '')))

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** '2026-08' → 'Aug-2026'. */
export const routeMonthLabel = (month: string): string => {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  return m ? `${MONTH_LABELS[+m[2] - 1] ?? m[2]}-${m[1]}` : month
}
/** The month a fresh upload defaults to — the local month, not the UTC one. */
export const currentMonth = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Drop the blank columns Excel leaves at the edges when a sheet starts at, say, column C. */
function trimBlankColumns(grid: Grid): { grid: Grid; width: number } {
  const width = grid.reduce((w, r) => Math.max(w, r?.length ?? 0), 0)
  const used: number[] = []
  for (let c = 0; c < width; c++) if (grid.some((r) => S(r?.[c]) !== '')) used.push(c)
  if (used.length === 0) return { grid: [], width: 0 }
  return { grid: grid.map((r) => used.map((c) => r?.[c] ?? '')), width: used.length }
}

/**
 * Which row is the header?
 *
 * The widest row near the top. A route card usually opens with a title and a couple of
 * summary lines that fill two or three cells, and then the header row that fills nearly
 * every column — so counting filled cells separates them without knowing a single heading.
 * Ties go to the earliest row, because a body row can be just as wide as the header.
 */
function findHeaderRow(grid: Grid, width: number): number {
  let best = -1
  let bestCount = 0
  const limit = Math.min(grid.length, 25)
  for (let r = 0; r < limit; r++) {
    const count = (grid[r] ?? []).filter((c) => S(c) !== '').length
    // A header is text, not figures — a row that is mostly numbers is already data.
    const filled = (grid[r] ?? []).map(S).filter((v) => v !== '')
    const numeric = filled.filter(isNum).length
    if (filled.length && numeric > filled.length / 2) continue
    if (count > bestCount) {
      bestCount = count
      best = r
    }
  }
  // A sheet with no obvious header (one long column of values) still prints — row 0 leads.
  return bestCount >= Math.max(2, Math.ceil(width * 0.4)) ? best : 0
}

function readSheet(name: string, ws: XLSX.WorkSheet): RouteSheet | null {
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

/**
 * Read every visible tab of a route card workbook.
 *
 * `month` is what the uploader chose — the sheet is never asked for it.
 */
export function parseRouteCardWorkbook(buf: ArrayBuffer, fileName: string, month: string): RouteCard {
  const wb = XLSX.read(buf, { type: 'array' })
  // A tab the author hid in Excel is working material, not something to put on screen.
  const hidden = new Set((wb.Workbook?.Sheets ?? []).filter((m) => m && m.Hidden).map((m) => String(m.name)))
  const sheets: RouteSheet[] = []
  for (const name of wb.SheetNames) {
    if (hidden.has(name)) continue
    const sheet = readSheet(name, wb.Sheets[name])
    if (sheet) sheets.push(sheet)
  }
  if (!sheets.length) throw new Error('This workbook has no readable sheet.')
  return {
    month,
    title: routeMonthLabel(month),
    fileName,
    sheets,
    rowCount: sheets.reduce((n, s) => n + s.cells.length, 0),
  }
}

// ---- The closing deadline, and the colour it earns --------------------------
//
// The sheet works to one rule: a row opens on its DATE, and it must be closed within 28
// days. Colour then says where it stands — green once it is closed, red once 25 days have
// gone by with it still open, amber while there is still room. The screen applies the same
// rule so an upload is coloured whether or not the workbook carried its own fill, and so a
// card that ages between two uploads changes colour on its own.

/** Days from the opening date to the closing deadline. */
export const DEADLINE_DAYS = 28
/** Days open after which a card still not closed is overdue. */
export const DUE_AFTER_DAYS = 25

/** Where a row stands: closed, overdue, or still inside its window. */
export type RowState = 'closed' | 'due' | 'open'

/**
 * The four columns the rule needs, by index — -1 when the sheet has none.
 *
 * Found by shape, never by a fixed position: a heading is matched loosely, and the opening
 * date falls back to whichever column actually holds dates. A revision that renames
 * "Closing Deadline" or moves it three columns along keeps working.
 */
export interface RouteCols {
  /** The opening date — column B in the sheets seen so far. */
  date: number
  status: number
  closedOn: number
  deadline: number
}

const clean = (h: string) => h.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

export function routeCardColumns(columns: string[], cells: string[][] = []): RouteCols {
  const heads = columns.map(clean)
  const find = (test: (h: string) => boolean, skip: number[] = []) =>
    heads.findIndex((h, i) => !skip.includes(i) && h !== '' && test(h))

  const deadline = find((h) => h.includes('deadline') || (h.includes('closing') && h.includes('date')))
  const closedOn = find((h) => /date of close|close date|closed on|closing date/.test(h) || (h.includes('clos') && h.includes('date')), [deadline])
  const status = find((h) => h === 'status' || (h.includes('status') && !h.includes('deadline')))

  let date = find((h) => h === 'date' || h === 'open date' || h === 'date of open', [deadline, closedOn])
  if (date < 0) {
    // No column says "date", so ask the values which column holds them.
    let best = -1
    let bestHits = 0
    for (let c = 0; c < columns.length; c++) {
      if (c === deadline || c === closedOn) continue
      const vals = cells.map((r) => r[c] ?? '').filter((v) => v !== '')
      if (vals.length < 2) continue
      const hits = vals.filter((v) => toISODate(v) !== '').length
      if (hits > bestHits && hits >= vals.length * 0.6) {
        bestHits = hits
        best = c
      }
    }
    date = best
  }
  return { date, status, closedOn, deadline }
}

/** Whole days from `fromISO` up to `toISO` (negative when `fromISO` is still ahead). */
const daysBetween = (fromISO: string, toISO: string): number =>
  Math.floor((Date.parse(toISO + 'T00:00:00') - Date.parse(fromISO + 'T00:00:00')) / 86400000)

/** Local 'YYYY-MM-DD' for a Date — never toISOString(), which shifts to UTC and, east of
 *  Greenwich, hands back the previous day for a local midnight. */
const localISO = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** `iso` shifted by `days`, as ISO. */
function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return localISO(d)
}

/**
 * A row's state, or null when the sheet cannot say (no opening date on the row).
 *
 * Closed wins outright: a card closed on day 40 is still closed, and colouring it red would
 * be reporting the delay twice — the Date of close already says that.
 */
export function rowState(row: string[], cols: RouteCols, todayISO: string): RowState | null {
  const closed =
    (cols.status >= 0 && /clos/i.test(row[cols.status] ?? '')) ||
    (cols.closedOn >= 0 && toISODate(row[cols.closedOn] ?? '') !== '')
  if (closed) return 'closed'
  const opened = cols.date >= 0 ? toISODate(row[cols.date] ?? '') : ''
  if (!opened) return null
  return daysBetween(opened, todayISO) >= DUE_AFTER_DAYS ? 'due' : 'open'
}

/**
 * What to print in the Closing Deadline cell.
 *
 * The sheet's own value is used when it has one. When it is blank but the row has an
 * opening date, the deadline is worked out the way the sheet would have — `computed` is
 * true so the screen can say where the date came from.
 */
export function deadlineOf(row: string[], cols: RouteCols): { text: string; computed: boolean } {
  const own = cols.deadline >= 0 ? (row[cols.deadline] ?? '').trim() : ''
  if (own) return { text: own, computed: false }
  const opened = cols.date >= 0 ? toISODate(row[cols.date] ?? '') : ''
  if (!opened) return { text: '', computed: false }
  const due = addDays(opened, DEADLINE_DAYS)
  return {
    text: new Date(due + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
    computed: true,
  }
}

/** How many rows sit in each state — the figures behind the cards above the sheet. */
export function routeCardTally(cells: string[][], cols: RouteCols, todayISO: string) {
  let closed = 0
  let due = 0
  let open = 0
  for (const row of cells) {
    const st = rowState(row, cols, todayISO)
    if (st === 'closed') closed++
    else if (st === 'due') due++
    else if (st === 'open') open++
  }
  return { total: cells.length, closed, due, open }
}

// ---- Persistence (server-synced, one record per month, per unit) ----------

export interface RouteCardRecord extends RouteCard {
  id: string // `rcard-<YYYY-MM>`
  savedAt: number
  by?: string
}

// ---- The deadline list, for the dashboard ----------------------------------
//
// The dashboard asks one question of this workbook: which cards are about to run out of
// time? Answering it
// means being careful about WHICH tabs to count. A route card workbook carries far more than
// route cards — the one on file has fifteen tabs, and STOCK, REJECTION, PD FINAL and the
// rest all have a date column, so a naive sweep reports 4,486 "open route cards" out of
// 12,850 rows that are mostly not route cards at all.
//
// The test used here is the one the question itself implies: a tab counts only if it can say
// what CLOSED means — a Status column, or a Date of close. Without one, nothing on that tab
// can be called open, so it is left out. That also settles the overlap between "ALL ROUTE"
// and the month tabs, since only the month tabs carry a status.

/** The columns the open list prints, on top of the four the closing rule needs. */
export interface RouteRowCols extends RouteCols {
  sNo: number
  itemCode: number
  itemName: number
  batch: number
  balance: number
}

/**
 * Column indexes for one tab, or null when the tab is not a route card register.
 *
 * The close test is checked FIRST, from the headings alone, so the tabs that are not route
 * cards cost nothing — the date-column fallback inside `routeCardColumns` reads every value
 * of every column, and STOCK alone is 7,510 rows.
 */
export function routeRowColumns(columns: string[], cells: string[][]): RouteRowCols | null {
  const heads = columns.map(clean)
  const canClose = heads.some(
    (h) => h === 'status' || (h.includes('status') && !h.includes('deadline')) || (h.includes('clos') && h.includes('date') && !h.includes('deadline')),
  )
  if (!canClose) return null

  const base = routeCardColumns(columns, cells)
  if (base.date < 0) return null
  const taken = [base.date, base.status, base.closedOn, base.deadline]
  const find = (test: RegExp) => heads.findIndex((h, i) => !taken.includes(i) && h !== '' && test.test(h))
  return {
    ...base,
    sNo: find(/^s ?no|^sr ?no|^serial|^sl no/),
    itemCode: find(/(item|part|material).*(code|no)|^code$/),
    itemName: find(/(item|part|material).*(name|desc)|^description$|^name$/),
    batch: find(/batch|^lot/),
    balance: find(/^balance|pending qty|open qty/),
  }
}

/** One route card row that has not been closed. */
export interface OpenRouteRow {
  /** Stable across re-uploads, so the same card is not counted twice. */
  key: string
  /** Which workbook and tab it came from — 'Aug-2026', 'AUG-26'. */
  month: string
  sheet: string
  sNo: string
  /** The opening date exactly as the sheet prints it, and as ISO for the arithmetic. */
  date: string
  dateISO: string
  itemCode: string
  itemName: string
  batch: string
  balance: string
  /** Days since it opened, and the deadline it is working to. */
  daysOpen: number
  /** Days left of the 28 — zero or negative once the deadline has passed. */
  daysLeft: number
  /** The deadline as the sheet prints it, and as ISO when it parses — the screen shortens
   *  "30 August 2026" to "30 Aug 2026", which a phone has room for. */
  deadline: string
  deadlineISO: string
  /** True once 25 days have gone by — the red rows on the Route Card sheet. */
  overdue: boolean
}

/** One month's register — the tab, tallied exactly the way the Route Card page tallies it. */
export interface RouteRegister {
  /** 'YYYY-MM', worked out from the dates on the rows rather than the tab's name. */
  month: string
  /** The tab as Excel names it — 'AUG-26'. */
  label: string
  /** The workbook it came from — 'Aug-2026'. */
  card: string
  total: number
  closed: number
  /** Open with 25 days or more gone — the ones the dashboard is asking about. */
  due: number
  /** Open and still inside the window. */
  open: number
  /** The `due` rows themselves, most urgent first. */
  dueRows: OpenRouteRow[]
}

export interface RouteDueSummary {
  /** False when no route card register was found at all — the dashboard card is then hidden. */
  hasData: boolean
  /** The register the dashboard shows: this month's, or the newest there is. */
  current: RouteRegister | null
  /** True when this month has no register yet and an earlier one is being shown. */
  fallback: boolean
  /** Every month that has a register, newest first — for the note under the title. */
  months: string[]
}

/**
 * The route cards whose deadline is on top of them, for the month we are in.
 *
 * This deliberately does NOT answer "what is open" — that was the first version, and 182
 * rows going back to April is not a morning meeting item. What the meeting needs is the
 * short list: not closed, and already 25 of its 28 days gone, so three days remain. That is
 * the same rule and the same figure as the OVERDUE card on the Route Card page, and it is
 * read one month at a time, from the register for the month we are in.
 *
 * A tab's month comes from the dates ON it, not from its name: 'AUG-26' and 'Sheet3' are
 * both read the same way, and a tab renamed in Excel keeps working. When this month has no
 * register yet — a September tab printed but not yet filled in — the newest one that does
 * is shown instead, and `fallback` says so, because a silent zero would read as "nothing
 * is due" when it means "nothing has been entered".
 */
export function routeCardDue(records: RouteCardRecord[], todayISO: string): RouteDueSummary {
  const registers: RouteRegister[] = []
  const seenMonths = new Set<string>()

  for (const rec of [...records].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))) {
    for (const sheet of rec.sheets) {
      const cols = routeRowColumns(sheet.columns, sheet.cells)
      if (!cols) continue

      // Which month is this tab? Whichever month most of its opening dates fall in.
      const monthHits = new Map<string, number>()
      for (const row of sheet.cells) {
        const iso = toISODate(row[cols.date] ?? '')
        if (iso) monthHits.set(iso.slice(0, 7), (monthHits.get(iso.slice(0, 7)) ?? 0) + 1)
      }
      let month = ''
      let best = 0
      for (const [m, n] of monthHits) if (n > best) [month, best] = [m, n]
      // No dated row at all — a tab printed for a month that has not started.
      if (!month) continue
      // A month already taken by a newer workbook is not read again.
      if (seenMonths.has(month)) continue
      seenMonths.add(month)

      const reg: RouteRegister = {
        month,
        label: sheet.name.trim() || routeMonthLabel(month),
        card: rec.title,
        total: sheet.cells.length,
        closed: 0,
        due: 0,
        open: 0,
        dueRows: [],
      }
      for (const row of sheet.cells) {
        const state = rowState(row, cols, todayISO)
        if (state === 'closed') {
          reg.closed++
          continue
        }
        if (state === 'open') {
          reg.open++
          continue
        }
        if (state !== 'due') continue // no opening date — counted in total, nothing more to say
        reg.due++
        const at = (i: number) => (i >= 0 ? (row[i] ?? '').trim() : '')
        const date = at(cols.date)
        const dateISO = toISODate(date)
        const daysOpen = dateISO ? daysBetween(dateISO, todayISO) : 0
        reg.dueRows.push({
          key: [date, at(cols.itemCode), at(cols.batch), at(cols.sNo)].join('|'),
          month: rec.title,
          sheet: reg.label,
          sNo: at(cols.sNo),
          date,
          dateISO,
          itemCode: at(cols.itemCode),
          itemName: at(cols.itemName),
          batch: at(cols.batch),
          balance: at(cols.balance),
          daysOpen,
          daysLeft: DEADLINE_DAYS - daysOpen,
          deadline: deadlineOf(row, cols).text,
          deadlineISO: toISODate(deadlineOf(row, cols).text),
          overdue: true,
        })
      }
      // Least time left first — the one with three days to go leads the ones with thirty.
      reg.dueRows.sort((a, b) => a.daysLeft - b.daysLeft || a.date.localeCompare(b.date))
      registers.push(reg)
    }
  }

  registers.sort((a, b) => b.month.localeCompare(a.month))
  const thisMonth = todayISO.slice(0, 7)
  const current = registers.find((r) => r.month === thisMonth) ?? registers[0] ?? null
  return {
    hasData: registers.length > 0,
    current,
    fallback: !!current && current.month !== thisMonth,
    months: registers.map((r) => r.month),
  }
}

const API = '/api/routecard'
const KEY_BASE = 'mm.routecard.v1'
/** Cache key for the ACTIVE unit — each workspace caches separately. */
const KEY = (unit: Unit) => unitKey(KEY_BASE, unit)

const sortBySaved = (list: RouteCardRecord[]) => [...list].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))

function readLocal(unit: Unit): RouteCardRecord[] {
  try {
    return sortBySaved(JSON.parse(localStorage.getItem(KEY(unit)) || '[]') as RouteCardRecord[])
  } catch {
    return []
  }
}
function writeLocal(list: RouteCardRecord[], unit: Unit) {
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

export async function loadRouteCards(): Promise<RouteCardRecord[]> {
  // Pinned at entry: an await can land after the user has switched workspace, and the
  // answer must go back to the unit that asked for it.
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(API, unit), { headers: authHeaders(false) })
    if (!r.ok) throw new Error('bad')
    const list = (await r.json()) as RouteCardRecord[]
    writeLocal(list, unit)
    return sortBySaved(list)
  } catch {
    return readLocal(unit)
  }
}

/** Save (overwrite) a month's card. Stable id per month → re-uploading replaces it. */
export async function saveRouteCard(card: RouteCard): Promise<RouteCardRecord> {
  const unit = getUnit()
  const rec: RouteCardRecord = { ...card, id: `rcard-${card.month}`, savedAt: Date.now() }
  try {
    const r = await fetch(apiUrl(API, unit), { method: 'POST', headers: authHeaders(), body: JSON.stringify(rec) })
    if (!r.ok) throw new Error('bad')
    return (await r.json()) as RouteCardRecord
  } catch {
    writeLocal([rec, ...readLocal(unit).filter((x) => x.id !== rec.id)], unit)
    return rec
  }
}

export async function deleteRouteCard(id: string): Promise<void> {
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(`${API}/${id}`, unit), { method: 'DELETE', headers: authHeaders(false) })
    if (!r.ok) throw new Error('bad')
  } catch {
    writeLocal(readLocal(unit).filter((x) => x.id !== id), unit)
  }
}
