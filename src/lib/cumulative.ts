import { clientId } from './realtime'
import { authHeaders } from './auth'
import { apiUrl, getUnit, unitKey } from './unit'
import type { Unit } from './unit'
import type { MachineRow } from '../types'
import { cacheList } from './cacheLimit'

export interface GroupTotal {
  plan: number
  ach: number
  /** Real backlog straight from the Excel "Back Log" column (accumulates on its own).
   *  Optional for backward-compat: when missing we fall back to plan − ach. */
  backlog?: number
}

/** Backlog for a group total: the Excel value if present, else plan − ach. */
export function backlogOf(t?: GroupTotal): number {
  if (!t) return 0
  return t.backlog ?? Math.max(0, t.plan - t.ach)
}

/**
 * Two shapes share this array:
 *  - Monthly cumulative record  → id = `cum-<YYYY-MM>`, `date` undefined
 *  - Per-day snapshot           → id = `day-<YYYY-MM-DD>`, `date` set
 */
export interface CumulativeEntry {
  id: string
  createdAt: number
  month: string // YYYY-MM
  date?: string // YYYY-MM-DD — set only for per-day snapshots
  groups: Record<string, GroupTotal>
  days?: number
  by?: string
}

const KEY_BASE = 'mm.cumulative.v1'
/** Cache key for the ACTIVE unit — each workspace caches separately. */
const KEY = (unit: Unit) => unitKey(KEY_BASE, unit)
const API = '/api/cumulative'

export function monthOf(date: string): string {
  return (date || '').slice(0, 7)
}

/** Per-group plan/ach/backlog totals summed from the loaded Excel rows. */
export function groupTotals(rows: MachineRow[]): Record<string, GroupTotal> {
  const map: Record<string, GroupTotal> = {}
  for (const r of rows) {
    if (!r.inPlan) continue
    const g = r.group || '—'
    if (!map[g]) map[g] = { plan: 0, ach: 0, backlog: 0 }
    map[g].plan += r.planQty
    map[g].ach += r.achQty
    map[g].backlog = (map[g].backlog ?? 0) + r.backlog
  }
  return map
}

/** Sum saved DAILY snapshots for the month (optionally only up to & incl. `date`).
 *  Backlog is left undefined → derived as plan − ach by backlogOf. */
export function cumulativeUpTo(
  entries: CumulativeEntry[],
  month: string,
  date?: string,
): Record<string, GroupTotal> {
  const out: Record<string, GroupTotal> = {}
  for (const e of entries) {
    if (!e.date || monthOf(e.date) !== month) continue
    if (date && e.date > date) continue
    for (const [g, t] of Object.entries(e.groups)) {
      if (!out[g]) out[g] = { plan: 0, ach: 0 }
      out[g].plan += t.plan
      out[g].ach += t.ach
    }
  }
  return out
}

/**
 * The month's cumulative totals (per group). Built by SUMMING the saved per-day
 * snapshots — so it grows day-by-day and past days never change when a new day is
 * added. Falls back to an old manual monthly record only when no day is saved yet.
 */
export function cumulativeForMonth(
  entries: CumulativeEntry[],
  month: string,
): Record<string, GroupTotal> {
  const hasDaily = entries.some((e) => e.date && monthOf(e.date) === month)
  if (hasDaily) return cumulativeUpTo(entries, month)
  const e = entries.find((x) => x.month === month && !x.date)
  return e ? e.groups : {}
}

export function daysForMonth(entries: CumulativeEntry[], month: string): number {
  const dailies = entries.filter((e) => e.date && monthOf(e.date) === month).length
  if (dailies) return dailies
  return entries.find((x) => x.month === month && !x.date)?.days ?? 0
}

/** The saved per-day snapshot for a date, or null when nothing was saved. */
export function dailyForDate(
  entries: CumulativeEntry[],
  date: string,
): Record<string, GroupTotal> | null {
  const e = entries.find((x) => x.date === date)
  return e ? e.groups : null
}

export function monthsIn(entries: CumulativeEntry[]): string[] {
  return Array.from(new Set(entries.map((e) => e.month))).sort().reverse()
}

function readLocal(unit: Unit): CumulativeEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY(unit)) || '[]') as CumulativeEntry[]
  } catch {
    return []
  }
}
function writeLocal(list: CumulativeEntry[], unit: Unit) {
  try {
    cacheList(KEY(unit), list)
  } catch {
    /* ignore */
  }
}

export async function fetchCumulative(): Promise<CumulativeEntry[]> {
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(API, unit), { cache: 'no-store' })
    if (!r.ok) throw new Error('bad')
    const list = (await r.json()) as CumulativeEntry[]
    writeLocal(list, unit)
    return list
  } catch {
    return readLocal(unit)
  }
}

/** Save (overwrite) a month's cumulative totals. Stable id → same month overwrites. */
export async function saveCumulativeMonth(
  month: string,
  groups: Record<string, GroupTotal>,
  days: number,
): Promise<CumulativeEntry> {
  const unit = getUnit()
  const entry: CumulativeEntry = {
    id: `cum-${month}`,
    createdAt: Date.now(),
    month,
    groups,
    days,
    by: clientId(),
  }
  try {
    const r = await fetch(apiUrl(API, unit), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(entry),
    })
    if (!r.ok) throw new Error('bad')
    return (await r.json()) as CumulativeEntry
  } catch {
    writeLocal([entry, ...readLocal(unit).filter((e) => e.id !== entry.id)], unit)
    return entry
  }
}

/** Save (overwrite) a single day's plan/ach snapshot. Stable id → same date overwrites. */
export async function saveDailyEntry(
  date: string,
  groups: Record<string, GroupTotal>,
): Promise<CumulativeEntry> {
  const unit = getUnit()
  const entry: CumulativeEntry = {
    id: `day-${date}`,
    createdAt: Date.now(),
    month: monthOf(date),
    date,
    groups,
    by: clientId(),
  }
  try {
    const r = await fetch(apiUrl(API, unit), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(entry),
    })
    if (!r.ok) throw new Error('bad')
    return (await r.json()) as CumulativeEntry
  } catch {
    writeLocal([entry, ...readLocal(unit).filter((e) => e.id !== entry.id)], unit)
    return entry
  }
}

export async function deleteCumulative(id: string): Promise<void> {
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(`${API}/${id}`, unit), { method: 'DELETE', headers: authHeaders(false) })
    if (!r.ok) throw new Error('bad')
  } catch {
    writeLocal(readLocal(unit).filter((e) => e.id !== id), unit)
  }
}
