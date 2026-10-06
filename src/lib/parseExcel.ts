import * as XLSX from 'xlsx'
import { type MachineRow, type ParsedReport } from '../types'
import { efficiencyTarget } from './unit'

type Cell = string | number | boolean | null
type Grid = Cell[][]

/** Normalise a header string for matching. */
function norm(v: Cell): string {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function toNum(v: Cell): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

type Role =
  | 'mc'
  | 'itemCode'
  | 'operator'
  | 'cycleTime'
  | 'planQty'
  | 'runningPlan'
  | 'achQty'
  | 'backlog'
  | 'efficiency'
  | 'rework'
  | 'rejection'
  | 'turningRejection'
  | 'remark'
  | 'setter'
  | 'workingHrs'
  | 'shift'
  | 'downtime'
  | 'ignore'

/** Decide what a header cell means. Order matters (running before plan). */
function classify(header: Cell): { role: Role; label?: string } {
  const h = norm(header)
  if (!h) return { role: 'ignore' }
  // Spacing and punctuation in these headers is typed by hand and varies between the sheet's
  // repeated section blocks — "Re-Marks", "Re- Marks", "Re Marks" all appear. Compare against a
  // form with spaces/dots/dashes removed so one stray space cannot turn a column into something
  // else (an unrecognised header falls through to "downtime reason", which is far from harmless).
  const flat = h.replace(/[\s.\-_]/g, '')
  if (flat.includes('remark')) return { role: 'remark' }
  if (flat.includes('setter') || flat.includes('setby') || flat.includes('setupby')) return { role: 'setter' }
  if (h === 'm/c' || h === 'mc') return { role: 'mc' }
  // Unit 2 and Unit 3 carry these two; Unit 1's sheet does not. Without them the fall-through
  // below would file a machine's WORKING hours as downtime minutes.
  if (flat === 'workingtime' || flat.startsWith('workingtime')) return { role: 'workingHrs' }
  if (flat === 'shift') return { role: 'shift' }
  if (h.startsWith('item code')) return { role: 'itemCode' }
  if (h.startsWith('operator')) return { role: 'operator' }
  if (h.startsWith('cycle time')) return { role: 'cycleTime' }
  if (h.includes('running')) return { role: 'runningPlan' }
  if (h.includes('plan') && h.includes('qty')) return { role: 'planQty' }
  if (h.startsWith('ach')) return { role: 'achQty' }
  if (h.includes('back log') || h.includes('backlog')) return { role: 'backlog' }
  if (h.startsWith('efficiency')) return { role: 'efficiency' }
  if (h.includes('turning')) return { role: 'turningRejection' }
  if (h.includes('rework')) return { role: 'rework' }
  if (h.includes('rejection') || h.includes('reject')) return { role: 'rejection' }
  // Everything else across the downtime band is a downtime reason.
  return { role: 'downtime', label: cleanReason(header) }
}

/** Turn "Ovality Problem  11Ov" -> "Ovality Problem", "Mech.Maint.21" -> "Mech.Maint". */
function cleanReason(header: Cell): string {
  return String(header ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[\s.]*\d+[A-Za-z]*\s*$/, '') // trailing code like " 11Ov" / ".21"
    .replace(/[.,\s]+$/, '')
    .trim()
}

const SECTION_RE = /^(.*?)\bmachine\b.*section/i
const SHIFT_RE = /(\d+\s*(?:st|nd|rd|th)\s*shift)/i

function isSectionHeader(cell: Cell): boolean {
  return SECTION_RE.test(String(cell ?? ''))
}

function isHeaderRow(row: Grid[number]): boolean {
  return norm(row[0]) === 'm/c'
}

interface ColumnMap {
  roles: Map<number, Role>
  downtimeLabels: Map<number, string>
}

function buildColumnMap(headerRow: Grid[number]): ColumnMap {
  const roles = new Map<number, Role>()
  const downtimeLabels = new Map<number, string>()
  headerRow.forEach((cell, idx) => {
    const { role, label } = classify(cell)
    if (role === 'ignore') return
    roles.set(idx, role)
    if (role === 'downtime' && label) downtimeLabels.set(idx, label)
  })
  /*
   * Unit 2 leaves its shift column unheaded — the I / II sits under a blank cell, right after
   * Working time. Unit 3 labels the same column "Shift". Claim the unlabelled neighbour so both
   * read the same, and so a blank header never falls through to "downtime reason".
   */
  for (const [idx, role] of roles) {
    if (role !== 'workingHrs') continue
    const next = idx + 1
    if (!roles.has(next) || roles.get(next) === 'ignore') roles.set(next, 'shift')
  }
  return { roles, downtimeLabels }
}

/**
 * Pull downtime out of a remark like "1 HR FEEDER PROBLEM + 3 HRS RESETTING".
 *
 * Each `+`-separated part reads as <amount> <HR|HRS|MIN> <reason>. Anything without a time —
 * a bare "MAINTENANCE" or "NO PLAN" — is a note, not a measured stoppage, so it is left out
 * rather than guessed at.
 *
 * Exported so what it recognises can be tested directly.
 */
const REMARK_PART = /^\s*(\d+(?:\.\d+)?)\s*(hrs?|mins?)\.?\s+(.+?)\s*$/i

export function downtimeFromRemark(remark: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const part of String(remark ?? '').split('+')) {
    const m = part.match(REMARK_PART)
    if (!m) continue
    const amount = parseFloat(m[1])
    if (!Number.isFinite(amount) || amount <= 0) continue
    const minutes = Math.round(/^h/i.test(m[2]) ? amount * 60 : amount)
    if (minutes <= 0) continue
    // Keep the sheet's own wording, just tidied — it is what the floor calls the reason.
    const reason = m[3].replace(/\s+/g, ' ').replace(/\s+([,)])/g, '$1').replace(/\(\s+/g, '(').trim()
    if (!reason) continue
    out[reason] = (out[reason] ?? 0) + minutes
  }
  return out
}

/**
 * Parse a workbook (already read as ArrayBuffer) into the domain model.
 *
 * The report is looked for across EVERY sheet rather than assumed to be the first one. These
 * files routinely carry a leftover blank "Sheet1", and a day's book may hold a tab per date;
 * reading tab one blindly meant an empty tab sitting first produced "no machine rows" from a
 * workbook that plainly had them. The first tab that yields machines wins, and if none do the
 * result is still an empty report, so the caller's message stays true.
 */
export function parseWorkbook(data: ArrayBuffer, fileName: string): ParsedReport {
  const wb = XLSX.read(data, { type: 'array' })

  const gridOf = (name: string) =>
    XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], {
      header: 1,
      defval: null,
      raw: true,
      blankrows: true,
    }) as Grid

  let first: ParsedReport | null = null
  for (const name of wb.SheetNames) {
    if (!wb.Sheets[name]) continue
    let report: ParsedReport
    try {
      report = parseGrid(gridOf(name), fileName)
    } catch {
      continue // a stray tab that isn't a report at all
    }
    if (report.rows.length) return report
    first ??= report
  }
  return first ?? parseGrid([], fileName)
}

/**
 * Drop leading columns that are empty in EVERY row.
 *
 * Everything below reads a row from index 0 — the header is recognised by `row[0] === 'M/C'`
 * and a machine name is `row[0]`. A sheet laid out from column B instead of A therefore
 * matched nothing and came back with no rows at all.
 *
 * These sheets normally hide the problem by accident: Excel's used range starts at the first
 * column that holds anything, so a blank column A is simply not in the data. But the moment
 * ANY cell in column A is touched — a stray space, a border, a cleared value — the range
 * widens and every row arrives with a leading blank. The same sheet then stops importing for
 * a reason nobody can see on screen. Trimming that margin makes the layout irrelevant.
 */
function trimLeadingBlankColumns(grid: Grid): Grid {
  const filled = (c: unknown) => String(c ?? '').trim() !== ''
  let off = 0
  for (;;) {
    let anyHere = false
    let anyBeyond = false
    for (const row of grid) {
      if (!row) continue
      if (filled(row[off])) anyHere = true
      for (let i = off + 1; i < row.length; i++) {
        if (filled(row[i])) { anyBeyond = true; break }
      }
      if (anyHere) break
    }
    if (anyHere || !anyBeyond) break
    off++
  }
  return off === 0 ? grid : grid.map((row) => (row ? row.slice(off) : row))
}

export function parseGrid(rawGrid: Grid, fileName: string): ParsedReport {
  const grid = trimLeadingBlankColumns(rawGrid)
  const rows: MachineRow[] = []
  /** Index into `rows` where each header-delimited block begins. */
  const blockStarts: number[] = []
  const reasonOrder: string[] = []
  const reasonSeen = new Set<string>()
  const groups: string[] = []
  let shift = ''
  let nextId = 0

  let section = ''
  let group = ''
  let sectionShift = ''
  let colMap: ColumnMap | null = null

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? []
    const first = row[0]

    // New section?
    if (isSectionHeader(first)) {
      const title = String(first)
      const m = title.match(SECTION_RE)
      group = (m?.[1] ?? '').trim().replace(/\s+/g, ' ')
      section = group ? `${group} Machine` : title.trim()
      sectionShift = (title.match(SHIFT_RE)?.[1] ?? '').replace(/\s+/g, ' ').trim()
      if (sectionShift && !shift) shift = sectionShift
      if (group && !groups.includes(group)) groups.push(group)
      colMap = null
      continue
    }

    // Header row for the current section.
    if (isHeaderRow(row)) {
      colMap = buildColumnMap(row)
      // A repeated header starts a new block. Unit 3's sheet puts Shift 1 in the first block
      // and Shift 2 in the second, so each block's rows belong together.
      blockStarts.push(rows.length)
      // register downtime reasons in column order
      Array.from(colMap.downtimeLabels.entries())
        .sort((a, b) => a[0] - b[0])
        .forEach(([, label]) => {
          if (label && !reasonSeen.has(label)) {
            reasonSeen.add(label)
            reasonOrder.push(label)
          }
        })
      continue
    }

    if (!colMap) continue

    // Total / blank / stop rows.
    const firstNorm = norm(first)
    if (firstNorm.startsWith('total')) continue
    if (!firstNorm) continue

    // Build a machine row from the column map.
    const rec: Record<string, Cell> = {}
    const downtime: Record<string, number> = {}
    let totalDowntime = 0

    colMap.roles.forEach((role, idx) => {
      const val = row[idx]
      if (role === 'downtime') {
        const label = colMap!.downtimeLabels.get(idx)!
        const n = toNum(val)
        if (n && n !== 0) {
          const m = Math.round(n) // Excel cells can hold un-rounded formula values
          downtime[label] = (downtime[label] ?? 0) + m
          totalDowntime += m
        }
      } else {
        rec[role] = val
      }
    })

    /*
     * A sheet with no reason columns keeps its downtime in the remark instead. Reading it
     * there is the only way those units get a downtime figure; a sheet that HAS the columns
     * is left exactly as it was, so Unit 1 is never second-guessed.
     */
    if (colMap.downtimeLabels.size === 0) {
      for (const [label, m] of Object.entries(downtimeFromRemark(String(rec.remark ?? '')))) {
        downtime[label] = (downtime[label] ?? 0) + m
        totalDowntime += m
        if (!reasonSeen.has(label)) {
          reasonSeen.add(label)
          reasonOrder.push(label)
        }
      }
    }

    const mc = String(rec.mc ?? '').trim()
    if (!mc) continue
    /*
     * Some sheets repeat their banner above each block, and where that banner sits in the M/C
     * column it would otherwise be imported as a machine called
     * "M/C Production Required Summery Sheet (Roller Setion 2st Shift) Date:-...". A real
     * machine name is short and has no sentence punctuation.
     */
    if (mc.length > 24 || /[\n:]/.test(mc) || /\b(sheet|section|setion|summery|summary|total)\b/i.test(mc)) continue

    // Excel cells often hold un-rounded formula results (e.g. 8hrs plan = 28800/cycle,
    // efficiency = ach/running×100) that are only *displayed* rounded. Round on read so
    // the dashboard shows whole pieces / whole-% like the sheet does — never long floats.
    const rawEff = toNum(rec.efficiency)
    const efficiency = rawEff === null ? null : Math.round(rawEff)
    const rawCycle = toNum(rec.cycleTime)
    const cycleTime = rawCycle === null ? null : Math.round(rawCycle * 10) / 10
    const planQty = Math.round(toNum(rec.planQty) ?? 0)
    const runningPlan = Math.round(toNum(rec.runningPlan) ?? 0)
    const achQty = Math.round(toNum(rec.achQty) ?? 0)
    const backlog = Math.round(toNum(rec.backlog) ?? 0)
    const inPlan = planQty > 0 || runningPlan > 0 || achQty > 0

    rows.push({
      id: nextId++,
      section,
      group,
      // A per-row shift column wins; Unit 1 has none and falls back to the section heading.
      shift: String(rec.shift ?? '').trim() || sectionShift || shift,
      mc,
      itemCode: String(rec.itemCode ?? '').trim(),
      operator: String(rec.operator ?? '').trim(),
      cycleTime,
      planQty,
      runningPlan,
      achQty,
      backlog,
      efficiency,
      rework: Math.round(toNum(rec.rework) ?? 0),
      rejection: Math.round(toNum(rec.rejection) ?? 0),
      turningRejection: Math.round(toNum(rec.turningRejection) ?? 0),
      downtime,
      totalDowntime,
      remark: String(rec.remark ?? '').trim(),
      setter: String(rec.setter ?? '').trim(),
      inPlan,
      isCritical: efficiency !== null && efficiency < efficiencyTarget(),
    })
  }

  /*
   * Where the sheet has no "… Machine Section" headings, take each machine's family from its
   * own name — PP-02 is a PP, HF-03 an HF. Unit 1's sheet names its sections and is untouched;
   * Unit 2 and Unit 3 do not, and without this their machine filter would have nothing to list.
   */
  if (!groups.length) {
    for (const r of rows) {
      if (r.group) continue
      const fam = String(r.mc || '').match(/^\s*([A-Za-z]+)/)?.[1]
      if (!fam) continue
      r.group = fam.toUpperCase()
      if (!groups.includes(r.group)) groups.push(r.group)
    }
  }

  /*
   * Give every row its block's shift.
   *
   * In the Unit 2 / Unit 3 sheets only the machines that actually ran carry a shift; the
   * idle ones above them are left blank. Since a block IS one shift, take the first shift the
   * block names and apply it to the rest — otherwise half of Shift 2 would land in Shift 1.
   */
  blockStarts.push(rows.length)
  for (let b = 0; b + 1 < blockStarts.length; b++) {
    const from = blockStarts[b]
    const to = blockStarts[b + 1]
    const known = rows.slice(from, to).find((r) => r.shift)?.shift
    if (!known) continue
    for (let i = from; i < to; i++) if (!rows[i].shift) rows[i].shift = known
  }

  return {
    rows,
    downtimeReasons: reasonOrder,
    groups,
    shift,
    fileName,
  }
}
