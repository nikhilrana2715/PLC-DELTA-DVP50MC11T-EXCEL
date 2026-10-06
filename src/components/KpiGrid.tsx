import {
  ClipboardList,
  CheckCircle2,
  Layers,
  Gauge,
  TriangleAlert,
  Timer,
  RefreshCcw,
  Ban,
  Target,
  Sigma,
  AlertOctagon,
  CalendarCheck,
  Route,
  type LucideIcon,
} from 'lucide-react'
import { ppmColor, type Kpis } from '../lib/aggregate'
import { cpkColor } from '../lib/cpk'
import { useT } from '../lib/i18n'
import { withTarget } from '../lib/unit'

export interface CpkKpi {
  avgCpk: number | null
  count: number
  below: number
  lowest: { machine: string; cp: number | null; cpk: number } | null
}
export interface CumKpi {
  plan: number
  ach: number
  backlog: number
  achPct: number
  topGroup: string
  topBacklog: number
}
export interface ReportKpi {
  count: number // repeat/unresolved machines vs previous date
  currentIssueCount: number // machines with any issue today
  hasPrev: boolean
  prevLabel: string
}

interface Tile {
  metric: string
  label: string
  value: string
  sub: string
  icon: LucideIcon
  tint: string
  grad: string
  valueColor?: string
  subColor?: string
  /** Optional compact metrics (label + value) listed under the headline, same card size. */
  secondary?: { label: string; value: string; valueColor?: string }[]
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-IN') // piece counts are always whole numbers
}

/** One "Label ————— value" line, used by the two-metric cards. */
function MetricLine({ label, value, valueColor, strong = false }: { label: string; value: string; valueColor?: string; strong?: boolean }) {
  const tr = useT()
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      {/* One line, always. Letting a long label wrap makes this card taller than the others —
          the two KPI rows are separate grids, so `items-stretch` cannot even them out again.
          The full text stays available on hover. */}
      <span
        title={tr(label)}
        className={`min-w-0 truncate ${strong ? 'text-[12px] md:text-[13px] font-semibold text-slate-700' : 'text-[11px] md:text-xs font-semibold text-slate-600'}`}
      >
        {tr(label)}
      </span>
      {/* dotted leader keeps the eye on the line when the label is short */}
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

function Card({ t, i, onClick }: { t: Tile; i: number; onClick: () => void }) {
  const tr = useT()
  return (
    <div
      // The floor is set by the tallest card (Rejection: headline + Turning Rejection + PPM) so
      // every tile in both rows is the same size, whatever it happens to hold.
      className={`stat-card ${t.tint} rise cursor-pointer h-full min-h-[138px] md:min-h-[150px]`}
      style={{ animationDelay: `${i * 40}ms` }}
      onClick={onClick}
      role="button"
      title="View breakdown"
    >
      <div className="p-3 md:p-3.5 h-full flex flex-col">
        <div className={`stat-icon stat-icon-sm ${t.grad}`}>
          <t.icon size={18} />
        </div>

        {t.secondary?.length ? (
          /* Several metrics — each on its own line with the number to the RIGHT of the label,
             the way the shop floor writes them ("Rejection — 122"). */
          <div className="mt-auto pt-1.5 flex flex-col gap-0.5">
            <MetricLine label={t.label} value={t.value} valueColor={t.valueColor} strong />
            {t.secondary.map((s) => (
              <MetricLine key={s.label} label={s.label} value={s.value} valueColor={s.valueColor} />
            ))}
            {/* A multi-metric card can still carry a footnote — the plan card spells out its hours here. */}
            {t.sub && <div className="text-[11px] mt-0.5 leading-tight text-slate-500">{tr(t.sub)}</div>}
          </div>
        ) : (
          /* Single metric. `mt-auto` sits it on the card's floor, exactly like the
             multi-metric block above, so every tile reads off the same baseline instead of
             leaving a gap under the shorter ones. */
          <div className="mt-auto pt-1.5">
            <div className="text-xs md:text-[13px] font-semibold text-slate-700 leading-tight">{tr(t.label)}</div>
            <div className="text-xl md:text-2xl font-extrabold tracking-tight leading-tight" style={{ color: t.valueColor ?? 'var(--ink)' }}>
              {t.value}
            </div>
            {t.sub && (
              <div
                className={`text-[11px] mt-0.5 leading-tight ${t.subColor ? 'font-bold' : 'text-slate-500'}`}
                style={t.subColor ? { color: t.subColor } : undefined}
              >
                {tr(t.sub)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function KpiGrid({
  k,
  cpk,
  cum,
  report,
  cpkAlertCount,
  cpkEnabled,
  cumulativeEnabled,
  todayPlanning,
  routeCard,
  planLabel,
  planNote,
  runningPlan = true,
  onCardClick,
  qualityRow = true,
}: {
  k: Kpis
  cpk: CpkKpi
  cum: CumKpi
  report: ReportKpi
  /** Machines where Cpk says "capable" yet rework/rejection happened anyway. */
  cpkAlertCount: number
  /** When false, the Cp-Cpk card is hidden from the dashboard entirely. */
  cpkEnabled: boolean
  /** When false, the Cumulative card is hidden from the dashboard entirely. */
  cumulativeEnabled: boolean
  /** When false, the whole Quality, Losses & Cumulative row is left out. See hasQualityRow. */
  qualityRow?: boolean
  /** Today's quantity from the Monthly Planning sheet for the CURRENT calendar month.
   *  Independent of the report date being viewed — it always answers "what is planned
   *  for today". Absent when no plan is uploaded for this month. */
  todayPlanning?: {
    value: number
    date: string
    hasPlan: boolean
    title: string
    measure?: 'pcs' | 'kg'
    /** The month's outstanding quantity — shown on the same card, see below. */
    board?: { monthBacklog: number | null }
  }
  /** Route cards running out of time — not closed, and already past 25 of their 28 days —
   *  in the month's register from the Monthly Report workbook. Absent, or with `hasData`
   *  false, the card is left off entirely: that is every workspace that has never uploaded
   *  a route card. */
  routeCard?: { due: number; register: string; hasData: boolean }
  /** "8 Hrs Plan Qty" for one shift, "16 Hrs Plan Qty" when both are combined. */
  planLabel: string
  /** Spelled-out hours, for a unit whose machines do not all run the same day. */
  planNote?: string
  /** When false, the plan card drops its Actual Running Plan line. See hasRunningPlan. */
  runningPlan?: boolean
  onCardClick: (metric: string) => void
}) {
  const tr = useT()
  const main: Tile[] = [
    // Monthly Planning's figure for today. Shown first: it is the day's target, which the
    // rest of the row then reports against.
    {
      metric: 'todayPlanning',
      label: 'Today Planning',
      value: todayPlanning?.hasPlan
        ? `${fmt(todayPlanning.value)}${todayPlanning.measure === 'kg' ? ' kg' : ''}`
        : '—',
      sub: todayPlanning?.hasPlan
        ? `${new Date(todayPlanning.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} · ${todayPlanning.title}`
        : 'no monthly plan for this month',
      // Today's target and what the month still owes, on one card: the meeting reads them
      // together — "this is today, and this is how far behind we still are."
      secondary:
        todayPlanning?.board && todayPlanning.board.monthBacklog !== null
          ? [{ label: 'Monthly Backlog', value: fmt(todayPlanning.board.monthBacklog), valueColor: '#ea580c' }]
          : undefined,
      icon: CalendarCheck,
      tint: 'tint-emerald',
      grad: 'grad-emerald',
    },
    {
      metric: 'plan',
      label: planLabel,
      value: fmt(k.planned),
      sub: planNote ?? '',
      // Only where the sheet actually has one — elsewhere it could never be anything but 0.
      secondary: runningPlan ? [{ label: 'Actual Running Plan', value: fmt(k.running_qty) }] : undefined,
      icon: ClipboardList,
      tint: 'tint-blue',
      grad: 'grad-blue',
    },
    {
      metric: 'achievement',
      label: 'Achievement',
      value: fmt(k.achievement),
      sub: `${k.planAttainment.toFixed(0)}% of plan`,
      icon: CheckCircle2,
      tint: 'tint-emerald',
      grad: 'grad-emerald',
    },
    {
      metric: 'backlog',
      label: 'Backlog',
      value: fmt(k.backlog),
      sub: 'pending vs running plan',
      icon: Layers,
      tint: 'tint-orange',
      grad: 'grad-orange',
    },
    {
      metric: 'efficiency',
      label: 'Overall Efficiency',
      value: `${k.overallEfficiency.toFixed(0)}%`,
      sub: `avg ${k.avgEfficiency.toFixed(0)}% per machine`,
      icon: Gauge,
      tint: 'tint-violet',
      grad: 'grad-violet',
    },
    {
      metric: 'downtime',
      label: 'Downtime',
      value: k.totalDowntime ? fmt(k.totalDowntime) : '—',
      sub: k.totalDowntime ? 'total recorded' : 'see remarks',
      icon: Timer,
      tint: 'tint-yellow',
      grad: 'grad-yellow',
    },
  ]

  const quality: Tile[] = [
    // Below Target sits here, not in the top row: it counts machines that LOST output,
    // which is the same story as rework / rejection / repeat issues. It also makes both
    // rows exactly six cards wide.
    {
      metric: 'belowTarget',
      label: 'Below Target',
      value: `${k.criticalCount}`,
      sub: withTarget('machines under 75%'),
      icon: TriangleAlert,
      tint: 'tint-red',
      grad: 'grad-red',
    },
    {
      // Rework carries its PPM the same way Rejection does — the count alone hides whether a
      // big number came off a big run or a small one.
      metric: 'rework',
      label: 'Rework',
      value: fmt(k.rework),
      sub: 'total pieces reworked',
      icon: RefreshCcw,
      tint: 'tint-yellow',
      grad: 'grad-yellow',
      secondary: [{ label: 'PPM', value: fmt(k.reworkPpm), valueColor: ppmColor(k.reworkPpm) }],
    },
    {
      // Rejection, Turning Rejection and PPM share one card — turning rejection is a subset of
      // the quality story, and PPM is the same rejection rated against what was actually made,
      // so a small count on a small run still reads as the problem it is.
      metric: 'rejection',
      label: 'Rejection',
      value: fmt(k.rejection),
      sub: 'total pieces rejected',
      icon: Ban,
      tint: 'tint-red',
      grad: 'grad-red',
      secondary: [
        { label: 'Turning Rejection', value: fmt(k.turningRejection) },
        { label: 'PPM', value: fmt(k.rejectionPpm), valueColor: ppmColor(k.rejectionPpm) },
      ],
    },
    {
      metric: 'cpk',
      label: cpk.lowest ? `Cp-Cpk · ${cpk.lowest.machine} (lowest)` : 'Cp-Cpk',
      value: cpk.lowest ? `Cpk ${cpk.lowest.cpk.toFixed(2)}` : '—',
      sub: cpkAlertCount
        ? `⚠ ${cpkAlertCount} quality alert${cpkAlertCount > 1 ? 's' : ''} · ${cpk.below} below 1.33`
        : cpk.lowest
          ? `Cp ${cpk.lowest.cp ?? '—'} · ${cpk.below} below 1.33`
          : 'no data yet',
      subColor: cpkAlertCount ? '#d03b3b' : undefined,
      icon: Target,
      tint: cpkAlertCount ? 'tint-red' : 'tint-blue',
      grad: cpkAlertCount ? 'grad-red' : 'grad-blue',
      valueColor: cpk.lowest ? cpkColor(cpk.lowest.cpk) : undefined,
    },
    {
      metric: 'cumulative',
      label: cum.topGroup ? `Cumulative · ${cum.topGroup} top backlog` : 'Cumulative Backlog',
      value: cum.plan ? fmt(cum.backlog) : '—',
      sub: cum.topGroup
        ? `${cum.topGroup} ${fmt(cum.topBacklog)} · ach ${cum.achPct}%`
        : 'add days to build',
      icon: Sigma,
      tint: 'tint-violet',
      grad: 'grad-violet',
    },
    // Route cards running out of time. Not part of the day's report at all — it comes from
    // the Monthly Report workbook — but it belongs on this row, because a card that misses
    // its 28 days is a loss the same way rework and rejection are. Only the ones with days
    // left to act on: a list of everything still open is a register, not a meeting item.
    ...(routeCard?.hasData
      ? [
          {
            metric: 'routecard',
            label: 'Route Card Deadline',
            value: fmt(routeCard.due),
            sub: routeCard.due
              ? `open 25+ days · ${routeCard.register} · tap for the list`
              : `nothing past 25 days · ${routeCard.register}`,
            subColor: routeCard.due ? '#d03b3b' : undefined,
            valueColor: routeCard.due ? '#ea580c' : undefined,
            icon: Route,
            tint: routeCard.due ? 'tint-red' : 'tint-emerald',
            grad: routeCard.due ? 'grad-red' : 'grad-emerald',
          } as Tile,
        ]
      : []),
    {
      metric: 'reporting',
      label: 'Repeating Issues',
      value: report.hasPrev ? `${report.count}` : '—',
      sub: report.hasPrev
        ? `repeat since ${report.prevLabel} · ${report.currentIssueCount} today`
        : 'no earlier day to compare',
      icon: AlertOctagon,
      tint: 'tint-red',
      grad: 'grad-red',
    },
  ]

  const shownQuality = quality.filter(
    (t) => (cpkEnabled || t.metric !== 'cpk') && (cumulativeEnabled || t.metric !== 'cumulative'),
  )

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5 md:gap-4 items-stretch">
        {main.map((t, i) => (
          <Card key={t.metric} t={t} i={i} onClick={() => onCardClick(t.metric)} />
        ))}
      </div>

      {qualityRow && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5 px-1">
            {tr('Quality, Losses & Cumulative')}
          </div>
          {/* Both column counts are written out so Tailwind actually generates them: seven
              tiles across seven columns beats six and a lone card on a second line. */}
          <div
            className={`grid grid-cols-2 lg:grid-cols-3 ${
              shownQuality.length > 6 ? 'xl:grid-cols-7' : 'xl:grid-cols-6'
            } gap-2.5 md:gap-4 items-stretch`}
          >
            {shownQuality.map((t, i) => (
              <Card key={t.metric} t={t} i={i} onClick={() => onCardClick(t.metric)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
