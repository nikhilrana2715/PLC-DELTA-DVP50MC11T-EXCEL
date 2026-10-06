// ---- Domain model for the Morning Meeting production dashboard ----

/** A single downtime reason -> value (minutes / count as entered in the sheet). */
export type Downtime = Record<string, number>

export interface MachineRow {
  /** Stable identity that survives edits (M/C can be renamed). */
  id: number
  /** Full section title, e.g. "IG Machine". */
  section: string
  /** Short group code, e.g. "IG", "EG", "HO", "FG", "CG". */
  group: string
  /** Shift label parsed from the section title, e.g. "1st Shift". */
  shift: string

  mc: string
  itemCode: string
  operator: string
  cycleTime: number | null

  /** Plan Qty (8 hrs / 4 hrs plan). */
  planQty: number
  /** Actual M/C Running Plan Qty. */
  runningPlan: number
  /** Achieved Qty. */
  achQty: number
  backlog: number
  /** Efficiency % as entered in the sheet (null when the machine has no plan). */
  efficiency: number | null

  /** Quality columns. */
  rework: number
  rejection: number
  turningRejection: number

  downtime: Downtime
  totalDowntime: number
  remark: string
  /** Who performed the setup (chosen from the section's setter list). */
  setter: string

  /** True when the machine actually had a plan / was running. */
  inPlan: boolean
  /** True when efficiency is a number below the critical threshold. */
  isCritical: boolean
}

export interface ParsedReport {
  rows: MachineRow[]
  /** Distinct downtime reason labels found in the sheet, in column order. */
  downtimeReasons: string[]
  /** Distinct group codes in the order they appear. */
  groups: string[]
  shift: string
  /** Source file name (for display). */
  fileName: string
}

/**
 * Unit 1's efficiency bands. Every unit now sets its own — see efficiencyTarget() in
 * lib/unit.ts, which is what the app actually reads. Kept here as the documented default.
 */
export const CRITICAL_EFFICIENCY = 75
export const WARNING_EFFICIENCY = 90
