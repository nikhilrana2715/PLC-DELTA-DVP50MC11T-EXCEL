import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ClipboardList,
  Users,
  UserCheck,
  CheckCircle2,
  Layers,
  TrendingUp,
  TriangleAlert,
  Factory,
  RefreshCcw,
  Ban,
} from 'lucide-react'
import { Fragment, useRef, useState } from 'react'
import {
  assemblyKpis,
  byLine,
  byFamily,
  remarksByFamily,
  lineLeaders,
  type AssemblyReport,
  type AssemblyRow,
  type RemarkDatum,
} from '../lib/assembly'
import { INK, CATEGORICAL } from '../lib/palette'
import { useT } from '../lib/i18n'
import { TooltipCard } from './charts/ChartTooltip'
import { HScrollButtons } from './HScrollButtons'
import { KpiBreakdownModal, type BreakdownData, type BreakdownCol } from './KpiBreakdownModal'

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN')

function Kpi({
  icon,
  label,
  value,
  sub,
  tint,
  grad,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string
  /** Optional second line under the number — used for "vs plan" style comparisons. */
  sub?: string
  tint: string // pastel card tint, e.g. 'tint-blue'
  grad: string // icon gradient, e.g. 'grad-blue'
  onClick?: () => void
}) {
  return (
    <div
      className={`stat-card ${tint} rise ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      title={onClick ? 'View breakdown' : undefined}
    >
      <div className="p-3 md:p-4">
        <div className={`stat-icon ${grad}`}>{icon}</div>
        <div className="mt-2 text-[11px] md:text-xs font-semibold uppercase tracking-wide text-slate-600 leading-tight">
          {label}
        </div>
        <div className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 leading-tight">{value}</div>
        {sub && (
          <div className="text-[11px] font-semibold leading-tight mt-0.5" style={{ color: 'var(--ink-hint)' }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

function Panel({
  title,
  children,
  onClick,
  actions,
}: {
  title: string
  children: React.ReactNode
  onClick?: () => void
  /** Controls pinned to the right of the heading — kept out of the header's click target. */
  actions?: React.ReactNode
}) {
  return (
    <div className="bento overflow-hidden min-w-0">
      <div
        className={`px-4 md:px-5 pt-4 pb-3 border-b border-[var(--hairline)] flex items-center justify-between gap-2 ${
          onClick ? 'cursor-pointer hover:bg-slate-50/60 transition' : ''
        }`}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        title={onClick ? 'View data table' : undefined}
      >
        <div className="font-bold text-slate-800 text-[15px] min-w-0 truncate">{title}</div>
        {actions && (
          <div onClick={(e) => e.stopPropagation()} className="shrink-0">
            {actions}
          </div>
        )}
        {onClick && <span className="text-[11px] font-semibold text-indigo-500 shrink-0">View data ›</span>}
      </div>
      <div className="p-3 md:p-4">{children}</div>
    </div>
  )
}

const axisX = {
  tick: { fontSize: 11, fill: INK.primary, fontWeight: 600 },
  tickLine: false,
  axisLine: { stroke: INK.axis },
  interval: 0 as const,
}
const axisY = { tick: { fontSize: 11, fill: INK.muted }, tickLine: false, axisLine: false, width: 40 }

// Value labels drawn on top of bars.
const numLabel = { position: 'top' as const, fontSize: 11, fill: INK.primary, fontWeight: 600 as const, formatter: (v: unknown) => (Number(v) ? fmt(Number(v)) : '') }
const pctLabel = { position: 'top' as const, fontSize: 11, fill: INK.primary, fontWeight: 600 as const, formatter: (v: unknown) => `${Number(v)}%` }

const orange = (n: number) => <span style={{ color: '#ea580c' }}>{n ? fmt(n) : '—'}</span>
const pctCell = (p: number) => (
  <span style={{ color: p >= 100 ? '#059669' : p > 0 ? '#0284c7' : '#94a3b8', fontWeight: 700 }}>{p}%</span>
)
const numCell = (n: number) => (n ? fmt(n) : '—')
/** Backlog from the sheet can legitimately be negative (cleared more than planned) —
 *  show it green so it reads as "ahead", not as a data error. */
const signedBacklog = (n: number) => (n ? <span style={{ color: n < 0 ? '#16a34a' : '#ea580c' }}>{fmt(n)}</span> : '—')

export function AssemblyDashboard({
  report,
  dateGroups,
  only,
}: {
  report: AssemblyReport
  /** When a date range is active, the per-date reports (ascending) so breakdowns split by date. */
  dateGroups?: { date: string; report: AssemblyReport }[]
  /**
   * Show this one section and nothing else — the meeting-screen loop hands it a section id
   * per slide. Undefined renders the whole page as usual.
   */
  only?: string
}) {
  /** Is this the card on screen? Everything shows when the loop is not driving. */
  const show = (id: string) => !only || only === id
  /** Rows pair two panels side by side; alone under the loop, one takes the width. */
  const rowCls = only ? 'min-w-0' : 'grid lg:grid-cols-2 gap-4 md:gap-5'
  const t = useT()
  const k = assemblyKpis(report)
  const lines = byLine(report)
  // Older sheets carry a "Poor quality backlog Qty." column; newer ones replaced it with
  // Rework / Rejection. Nothing to plot either way when every line sums to zero.
  const hasPqBacklog = lines.some((l) => l.poorQualityBacklog !== 0)
  const families = byFamily(report)
  const remarks = remarksByFamily(report)
  const leaders = lineLeaders(report)
  const chartH = 280
  // Pixels each line needs before its bars and label start colliding, and the width that
  // gives every line one — the chart scrolls sideways inside its card past that.
  const LINE_SLOT = 76
  const lineChartW = Math.max(560, lines.length * LINE_SLOT)
  const [breakdown, setBreakdown] = useState<BreakdownData | null>(null)
  // The item table is far wider than the card; its arrows drive this scroller.
  const itemScroll = useRef<HTMLDivElement | null>(null)

  const fmtD = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  // Sort item rows by line number ascending (1,2,3…); rows without a line (aux ops) go last.
  const byLineAsc = (a: AssemblyRow, b: AssemblyRow) => (a.line ?? 999) - (b.line ?? 999) || b.planQty - a.planQty

  // One row of the Detailed Summary table (reused for the flat list and per-date sections).
  const detailRow = (r: AssemblyRow, key: React.Key) => {
    const pct = r.planQty > 0 ? Math.round((r.achQty / r.planQty) * 100) : 0
    const backlog = Math.max(0, r.planQty - r.achQty) // Backlog = Plan − OK
    return (
      <tr key={key}>
        <td className="whitespace-nowrap text-slate-500">{r.process || '—'}</td>
        <td className="text-slate-600">{r.line ?? '—'}</td>
        <td className="text-slate-600 whitespace-nowrap">{r.lineLeader || '—'}</td>
        <td className="font-semibold text-slate-800 whitespace-nowrap">{r.family || '—'}</td>
        <td className="text-slate-500 whitespace-nowrap">{r.itemCode || '—'}</td>
        <td className="text-slate-600 whitespace-nowrap">{r.itemName || '—'}</td>
        <td className="text-right tabular-nums">{r.planQty ? fmt(r.planQty) : '—'}</td>
        <td className="text-right tabular-nums">{r.planOperators || '—'}</td>
        {/* Running a line short of its planned operators is the thing a line leader gets
            asked about, so it is coloured instead of left for the eye to spot. */}
        <td
          className="text-right tabular-nums"
          style={{ color: r.planOperators && r.operators < r.planOperators ? '#ea580c' : undefined }}
        >
          {r.operators || '—'}
        </td>
        <td className="text-right tabular-nums">{r.achQty ? fmt(r.achQty) : '—'}</td>
        <td className="text-right tabular-nums" style={{ color: pct >= 100 ? '#059669' : pct > 0 ? '#0284c7' : '#94a3b8' }}>
          {r.planQty ? `${pct}%` : '—'}
        </td>
        <td className="text-right tabular-nums" style={{ color: backlog ? '#ea580c' : undefined }}>
          {backlog ? fmt(backlog) : '—'}
        </td>
        <td className="text-right tabular-nums" style={{ color: r.rework ? '#ea580c' : undefined }}>{r.rework || '—'}</td>
        <td className="text-right tabular-nums" style={{ color: r.rejection ? '#dc2626' : undefined }}>{r.rejection || '—'}</td>
        <td className="text-red-600 text-[12px] whitespace-nowrap">{r.remark || '—'}</td>
      </tr>
    )
  }
  const processCol: BreakdownCol = { key: 'process', label: 'Process', render: (r: AssemblyRow) => r.process || '—' }
  const lineRefCols: BreakdownCol[] = [
    { key: 'line', label: 'Line', primary: true, width: '64px' },
    { key: 'lineLeader', label: 'Line Leader', width: '160px', wrap: true, render: (r: { lineLeader?: string }) => r.lineLeader || '—' },
    { key: 'plan', label: 'Plan', align: 'right', width: '96px', render: (r: { plan: number }) => fmt(r.plan) },
    { key: 'ach', label: 'OK', align: 'right', width: '96px', render: (r: { ach: number }) => fmt(r.ach) },
    { key: 'achPct', label: 'OK %', align: 'right', width: '96px', render: (r: { achPct: number }) => pctCell(r.achPct) },
  ]
  // Complete per-item detail — shown when ANY KPI card is clicked. Widths keep short
  // columns tight (no dead gaps) and let Item Name / Remark absorb the rest and wrap.
  const fullCols: BreakdownCol[] = [
    { key: 'process', label: 'Process', width: '80px', render: (r: AssemblyRow) => r.process || '—' },
    { key: 'line', label: 'Line', primary: true, width: '50px', render: (r: AssemblyRow) => r.line ?? '—' },
    { key: 'lineLeader', label: 'Line Leader', width: '100px', wrap: true, render: (r: AssemblyRow) => r.lineLeader || '—' },
    { key: 'family', label: 'Family', width: '84px' },
    { key: 'itemCode', label: 'Item Code', width: '90px', render: (r: AssemblyRow) => r.itemCode || '—' },
    { key: 'itemName', label: 'Item Name', wrap: true, render: (r: AssemblyRow) => r.itemName || '—' },
    { key: 'planQty', label: 'Plan Qty', align: 'right', width: '72px', render: (r: AssemblyRow) => numCell(r.planQty) },
    { key: 'achQty', label: 'OK Qty', align: 'right', width: '72px', render: (r: AssemblyRow) => numCell(r.achQty) },
    // Straight from the sheet's "Back Log Qty." column — negatives included (a line that
    // cleared more than planned), so this is not run through the ≥0 `orange` helper.
    { key: 'backlogQty', label: 'Backlog', align: 'right', width: '76px', render: (r: AssemblyRow) => signedBacklog(r.backlogQty) },
    { key: 'effPct', label: 'Eff.%', align: 'right', width: '62px', render: (r: AssemblyRow) => pctCell(r.planQty > 0 ? Math.round((r.achQty / r.planQty) * 100) : 0) },
    { key: 'rework', label: 'Rework', align: 'right', width: '72px', render: (r: AssemblyRow) => (r.rework ? orange(r.rework) : '—') },
    { key: 'rejection', label: 'Rejection', align: 'right', width: '80px', render: (r: AssemblyRow) => (r.rejection ? orange(r.rejection) : '—') },
    { key: 'remark', label: 'Remark', width: '120px', wrap: true, render: (r: AssemblyRow) => r.remark || '—' },
  ]
  const fullTotal = (rep: AssemblyReport) => {
    const kk = assemblyKpis(rep)
    return { planQty: fmt(kk.totalPlan), achQty: fmt(kk.achievementQty), backlogQty: fmt(kk.backlogQty), rework: fmt(kk.rework), rejection: fmt(kk.rejection) }
  }
  const opsCols: BreakdownCol[] = [
    processCol,
    { key: 'line', label: 'Line', primary: true, render: (r: AssemblyRow) => r.line ?? '—' },
    { key: 'family', label: 'Line / Operation' },
    { key: 'planOperators', label: 'Plan Op.', align: 'right' },
    { key: 'operators', label: 'Use Op.', align: 'right' },
  ]

  type RowsOf = (rep: AssemblyReport) => unknown[]
  type TotalOf = (rep: AssemblyReport) => Record<string, React.ReactNode>

  // Build a breakdown — split into per-date sections when a range (dateGroups) is active.
  const openSectioned = (title: string, columns: BreakdownCol[], rowsOf: RowsOf, totalOf?: TotalOf, note?: string) => {
    const total = totalOf ? totalOf(report) : undefined
    if (dateGroups && dateGroups.length) {
      setBreakdown({
        title,
        note,
        columns,
        rows: rowsOf(report),
        total,
        sectionGroups: dateGroups.map((g) => ({ label: fmtD(g.date), rows: rowsOf(g.report), total: totalOf ? totalOf(g.report) : undefined })),
      })
    } else {
      setBreakdown({ title, note, columns, rows: rowsOf(report), total })
    }
  }

  // Click ANY KPI card -> the complete per-item detail (all fields), per-date sections in range mode.
  const openKpi = (title: string) => {
    openSectioned(title, fullCols, (rep) => [...rep.rows].sort(byLineAsc), fullTotal)
  }

  // Assembly Balance card -> its calculation: (WIP + Received) − Today Ring Achievement.
  // In range mode it splits per date (each date its own calculation + balance).
  const openAssemblyBalance = () => {
    const n = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmt(v))
    const calcRows = (rep: AssemblyReport) => [
      { k: 'Total WIP ring Qty', v: n(rep.totalWip) },
      { k: '+ Total Received Qty in Production', v: n(rep.totalReceived) },
      { k: '− Today Ring Achievement Quantity', v: rep.todayRingAchievement === null || rep.todayRingAchievement === undefined ? '—' : `(${fmt(rep.todayRingAchievement)})` },
    ]
    const calcTotal = (rep: AssemblyReport) => ({ k: '= Assembly Balance Qty', v: n(rep.assemblyBalance) })
    const columns: BreakdownCol[] = [{ key: 'k', label: 'Component' }, { key: 'v', label: 'Qty', align: 'right' }]
    const note = '(Total WIP ring Qty + Total Received Qty in Production) − Today Ring Achievement Quantity'
    if (dateGroups && dateGroups.length) {
      setBreakdown({
        title: 'Assembly Balance Qty — calculation',
        note: `${note} · per date`,
        columns,
        rows: calcRows(report),
        sectionGroups: dateGroups.map((g) => ({ label: fmtD(g.date), rows: calcRows(g.report), total: calcTotal(g.report) })),
      })
    } else {
      setBreakdown({ title: 'Assembly Balance Qty — calculation', note, columns, rows: calcRows(report), total: calcTotal(report) })
    }
  }

  // Click a chart panel -> its underlying data table (per-date sections in range mode).
  const openChart = (key: string) => {
    switch (key) {
      case 'planVsAch':
        openSectioned('Plan vs OK', [{ key: 'k', label: 'Metric', primary: true }, { key: 'v', label: 'Qty', align: 'right' }], (rep) => { const kk = assemblyKpis(rep); return [{ k: 'Total Plan Qty', v: fmt(kk.totalPlan) }, { k: 'OK Qty', v: fmt(kk.achievementQty) }, { k: 'Backlog Qty', v: fmt(kk.backlogQty) }] })
        break
      case 'byLine':
        openSectioned('Plan, OK & Backlog — by line', [...lineRefCols, { key: 'backlog', label: 'Backlog', align: 'right', width: '96px', render: (r: { backlog: number }) => orange(r.backlog) }], (rep) => byLine(rep))
        break
      case 'achPctLineChart':
        openSectioned('OK % — by line', lineRefCols, (rep) => byLine(rep))
        break
      case 'opsLine':
        openSectioned(
          'Operators — by line & operation',
          opsCols,
          (rep) => [...rep.rows.filter((r) => r.operators > 0 || r.planOperators > 0)].sort(byLineAsc),
          (rep) => ({ planOperators: assemblyKpis(rep).operatorsPlanned, operators: assemblyKpis(rep).operatorsUsed }),
        )
        break
      case 'family':
        openSectioned('Plan Qty — by family', [{ key: 'family', label: 'Family', primary: true }, { key: 'plan', label: 'Plan Qty', align: 'right', render: (r: { plan: number }) => fmt(r.plan) }, { key: 'pct', label: '% of total', align: 'right', render: (r: { plan: number }) => `${k.totalPlan > 0 ? Math.round((r.plan / k.totalPlan) * 100) : 0}%` }], (rep) => byFamily(rep), (rep) => ({ plan: fmt(assemblyKpis(rep).totalPlan) }))
        break
      case 'pqBacklogLine':
        openSectioned('Poor Quality Backlog — by line', [{ key: 'line', label: 'Line', primary: true }, { key: 'poorQualityBacklog', label: 'PQ Backlog', align: 'right', render: (r: { poorQualityBacklog: number }) => orange(r.poorQualityBacklog) }], (rep) => byLine(rep))
        break
    }
  }

  // Click a remark card -> the full details of that line's issue (from the given date's report).
  const openRemark = (rd: RemarkDatum, src: AssemblyReport = report) => {
    const row = src.rows.find((r) => r.line === rd.line && r.family === rd.family && r.remark === rd.remark)
    setBreakdown({
      title: `Remark — ${rd.line !== null ? `Line ${rd.line}` : 'Operation'} · ${rd.family || '—'}`,
      columns: [{ key: 'k', label: 'Detail', primary: true }, { key: 'v', label: 'Value' }],
      rows: [
        { k: 'Process', v: row?.process || '—' },
        { k: 'Line', v: rd.line ?? '—' },
        { k: 'Family', v: rd.family || '—' },
        { k: 'Item Name', v: row?.itemName || '—' },
        { k: 'Item Code', v: row?.itemCode || '—' },
        { k: 'Plan Qty', v: row ? fmt(row.planQty) : '—' },
        { k: 'OK Qty', v: row ? fmt(row.achQty) : '—' },
        { k: 'Backlog Qty', v: row ? fmt(Math.max(0, row.planQty - row.achQty)) : '—' },
        { k: 'Poor Quality Backlog', v: fmt(rd.poorQualityBacklog) },
        { k: 'Remark', v: <span className="text-red-600 font-semibold">{rd.remark}</span> },
      ],
    })
  }

  // One remark card (reused for the flat list and per-date sections).
  const remarkCard = (r: RemarkDatum, key: React.Key, src: AssemblyReport) => (
    <div
      key={key}
      className="rounded-xl border border-red-100 bg-gradient-to-br from-red-50/70 to-white p-3 cursor-pointer hover:border-red-200 hover:shadow-sm transition"
      onClick={() => openRemark(r, src)}
      role="button"
      title="View full details"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-indigo-600 text-white rounded-lg px-2 py-0.5">
          {r.line !== null ? `Line ${r.line}` : 'Aux'}
        </span>
        <span className="text-[11px] font-bold bg-slate-100 text-slate-600 rounded-lg px-2 py-0.5">{r.family || '—'}</span>
        {r.poorQualityBacklog > 0 && (
          <span className="ml-auto text-[11px] font-bold text-red-600">PQ Backlog: {fmt(r.poorQualityBacklog)}</span>
        )}
      </div>
      <div className="mt-2 flex items-start gap-1.5 text-[13px] text-slate-700 font-medium">
        <TriangleAlert size={14} className="text-red-500 mt-0.5 shrink-0" />
        <span>{r.remark}</span>
      </div>
    </div>
  )
  const remarkEmpty = (
    <div className="flex flex-col items-center gap-2 text-center py-8">
      <div className="w-12 h-12 rounded-2xl grid place-items-center bg-emerald-100 text-emerald-600">
        <CheckCircle2 size={22} />
      </div>
      <div className="text-sm font-semibold text-slate-600">No issues reported — all lines clear 🎉</div>
    </div>
  )
  // Per-date remark groups when a range is active.
  const remarkGroups = dateGroups && dateGroups.length > 0 ? dateGroups.map((g) => ({ date: g.date, report: g.report, remarks: remarksByFamily(g.report) })) : null

  return (
    <>
      {breakdown && <KpiBreakdownModal data={breakdown} onClose={() => setBreakdown(null)} />}
    <div className="flex flex-col gap-4 md:gap-5">
      {/* ---- KPI cards (any click opens the complete per-item detail) — 5 per row on
             desktop so the 10 cards sit in exactly 2 rows ---- */}
      {show('kpi') && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 md:gap-4">
        {/* Row 1: Plan → OK → Backlog → Rework → Rejection */}
        <Kpi icon={<ClipboardList size={20} />} label="Total Plan Qty" value={fmt(k.totalPlan)} tint="tint-blue" grad="grad-blue" onClick={() => openKpi('Total Plan Qty — full detail')} />
        <Kpi icon={<CheckCircle2 size={20} />} label="OK Qty" value={fmt(k.achievementQty)} tint="tint-emerald" grad="grad-emerald" onClick={() => openKpi('OK Qty — full detail')} />
        <Kpi icon={<Layers size={20} />} label="Total Backlog Qty" value={fmt(k.backlogQty)} tint="tint-orange" grad="grad-orange" onClick={() => openKpi('Total Backlog Qty — full detail')} />
        <Kpi icon={<RefreshCcw size={20} />} label="Total Rework" value={fmt(k.rework)} tint="tint-yellow" grad="grad-yellow" onClick={() => openKpi('Total Rework — full detail')} />
        <Kpi icon={<Ban size={20} />} label="Total Rejection" value={fmt(k.rejection)} tint="tint-red" grad="grad-red" onClick={() => openKpi('Total Rejection — full detail')} />
        {/* Row 2: OK % → Poor Quality % → Present Manpower → Operators Used → Assembly Balance */}
        <Kpi icon={<TrendingUp size={20} />} label="OK %" value={`${k.achievementPct}%`} tint="tint-violet" grad="grad-violet" onClick={() => openKpi('OK % — full detail')} />
        <Kpi icon={<TriangleAlert size={20} />} label="Poor Quality %" value={k.poorQualityPct === null ? '—' : `${k.poorQualityPct}%`} tint="tint-red" grad="grad-red" onClick={() => openKpi('Poor Quality — full detail')} />
        <Kpi icon={<Users size={20} />} label="Total Present Manpower" value={fmt(k.presentManpower)} tint="tint-emerald" grad="grad-emerald" onClick={() => openKpi('Total Present Manpower — full detail')} />
        <Kpi icon={<Users size={20} />} label="Total Operators Planned" value={fmt(k.operatorsPlanned)} tint="tint-blue" grad="grad-blue" onClick={() => openKpi('Total Operators Planned — full detail')} />
        <Kpi
          icon={<UserCheck size={20} />}
          label="Total Operators Used"
          value={fmt(k.operatorsUsed)}
          /* The gap between planned and used is the whole point of having both columns. */
          sub={k.operatorsPlanned ? `${k.operatorsUsed - k.operatorsPlanned >= 0 ? '+' : ''}${k.operatorsUsed - k.operatorsPlanned} vs plan` : undefined}
          tint="tint-violet"
          grad="grad-violet"
          onClick={() => openKpi('Total Operators Used — full detail')}
        />
        <Kpi icon={<Factory size={20} />} label="Assembly Balance Qty" value={k.assemblyBalance === null ? '—' : fmt(k.assemblyBalance)} tint="tint-yellow" grad="grad-yellow" onClick={openAssemblyBalance} />
      </div>}

      {/* ---- Line Leaders (shown only when the sheet provides them) ----
             Travels with the KPI cards: it names who runs each line, which is context for
             the opening slide rather than a card of its own. */}
      {show('kpi') && leaders.length > 0 && (
        <div className="bento bento-pad">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Line Leaders</div>
          <div className="flex flex-wrap gap-2">
            {leaders.map((l) => (
              <span key={l.line || l.leader} className="inline-flex items-center gap-1.5 text-[13px] font-semibold bg-indigo-50 text-indigo-700 rounded-lg px-2.5 py-1">
                {l.line ? (
                  <>
                    <span className="font-bold">{l.line}</span> – {l.leader}
                  </>
                ) : (
                  <span className="font-bold">{l.leader}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ---- Row: Plan vs OK total | Plan & OK by Line (combined) ---- */}
      <div className={rowCls}>
        {show('planVsAch') && <Panel title="Plan Qty vs OK Qty" onClick={() => openChart('planVsAch')}>
          <div style={{ height: chartH }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[{ name: 'Total Plan Qty', v: k.totalPlan }, { name: 'OK Qty', v: k.achievementQty }]} margin={{ top: 20, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={INK.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" {...axisX} />
                <YAxis {...axisY} />
                <Tooltip cursor={{ fill: 'rgba(42,120,214,0.06)' }} content={({ active, payload, label }) => (active && payload?.length ? <TooltipCard title={String(label)} items={[{ label: 'Qty', value: payload[0]?.value as number, color: '#2a78d6' }]} /> : null)} />
                <Bar dataKey="v" radius={[5, 5, 0, 0]} maxBarSize={90} isAnimationActive={false}>
                  <LabelList dataKey="v" {...numLabel} />
                  <Cell fill="#2a78d6" />
                  <Cell fill="#1baf7a" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>}

        {show('byLine') && <Panel title="Plan, OK & Backlog Qty by Line" onClick={() => openChart('byLine')}>
          <div className="overflow-x-auto overflow-y-hidden scroll-area" style={{ height: chartH }}>
            <ResponsiveContainer width={lineChartW} height="100%">
              <BarChart data={lines} margin={{ top: 20, right: 8, left: 0, bottom: 4 }} barCategoryGap="18%">
                <CartesianGrid stroke={INK.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="line" {...axisX} />
                <YAxis {...axisY} />
                <Tooltip cursor={{ fill: 'rgba(42,120,214,0.06)' }} content={({ active, payload, label }) => (active && payload?.length ? <TooltipCard title={String(label)} items={[{ label: 'Plan', value: payload[0]?.payload.plan, color: '#2a78d6' }, { label: 'OK', value: payload[0]?.payload.ach, color: '#1baf7a' }, { label: 'Backlog', value: payload[0]?.payload.backlog, color: '#ea580c' }]} /> : null)} />
                <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12.5, color: INK.secondary, paddingTop: 4 }} />
                <Bar dataKey="plan" name="Plan Qty" fill="#2a78d6" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false}>
                  <LabelList dataKey="plan" {...numLabel} fontSize={9} />
                </Bar>
                <Bar dataKey="ach" name="OK Qty" fill="#1baf7a" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false}>
                  <LabelList dataKey="ach" {...numLabel} fontSize={9} />
                </Bar>
                <Bar dataKey="backlog" name="Backlog Qty" fill="#ea580c" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false}>
                  <LabelList dataKey="backlog" {...numLabel} fontSize={9} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>}
      </div>

      {/* ---- Row: Ach% by Line | Operators by Line ---- */}
      <div className={rowCls}>
        {show('achPct') && <Panel title="OK % by Line" onClick={() => openChart('achPctLineChart')}>
          <div className="overflow-x-auto overflow-y-hidden scroll-area" style={{ height: chartH }}>
            <ResponsiveContainer width={lineChartW} height="100%">
              <BarChart data={lines} margin={{ top: 20, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={INK.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="line" {...axisX} />
                <YAxis {...axisY} unit="%" />
                <Tooltip cursor={{ fill: 'rgba(16,185,129,0.06)' }} content={({ active, payload, label }) => (active && payload?.length ? <TooltipCard title={String(label)} items={[{ label: 'OK', value: `${payload[0]?.value}%`, color: '#16a34a' }]} /> : null)} />
                <Bar dataKey="achPct" name="OK %" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={30} isAnimationActive={false}>
                  <LabelList dataKey="achPct" {...pctLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>}

        {show('operators') && <Panel title="Operators — Plan vs Used by Line" onClick={() => openChart('opsLine')}>
          <div className="overflow-x-auto overflow-y-hidden scroll-area" style={{ height: chartH }}>
            <ResponsiveContainer width={lineChartW} height="100%">
              <BarChart data={lines} margin={{ top: 20, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={INK.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="line" {...axisX} />
                <YAxis {...axisY} />
                <Tooltip
                  cursor={{ fill: 'rgba(124,108,240,0.06)' }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <TooltipCard
                        title={String(label)}
                        items={[
                          { label: 'Planned', value: (payload.find((x) => x.dataKey === 'planOperators')?.value as number) ?? 0, color: '#3b82f6' },
                          { label: 'Used', value: (payload.find((x) => x.dataKey === 'operators')?.value as number) ?? 0, color: '#7c6cf0' },
                        ]}
                      />
                    ) : null
                  }
                />
                <Bar dataKey="planOperators" name="Planned" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false}>
                  <LabelList dataKey="planOperators" {...numLabel} />
                </Bar>
                <Bar dataKey="operators" name="Used" fill="#7c6cf0" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false}>
                  <LabelList dataKey="operators" {...numLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>}
      </div>

      {/* ---- Row: Plan by Family (pie) | Poor Quality Backlog by Line ---- */}
      <div className={rowCls}>
        {show('family') && <Panel title="Plan Qty by Family" onClick={() => openChart('family')}>
          <div style={{ height: chartH }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={families}
                  dataKey="plan"
                  nameKey="family"
                  cx="50%"
                  cy="50%"
                  outerRadius="74%"
                  isAnimationActive={false}
                  label={(e: { value?: number; percent?: number }) => `${fmt(e.value ?? 0)} · ${Math.round((e.percent ?? 0) * 100)}%`}
                  labelLine={false}
                  style={{ fontSize: 10.5, fontWeight: 600 }}
                >
                  {families.map((_, i) => (
                    <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />
                  ))}
                </Pie>
                <Tooltip content={({ active, payload }) => (active && payload?.length ? <TooltipCard title={String(payload[0]?.name)} items={[{ label: 'Plan', value: payload[0]?.value as number, color: payload[0]?.payload.fill }]} /> : null)} />
                <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12, color: INK.secondary }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>}

        {/* The newer sheet format dropped the "Poor quality backlog Qty." column (it now
            carries Rework / Rejection there instead), so this chart has nothing to plot.
            Say so rather than drawing a row of zero-height bars that looks broken. */}
        {show('pqBacklog') && <Panel title="Poor Quality Backlog by Line" onClick={hasPqBacklog ? () => openChart('pqBacklogLine') : undefined}>
          <div className="overflow-x-auto overflow-y-hidden scroll-area" style={{ height: chartH }}>
            {hasPqBacklog ? (
              <ResponsiveContainer width={lineChartW} height="100%">
                <BarChart data={lines} margin={{ top: 20, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke={INK.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="line" {...axisX} />
                  <YAxis {...axisY} />
                  <Tooltip cursor={{ fill: 'rgba(220,38,38,0.06)' }} content={({ active, payload, label }) => (active && payload?.length ? <TooltipCard title={String(label)} items={[{ label: 'PQ Backlog', value: payload[0]?.value as number, color: '#dc2626' }]} /> : null)} />
                  <Bar dataKey="poorQualityBacklog" name="Poor Quality Backlog" fill="#dc2626" radius={[4, 4, 0, 0]} maxBarSize={30} isAnimationActive={false}>
                    <LabelList dataKey="poorQualityBacklog" {...numLabel} fontSize={10} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full grid place-items-center px-6 text-center">
                <div>
                  <TriangleAlert size={26} className="mx-auto mb-2" style={{ color: '#cbd5e1' }} />
                  <div className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
                    {t('No Poor Quality Backlog in this sheet')}
                  </div>
                  <div className="text-[12px] mt-1" style={{ color: 'var(--ink-muted)' }}>
                    {t('This report has no "Poor quality backlog Qty." column, so there is nothing to plot.')}
                  </div>
                </div>
              </div>
            )}
          </div>
        </Panel>}
      </div>

      {/* ---- Remark summary by line & family ---- */}
      {show('remarks') && <Panel title={remarkGroups ? 'Remark Summary by Line & Family — date-wise' : 'Remark Summary by Line & Family'}>
        {remarkGroups ? (
          remarkGroups.every((g) => g.remarks.length === 0) ? (
            remarkEmpty
          ) : (
            <div className="flex flex-col gap-4">
              {remarkGroups.map((g) => (
                <div key={g.date}>
                  <div className="mb-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold bg-violet-100 text-violet-700">
                      {fmtD(g.date)}
                    </span>
                  </div>
                  {g.remarks.length === 0 ? (
                    <div className="text-[13px] text-slate-400 font-medium pl-1">No issues for this date 🎉</div>
                  ) : (
                    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5 md:gap-3">
                      {g.remarks.map((r, i) => remarkCard(r, g.date + '-' + i, g.report))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : remarks.length === 0 ? (
          remarkEmpty
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5 md:gap-3">
            {remarks.map((r, i) => remarkCard(r, i, report))}
          </div>
        )}
      </Panel>}

      {/* ---- Detailed summary by item ---- */}
      {show('items') && <Panel
        title={dateGroups && dateGroups.length > 0 ? 'Detailed Summary by Item — date-wise' : 'Detailed Summary by Item'}
        actions={<HScrollButtons scrollRef={itemScroll} />}
      >
        <div ref={itemScroll} className="scroll-area" style={{ overflowX: 'auto' }}>
          <table className="tbl" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th>Process</th>
                <th>Line</th>
                <th>Line Leader</th>
                <th>Family</th>
                <th>Item Code</th>
                <th>Item Name</th>
                <th className="text-right">Plan Qty</th>
                <th className="text-right">Plan Op.</th>
                <th className="text-right">Use Op.</th>
                <th className="text-right">OK Qty</th>
                <th className="text-right">OK %</th>
                <th className="text-right">Backlog Qty</th>
                <th className="text-right">Rework</th>
                <th className="text-right">Rejection</th>
                <th>Remark</th>
              </tr>
            </thead>
            <tbody>
              {dateGroups && dateGroups.length > 0
                ? dateGroups.map((g) => (
                    <Fragment key={'d-' + g.date}>
                      <tr>
                        <td colSpan={14} className="pt-4 pb-2">
                          <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold bg-violet-100 text-violet-700">
                            {fmtD(g.date)}
                          </span>
                        </td>
                      </tr>
                      {[...g.report.rows].sort(byLineAsc).map((r, i) => detailRow(r, g.date + '-' + i))}
                    </Fragment>
                  ))
                : [...report.rows].sort(byLineAsc).map((r, i) => detailRow(r, i))}
            </tbody>
          </table>
        </div>
      </Panel>}
    </div>
    </>
  )
}
