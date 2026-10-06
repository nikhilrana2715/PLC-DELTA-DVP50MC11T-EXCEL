import type { MachineRow } from '../types'
import type { PdRow } from './pdReport'
import { shiftNum } from './dataset'
import { efficiencyTarget } from './unit'
import { roundRow } from './dataset'
import { prioritise } from './aggregate'

/**
 * Converts monthly KPI (PD Report) rows into the Morning Meeting Dashboard's
 * machine-wise daily domain model (`MachineRow[]`).
 *
 * Core Calculation Logic:
 * Step 1: Cycle Time -> 8 Hours Plan Quantity = =IFERROR(3600/cycleTime*8, 0)
 *         Available time = 8 Hours = 480 Minutes = 28,800 Seconds.
 * Step 2: Actual Plan Quantity:
 *         Subtract applicable downtime categories from 480 minutes:
 *         - New Setting (10)
 *         - No Operator (13)
 *         - No Material (14 - External / Internal)
 *         - Wheel Change (17)
 *         - Stick Change (17)
 *         - Wheel Dressing (18)
 *         - Material Defect (16)
 *         - Not In Plan (30)
 *         Remaining production time = Math.max(0, 480 - applicableDowntimeMinutes)
 *         Actual Plan Qty = ((480 - Applicable Downtime) * 60) / Cycle Time in Seconds
 * Step 3: Achievement = Good Qty
 * Step 4: Backlog = Math.max(0, Actual Plan Qty - Achievement)
 * Step 5: Efficiency % = (Achievement * 100) / Actual Plan Qty
 */

/**
 * Checks if a downtime reason matches one of the defined production-loss
 * categories that must be subtracted from the 8-hour plan.
 */
export function isApplicableDowntimeReason(reason: string): boolean {
  const r = (reason || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (r.includes('new setting') || /\b10\b/.test(r)) return true
  if (r.includes('no operator') || /\b13\b/.test(r)) return true
  if (r.includes('no material') || /\b14\b/.test(r)) return true
  if (r.includes('wheel change') || /\b17\b/.test(r)) return true
  if (r.includes('stick change')) return true
  if (r.includes('wheel dressing') || /\b18\b/.test(r)) return true
  if (r.includes('material defect') || /\b16\b/.test(r)) return true
  if (r.includes('not in plan') || r.includes('no plan') || /\b30\b/.test(r)) return true

  return false
}

export interface KpiDayProcessed {
  date: string
  rows: MachineRow[]
  groups: string[]
  downtimeReasons: string[]
  total8hPlan: number
  totalActualPlan: number
  totalAchievement: number
  totalBacklog: number
  overallEfficiency: number | null
}

/**
 * Normalizes machine name: "IG.04" -> "IG-04", "IG 04" -> "IG-04".
 */
export function normalizeMachine(mc: string): string {
  const s = String(mc || '').trim()
  return s.replace(/\./g, '-').replace(/\s+/g, '-')
}

/**
 * Derives machine group code from row group or machine name prefix.
 */
export function deriveGroup(group: string, machine: string): string {
  if (group && group.trim()) return group.trim().toUpperCase()
  const m = machine.match(/^([A-Za-z]+)/)
  return m ? m[1].toUpperCase() : 'OTHER'
}

/**
 * Process a set of raw KPI (PD Report) rows for a SINGLE selected date.
 * Groups by (machine, shift), aggregates multiple operations if any, and calculates
 * the full 5-step production metrics.
 */
export function processKpiRowsForDate(pdRowsForDate: PdRow[], date: string): KpiDayProcessed {
  if (!pdRowsForDate.length) {
    return {
      date,
      rows: [],
      groups: [],
      downtimeReasons: [],
      total8hPlan: 0,
      totalActualPlan: 0,
      totalAchievement: 0,
      totalBacklog: 0,
      overallEfficiency: null,
    }
  }

  // All downtime reason columns present across this date's rows
  const reasonsSet = new Set<string>()
  for (const r of pdRowsForDate) {
    if (r.downtime) {
      for (const k of Object.keys(r.downtime)) {
        if (k && k.trim()) reasonsSet.add(k.trim())
      }
    }
  }
  const downtimeReasons = Array.from(reasonsSet)

  // Group by unique key: `${shiftNum(r.shift)}__${normalizeMachine(r.machine)}`
  type GroupKey = string
  const grouped = new Map<GroupKey, PdRow[]>()

  for (const r of pdRowsForDate) {
    const sNum = shiftNum(r.shift)
    const mc = normalizeMachine(r.machine)
    if (!mc) continue
    const key = `${sNum}__${mc}`
    const list = grouped.get(key)
    if (list) list.push(r)
    else grouped.set(key, [r])
  }

  let nextId = 1
  const machineRows: MachineRow[] = []
  const groupsSet = new Set<string>()

  for (const [key, rows] of grouped) {
    const [shiftNumStr, machine] = key.split('__')
    const sNum = Number(shiftNumStr) === 2 ? 2 : 1
    const shiftLabel = sNum === 1 ? '1st Shift' : '2nd Shift'

    const firstRow = rows[0]
    const group = deriveGroup(firstRow.group, machine)
    groupsSet.add(group)

    const section = `${group} Machine - ${shiftLabel}`

    // Aggregate items, operators, and remarks
    const items = Array.from(new Set(rows.map((r) => r.itemCode || r.sapItemCode).filter(Boolean)))
    const operators = Array.from(new Set(rows.flatMap((r) => r.operators || []).filter(Boolean)))

    // Combine downtime
    const combinedDowntime: Record<string, number> = {}
    let totalDowntimeMin = 0
    let applicableDowntimeMin = 0

    for (const r of rows) {
      if (r.downtime) {
        for (const [rn, val] of Object.entries(r.downtime)) {
          const v = Math.round(Number(val) || 0)
          if (v <= 0) continue
          combinedDowntime[rn] = (combinedDowntime[rn] || 0) + v
          totalDowntimeMin += v
          if (isApplicableDowntimeReason(rn)) {
            applicableDowntimeMin += v
          }
        }
      }
    }

    // Quality metrics
    const rework = rows.reduce((acc, r) => acc + (Number(r.rework) || 0), 0)
    const rejection = rows.reduce((acc, r) => acc + (Number(r.runningRej) || 0) + (Number(r.turningRej) || 0), 0)
    const good = rows.reduce((acc, r) => acc + (Number(r.good) || 0), 0)

    // Determine cycle time:
    // If multiple operations, use weighted cycle time by good pieces; fallback to first non-zero
    const rowsWithCt = rows.filter((r) => Number(r.cycleTime) > 0)
    let cycleTime: number | null = null

    if (rowsWithCt.length === 1) {
      cycleTime = Number(rowsWithCt[0].cycleTime)
    } else if (rowsWithCt.length > 1) {
      const totalGoodWithCt = rowsWithCt.reduce((acc, r) => acc + (Number(r.good) || 0), 0)
      if (totalGoodWithCt > 0) {
        const weightedSum = rowsWithCt.reduce((acc, r) => acc + Number(r.cycleTime) * (Number(r.good) || 0), 0)
        cycleTime = Math.round((weightedSum / totalGoodWithCt) * 10) / 10
      } else {
        const sumCt = rowsWithCt.reduce((acc, r) => acc + Number(r.cycleTime), 0)
        cycleTime = Math.round((sumCt / rowsWithCt.length) * 10) / 10
      }
    }

    // -------------------------------------------------------------
    // Core 5-Step Calculations:
    // -------------------------------------------------------------
    const ctSeconds = cycleTime && cycleTime > 0 ? cycleTime : 0

    // Step 1: 8 Hours Plan Quantity = =IFERROR(3600/cycle time*8,0)
    // 8 Hours = 480 Minutes = 28,800 Seconds
    const planQty = ctSeconds > 0 ? Math.round(28800 / ctSeconds) : 0

    // Step 2: Actual Plan Quantity = ((480 - Applicable Downtime) * 60) / Cycle Time
    const remainingProductionMinutes = Math.max(0, 480 - applicableDowntimeMin)
    const runningPlan = ctSeconds > 0 ? Math.round((remainingProductionMinutes * 60) / ctSeconds) : 0

    // Step 3: Achievement = Good Qty
    const achQty = Math.round(good)

    // Step 4: Backlog = MAX(0, Actual Plan Qty - Achievement)
    const backlog = Math.max(0, runningPlan - achQty)

    // Step 5: Efficiency % = (Achievement * 100) / Actual Plan Qty
    const effBase = runningPlan > 0 ? runningPlan : planQty
    const efficiency = effBase > 0 ? Math.round((achQty * 100) / effBase) : null

    const target = efficiencyTarget()
    const isCritical = efficiency !== null && efficiency < target
    const inPlan = runningPlan > 0 || planQty > 0 || achQty > 0

    const row: MachineRow = roundRow({
      id: nextId++,
      section,
      group,
      shift: shiftLabel,
      mc: machine,
      itemCode: items.join(', '),
      operator: operators.join(', '),
      cycleTime,
      planQty,
      runningPlan,
      achQty,
      backlog,
      efficiency,
      rework: Math.round(rework),
      rejection: Math.round(rejection),
      turningRejection: 0,
      downtime: combinedDowntime,
      totalDowntime: Math.round(totalDowntimeMin),
      remark: '',
      setter: '',
      inPlan,
      isCritical,
    })

    machineRows.push(row)
  }

  const sortedRows = prioritise(machineRows)
  const groups = Array.from(groupsSet).sort()

  const total8hPlan = sortedRows.reduce((a, r) => a + r.planQty, 0)
  const totalActualPlan = sortedRows.reduce((a, r) => a + r.runningPlan, 0)
  const totalAchievement = sortedRows.reduce((a, r) => a + r.achQty, 0)
  const totalBacklog = sortedRows.reduce((a, r) => a + r.backlog, 0)
  const effDenom = totalActualPlan > 0 ? totalActualPlan : total8hPlan
  const overallEfficiency = effDenom > 0 ? Math.round((totalAchievement * 100) / effDenom) : null

  return {
    date,
    rows: sortedRows,
    groups,
    downtimeReasons,
    total8hPlan,
    totalActualPlan,
    totalAchievement,
    totalBacklog,
    overallEfficiency,
  }
}

