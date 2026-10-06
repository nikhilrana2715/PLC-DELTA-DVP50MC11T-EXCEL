// ---- Loop: the dashboard as a slideshow, for the morning meeting screen ----
//
// A morning meeting is a room looking at one screen. Scrolling through eight cards while
// people talk means half of them are reading the wrong thing; so Loop puts ONE card on the
// screen at a time and moves on by itself, the way a shop-floor display does.
//
// Two things advance together. The section changes — KPI cards, then Priority, then the
// plan chart, and so on — and the machine group changes with it, so the room sees FG's whole
// dashboard, then CG's, then EG's. Group first, section inside it: that is the order a
// meeting actually runs in ("right, FG…"), and it keeps each group's story together instead
// of jumping between them every seven seconds.

import type { Unit } from './unit'

const K_LOOP = 'mm.loop'
const K_LOOP_SECS = 'mm.loopSecs'

const get = (key: string, fallback: string): string => {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}
const set = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

/** How long each card holds the screen. Six to eight seconds is long enough to read a chart
 *  and short enough that nobody waits for it. */
export const LOOP_SECONDS = [6, 7, 8, 10, 15] as const
export const DEFAULT_LOOP_SECONDS = 7

export const getLoopEnabled = (): boolean => get(K_LOOP, '0') === '1'
export const setLoopEnabled = (on: boolean) => set(K_LOOP, on ? '1' : '0')
export const getLoopSeconds = (): number => {
  const n = Number(get(K_LOOP_SECS, String(DEFAULT_LOOP_SECONDS)))
  return LOOP_SECONDS.includes(n as (typeof LOOP_SECONDS)[number]) ? n : DEFAULT_LOOP_SECONDS
}
export const setLoopSeconds = (s: number) => set(K_LOOP_SECS, String(s))

// ---- What the loop walks through ----------------------------------------

export interface LoopSection {
  id: string
  /** What the loop bar calls it. */
  label: string
}

/**
 * The production dashboard, in the order it reads down the page.
 *
 * Unit 2 and Unit 3 render the same page with a couple of cards hidden, so the list is
 * filtered against what the unit actually shows rather than kept per unit.
 */
export const DASHBOARD_SECTIONS: LoopSection[] = [
  { id: 'kpi', label: 'Summary Cards' },
  { id: 'priority', label: 'Priority Alerts' },
  { id: 'plan', label: 'Plan vs Achievement vs Backlog' },
  { id: 'remarks', label: 'Downtime Remarks' },
  { id: 'efficiency', label: 'Efficiency by Machine' },
  { id: 'downtime', label: 'Downtime by Category' },
  { id: 'register', label: 'Machine Register' },
]

/** The Assembly workspace's dashboard is a different page, so it has its own running order. */
export const ASSEMBLY_SECTIONS: LoopSection[] = [
  { id: 'kpi', label: 'Summary Cards' },
  { id: 'planVsAch', label: 'Plan Qty vs OK Qty' },
  { id: 'byLine', label: 'Plan, OK & Backlog by Line' },
  { id: 'achPct', label: 'OK % by Line' },
  { id: 'operators', label: 'Operators — Plan vs Used' },
  { id: 'family', label: 'Plan Qty by Family' },
  { id: 'pqBacklog', label: 'Poor Quality Backlog by Line' },
  { id: 'remarks', label: 'Remark Summary' },
  { id: 'items', label: 'Detailed Summary by Item' },
]

export interface LoopStep {
  /** Machine group to filter to — 'ALL' means no filter. */
  group: string
  section: LoopSection
}

/**
 * Build the running order.
 *
 * `groups` is what the day's report actually contains, so a unit with no CG machines never
 * shows an empty CG slide. 'ALL' leads: the room sees the whole shop before it is broken
 * down, which is how the meeting opens.
 */
export function buildPlaylist(sections: LoopSection[], groups: string[]): LoopStep[] {
  const all = groups.length ? ['ALL', ...groups] : ['ALL']
  return all.flatMap((group) => sections.map((section) => ({ group, section })))
}

/** Sections for the workspace on screen, minus the cards that unit does not render. */
export function sectionsFor(unit: Unit, opts: { hasRemarks: boolean; hasPriority: boolean }): LoopSection[] {
  if (unit === 'ASS') return ASSEMBLY_SECTIONS
  return DASHBOARD_SECTIONS.filter(
    (s) => (s.id !== 'remarks' || opts.hasRemarks) && (s.id !== 'priority' || opts.hasPriority),
  )
}
