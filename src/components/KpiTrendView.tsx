import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, ArrowDownRight, ArrowUpRight, Gauge, Minus, Percent, Timer, TrendingUp } from 'lucide-react'
import { pdKpis, type PdRow } from '../lib/pdReport'
import { DT_CATEGORY_META } from '../lib/downtime'
import { INK, SERIES, STATUS, efficiencyColor } from '../lib/palette'
import { efficiencyTarget } from '../lib/unit'
import { TooltipCard } from './charts/ChartTooltip'
import { monthShort, monthsBetween } from './MonthRangePicker'
import { KpiTrendDetail, type DetailColumn, type DetailRow } from './KpiTrendDetail'
import { accentFor } from './KpiBreakdownModal'

/** The KPI Dashboard's own cards, mapped onto the same palette the dashboard breakdowns use. */
const TREND_ACCENT: Record<string, string> = {
  oee: 'efficiency',
  planning: 'plan',
  achievement: 'achievement',
  downtime: 'downtime',
  losses: 'rejection',
}
import { useT } from '../lib/i18n'

/**
 * The KPI report read month against month.
 *
 * The KPI page answers "what happened"; this one answers "is it getting better". Every chart
 * is therefore change-over-time across whole months, and each carries ONE measure family —
 * a second y-axis would let two unrelated scales be compared by eye, which is the fastest way
 * to draw a wrong conclusion from a right number.
 *
 * The stack order below is deliberate: Operator, then Management, then Maintenance. Green
 * beside red is the one adjacency red-green colour blindness cannot separate (ΔE 7.4), so
 * violet sits between them, and the table at the foot carries every figure in text as well.
 */

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN')
const pct = (n: number) => `${Math.round(n)}%`
/** Attainment on the rows that carry a plan — see MonthRow.plannedAch. */
const attain = (plannedAch: number, planQty: number): number => (planQty > 0 && plannedAch > 0 ? (plannedAch / planQty) * 100 : 0)

/**
 * Defects per million, against what the month actually produced.
 *
 * "Produced" is the sheet's own Total — good pieces plus running rejection plus turning
 * rejection, i.e. everything that came off the machine. Measuring a defect rate against good
 * output alone would flatter every month, and against the plan would move with a number the
 * shop floor did not make.
 */
const ppm = (defects: number, produced: number): string => (produced > 0 ? Math.round((defects / produced) * 1e6).toLocaleString('en-IN') : '—')

/** Downtime stack, ordered so the two hardest colours to tell apart are never neighbours. */
const DT_STACK = [
  { key: 'operator', ...DT_CATEGORY_META.operator },
  { key: 'management', ...DT_CATEGORY_META.management },
  { key: 'maintenance', ...DT_CATEGORY_META.maintenance },
] as const

interface MonthRow {
  month: string
  label: string
  oee: number
  availability: number
  performance: number
  quality: number
  planQty: number
  achievement: number
  /**
   * Output on the rows that actually carry a plan, and the rest.
   *
   * The sheet leaves M/C Plan Qty at 0 wherever CYCLE TIME is blank while still reporting
   * that row's output, so total-over-plan reads "183% of plan". Attainment is measured on
   * the planned rows alone — the same split the KPI page makes — and the remainder is
   * reported beside it rather than folded in.
   */
  plannedAch: number
  unplannedAch: number
  downtime: number
  operator: number
  management: number
  maintenance: number
  rework: number
  rejection: number
  turningRej: number
  /** Rejection + Turning Rejection — what the chart and the cards both report. */
  rejectionAll: number
  rows: number
}

function Stat({
  icon,
  label,
  value,
  sub,
  tint,
  grad,
  delta,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  tint: string
  grad: string
  /** Change from the first month to the last, when the range holds more than one. */
  delta?: { n: number; better: 'up' | 'down' }
  /** Opens this card's month-by-month working. */
  onClick?: () => void
}) {
  const t = useT()
  const dir = delta ? (delta.n > 0.5 ? 'up' : delta.n < -0.5 ? 'down' : 'flat') : null
  const good = dir === 'flat' ? null : dir === delta?.better
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={onClick ? t('Open the month-by-month working') : undefined}
      className={`stat-card ${tint} rise text-left w-full transition ${onClick ? 'hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 cursor-pointer' : ''}`}
    >
      <div className="p-3 md:p-4">
        <div className={`stat-icon ${grad}`}>{icon}</div>
        <div className="mt-2 text-[11px] md:text-xs font-semibold uppercase tracking-wide text-slate-600 leading-tight">{t(label)}</div>
        <div className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 leading-tight">{value}</div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {dir && (
            <span
              className="inline-flex items-center gap-0.5 text-[11px] font-bold rounded-md px-1.5 py-0.5"
              style={{
                background: good === null ? '#eceef3' : good ? '#dff5df' : '#fde4e4',
                color: good === null ? '#626977' : good ? '#0a7a0a' : '#b0201f',
              }}
            >
              {dir === 'up' ? <ArrowUpRight size={11} /> : dir === 'down' ? <ArrowDownRight size={11} /> : <Minus size={11} />}
              {Math.abs(delta!.n) >= 0.5 ? `${Math.abs(Math.round(delta!.n))}%` : t('flat')}
            </span>
          )}
          {sub && <span className="text-[11px] font-semibold text-slate-500 leading-tight">{sub}</span>}
        </div>
      </div>
    </button>
  )
}

function Card({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: React.ReactNode; children: React.ReactNode }) {
  const t = useT()
  return (
    <div className="bento rise overflow-hidden min-w-0">
      <div className="flex items-center gap-3 px-4 md:px-5 pt-4 pb-3 border-b border-[var(--hairline)]">
        <div className="w-9 h-9 rounded-xl grid place-items-center bg-indigo-50 text-indigo-600 shrink-0">{icon}</div>
        <div className="min-w-0">
          <div className="font-bold text-slate-800">{t(title)}</div>
          <div className="text-xs text-slate-500">{t(subtitle)}</div>
        </div>
      </div>
      <div className="p-3 md:p-4">{children}</div>
    </div>
  )
}

export function KpiTrendView({
  monthRows,
  from,
  to,
}: {
  /** Month → the rows behind it, gathered across every import. */
  monthRows: Map<string, PdRow[]>
  from: string
  to: string
}) {
  const t = useT()
  const target = efficiencyTarget()

  const months = useMemo<MonthRow[]>(() => {
    // Every month in the range appears, even an empty one — a gap in the line IS the story.
    return monthsBetween(from, to).map((m) => {
      const k = pdKpis(monthRows.get(m) ?? [])
      return {
        month: m,
        label: monthShort(m),
        oee: k.oee,
        availability: k.availability,
        performance: k.performance,
        quality: k.quality,
        planQty: k.planQty,
        achievement: k.achievement,
        plannedAch: k.plannedAchievement,
        unplannedAch: k.unplannedAchievement,
        downtime: k.downtimeMin,
        operator: k.operatorMin,
        management: k.managementMin,
        maintenance: k.maintenanceMin,
        rework: k.rework,
        rejection: k.rejection,
        turningRej: k.turningRej,
        rejectionAll: k.rejection + k.turningRej,
        rows: k.rows,
      }
    })
  }, [monthRows, from, to])

  /** Everything that came off the machines that month — the PPM denominator. */
  const producedOf = (m: MonthRow) => m.achievement + m.rejection + m.turningRej
  const live = months.filter((m) => m.rows > 0)
  const total = useMemo(() => {
    const sum = (f: (m: MonthRow) => number) => live.reduce((s, m) => s + f(m), 0)
    const oeeRows = live.filter((m) => m.oee > 0)
    return {
      oee: oeeRows.length ? oeeRows.reduce((s, m) => s + m.oee, 0) / oeeRows.length : 0,
      planQty: sum((m) => m.planQty),
      achievement: sum((m) => m.achievement),
      plannedAch: sum((m) => m.plannedAch),
      unplannedAch: sum((m) => m.unplannedAch),
      downtime: sum((m) => m.downtime),
      rework: sum((m) => m.rework),
      rejection: sum((m) => m.rejection + m.turningRej),
      produced: sum((m) => m.achievement + m.rejection + m.turningRej),
      operator: sum((m) => m.operator),
      management: sum((m) => m.management),
      maintenance: sum((m) => m.maintenance),
    }
  }, [live])

  /** First month against last — the only comparison a trend page owes the reader. */
  const swing = (pick: (m: MonthRow) => number): number | undefined => {
    if (live.length < 2) return undefined
    const a = pick(live[0])
    const b = pick(live[live.length - 1])
    if (!a) return undefined
    return ((b - a) / a) * 100
  }

  /** Which card's working is open. */
  const [detail, setDetail] = useState<'oee' | 'planning' | 'achievement' | 'downtime' | 'losses' | null>(null)

  /**
   * One card, opened out into months.
   *
   * Every table lists the whole range — a month with no import shows as blank rather than
   * being dropped, because "we never imported July" is itself worth seeing.
   */
  const breakdown = useMemo(() => {
    if (!detail) return null
    const span = `${monthShort(from)} — ${monthShort(to)}`
    const share = (n: number, all: number) => (all > 0 ? pct((n / all) * 100) : '—')
    const cols = (...c: DetailColumn[]): DetailColumn[] => [{ label: 'Month' }, ...c]
    const line = (m: MonthRow, cells: string[]): DetailRow => ({ label: m.label, cells, empty: m.rows === 0 })

    if (detail === 'oee')
      return {
        title: 'OEE by month',
        subtitle: span,
        note: 'OEE is the sheet\u2019s own column, averaged with each row weighted by the minutes it covers \u2014 Availability \u00d7 Performance \u00d7 Quality.',
        columns: cols({ label: 'OEE', num: true }, { label: 'Availability', num: true, soft: true }, { label: 'Performance', num: true, soft: true }, { label: 'Quality', num: true, soft: true }),
        rows: months.map((m) => line(m, m.rows ? [pct(m.oee), pct(m.availability), pct(m.performance), pct(m.quality)] : ['—', '—', '—', '—'])),
        total: { label: 'AVERAGE', cells: [pct(total.oee), '', '', ''] },
      }

    if (detail === 'planning')
      return {
        title: 'Total Planning by month',
        subtitle: span,
        columns: cols({ label: 'Plan Qty', num: true }, { label: 'Achievement', num: true, soft: true }, { label: 'Attainment', num: true }, { label: 'Share of range', num: true, soft: true }),
        rows: months.map((m) =>
          line(m, m.rows ? [fmt(m.planQty), fmt(m.achievement), pct(attain(m.plannedAch, m.planQty)), share(m.planQty, total.planQty)] : ['—', '—', '—', '—']),
        ),
        total: { label: 'TOTAL', cells: [fmt(total.planQty), fmt(total.achievement), pct(attain(total.plannedAch, total.planQty)), '100%'] },
      }

    if (detail === 'achievement')
      return {
        title: 'Total Achievement by month',
        subtitle: span,
        note: 'Attainment counts only the rows that carry a plan; output on rows the sheet left unplanned is reported beside it.',
        columns: cols({ label: 'Achievement', num: true }, { label: 'Against plan', num: true, soft: true }, { label: 'Attainment', num: true }, { label: 'Unplanned', num: true, soft: true }),
        rows: months.map((m) =>
          line(m, m.rows ? [fmt(m.achievement), fmt(m.plannedAch), pct(attain(m.plannedAch, m.planQty)), fmt(m.unplannedAch)] : ['—', '—', '—', '—']),
        ),
        total: { label: 'TOTAL', cells: [fmt(total.achievement), fmt(total.plannedAch), pct(attain(total.plannedAch, total.planQty)), fmt(total.unplannedAch)] },
      }

    if (detail === 'downtime')
      return {
        title: 'Total Downtime by month',
        subtitle: span,
        columns: cols({ label: 'Operator', num: true }, { label: 'Management', num: true }, { label: 'Maintenance', num: true }, { label: 'Total (min)', num: true }, { label: 'Share of range', num: true, soft: true }),
        rows: months.map((m) =>
          line(m, m.rows ? [fmt(m.operator), fmt(m.management), fmt(m.maintenance), fmt(m.downtime), share(m.downtime, total.downtime)] : ['—', '—', '—', '—', '—']),
        ),
        total: { label: 'TOTAL', cells: [fmt(total.operator), fmt(total.management), fmt(total.maintenance), fmt(total.downtime), '100%'] },
      }

    // losses — the card the shop floor reads in PPM
    return {
      title: 'Rework & Rejection by month',
      subtitle: span,
      note: 'PPM = pieces per million, against what that month produced (good + running rejection + turning rejection). Rejection includes Turning Rejection.',
      columns: cols(
        { label: 'Rework', num: true },
        { label: 'Rework PPM', num: true },
        { label: 'Rejection', num: true },
        { label: 'Rejection PPM', num: true },
        { label: 'incl. T.R', num: true, soft: true },
        { label: 'Produced', num: true, soft: true },
      ),
      rows: months.map((m) => {
        const made = producedOf(m)
        const rej = m.rejection + m.turningRej
        return line(m, m.rows ? [fmt(m.rework), ppm(m.rework, made), fmt(rej), ppm(rej, made), fmt(m.turningRej), fmt(made)] : ['—', '—', '—', '—', '—', '—'])
      }),
      total: {
        label: 'TOTAL',
        cells: [
          fmt(total.rework),
          ppm(total.rework, total.produced),
          fmt(total.rejection),
          ppm(total.rejection, total.produced),
          fmt(live.reduce((n, m) => n + m.turningRej, 0)),
          fmt(total.produced),
        ],
      },
    }
  }, [detail, months, total, live, from, to])

  const axis = { tick: { fontSize: 11, fill: INK.primary, fontWeight: 600 as const }, tickLine: false, axisLine: { stroke: INK.axis } }
  const yAxis = { tick: { fontSize: 11, fill: INK.muted }, tickLine: false, axisLine: false as const }
  const grid = <CartesianGrid stroke={INK.grid} strokeDasharray="3 3" vertical={false} />
  const legend = <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12.5, color: INK.secondary, paddingTop: 4 }} />

  if (live.length === 0) {
    return (
      <div className="bento bento-pad text-center py-16">
        <div className="w-16 h-16 mx-auto rounded-2xl grid place-items-center bg-amber-100 text-amber-600 shadow-sm mb-4">
          <TrendingUp size={30} />
        </div>
        <div className="text-lg font-bold text-slate-700">{t('No PD Report rows in these months')}</div>
        <div className="text-sm text-slate-400 mt-1">{t('Pick a different month range, or import the report for these months.')}</div>
      </div>
    )
  }

  return (
    <>
      {breakdown && (
        <KpiTrendDetail
          title={breakdown.title}
          subtitle={breakdown.subtitle}
          note={'note' in breakdown ? breakdown.note : undefined}
          columns={breakdown.columns}
          rows={breakdown.rows}
          total={breakdown.total}
          accent={accentFor(TREND_ACCENT[detail ?? ''] ?? '')}
          onClose={() => setDetail(null)}
        />
      )}

      {/* ---- the range's headline, each with its first-to-last-month swing ---- */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
        <Stat
          icon={<Percent size={20} />}
          label="OEE"
          onClick={() => setDetail('oee')}
          value={pct(total.oee)}
          sub={`${t('avg of')} ${live.length} ${t('month(s)')}`}
          delta={swing((m) => m.oee) !== undefined ? { n: swing((m) => m.oee)!, better: 'up' } : undefined}
          tint="tint-blue"
          grad="grad-blue"
        />
        <Stat
          icon={<Gauge size={20} />}
          label="Total Planning"
          onClick={() => setDetail('planning')}
          value={fmt(total.planQty)}
          delta={swing((m) => m.planQty) !== undefined ? { n: swing((m) => m.planQty)!, better: 'up' } : undefined}
          tint="tint-violet"
          grad="grad-violet"
        />
        <Stat
          icon={<TrendingUp size={20} />}
          label="Total Achievement"
          onClick={() => setDetail('achievement')}
          value={fmt(total.achievement)}
          sub={`${pct(attain(total.plannedAch, total.planQty))} ${t('of plan')}${total.unplannedAch > 0 ? ` · ${fmt(total.unplannedAch)} ${t('unplanned')}` : ''}`}
          delta={swing((m) => m.achievement) !== undefined ? { n: swing((m) => m.achievement)!, better: 'up' } : undefined}
          tint="tint-emerald"
          grad="grad-emerald"
        />
        <Stat
          icon={<Timer size={20} />}
          label="Total Downtime"
          onClick={() => setDetail('downtime')}
          value={`${fmt(total.downtime)} min`}
          delta={swing((m) => m.downtime) !== undefined ? { n: swing((m) => m.downtime)!, better: 'down' } : undefined}
          tint="tint-yellow"
          grad="grad-yellow"
        />
        <Stat
          icon={<Activity size={20} />}
          label="Rework & Rejection"
          onClick={() => setDetail('losses')}
          value={fmt(total.rework + total.rejection)}
          sub={`${fmt(total.rework)} ${t('rework')} · ${fmt(total.rejection)} ${t('rejection')}`}
          delta={swing((m) => m.rework + m.rejection + m.turningRej) !== undefined ? { n: swing((m) => m.rework + m.rejection + m.turningRej)!, better: 'down' } : undefined}
          tint="tint-red"
          grad="grad-red"
        />
      </div>

      {/* ---- OEE: one series, so the title names it and no legend is needed ---- */}
      {/* ---- OEE: one series, so the title names it and no legend is needed ----
             The band behind the line does the work a bare line could not: everything under
             the target is washed red, everything over it green, so "are we there yet" is
             answered by where the line sits rather than by reading the axis. ---- */}
      <Card title="OEE by Month" subtitle={`Weighted by machine minutes · target ${target}%`} icon={<Percent size={18} />}>
        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={months} margin={{ top: 28, right: 36, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="oeeArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7c6cf0" stopOpacity={0.42} />
                  <stop offset="55%" stopColor="#5b7cf0" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#4a3aa7" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="oeeLine" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#4a3aa7" />
                  <stop offset="100%" stopColor="#2a78d6" />
                </linearGradient>
              </defs>
              {/* The two bands, drawn first so every mark sits on top of them. */}
              <ReferenceArea y1={0} y2={target} fill={STATUS.critical} fillOpacity={0.05} strokeOpacity={0} />
              <ReferenceArea y1={target} y2={100} fill={STATUS.good} fillOpacity={0.05} strokeOpacity={0} />
              <CartesianGrid stroke={INK.grid} strokeDasharray="3 3" vertical={false} />
              {/* Padding pulls the first and last points off the edges, so their value pills
                  have room instead of being clipped by the axis. */}
              <XAxis dataKey="label" interval={0} height={30} padding={{ left: 28, right: 28 }} {...axis} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, target, 100]} width={40} unit="%" {...yAxis} />
              <ReferenceLine
                y={target}
                stroke={STATUS.critical}
                strokeDasharray="5 4"
                label={{ value: `${t('Target')} ${target}%`, position: 'insideTopLeft', fill: STATUS.critical, fontSize: 10, fontWeight: 700, dy: -4 }}
              />
              <Tooltip
                cursor={{ stroke: INK.axis, strokeWidth: 1 }}
                wrapperStyle={{ zIndex: 40 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const m = payload[0].payload as MonthRow
                  return (
                    <TooltipCard
                      title={String(label)}
                      items={[
                        { label: 'OEE', value: pct(m.oee), color: efficiencyColor(m.oee || null) },
                        { label: 'Availability', value: pct(m.availability), color: INK.muted },
                        { label: 'Performance', value: pct(m.performance), color: INK.muted },
                        { label: 'Quality', value: pct(m.quality), color: INK.muted },
                      ]}
                    />
                  )
                }}
              />
              <Area
                type="monotone"
                dataKey="oee"
                name={t('OEE')}
                stroke="url(#oeeLine)"
                strokeWidth={3}
                fill="url(#oeeArea)"
                isAnimationActive={false}
                connectNulls
                activeDot={{ r: 7, strokeWidth: 2, stroke: '#fff' }}
                // Each point is coloured by the band it lands in, so a month below target
                // reads as a red dot rather than as a position to measure against the line.
                dot={(props) => {
                  const { cx, cy, payload, index } = props as { cx: number; cy: number; payload: MonthRow; index: number }
                  if (!payload.rows) return <g key={`empty-${index}`} />
                  return (
                    <g key={`dot-${index}`}>
                      <circle cx={cx} cy={cy} r={5.5} fill={efficiencyColor(payload.oee)} stroke="#fff" strokeWidth={2} />
                      <rect x={cx - 17} y={cy - 30} rx={6} width={34} height={18} fill={efficiencyColor(payload.oee)} opacity={0.14} />
                      <text x={cx} y={cy - 17} textAnchor="middle" fontSize={11} fontWeight={800} fill={efficiencyColor(payload.oee)}>
                        {pct(payload.oee)}
                      </text>
                    </g>
                  )
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid xl:grid-cols-2 gap-4 md:gap-5 min-w-0">
        {/* ---- Plan vs Achievement ---- */}
        <Card title="Plan vs Achievement by Month" subtitle="Quantities the report carries, month by month" icon={<TrendingUp size={18} />}>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ top: 16, right: 8, left: 0, bottom: 4 }} barCategoryGap="24%">
                {grid}
                <XAxis dataKey="label" interval={0} height={30} {...axis} />
                <YAxis width={52} {...yAxis} />
                <Tooltip
                  cursor={{ fill: 'rgba(42,120,214,0.06)' }}
                  wrapperStyle={{ zIndex: 40 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const m = payload[0].payload as MonthRow
                    return (
                      <TooltipCard
                        title={String(label)}
                        items={[
                          { label: 'Plan', value: fmt(m.planQty), color: SERIES.plan },
                          { label: 'Achievement', value: fmt(m.achievement), color: SERIES.achievement },
                          { label: 'Attainment', value: m.planQty > 0 ? pct(attain(m.plannedAch, m.planQty)) : '—', color: INK.muted },
                          { label: 'Unplanned', value: fmt(m.unplannedAch), color: INK.muted },
                        ]}
                      />
                    )
                  }}
                />
                {legend}
                <Bar dataKey="planQty" name={t('Plan')} fill={SERIES.plan} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
                <Bar dataKey="achievement" name={t('Achievement')} fill={SERIES.achievement} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* ---- Downtime split. Stacked: the question is how the month's total divides. ---- */}
        <Card title="Downtime Split by Month" subtitle="Operator · Management · Maintenance, in minutes" icon={<Timer size={18} />}>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ top: 16, right: 8, left: 0, bottom: 4 }} barCategoryGap="28%">
                {grid}
                <XAxis dataKey="label" interval={0} height={30} {...axis} />
                <YAxis width={56} {...yAxis} />
                <Tooltip
                  cursor={{ fill: 'rgba(42,120,214,0.06)' }}
                  wrapperStyle={{ zIndex: 40 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const m = payload[0].payload as MonthRow
                    return (
                      <TooltipCard
                        title={String(label)}
                        items={[
                          ...DT_STACK.map((s) => ({ label: s.label, value: `${fmt(m[s.key])} min`, color: s.color })),
                          { label: 'Total', value: `${fmt(m.downtime)} min`, color: INK.muted },
                        ]}
                      />
                    )
                  }}
                />
                {legend}
                {DT_STACK.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={t(s.label)}
                    stackId="dt"
                    fill={s.color}
                    // A 2px surface gap between segments keeps the boundary readable when
                    // two fills are close in value.
                    stroke="var(--surface)"
                    strokeWidth={2}
                    radius={i === DT_STACK.length - 1 ? [4, 4, 0, 0] : undefined}
                    maxBarSize={52}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* ---- Losses ---- */}
      {/* Two series, not three: Turning Rejection is rejection, and splitting it out invited
          the eye to read the smaller bar as the whole story. The breakdown still lists it. */}
      <Card title="Rework & Rejection by Month" subtitle="Pieces lost after they were made · rejection includes T.R" icon={<Activity size={18} />}>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={months} margin={{ top: 16, right: 8, left: 0, bottom: 4 }} barCategoryGap="24%">
              {grid}
              <XAxis dataKey="label" interval={0} height={30} {...axis} />
              <YAxis width={52} {...yAxis} />
              <Tooltip
                cursor={{ fill: 'rgba(42,120,214,0.06)' }}
                wrapperStyle={{ zIndex: 40 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const m = payload[0].payload as MonthRow
                  return (
                    <TooltipCard
                      title={String(label)}
                      items={[
                        { label: 'Rework', value: fmt(m.rework), color: SERIES.backlog },
                        { label: 'Rejection (incl. T.R)', value: fmt(m.rejection + m.turningRej), color: STATUS.critical },
                        { label: 'of which Turning Rejection', value: fmt(m.turningRej), color: INK.muted },
                        { label: 'Rejection PPM', value: ppm(m.rejection + m.turningRej, producedOf(m)), color: INK.muted },
                      ]}
                    />
                  )
                }}
              />
              {legend}
              <Bar dataKey="rework" name={t('Rework')} fill={SERIES.backlog} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
              <Bar dataKey="rejectionAll" name={t('Rejection (incl. T.R)')} fill={STATUS.critical} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* ---- Every figure in text as well: the table is the accessible reading of the charts
             above, and the relief the green fill's contrast requires. ---- */}
      <div className="bento rise overflow-hidden min-w-0">
        <div className="px-4 md:px-5 pt-4 pb-3 border-b border-[var(--hairline)]">
          <div className="font-bold text-slate-800">{t('Month by Month')}</div>
          <div className="text-xs text-slate-500">{t('The same figures as the charts above, in full')}</div>
        </div>
        <div className="scroll-area px-3 md:px-4 pb-4" style={{ overflowX: 'auto' }}>
          <table className="qa-grid" style={{ width: '100%', minWidth: 860 }}>
            <thead>
              <tr>
                {['Month', 'Rows', 'OEE', 'Plan', 'Achievement', 'Attainment', 'Operator', 'Management', 'Maintenance', 'Downtime', 'Rework', 'Rejection'].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={`px-2 py-2 text-[10.5px] font-bold uppercase tracking-wide text-white whitespace-nowrap ${i === 0 ? 'text-left' : 'text-right'}`}
                    >
                      {t(h)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => (
                <tr key={m.month} style={{ background: i % 2 ? 'color-mix(in srgb, var(--ink) 5%, var(--surface))' : 'var(--surface)' }}>
                  <td className="px-2 py-[7px] text-[12px] font-semibold whitespace-nowrap" style={{ color: 'var(--ink)' }}>
                    {m.label}
                  </td>
                  {[
                    m.rows ? fmt(m.rows) : '—',
                    m.oee ? pct(m.oee) : '—',
                    fmt(m.planQty),
                    fmt(m.achievement),
                    m.planQty > 0 ? pct(attain(m.plannedAch, m.planQty)) : '—',
                    fmt(m.operator),
                    fmt(m.management),
                    fmt(m.maintenance),
                    fmt(m.downtime),
                    fmt(m.rework),
                    fmt(m.rejection + m.turningRej),
                  ].map((v, c) => (
                    <td key={c} className="px-2 py-[7px] text-[12px] text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-2)' }}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
