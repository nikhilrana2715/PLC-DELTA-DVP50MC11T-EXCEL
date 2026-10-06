// Daily Plan vs Achievement — the small sheet the meeting reads its running totals off.
//
// The Monthly Planning sheet says what the month is meant to make, and the daily production
// report says what each machine made; neither carries the plant's own running Day / Month
// tally, because that is worked out separately and written on the board. This sheet IS that
// tally — six numbers:
//
//   31/08/2026 | Plan    | Achv.   | Backlog
//   Day        |   2,981 |  11,509 |  -8,528
//   Month      | 442,997 | 347,887 |  95,110
//
// Nothing here depends on those cells sitting where they sit. The header row is found by its
// words, the two rows by their labels, and the date by whichever cell parses as one — so a
// re-laid-out sheet keeps working. Backlog is stored as written, negative included: a day
// that beat its plan is real information, and clamping it to zero would hide it.
import * as XLSX from 'xlsx'
import { toISODate } from './monthlyPlan'
import { apiUrl, getUnit, unitKey } from './unit'
import type { Unit } from './unit'
import { cacheList } from './cacheLimit'

export interface PlanVsAchFigures {
  plan: number
  ach: number
  backlog: number
}

export interface PlanVsAch {
  /** 'YYYY-MM-DD' — the sheet's own date when it has one, else the date chosen on upload. */
  date: string
  fileName: string
  /** True when the date came from the sheet rather than the picker. */
  dateFromSheet: boolean
  day: PlanVsAchFigures
  month: PlanVsAchFigures
  /** Whether each row was actually found — a missing row reads "—", not zero. */
  dayFound?: boolean
  monthFound?: boolean
  /** What the sheet called the day row ("Yesterday", "Day", "Today") — shown as-is. */
  dayLabel?: string
}

type Cell = string | number | null | undefined
type Grid = Cell[][]

const S = (v: Cell) => String(v ?? '').replace(/\s+/g, ' ').trim()
const norm = (v: Cell) => S(v).toLowerCase()
const num = (v: Cell): number => {
  if (v == null || v === '' || v === '-') return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, '').replace(/\s/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** Which column holds what, from whatever the header row calls them. */
interface Cols {
  plan: number
  ach: number
  backlog: number
}

const HEAD = {
  // "Achv.", "Ach", "Achievement" — and never "Plan" itself, which contains no 'ach'.
  ach: /^(ach|achv|achiev)/,
  plan: /^plan/,
  backlog: /^(backlog|balance|pending)/,
}

/**
 * The two rows, by whatever the sheet calls them.
 *
 * The plant writes "Yesterday" where an earlier reading of this sheet expected "Day" — the
 * tally is prepared the next morning, so the day it covers IS yesterday to whoever types it.
 * Matching only /^day/ meant that row was silently skipped and the six figures came out
 * empty, which is exactly the number nobody notices is missing. Every word the row is
 * plausibly called is accepted instead; the label found is kept so the screen can echo it.
 */
const ROW = {
  day: /^(yesterday|y[\s'’.-]?day|prev(ious)?|last\s*day|day|daily|today|shift)\b/,
  month: /^(month|monthly|mtd|m\.?t\.?d|cumulative|cum)\b/,
}

function findCols(row: Cell[]): Cols | null {
  const cols: Cols = { plan: -1, ach: -1, backlog: -1 }
  row.forEach((c, i) => {
    const h = norm(c)
    if (!h) return
    if (cols.plan < 0 && HEAD.plan.test(h)) cols.plan = i
    else if (cols.ach < 0 && HEAD.ach.test(h)) cols.ach = i
    else if (cols.backlog < 0 && HEAD.backlog.test(h)) cols.backlog = i
  })
  // Plan and achievement are the two that must be there; backlog can be derived.
  return cols.plan >= 0 && cols.ach >= 0 ? cols : null
}

const figuresFrom = (row: Cell[], cols: Cols): PlanVsAchFigures => {
  const plan = num(row[cols.plan])
  const ach = num(row[cols.ach])
  // A sheet that leaves the column out still gets the figure, worked out the way it would.
  const backlog = cols.backlog >= 0 ? num(row[cols.backlog]) : plan - ach
  return { plan, ach, backlog }
}

/**
 * Read the Day / Month tally out of a workbook.
 *
 * Every sheet is tried, so the tally can sit on a tab beside other working.
 */
export function parsePlanVsAchWorkbook(buf: ArrayBuffer, fileName: string, fallbackDate: string): PlanVsAch {
  const wb = XLSX.read(buf, { type: 'array' })
  const hidden = new Set((wb.Workbook?.Sheets ?? []).filter((m) => m && m.Hidden).map((m) => String(m.name)))

  for (const name of wb.SheetNames) {
    if (hidden.has(name)) continue
    const ws = wb.Sheets[name]
    if (!ws?.['!ref']) continue
    const grid = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, defval: '', raw: false, blankrows: false }) as Grid

    for (let h = 0; h < grid.length; h++) {
      const cols = findCols(grid[h] ?? [])
      if (!cols) continue
      // The two rows are found by their labels, anywhere under the header.
      let day: PlanVsAchFigures | null = null
      let month: PlanVsAchFigures | null = null
      let dayLabel = ''
      let monthAt = -1
      for (let r = h + 1; r < grid.length; r++) {
        const first = (grid[r] ?? []).find((c) => S(c) !== '')
        const label = norm(first)
        if (!day && ROW.day.test(label)) {
          day = figuresFrom(grid[r] ?? [], cols)
          dayLabel = S(first)
        } else if (!month && ROW.month.test(label)) {
          month = figuresFrom(grid[r] ?? [], cols)
          monthAt = r
        }
        if (day && month) break
      }
      // A day row the words did not catch — someone labelled it with the date, or with a
      // word nobody thought of. The table's shape still says which row it is: the filled
      // row above the month row. Better than reporting a day of zero, which reads as real.
      if (!day && monthAt > h + 1) {
        for (let r = h + 1; r < monthAt; r++) {
          const row = grid[r] ?? []
          if (S(row[cols.plan]) === '' && S(row[cols.ach]) === '') continue
          day = figuresFrom(row, cols)
          dayLabel = S(row.find((c) => S(c) !== '')) || 'Yesterday'
          break
        }
      }
      if (!day && !month) continue

      // The date: whatever cell in the header row (or the two above it) reads as one.
      let date = ''
      for (let r = Math.max(0, h - 2); r <= h && !date; r++) {
        for (const c of grid[r] ?? []) {
          const iso = toISODate(c)
          if (iso) {
            date = iso
            break
          }
        }
      }
      return {
        date: date || fallbackDate,
        dateFromSheet: !!date,
        fileName,
        day: day ?? { plan: 0, ach: 0, backlog: 0 },
        month: month ?? { plan: 0, ach: 0, backlog: 0 },
        dayFound: !!day,
        monthFound: !!month,
        // The label is printed as a heading, so a date or an essay is no use as one.
        dayLabel: !dayLabel || toISODate(dayLabel) || dayLabel.length > 16 ? 'Yesterday' : dayLabel,
      }
    }
  }
  throw new Error(
    'No “Plan / Achv. / Backlog” table was found in this workbook. It needs a header row with Plan and Achv. columns, and a Yesterday (or Day) and a Month row under it.',
  )
}

// ---- Persistence (server-synced, one record per date, per unit) -----------

export interface PlanVsAchRecord extends PlanVsAch {
  id: string // `pva-<YYYY-MM-DD>`
  savedAt: number
  by?: string
}

const API = '/api/planvsach'
const KEY_BASE = 'mm.planvsach.v1'
const KEY = (unit: Unit) => unitKey(KEY_BASE, unit)

const byDate = (list: PlanVsAchRecord[]) => [...list].sort((a, b) => b.date.localeCompare(a.date))

function readLocal(unit: Unit): PlanVsAchRecord[] {
  try {
    return byDate(JSON.parse(localStorage.getItem(KEY(unit)) || '[]') as PlanVsAchRecord[])
  } catch {
    return []
  }
}
function writeLocal(list: PlanVsAchRecord[], unit: Unit) {
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

export async function loadPlanVsAch(): Promise<PlanVsAchRecord[]> {
  // Pinned at entry: an await can land after the user has switched workspace.
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(API, unit), { headers: authHeaders(false) })
    if (!r.ok) throw new Error('bad')
    const list = (await r.json()) as PlanVsAchRecord[]
    writeLocal(list, unit)
    return byDate(list)
  } catch {
    return readLocal(unit)
  }
}

/** Save (overwrite) one date's tally. Stable id per date → re-uploading replaces it. */
export async function savePlanVsAch(rec: PlanVsAch): Promise<PlanVsAchRecord> {
  const unit = getUnit()
  const full: PlanVsAchRecord = { ...rec, id: `pva-${rec.date}`, savedAt: Date.now() }
  try {
    const r = await fetch(apiUrl(API, unit), { method: 'POST', headers: authHeaders(), body: JSON.stringify(full) })
    if (!r.ok) throw new Error('bad')
    return (await r.json()) as PlanVsAchRecord
  } catch {
    writeLocal([full, ...readLocal(unit).filter((x) => x.id !== full.id)], unit)
    return full
  }
}

export async function deletePlanVsAch(id: string): Promise<void> {
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(`${API}/${id}`, unit), { method: 'DELETE', headers: authHeaders(false) })
    if (!r.ok) throw new Error('bad')
  } catch {
    writeLocal(readLocal(unit).filter((x) => x.id !== id), unit)
  }
}
