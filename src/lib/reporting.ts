// ---- "Reporting Issues" — repeat / unresolved problems across two dates ----
// A machine is a REPEAT issue when it had a reporting problem on the previous
// date AND still has one on the current date (i.e. it was not fixed).
// Reporting areas: below-75% efficiency, downtime, and "Taper Problem" (kept
// last). "Wheel change" downtime is planned work and is NOT counted.

import { type MachineRow } from '../types'
import { efficiencyTarget } from './unit'

export type IssueArea = 'below75' | 'downtime' | 'taper'

export const AREA_META: Record<IssueArea, { label: string; color: string; rank: number }> = {
  below75: { label: 'Below 75%', color: '#ef4444', rank: 0 },
  downtime: { label: 'Downtime', color: '#f59e0b', rank: 1 },
  taper: { label: 'Taper Problem', color: '#8b5cf6', rank: 2 }, // always last
}

// Downtime reasons that must NOT be counted as an issue (planned activity).
const EXCLUDED_DOWNTIME = ['wheel change']
// Keywords that identify the "Taper Problem" reporting area.
const TAPER_KEYS = ['taper', 'tapper']

function isExcludedReason(reason: string): boolean {
  const r = reason.toLowerCase()
  return EXCLUDED_DOWNTIME.some((k) => r.includes(k))
}
function isTaperReason(reason: string): boolean {
  const r = reason.toLowerCase()
  return TAPER_KEYS.some((k) => r.includes(k))
}

/** Which reporting areas flag this machine (taper pushed last). */
export function machineIssueAreas(row: MachineRow): { areas: IssueArea[]; reasons: string[] } {
  const areas: IssueArea[] = []
  if (row.efficiency !== null && row.efficiency < efficiencyTarget()) areas.push('below75')

  const reasons: string[] = []
  let hasTaper = false
  let hasOtherDt = false
  for (const [reason, val] of Object.entries(row.downtime)) {
    if (val <= 0) continue
    if (isExcludedReason(reason)) continue // wheel change — skip
    reasons.push(reason)
    if (isTaperReason(reason)) hasTaper = true
    else hasOtherDt = true
  }
  if (hasOtherDt) areas.push('downtime')
  if (hasTaper) areas.push('taper') // keep taper last
  return { areas, reasons }
}

export function hasReportingIssue(row: MachineRow): boolean {
  return machineIssueAreas(row).areas.length > 0
}

/** Set of machine names (mc) that have any reporting issue in these rows. */
export function issueMachineSet(rows: MachineRow[]): Set<string> {
  const s = new Set<string>()
  for (const r of rows) if (r.mc && hasReportingIssue(r)) s.add(r.mc)
  return s
}

/** Lowest (most severe) area rank for ordering — below75 first, taper last. */
export function areaRank(areas: IssueArea[]): number {
  return areas.length ? Math.min(...areas.map((a) => AREA_META[a].rank)) : 99
}

export interface RepeatIssue {
  mc: string
  operator: string
  efficiency: number | null
  areas: IssueArea[]
  reasons: string[]
  row: MachineRow
}

export interface ReportingSummary {
  count: number // repeat machines (issue on previous date AND current date)
  currentIssueCount: number // machines with any issue on the current date
  hasPrev: boolean
  prevLabel: string
  repeats: RepeatIssue[]
}

/**
 * Repeat/unresolved issues. `currentRows` and `prevRows` are each a full day's
 * Shift 1 + Shift 2 rows. Per-machine: one machine = one issue regardless of how
 * many problem areas it has.
 */
export function reportingIssues(
  currentRows: MachineRow[],
  prevRows: MachineRow[],
  hasPrev: boolean,
  prevLabel = '',
): ReportingSummary {
  const prev = issueMachineSet(prevRows)

  // One entry per machine on the current date (a machine can appear in both
  // shifts — keep the worst row: most areas, then lowest efficiency).
  const byMc = new Map<string, RepeatIssue>()
  for (const r of currentRows) {
    if (!r.mc) continue
    const { areas, reasons } = machineIssueAreas(r)
    if (areas.length === 0) continue
    const cand: RepeatIssue = { mc: r.mc, operator: r.operator, efficiency: r.efficiency, areas, reasons, row: r }
    const cur = byMc.get(r.mc)
    if (!cur) {
      byMc.set(r.mc, cand)
    } else {
      const better =
        cand.areas.length > cur.areas.length ||
        (cand.areas.length === cur.areas.length && (cand.efficiency ?? 999) < (cur.efficiency ?? 999))
      if (better) byMc.set(r.mc, cand)
    }
  }

  const repeats = [...byMc.values()]
    .filter((x) => prev.has(x.mc))
    .sort((a, b) => areaRank(a.areas) - areaRank(b.areas) || (a.efficiency ?? 999) - (b.efficiency ?? 999))

  return {
    count: hasPrev ? repeats.length : 0,
    currentIssueCount: byMc.size,
    hasPrev,
    prevLabel,
    repeats,
  }
}
