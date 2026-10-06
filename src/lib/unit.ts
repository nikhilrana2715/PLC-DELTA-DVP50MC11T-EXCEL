import { useSyncExternalStore } from 'react'

/**
 * The plant runs as four separate workspaces — three production units and Assembly.
 * Each keeps its own records, so switching unit swaps the whole dataset: uploads,
 * meetings, notes, Cp-Cpk, cumulative, assembly and the monthly plan.
 *
 * The choice lives on the device (localStorage). The server decides what a record's unit
 * is from the request, so a device cannot write into a unit it is not looking at.
 */
export const UNITS = ['U1', 'U2', 'U3', 'ASS'] as const
export type Unit = (typeof UNITS)[number]

/** Full names for tooltips and headings — the buttons themselves stay short. */
export const UNIT_LABEL: Record<Unit, string> = {
  U1: 'Unit 1',
  U2: 'Unit 2',
  U3: 'Unit 3',
  ASS: 'Assembly',
}

/**
 * What each workspace's dashboard is called on screen.
 *
 * The units are separate shops making different things, so the heading says which one you are
 * looking at rather than leaving every page with the same name.
 */
const DASHBOARD_TITLE: Record<Unit, string> = {
  U1: 'Production Dashboard',
  U2: 'Shell Production Dashboard',
  U3: 'Roller Production Dashboard',
  ASS: 'Assembly Dashboard',
}
export const dashboardTitle = (unit: string): string =>
  DASHBOARD_TITLE[unit as Unit] ?? DASHBOARD_TITLE.U1

/**
 * Units that run ONE shift, so the Shift 1 / Shift 2 split means nothing there.
 *
 * Unit 2 works a single ~10-hour shift. Asking which shift a file belongs to, offering a
 * shift picker, or splitting its dashboard in two only invites a wrong answer — so those
 * controls are hidden and every row is simply that unit's day. Nothing is filtered out: a
 * stray second-shift row still counts, it just is not shown as a separate half.
 */
const SINGLE_SHIFT_UNITS: readonly string[] = ['U2']

/** Does this workspace separate Shift 1 from Shift 2? */
export const hasShifts = (unit: string): boolean => !SINGLE_SHIFT_UNITS.includes(unit)

/**
 * Units whose day arrives as ONE workbook.
 *
 * Unit 1 sends a separate file per shift, so the importer offers a box for each. Unit 3 sends
 * a single sheet with Shift 1 on top and Shift 2 below it, and Unit 2 works one shift — for
 * both, asking which shift a file is would be a question with no right answer. They get one
 * box, and the rows say which shift they belong to.
 *
 * Separate from hasShifts on purpose: Unit 3 still HAS two shifts everywhere else.
 */
const SINGLE_UPLOAD_UNITS: readonly string[] = ['U2', 'U3']

/** True when one upload covers the whole day rather than one shift. */
export const oneUploadPerDay = (unit: string): boolean => SINGLE_UPLOAD_UNITS.includes(unit)

/**
 * The dashboard's second row — Below Target, Rework, Rejection, Cp-Cpk, Cumulative and
 * Repeating Issues — is fed by columns only the Unit 1 report carries. The Shell and
 * Roller sheets have no Cp-Cpk batches and no rework/rejection breakdown of that shape,
 * so every one of those cards reads zero there. A row of zeroes is worse than no row.
 */
const QUALITY_ROW_UNITS: readonly string[] = ['U1']

/** True when the dashboard shows the Quality, Losses & Cumulative row. */
export const hasQualityRow = (unit: string): boolean => QUALITY_ROW_UNITS.includes(unit)

/**
 * Unit 1's report carries an 'Actual Running Plan' — what a machine was really set to run
 * once the day's plan met the floor. The Shell and Roller sheets have no such column, so
 * every row there reads 0. Those units show Plan Qty alone rather than a column of zeroes.
 */
const NO_RUNNING_PLAN_UNITS: readonly string[] = ['U2', 'U3']

/** True when the unit's sheet has an Actual Running Plan of its own. */
export const hasRunningPlan = (unit: string): boolean => !NO_RUNNING_PLAN_UNITS.includes(unit)

/**
 * The efficiency each unit is held to. A machine under it is 'critical' and leads the
 * morning meeting; the whole app's red/amber/green banding hangs off this one number.
 *
 * Unit 1 grinds to 75%. Shell (U2) and Roller (U3) run tighter processes and are held to
 * 90% and 95%. Anything not listed keeps Unit 1's figure.
 */
const EFFICIENCY_TARGETS: Record<string, number> = { U2: 90, U3: 95 }
export const DEFAULT_EFFICIENCY_TARGET = 75

/** The unit's critical line. Defaults to the ACTIVE unit, which is what render code wants. */
export const efficiencyTarget = (unit: string = current): number =>
  EFFICIENCY_TARGETS[unit] ?? DEFAULT_EFFICIENCY_TARGET

/**
 * The 'good' line, above which a machine is green. Unit 1 uses 75 / 90 — that upper mark
 * is 60% of the way from the target to a perfect 100, so every other target keeps the same
 * proportion instead of a second hand-set number (U2 → 96, U3 → 98).
 */
export const efficiencyGoodLine = (unit: string = current): number => {
  const t = efficiencyTarget(unit)
  return Math.round(t + (100 - t) * 0.6)
}

/**
 * Swap the 75 baked into a label for the unit's own target. The Hindi and Gujarati
 * translations carry the same digits, so this works after translation in every language.
 */
export const withTarget = (label: string, unit: string = current): string =>
  label.replace(/75/g, String(efficiencyTarget(unit)))

/**
 * Hours a plan quantity covers, for the card that reads 'N Hrs Plan Qty'.
 *
 * Nothing is CALCULATED from this — plan quantity comes straight out of the sheet, which
 * did its own arithmetic. This is purely the label, so it has to match how the unit runs:
 * Unit 1 works two 8-hour shifts, Unit 2 works a single 10-hour one.
 */
const SHIFT_HOURS: Record<string, number> = { U2: 10 }
const DEFAULT_SHIFT_HOURS = 8

/** Hours a plan quantity covers: 16 for Unit 1 across both shifts, 10 for Unit 2's single one. */
export function planHours(unit: string, bothShifts: boolean): number {
  const per = SHIFT_HOURS[unit] ?? DEFAULT_SHIFT_HOURS
  return hasShifts(unit) && bothShifts ? per * 2 : per
}

/**
 * Groups that run a different number of hours from the rest of their unit.
 *
 * Roller's QE line runs 10 hours out of the 24 while WC, FG and CG work both 8-hour
 * shifts. Figures here are for a FULL DAY; looking at one shift halves them, exactly as
 * the ordinary 16 becomes 8.
 */
const GROUP_DAY_HOURS: Record<string, Record<string, number>> = { U3: { QE: 10 } }

/** True when a unit's machines do not all run the same hours, so no single label fits. */
export const hasMixedPlanHours = (unit: string): boolean => !!GROUP_DAY_HOURS[unit]

/** Hours behind ONE machine's plan quantity, honouring any group that runs its own hours. */
export function planHoursFor(unit: string, group: string, bothShifts: boolean): number {
  const day = GROUP_DAY_HOURS[unit]?.[group]
  if (day === undefined) return planHours(unit, bothShifts)
  return bothShifts || !hasShifts(unit) ? day : day / 2
}

/** e.g. '16 hrs · QE 10 hrs' — the line under the plan card of a mixed-hours unit. */
export function planHoursNote(unit: string, bothShifts: boolean): string {
  const over = GROUP_DAY_HOURS[unit]
  if (!over) return ''
  const odd = Object.entries(over)
    .map(([g]) => `${g} ${planHoursFor(unit, g, bothShifts)} hrs`)
    .join(' · ')
  return `${planHours(unit, bothShifts)} hrs · ${odd}`
}

/**
 * e.g. '16 Hrs Plan Qty' for Unit 1 across both shifts, '10 Hrs Plan Qty' for Unit 2.
 * A unit whose groups run different hours gets a plain title — the hours go in the note
 * underneath, because one number would be wrong for some of the machines counted.
 */
export const planQtyLabel = (unit: string, bothShifts: boolean): string =>
  hasMixedPlanHours(unit) ? 'Plan Qty' : `${planHours(unit, bothShifts)} Hrs Plan Qty`

const KEY = 'mm.unit'
export const DEFAULT_UNIT: Unit = 'U1'

const isUnit = (v: unknown): v is Unit => UNITS.includes(v as Unit)

// useSyncExternalStore demands an identity-stable snapshot: returning a fresh value each
// call spins React forever. The unit is a plain string, so caching it is enough.
let current: Unit = (() => {
  try {
    const v = localStorage.getItem(KEY)
    return isUnit(v) ? v : DEFAULT_UNIT
  } catch {
    return DEFAULT_UNIT
  }
})()

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export const getUnit = (): Unit => current

export function setUnit(u: Unit) {
  if (!isUnit(u) || u === current) return
  current = u
  try {
    localStorage.setItem(KEY, u)
  } catch {
    /* private mode — the choice just won't survive a reload */
  }
  notify()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  // Another tab switching unit should move this one too, so the two never disagree.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return
    const v = e.newValue
    if (isUnit(v) && v !== current) {
      current = v
      notify()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

/** The active unit, re-rendering the component when it changes. */
export const useUnit = (): Unit => useSyncExternalStore(subscribe, getUnit, getUnit)

/** Add the active unit to an API path: apiUrl('/api/notes') → '/api/notes?unit=U2'. */
export function apiUrl(path: string, unit: Unit = current): string {
  return `${path}${path.includes('?') ? '&' : '?'}unit=${encodeURIComponent(unit)}`
}

/**
 * Per-unit localStorage key, so one unit's offline cache never shows under another.
 *
 * Pass the unit explicitly for anything that spans an `await`. A request started on U2 and
 * finishing after the user has moved to U3 must still be filed under U2 — reading the active
 * unit again on the way back writes one workspace's records into another's cache, and that
 * cache outlives the reload.
 */
export const unitKey = (base: string, unit: Unit = current): string => `${base}.${unit}`
