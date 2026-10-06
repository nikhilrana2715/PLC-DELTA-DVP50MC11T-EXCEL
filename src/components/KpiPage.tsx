import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, CalendarRange, Clock, Filter, Percent, RefreshCcw, Target, TrendingUp } from 'lucide-react'
import type { Kpis } from '../lib/aggregate'
import { type PdRow, pdKpis, rowAchievement } from '../lib/pdReport'
import { DT_CATEGORY_META, downtimeCategory } from '../lib/downtime'
import { loadImports, useImportModal, useImports, type PdImport } from '../lib/pdImport'
import { PdImportModal } from './pd/PdImportModal'
import { PdFullTable } from './pd/PdFullTable'
import { useT } from '../lib/i18n'
import { KpiBreakdownModal, accentFor, type BreakdownData } from './KpiBreakdownModal'
import { monthLong } from './MonthRangePicker'

/**
 * The KPI page.
 *
 * It prefers the PD Report — the raw production log, which carries the plant's own
 * Availability / Performance / Quality / OEE columns — reading the import that covers the
 * month picked in the header. With nothing imported it falls back to the day's shift report,
 * so the page is never blank.
 *
 * The cards use the dashboard's own tint/gradient vocabulary so the two screens read as one
 * product, and are deliberately compact: six numbers should fit one row on a laptop.
 *
 * Two of them do not come from that report at all. Total Planning and Total Achievement read
 * the Month row of the Daily Plan vs Achievement sheet — the plant's own running tally — so
 * they answer "where is the month" rather than "what did these machines make", which is what
 * summing the report's FG/CG/EG/IG/HO goods was answering under those labels. The month's
 * backlog rides on the achievement tile, because the meeting reads the two together. With no
 * such sheet uploaded, both fall back to the report's own totals.
 */

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN')

/**
 * The month a row belongs to: its own date when the sheet dated it, otherwise the month
 * chosen on the import screen. The same rule the KPI Dashboard groups by, so the two
 * screens can never disagree about which month a row is in.
 */
const rowMonth = (im: PdImport, r: PdRow): string => {
  const own = String(r.date || '').slice(0, 7)
  return /^\d{4}-\d{2}$/.test(own) ? own : im.month || ''
}

/**
 * Exactly the Dashboard's tile: gradient icon at the top-left, content sitting on the
 * card's floor, label above the number, a quiet sub-line under it. Multi-figure tiles use
 * the same dotted-leader line the Dashboard uses for "Rework … 423 / PPM … 6,590".
 */
function MetricLine({ label, value, valueColor, strong = false }: { label: string; value: string; valueColor?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span
        title={label}
        className={`min-w-0 truncate ${strong ? 'text-[12px] md:text-[13px] font-semibold text-slate-700' : 'text-[11px] md:text-xs font-semibold text-slate-600'}`}
      >
        {label}
      </span>
      <span className="flex-1 border-b border-dotted border-slate-300/70 translate-y-[-3px]" />
      <span
        className={`shrink-0 font-extrabold tracking-tight tabular-nums leading-tight ${strong ? 'text-lg md:text-xl' : 'text-[15px] md:text-base'}`}
        style={{ color: valueColor ?? 'var(--ink)' }}
      >
        {value}
      </span>
    </div>
  )
}

function Card({
  label,
  icon,
  tint,
  grad,
  value,
  valueColor,
  sub,
  subColor,
  lines,
  foot,
  delay = 0,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  tint: string
  grad: string
  value?: string
  valueColor?: string
  sub?: string
  subColor?: string
  /** Several figures on one tile — the first is the headline. */
  lines?: { label: string; value: string; valueColor?: string }[]
  /** One dotted-leader figure under the headline — the same line the multi-figure tiles use. */
  foot?: { label: string; value: string; valueColor?: string }
  delay?: number
  /** Opens this tile's machine-wise breakdown. Absent = the tile is not clickable. */
  onClick?: () => void
}) {
  return (
    <div
      className={`stat-card ${tint} rise h-full min-h-[138px] md:min-h-[150px] ${
        onClick ? 'cursor-pointer hover:brightness-[0.98] active:scale-[0.99] transition' : ''
      }`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={onClick ? 'Click for the machine-wise breakdown' : undefined}
    >
      <div className="p-3 md:p-3.5 h-full flex flex-col">
        <div className={`stat-icon stat-icon-sm ${grad}`}>{icon}</div>
        {lines?.length ? (
          <div className="mt-auto pt-1.5 flex flex-col gap-0.5">
            <MetricLine label={lines[0].label} value={lines[0].value} valueColor={lines[0].valueColor} strong />
            {lines.slice(1).map((l) => (
              <MetricLine key={l.label} label={l.label} value={l.value} valueColor={l.valueColor} />
            ))}
          </div>
        ) : (
          <div className="mt-auto pt-1.5">
            <div className="text-xs md:text-[13px] font-semibold text-slate-700 leading-tight">{label}</div>
            <div className="text-xl md:text-2xl font-extrabold tracking-tight leading-tight" style={{ color: valueColor ?? 'var(--ink)' }}>
              {value}
            </div>
            {sub && (
              <div
                className={`text-[11px] mt-0.5 leading-tight ${subColor ? 'font-bold' : 'text-slate-500'}`}
                style={subColor ? { color: subColor } : undefined}
              >
                {sub}
              </div>
            )}
            {foot && (
              <div className="mt-1">
                <MetricLine label={foot.label} value={foot.value} valueColor={foot.valueColor} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The Daily Plan vs Achievement tally — the plant's own running Day / Month figures, kept
 * outside this app and uploaded each morning. Total Planning and Total Achievement read the
 * MONTH row off it: that is the number the meeting works to, and summing the PD Report's
 * FG/CG/EG/IG/HO goods columns answered a different question ("what did these machines make
 * today") under the same two labels.
 */
export interface KpiMonthlyBoard {
  hasSheet: boolean
  fileName: string
  /** 'YYYY-MM' — the month those figures cover, never assumed to be the month we are in. */
  month: string
  /** What the sheet called its day row ("Yesterday", "Day") and the date it belongs to. */
  dayLabel: string
  dayDate: string
  /** null = the sheet did not carry that row. Backlog keeps its sign: a beaten plan is real. */
  dayPlan: number | null
  dayAch: number | null
  dayBacklog: number | null
  monthPlan: number | null
  monthAch: number | null
  monthBacklog: number | null
}

export function KpiPage({
  k,
  cpk,
  shift,
  monthly,
  month,
}: {
  k: Kpis
  cpk: { avgCp: number | null; avgCpk: number | null; count: number }
  shift: 'both' | '1' | '2'
  /** Absent or without a Month row: the two cards fall back to the PD Report's own totals. */
  monthly?: KpiMonthlyBoard | null
  /** 'YYYY-MM' — the month this page reports on. Null/absent = the whole report. */
  month?: string | null
}) {
  const t = useT()
  const imports = useImports()
  const modalOpen = useImportModal()

  useEffect(() => {
    void loadImports()
  }, [])

  /**
   * The report behind the month on screen.
   *
   * Uploading used to be half the job: an import drove this page only after it had been
   * opened and "converted", and exactly one import could hold that flag at a time. So five
   * months of workbooks could sit in Recent Imports while the page read whichever single one
   * was converted last — and picking a month did nothing, because no other month's rows were
   * ever in play.
   *
   * The month picker IS the choice now. Every import counts, and the newest upload that
   * covers the picked month is the one read — so a corrected re-upload of a month wins
   * outright over the original rather than being added to it.
   */
  const pd = useMemo(() => {
    if (!imports.length) return null
    const newest = (list: PdImport[]) => [...list].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0] ?? null
    if (!month) return newest(imports)
    return newest(imports.filter((im) => im.rows.some((r) => rowMonth(im, r) === month)))
  }, [imports, month])

  // ---- the six numbers, from the PD Report when there is one ----
  /*
   * The cards follow the table's filters.
   *
   * Filtering the grid to one machine and leaving OEE, downtime and rejection describing the
   * whole plant put two different stories on one screen. The table reports which rows survived
   * and every figure above is recomputed from exactly those.
   */
  const [filtered, setFiltered] = useState<PdRow[] | null>(null)
  const onFilteredChange = useCallback((rs: PdRow[]) => setFiltered(rs), [])
  // A newly converted import — or a new month — invalidates whatever the last one was filtered to.
  useEffect(() => setFiltered(null), [pd?.id, month])

  // Stable identity: this is a prop of the table, and a fresh array each render would rebuild
  // its columns, re-run its filter and fire onFilteredChange forever.
  const textNumbers = useMemo(() => pd?.textNumbers ?? [], [pd])

  /*
   * Only the picked month's rows reach the cards and the sheet.
   *
   * The plant sends one workbook per month, but a converted import can still span several —
   * and every figure on this page is then a sum across months sitting under a header that
   * names one. Rows the sheet dated go by their own date; a sheet with no dates falls back
   * to the month chosen on the import screen, the same rule the KPI Dashboard uses.
   */
  const monthRows = useMemo(() => {
    if (!pd) return []
    return month ? pd.rows.filter((r) => rowMonth(pd, r) === month) : pd.rows
  }, [pd, month])
  /** Nothing imported for this month — said out loud, since a page of zeroes reads as real. */
  const emptyMonth = !!month && imports.length > 0 && monthRows.length === 0

  const rowsForKpis = filtered ?? monthRows
  const p = useMemo(() => (pd ? pdKpis(rowsForKpis) : null), [pd, rowsForKpis])
  const filterOn = !!(pd && filtered && filtered.length !== monthRows.length)
  const planQty = p ? p.planQty : k.planned
  const achievement = p ? p.achievement : k.achievement
  const rework = p ? p.rework : k.rework
  const rejection = p ? p.rejection : k.rejection
  const turningRej = p ? p.turningRej : k.turningRejection
  const downtimeMin = p ? p.downtimeMin : k.totalDowntime

  // Without a PD Report the shift data has no A/P/Q columns, so they are derived instead.
  const shiftMinutes = 480 * (shift === 'both' ? 2 : 1)
  const availMin = Math.max(0, k.running * shiftMinutes)
  const availability = p ? p.availability : availMin > 0 ? ((availMin - k.totalDowntime) / availMin) * 100 : 0
  const performance = p ? p.performance : k.running_qty > 0 ? (k.achievement / k.running_qty) * 100 : 0
  const bad = rework + rejection + turningRej
  const quality = p ? p.quality : achievement > 0 ? ((achievement - bad) / achievement) * 100 : 0
  const oee = p ? p.oee : (availability / 100) * (performance / 100) * (quality / 100) * 100

  /*
   * Attainment is measured only on the rows that carry a plan.
   *
   * The sheet computes M/C Plan Qty as `(Plan Hrs - AD) * 3600 / CYCLE TIME`, wrapped in
   * IFERROR — so every row with a blank cycle time gets a plan of 0 while still reporting its
   * output. Dividing total output by that plan read "155% of plan"; on the 583 rows that do
   * carry one it is 64%. The rest of the output is reported separately rather than folded in.
   */
  const attainment = p
    ? p.plannedAchievement > 0 && planQty > 0
      ? (p.plannedAchievement / planQty) * 100
      : 0
    : planQty > 0
      ? (achievement / planQty) * 100
      : 0
  const downShare = p ? (p.planMin > 0 ? (downtimeMin / p.planMin) * 100 : 0) : availMin > 0 ? (downtimeMin / availMin) * 100 : 0
  const hasCpk = cpk.count > 0 && cpk.avgCpk !== null

  /*
   * Total Planning / Total Achievement come off the Plan vs Achievement sheet's Month row.
   *
   * Both figures must come from the SAME row or the pair is meaningless, so the sheet drives
   * the cards only when it carried that row; otherwise the PD Report's own totals stay, and
   * the sub-line says which of the two is on screen.
   */
  const board =
    monthly?.hasSheet && monthly.monthPlan !== null && monthly.monthAch !== null ? monthly : null
  const monthLabel = board?.month ? monthLong(board.month) : ''
  // Written as the sheet wrote it. A negative backlog — the month is ahead — is information.
  const monthBacklog = board ? (board.monthBacklog ?? board.monthPlan! - board.monthAch!) : 0
  const monthAttain = board && board.monthPlan! > 0 ? (board.monthAch! / board.monthPlan!) * 100 : 0

  /*
   * Card breakdowns.
   *
   * Each tile answers "which machines make up this number?" — built from the SAME rows the
   * cards are computed from, so a filtered table gives a filtered breakdown and the two can
   * never disagree.
   */
  const [breakdown, setBreakdown] = useState<BreakdownData | null>(null)

  /**
   * Lets a row inside one breakdown open another — the downtime view drills from the three
   * factors into the reasons behind one of them. A ref, because the callback would otherwise
   * have to close over itself.
   */
  const openRef = useRef<(metric: string) => void>(() => {})
  const openBreakdown = useCallback(
    (metric: string) => {
      /*
       * The sheet's own Day / Month tally.
       *
       * Built before the machine rows are touched — it comes from a different source
       * entirely, and it has to open even when no PD Report has been converted yet.
       */
      if (metric === 'monthly') {
        if (!board) return
        const day =
          board.dayPlan !== null && board.dayAch !== null
            ? {
                row: board.dayLabel || 'Yesterday',
                when: board.dayDate
                  ? new Date(`${board.dayDate}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '',
                plan: board.dayPlan,
                ach: board.dayAch,
                backlog: board.dayBacklog ?? board.dayPlan - board.dayAch,
              }
            : null
        const list = [
          ...(day ? [day] : []),
          { row: 'Month', when: monthLabel, plan: board.monthPlan!, ach: board.monthAch!, backlog: monthBacklog },
        ]
        const gap = (v: number) => (
          <span style={{ color: v > 0 ? '#ea580c' : '#0f9d58', fontWeight: 700 }}>{fmt(v)}</span>
        )
        setBreakdown({
          accent: accentFor('achievement'),
          title: 'Plan vs Achievement',
          note: `${board.fileName || 'the Daily Plan vs Achievement sheet'} · the plant's own running tally — a negative backlog means the plan was beaten`,
          columns: [
            { key: 'row', label: 'Row', primary: true, width: '130px', render: (r: any) => (
              <span>
                <b>{r.row}</b>
                {r.when ? <span style={{ opacity: 0.6 }}> · {r.when}</span> : null}
              </span>
            ) },
            { key: 'plan', label: 'Plan', align: 'right' as const, render: (r: any) => fmt(r.plan) },
            { key: 'ach', label: 'Achv.', align: 'right' as const, lead: true, render: (r: any) => <b>{fmt(r.ach)}</b> },
            { key: 'pct', label: 'Of plan', align: 'right' as const, render: (r: any) => (r.plan > 0 ? `${((r.ach / r.plan) * 100).toFixed(1)}%` : '—') },
            { key: 'backlog', label: 'Backlog', align: 'right' as const, render: (r: any) => gap(r.backlog) },
          ],
          rows: list,
        })
        return
      }

      const rows = rowsForKpis
      if (!rows.length) return

      /** One entry per machine, in sheet order. */
      const byMachine = () => {
        const m = new Map<string, PdRow[]>()
        for (const r of rows) {
          const key = r.machine || '—'
          if (!m.has(key)) m.set(key, [])
          m.get(key)!.push(r)
        }
        return [...m.entries()].map(([machine, rs]) => ({ machine, rs }))
      }
      const sum = (rs: PdRow[], f: (r: PdRow) => number) => rs.reduce((a, r) => a + (f(r) || 0), 0)
      const pctCell = (v: number) => (
        <span style={{ color: v >= 85 ? '#0f9d58' : v >= 60 ? '#b8860b' : '#d03b3b', fontWeight: 700 }}>
          {v.toFixed(1)}%
        </span>
      )
      const machineCol = { key: 'machine', label: 'Machine', primary: true, width: '110px' }
      const rowsCol = { key: 'n', label: 'Rows', align: 'right' as const, width: '70px' }

      let data: BreakdownData | null = null

      if (metric === 'oee') {
        const list = byMachine().map(({ machine, rs }) => {
          const avail = sum(rs, (r) => r.availableMin)
          const down = sum(rs, (r) => r.downtimeTotal)
          const w = (f: (r: PdRow) => number) => (avail > 0 ? sum(rs, (r) => f(r) * r.availableMin) / avail : 0)
          return {
            machine, n: rs.length,
            availableMin: avail, downtimeMin: down,
            a: w((r) => r.availability), p: w((r) => r.performance), q: w((r) => r.quality), o: w((r) => r.oee),
          }
        }).sort((x, y) => x.o - y.o)
        const availAll = list.reduce((a, x) => a + x.availableMin, 0)
        const wAll = (key: 'a' | 'p' | 'q' | 'o') =>
          availAll > 0 ? list.reduce((a, x) => a + x[key] * x.availableMin, 0) / availAll : 0
        data = {
          title: 'Machine-wise OEE',
          note: 'Availability x Performance x Quality — weighted by each machine’s available minutes, worst first',
          columns: [
            machineCol, rowsCol,
            { key: 'availableMin', label: 'Available min', align: 'right' as const, render: (r: any) => fmt(r.availableMin) },
            { key: 'downtimeMin', label: 'Downtime min', align: 'right' as const, render: (r: any) => fmt(r.downtimeMin) },
            { key: 'a', label: 'A %', align: 'right' as const, render: (r: any) => pctCell(r.a) },
            { key: 'p', label: 'P %', align: 'right' as const, render: (r: any) => pctCell(r.p) },
            { key: 'q', label: 'Q %', align: 'right' as const, render: (r: any) => pctCell(r.q) },
            { key: 'o', label: 'OEE %', align: 'right' as const, render: (r: any) => pctCell(r.o) },
          ],
          rows: list,
          total: {
            machine: 'TOTAL', n: fmt(rows.length),
            availableMin: fmt(availAll), downtimeMin: fmt(list.reduce((a, x) => a + x.downtimeMin, 0)),
            a: pctCell(wAll('a')), p: pctCell(wAll('p')), q: pctCell(wAll('q')), o: pctCell(wAll('o')),
          },
        }
      } else if (metric === 'planning' || metric === 'achievement') {
        const list = byMachine().map(({ machine, rs }) => {
          const plan = sum(rs, (r) => r.planQty)
          const ach = sum(rs, (r) => rowAchievement(r))
          const withPlan = rs.filter((r) => r.planQty > 0)
          return {
            machine, n: rs.length, noPlan: rs.length - withPlan.length,
            plan, ach, good: sum(rs, (r) => r.good),
            pct: plan > 0 ? (sum(withPlan, (r) => rowAchievement(r)) / plan) * 100 : 0,
          }
        }).sort((x, y) => y.plan - x.plan)
        const planAll = list.reduce((a, x) => a + x.plan, 0)
        const achAll = list.reduce((a, x) => a + x.ach, 0)
        data = {
          title: metric === 'planning' ? 'Machine-wise Planning' : 'Machine-wise Achievement',
          note:
            metric === 'planning'
              ? 'Plan quantity per machine. Rows with no cycle time carry no plan — counted separately'
              : 'What each machine actually produced against its plan',
          columns: [
            machineCol, rowsCol,
            { key: 'plan', label: 'Plan Qty', align: 'right' as const, render: (r: any) => fmt(r.plan) },
            { key: 'good', label: 'Good', align: 'right' as const, render: (r: any) => fmt(r.good) },
            { key: 'ach', label: 'Achievement', align: 'right' as const, render: (r: any) => fmt(r.ach) },
            { key: 'pct', label: 'Of plan', align: 'right' as const, render: (r: any) => (r.plan > 0 ? pctCell(r.pct) : '—') },
            { key: 'noPlan', label: 'No plan', align: 'right' as const, render: (r: any) => (r.noPlan ? <span style={{ color: '#b8860b' }}>{fmt(r.noPlan)}</span> : '—') },
          ],
          rows: list,
          total: {
            machine: 'TOTAL', n: fmt(rows.length),
            plan: fmt(planAll), good: fmt(sum(rows, (r) => r.good)), ach: fmt(achAll),
            pct: planAll > 0 ? pctCell((achAll / planAll) * 100) : '—',
            noPlan: fmt(list.reduce((a, x) => a + x.noPlan, 0)),
          },
        }
      } else if (metric === 'downtime') {
        /*
         * The three factors first, the reasons behind them second.
         *
         * Operator, Maintenance and Management used to sit as three more cards under the
         * row, which said the same thing the Total Downtime card already said and took a
         * third of the screen to say it. They live in here now: one row each, and clicking
         * one opens its own reasons — which is the question the meeting asks next anyway.
         */
        const byCat = new Map<string, { cat: string; min: number; reasons: Set<string>; machines: Set<string> }>()
        for (const r of rows) {
          for (const [reason, min] of Object.entries(r.downtime)) {
            if (!min) continue
            const cat = downtimeCategory(reason)
            const e = byCat.get(cat) ?? { cat, min: 0, reasons: new Set<string>(), machines: new Set<string>() }
            e.min += min
            e.reasons.add(reason)
            e.machines.add(r.machine)
            byCat.set(cat, e)
          }
        }
        // Every factor is listed even at zero — "no maintenance downtime today" is an answer.
        const list = (['operator', 'maintenance', 'management'] as const).map(
          (cat) => byCat.get(cat) ?? { cat, min: 0, reasons: new Set<string>(), machines: new Set<string>() },
        )
        const totalMin = list.reduce((a, x) => a + x.min, 0)
        data = {
          title: 'Total Downtime — by factor',
          note: `${fmt(totalMin)} min in total · click a factor to see the reasons behind it`,
          columns: [
            {
              key: 'cat',
              label: 'Factor',
              primary: true,
              render: (r: any) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: DT_CATEGORY_META[r.cat as 'operator'].color }} />
                  {t(DT_CATEGORY_META[r.cat as 'operator'].label)}
                </span>
              ),
            },
            { key: 'reasons', label: 'Reasons', align: 'right' as const, width: '100px', render: (r: any) => fmt(r.reasons.size) },
            { key: 'machines', label: 'Machines', align: 'right' as const, width: '110px', render: (r: any) => fmt(r.machines.size) },
            { key: 'min', label: 'Minutes', align: 'right' as const, lead: true, width: '120px', render: (r: any) => <b>{fmt(r.min)}</b> },
            {
              key: 'share',
              label: 'Share',
              align: 'right' as const,
              width: '90px',
              render: (r: any) => (totalMin > 0 ? `${((r.min / totalMin) * 100).toFixed(1)}%` : '—'),
            },
          ],
          rows: list,
          total: { cat: 'TOTAL', min: fmt(totalMin), share: '100%' },
          onRowClick: (r: any) => openRef.current(r.cat),
        }
      } else if (metric === 'operator' || metric === 'maintenance' || metric === 'management') {
        // Reason-wise, so the meeting can see WHAT stopped the machines, not only how long.
        const wanted = metric
        const byReason = new Map<string, { reason: string; min: number; machines: Set<string> }>()
        for (const r of rows) {
          for (const [reason, min] of Object.entries(r.downtime)) {
            if (!min) continue
            const cat = downtimeCategory(reason)
            if (wanted && cat !== wanted) continue
            const e = byReason.get(reason) ?? { reason, min: 0, machines: new Set<string>() }
            e.min += min
            e.machines.add(r.machine)
            byReason.set(reason, e)
          }
        }
        const list = [...byReason.values()].sort((a, b) => b.min - a.min)
        const totalMin = list.reduce((a, x) => a + x.min, 0)
        data = {
          title: wanted ? `${DT_CATEGORY_META[wanted as 'operator'].label} — reason-wise` : 'Downtime — reason-wise',
          note: `${fmt(totalMin)} min across ${list.length} reason(s), longest first`,
          columns: [
            {
              key: 'reason',
              label: 'Reason',
              primary: true,
              wrap: true,
              // The factor's colour rides on the reason itself. A column of its own would
              // print the same words on every row — the title already names the factor.
              render: (r: any) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0, background: DT_CATEGORY_META[downtimeCategory(r.reason)].color }}
                  />
                  {r.reason}
                </span>
              ),
            },
            { key: 'machines', label: 'Machines', align: 'right' as const, width: '100px', render: (r: any) => fmt(r.machines.size) },
            { key: 'min', label: 'Minutes', align: 'right' as const, lead: true, width: '110px', render: (r: any) => fmt(r.min) },
            { key: 'share', label: 'Share', align: 'right' as const, width: '90px', render: (r: any) => (totalMin > 0 ? `${((r.min / totalMin) * 100).toFixed(1)}%` : '—') },
          ],
          rows: list,
          total: { reason: 'TOTAL', min: fmt(totalMin), share: '100%' },
          onBack: () => openRef.current('downtime'),
        }
      } else if (metric === 'quality') {
        const list = byMachine().map(({ machine, rs }) => {
          const made = sum(rs, (r) => rowAchievement(r))
          const rew = sum(rs, (r) => r.rework)
          const rej = sum(rs, (r) => r.runningRej)
          const tr = sum(rs, (r) => r.turningRej)
          return { machine, n: rs.length, made, rework: rew, rejection: rej, tr, bad: rew + rej + tr }
        }).filter((x) => x.bad > 0).sort((a, b) => b.bad - a.bad)
        data = {
          title: 'Machine-wise Rework / Rejection / T.R',
          note: `${list.length} machine(s) reported a loss, worst first`,
          columns: [
            machineCol, rowsCol,
            { key: 'made', label: 'Produced', align: 'right' as const, render: (r: any) => fmt(r.made) },
            { key: 'rework', label: 'Rework', align: 'right' as const, render: (r: any) => (r.rework ? <span style={{ color: '#ea580c', fontWeight: 700 }}>{fmt(r.rework)}</span> : '—') },
            { key: 'rejection', label: 'Rejection', align: 'right' as const, render: (r: any) => (r.rejection ? <span style={{ color: '#d03b3b', fontWeight: 700 }}>{fmt(r.rejection)}</span> : '—') },
            { key: 'tr', label: 'Turning Rej.', align: 'right' as const, render: (r: any) => (r.tr ? fmt(r.tr) : '—') },
            { key: 'bad', label: 'Total loss', align: 'right' as const, render: (r: any) => <b>{fmt(r.bad)}</b> },
          ],
          rows: list,
          total: {
            machine: 'TOTAL', n: fmt(rows.length),
            made: fmt(sum(rows, (r) => rowAchievement(r))),
            rework: fmt(sum(rows, (r) => r.rework)),
            rejection: fmt(sum(rows, (r) => r.runningRej)),
            tr: fmt(sum(rows, (r) => r.turningRej)),
            bad: fmt(sum(rows, (r) => r.rework + r.runningRej + r.turningRej)),
          },
        }
      }

      if (data) setBreakdown({ ...data, accent: accentFor(metric) })
    },
    [rowsForKpis, t, board, monthLabel, monthBacklog],
  )
  // Kept current so a row inside one breakdown can open the next.
  openRef.current = openBreakdown

  return (
    <div className="flex flex-col gap-3 md:gap-4 min-w-0">
      {emptyMonth && (
        <div
          className="rounded-xl px-3 py-2 text-[12.5px] font-semibold flex items-center gap-2 flex-wrap"
          style={{ background: 'color-mix(in srgb, #f59e0b 16%, var(--surface))', color: 'var(--ink-2)' }}
        >
          <CalendarRange size={14} style={{ color: '#b45309' }} />
          {t('No PD Report has been imported for this month')} — {monthLong(month!)}.
        </div>
      )}

      {filterOn && (
        <div
          className="rounded-xl px-3 py-2 text-[12.5px] font-semibold flex items-center gap-2 flex-wrap"
          style={{ background: 'color-mix(in srgb, #3b82f6 12%, var(--surface))', color: 'var(--ink-2)' }}
        >
          <Filter size={14} style={{ color: '#2563eb' }} />
          {t('Every figure below is for the filtered rows only')} — {fmt(filtered!.length)} {t('of')} {fmt(monthRows.length)}.
          {board && ` ${t('Total Planning and Total Achievement read the Plan vs Achievement sheet, so the filter does not move them.')}`}
        </div>
      )}

      {/* ---- the six cards: same tile as the Dashboard ---- */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Card
          label={t('OEE')}
          icon={<Percent size={18} />}
          tint="tint-blue"
          grad="grad-blue"
          value={`${Math.round(oee)}%`}
          valueColor={oee >= 60 ? '#0f9d58' : oee >= 40 ? undefined : '#d03b3b'}
          sub={`A ${Math.round(availability)}% · P ${Math.round(performance)}% · Q ${Math.round(quality)}%`}
          delay={0}
          onClick={() => openBreakdown('oee')}
        />
        <Card
          label={t('Total Planning')}
          icon={<Target size={18} />}
          tint="tint-violet"
          grad="grad-violet"
          value={board ? fmt(board.monthPlan!) : fmt(planQty)}
          sub={
            board
              ? `${t('Monthly plan')} · ${monthLabel}`
              : p
                ? `${fmt(p.plannedRows)} ${t('of')} ${fmt(p.rows)} ${t('row(s)')} ${t('have a plan')}`
                : t('planned')
          }
          subColor={!board && p && p.unplannedRows > 0 ? '#a16207' : undefined}
          delay={40}
          onClick={() => openBreakdown(board ? 'monthly' : 'planning')}
        />
        <Card
          label={t('Total Achievement')}
          icon={<TrendingUp size={18} />}
          tint="tint-emerald"
          grad="grad-emerald"
          value={board ? fmt(board.monthAch!) : fmt(achievement)}
          sub={
            board
              ? `${monthAttain.toFixed(1)}% ${t('of plan')} · ${monthLabel}`
              : p && p.unplannedRows > 0
                ? `${attainment.toFixed(1)}% ${t('of plan')} · ${fmt(p.unplannedAchievement)} ${t('unplanned')}`
                : `${attainment.toFixed(1)}% ${t('of plan')}`
          }
          foot={
            board
              ? { label: t('Backlog'), value: fmt(monthBacklog), valueColor: monthBacklog > 0 ? '#ea580c' : '#0f9d58' }
              : undefined
          }
          delay={80}
          onClick={() => openBreakdown(board ? 'monthly' : 'achievement')}
        />
        <Card
          label={t('Cp / Cpk')}
          icon={<Activity size={18} />}
          tint="tint-emerald"
          grad="grad-emerald"
          value={`${(cpk.avgCp ?? 0).toFixed(2)} / ${(cpk.avgCpk ?? 0).toFixed(2)}`}
          valueColor={hasCpk ? ((cpk.avgCpk ?? 0) >= 1.33 ? '#0f9d58' : '#d03b3b') : undefined}
          sub={hasCpk ? `${cpk.count} ${t('batch(es)')}` : t('No Data')}
          delay={120}
        />
        <Card
          label={t('Total Downtime')}
          icon={<Clock size={18} />}
          tint="tint-yellow"
          grad="grad-yellow"
          value={`${fmt(downtimeMin)} ${t('min')}`}
          sub={`${downShare.toFixed(1)}% ${t('of available time')} · ${t('open for the split')}`}
          delay={160}
          onClick={() => openBreakdown('downtime')}
        />
        <Card
          label={t('Rework / Rejection / T.R')}
          icon={<RefreshCcw size={18} />}
          tint="tint-red"
          grad="grad-red"
          lines={[
            { label: t('Rework'), value: fmt(rework), valueColor: rework ? '#ea580c' : undefined },
            { label: t('Rejection'), value: fmt(rejection), valueColor: rejection ? '#d03b3b' : undefined },
            { label: t('Turning Rejection'), value: fmt(turningRej), valueColor: turningRej ? '#d03b3b' : undefined },
          ]}
          delay={200}
          onClick={() => openBreakdown('quality')}
        />
      </div>

      {/* ---- the whole sheet, every column, behind the numbers ---- */}
      {pd && (
        <PdFullTable
          rows={monthRows}
          reasons={pd.reasons}
          textNumbers={textNumbers}
          onFilteredChange={onFilteredChange}
        />
      )}

      {modalOpen && <PdImportModal />}
      {breakdown && <KpiBreakdownModal data={breakdown} onClose={() => setBreakdown(null)} />}
    </div>
  )
}
