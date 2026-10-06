import { type MachineRow } from '../types'
import { efficiencyGoodLine, efficiencyTarget } from './unit'

export interface Kpis {
  machines: number
  running: number
  planned: number
  running_qty: number
  achievement: number
  backlog: number
  overallEfficiency: number // achievement / running plan — or plan qty on sheets with no running plan
  avgEfficiency: number
  criticalCount: number
  warningCount: number
  goodCount: number
  totalDowntime: number
  planAttainment: number // achievement / planQty
  rework: number
  rejection: number
  turningRejection: number
  /** Pieces per million produced. Denominator is achievement (what the machines made). */
  reworkPpm: number
  rejectionPpm: number
  turningRejectionPpm: number
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/**
 * Rejects per million produced. `produced` is the achieved quantity — with no output there is
 * nothing to rate, so the answer is 0 rather than a divide-by-zero.
 */
export const ppm = (rejects: number, produced: number): number =>
  produced > 0 ? Math.round((rejects / produced) * 1_000_000) : 0

/** Rejection-PPM bands used across the dashboard. */
export const PPM_GOOD = 1000
export const PPM_WARN = 5000

/**
 * Green under 1000 PPM, amber to 5000, red beyond — the usual automotive-supply bands.
 *
 * The value sits on a pale tinted KPI card, where raw amber reads at about 1.6:1. Mixing each
 * hue toward `--ink` keeps the band obvious while staying legible: `--ink` is dark in the light
 * theme and light in the dark one, so the same expression darkens or lightens as needed.
 */
export function ppmColor(v: number): string {
  const hue = v < PPM_GOOD ? '#0ca30c' : v < PPM_WARN ? '#fab219' : '#d03b3b'
  return `color-mix(in srgb, ${hue} 46%, var(--ink))`
}

export function computeKpis(rows: MachineRow[]): Kpis {
  const active = rows.filter((r) => r.inPlan)
  const planned = sum(active.map((r) => r.planQty))
  const running_qty = sum(active.map((r) => r.runningPlan))
  const achievement = sum(active.map((r) => r.achQty))
  const backlog = sum(active.map((r) => r.backlog))
  const totalDowntime = sum(rows.map((r) => r.totalDowntime))

  const target = efficiencyTarget()
  const goodLine = efficiencyGoodLine()
  const withEff = active.filter((r) => r.efficiency !== null) as (MachineRow & { efficiency: number })[]
  const avgEfficiency = withEff.length ? sum(withEff.map((r) => r.efficiency)) / withEff.length : 0

  /*
   * Unit 1's report carries a Running Plan — what a machine was actually set to run, after the
   * day's plan met reality. The Shell and Roller sheets have no such column, so running_qty is
   * zero on every row there and an achievement/running_qty headline read 0%.
   *
   * Those sheets already measure each row's own efficiency against PLAN QTY, so that is the
   * denominator to fall back on: it keeps the headline agreeing with the per-machine average
   * printed directly beneath it. Unit 1 is untouched — it always has a running plan.
   */
  const effBase = running_qty || planned

  const rework = sum(active.map((r) => r.rework))
  const rejection = sum(active.map((r) => r.rejection))
  const turningRejection = sum(active.map((r) => r.turningRejection))

  return {
    machines: rows.length,
    running: active.length,
    planned,
    running_qty,
    achievement,
    backlog,
    overallEfficiency: effBase ? (achievement / effBase) * 100 : 0,
    avgEfficiency,
    criticalCount: withEff.filter((r) => r.efficiency < target).length,
    warningCount: withEff.filter((r) => r.efficiency >= target && r.efficiency < goodLine).length,
    goodCount: withEff.filter((r) => r.efficiency >= goodLine).length,
    totalDowntime,
    planAttainment: planned ? (achievement / planned) * 100 : 0,
    rework,
    rejection,
    turningRejection,
    reworkPpm: ppm(rework, achievement),
    rejectionPpm: ppm(rejection, achievement),
    turningRejectionPpm: ppm(turningRejection, achievement),
  }
}

/**
 * Priority ordering: critical machines (under the unit's target) first, worst efficiency
 * on top; then the rest by efficiency ascending. Machines with no plan sink last.
 */
export function prioritise(rows: MachineRow[]): MachineRow[] {
  return [...rows].sort((a, b) => {
    if (a.inPlan !== b.inPlan) return a.inPlan ? -1 : 1
    const ea = a.efficiency ?? Infinity
    const eb = b.efficiency ?? Infinity
    return ea - eb
  })
}

/** Machines that need attention in the meeting (under the unit's target), worst first. */
export function criticalMachines(rows: MachineRow[]): MachineRow[] {
  return rows
    .filter((r) => r.isCritical)
    .sort((a, b) => (a.efficiency ?? 0) - (b.efficiency ?? 0))
}

// Section order for the Machine List / KPI breakdown views (not alphabetical —
// matches how the factory floor itself is laid out).
/**
 * Shop-floor order per workspace — the sequence the plant reads its machines in.
 *
 * Each unit has its own line-up, so the order is looked up by unit rather than shared. A group
 * the list does not name sorts after the named ones, alphabetically, so a new machine family
 * appears at the end instead of vanishing.
 */
const GROUP_SEQUENCES: Record<string, string[]> = {
  U1: ['FG', 'CG', 'EG', 'IG', 'HO'],
  U2: ['PP', 'AF', 'HF', 'L', 'SF'],
  U3: ['WC', 'FG', 'CG', 'QE'],
}

/** Kept for callers that predate per-unit ordering; Unit 1 is the default line-up. */
export const GROUP_SEQUENCE = GROUP_SEQUENCES.U1

export const groupSequenceFor = (unit: string): string[] => GROUP_SEQUENCES[unit] ?? GROUP_SEQUENCES.U1

export function groupRank(group: string, unit = 'U1'): number {
  const seq = groupSequenceFor(unit)
  const i = seq.indexOf(String(group || '').toUpperCase())
  return i === -1 ? seq.length : i
}

/** The machine's number, e.g. "IG-04" / "IG 04" / "HO-08OR" -> 4, 4, 8. */
function machineNum(mc: string): number {
  const m = String(mc || '').match(/(\d+)/)
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER
}

/**
 * Natural factory sequence: FG, then CG, then EG, then IG, then HO — and within
 * each group, ascending by machine number (IG-01, IG-04, IG-11, ... not by
 * value/efficiency). Used for the Machine List and KPI-card breakdown tables,
 * where a fixed, predictable order is more useful than a "highest first" sort.
 */
export function sortBySequence<T extends { group: string; mc: string }>(rows: T[], unit = 'U1'): T[] {
  return [...rows].sort((a, b) => {
    const g = groupRank(a.group, unit) - groupRank(b.group, unit)
    if (g !== 0) return g
    const n = machineNum(a.mc) - machineNum(b.mc)
    if (n !== 0) return n
    return a.mc.localeCompare(b.mc)
  })
}

export interface ReasonTotal {
  reason: string
  value: number
}

export interface ReasonDetail extends ReasonTotal {
  /** Which machines contributed this downtime (largest first). */
  machines: { mc: string; value: number }[]
}

/** Downtime by reason WITH the per-machine breakdown for each reason. */
export function downtimeDetailed(reasons: string[], rows: MachineRow[]): ReasonDetail[] {
  const map = new Map<string, { total: number; machines: Map<string, number> }>()
  for (const reason of reasons) map.set(reason, { total: 0, machines: new Map() })
  for (const row of rows) {
    for (const [reason, value] of Object.entries(row.downtime)) {
      if (value <= 0) continue
      let e = map.get(reason)
      if (!e) {
        e = { total: 0, machines: new Map() }
        map.set(reason, e)
      }
      e.total += value
      e.machines.set(row.mc, (e.machines.get(row.mc) ?? 0) + value)
    }
  }
  return Array.from(map.entries())
    .map(([reason, e]) => ({
      reason,
      value: e.total,
      machines: Array.from(e.machines.entries())
        .map(([mc, value]) => ({ mc, value }))
        .sort((a, b) => b.value - a.value),
    }))
    .filter((t) => t.value > 0)
    .sort((a, b) => b.value - a.value)
}

/** Aggregate downtime across all machines by reason, largest first. */
export function downtimeByReason(reasons: string[], rows: MachineRow[]): ReasonTotal[] {
  const totals = new Map<string, number>()
  for (const reason of reasons) totals.set(reason, 0)
  for (const row of rows) {
    for (const [reason, value] of Object.entries(row.downtime)) {
      totals.set(reason, (totals.get(reason) ?? 0) + value)
    }
  }
  return Array.from(totals.entries())
    .map(([reason, value]) => ({ reason, value }))
    .filter((t) => t.value > 0)
    .sort((a, b) => b.value - a.value)
}

/** Remarks summary when structured downtime columns are empty. */
export function remarkSummary(rows: MachineRow[]): { remark: string; machines: string[] }[] {
  const map = new Map<string, string[]>()
  for (const r of rows) {
    const key = r.remark.trim()
    if (!key) continue
    const arr = map.get(key) ?? []
    arr.push(r.mc)
    map.set(key, arr)
  }
  return Array.from(map.entries())
    .map(([remark, machines]) => ({ remark, machines }))
    .sort((a, b) => b.machines.length - a.machines.length)
}

export function efficiencyBand(eff: number | null): 'critical' | 'warning' | 'good' | 'na' {
  if (eff === null) return 'na'
  if (eff < efficiencyTarget()) return 'critical'
  if (eff < efficiencyGoodLine()) return 'warning'
  return 'good'
}
