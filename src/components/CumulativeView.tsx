import { useEffect, useMemo, useState } from 'react'
import {
  Sigma,
  CalendarPlus,
  CalendarDays,
  RotateCcw,
  Info,
  ClipboardList,
  CheckCircle2,
  Layers,
  CalendarRange,
  Pencil,
  Save,
  type LucideIcon,
} from 'lucide-react'
import {
  cumulativeForMonth,
  cumulativeUpTo,
  dailyForDate,
  daysForMonth,
  monthOf,
  type CumulativeEntry,
  type GroupTotal,
} from '../lib/cumulative'

function todayISO() {
  // Local calendar date (en-CA = YYYY-MM-DD). toISOString() would give the UTC day,
  // which is the PREVIOUS date for IST between 00:00 and 05:30.
  return new Date().toLocaleDateString('en-CA')
}
/** The calendar day before an ISO date (YYYY-MM-DD) — computed in UTC so the
 *  result never shifts by a day in timezones ahead of / behind UTC. */
function prevDay(d: string) {
  const dt = new Date(d + 'T00:00:00Z')
  dt.setUTCDate(dt.getUTCDate() - 1)
  return dt.toISOString().slice(0, 10)
}
function fmtMonth(m: string) {
  const dt = new Date(m + '-01T00:00:00')
  return Number.isNaN(dt.getTime()) ? m : dt.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}
function fmtDate(d: string) {
  const dt = new Date(d + 'T00:00:00')
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
/** Machine groups always read in this order across the app. */
const GROUP_ORDER = ['FG', 'CG', 'EG', 'IG', 'HO']
const fmt = (n: number) => Math.round(n).toLocaleString('en-IN')
const pct = (a: number, p: number) => (p > 0 ? Math.round((a / p) * 100) : 0)

function MiniStat({
  icon: Icon,
  tint,
  grad,
  label,
  value,
  sub,
  onClick,
}: {
  icon: LucideIcon
  tint: string
  grad: string
  label: string
  value: string
  sub: string
  onClick?: () => void
}) {
  return (
    <div
      className={`stat-card ${tint} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      title={onClick ? 'View group-wise detail' : undefined}
    >
      <div className="p-3 md:p-4">
        <div className={`stat-icon ${grad}`}>
          <Icon size={20} />
        </div>
        <div className="mt-2 md:mt-3 text-xl md:text-2xl font-extrabold tracking-tight text-slate-900">{value}</div>
        <div className="text-xs md:text-[13px] font-semibold text-slate-700 leading-tight">{label}</div>
        <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">{sub}</div>
      </div>
    </div>
  )
}

interface Row {
  label: string
  accent: string
  tint: string
  val: (g: string) => number
  isPct?: boolean
  edit?: (g: string, value: number) => void
}

export function CumulativeView({
  entries,
  todayGroups,
  groupsForDate,
  groups,
  onAdd,
  onReset,
  onSaveDay,
  onDetail,
}: {
  entries: CumulativeEntry[]
  todayGroups: Record<string, GroupTotal>
  /** Group totals straight from whatever Excel was uploaded for any given date. */
  groupsForDate: (date: string) => Record<string, GroupTotal>
  groups: string[]
  onAdd: (month: string, yesterday: Record<string, GroupTotal>) => void
  onReset?: (month: string) => void
  onSaveDay: (date: string, groups: Record<string, GroupTotal>) => void
  onDetail?: () => void
}) {
  const [addDate, setAddDate] = useState(todayISO())
  const [saved, setSaved] = useState(false)
  // Month follows the selected date (no separate month picker).
  const month = monthOf(addDate)
  const isToday = addDate === todayISO()

  const cum = useMemo(() => cumulativeForMonth(entries, month), [entries, month])
  const days = daysForMonth(entries, month)
  const hasData = Object.keys(cum).length > 0

  // Saved snapshot for the picked date (null = nothing was saved for it).
  const daily = useMemo(() => dailyForDate(entries, addDate), [entries, addDate])
  // Whatever Excel was actually uploaded for the picked date (works for any past date,
  // not just today) — this is what makes a historical pick show real numbers instead of blanks.
  const uploadedForDate = useMemo(() => (isToday ? {} : groupsForDate(addDate)), [groupsForDate, addDate, isToday])

  const cols = useMemo(() => {
    const all = new Set<string>(groups)
    Object.keys(todayGroups).forEach((g) => all.add(g))
    Object.keys(uploadedForDate).forEach((g) => all.add(g))
    Object.keys(cum).forEach((g) => all.add(g))
    if (daily) Object.keys(daily).forEach((g) => all.add(g))
    // Fixed column order: FG → CG → EG → IG → HO (any other group follows, A→Z).
    const rank = (g: string) => {
      const i = GROUP_ORDER.indexOf(g)
      return i === -1 ? GROUP_ORDER.length : i
    }
    return Array.from(all).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  }, [groups, todayGroups, uploadedForDate, cum, daily])

  // The day section: saved snapshot for the date → else today's live report → else that
  // date's uploaded Excel (if any) → else blank. Local edits (override) sit on top, and
  // reset whenever the date changes.
  const [yOverride, setYOverride] = useState<Record<string, Partial<GroupTotal>>>({})
  useEffect(() => {
    setYOverride({})
  }, [addDate])
  const zero: GroupTotal = { plan: 0, ach: 0, backlog: 0 }
  const baseY = (g: string): GroupTotal =>
    daily ? daily[g] ?? zero : isToday ? todayGroups[g] ?? zero : uploadedForDate[g] ?? zero
  const hasUploaded = Object.keys(uploadedForDate).length > 0
  const yPlan = (g: string) => yOverride[g]?.plan ?? baseY(g).plan
  const yAch = (g: string) => yOverride[g]?.ach ?? baseY(g).ach
  // Backlog is auto: Plan − Achievement (never negative).
  const yBack = (g: string) => Math.max(0, yPlan(g) - yAch(g))
  const setY = (g: string, field: 'plan' | 'ach' | 'backlog', value: number) =>
    setYOverride((prev) => ({ ...prev, [g]: { ...prev[g], [field]: value } }))

  // Cumulative (month-to-date) = sum of PRIOR saved days + this day's live report.
  // Past days stay fixed; adding a new day just adds on top. Backlog = Plan − Ach.
  const priorCum = useMemo(() => cumulativeUpTo(entries, month, prevDay(addDate)), [entries, month, addDate])
  const cPlan = (g: string) => (priorCum[g]?.plan ?? 0) + yPlan(g)
  const cAch = (g: string) => (priorCum[g]?.ach ?? 0) + yAch(g)
  const cBack = (g: string) => Math.max(0, cPlan(g) - cAch(g))
  const sum = (fn: (g: string) => number) => cols.reduce((t, g) => t + fn(g), 0)

  const AMBER = { accent: '#f59e0b', tint: 'rgba(245,158,11,0.10)' }
  const EMERALD = { accent: '#10b981', tint: 'rgba(16,185,129,0.10)' }
  const SKY = { accent: '#0ea5e9', tint: 'rgba(14,165,233,0.10)' }

  const yesterdayRows: Row[] = [
    { label: 'Plan Qty', ...AMBER, val: yPlan, edit: (g, v) => setY(g, 'plan', v) },
    { label: 'Achievement Qty', ...EMERALD, val: yAch, edit: (g, v) => setY(g, 'ach', v) },
    { label: 'Achievement %', accent: EMERALD.accent, tint: 'rgba(16,185,129,0.05)', val: (g) => pct(yAch(g), yPlan(g)), isPct: true },
    // Backlog is auto (Plan − Ach) — not editable.
    { label: 'Backlog Qty', ...SKY, val: yBack },
  ]
  // All cumulative rows are auto-derived (prior days + today, backlog = plan − ach) — read-only.
  const cumulativeRows: Row[] = [
    { label: 'Cumulative Plan Qty', ...AMBER, val: cPlan },
    { label: 'Cumulative Achievement Qty', ...EMERALD, val: cAch },
    { label: 'Cumulative Backlog', ...SKY, val: cBack },
    { label: 'Backlog %', accent: SKY.accent, tint: 'rgba(14,165,233,0.05)', val: (g) => pct(cBack(g), cPlan(g)), isPct: true },
  ]

  const cPlanT = sum(cPlan)
  const cAchT = sum(cAch)
  const cBackT = sum(cBack)
  const topGroup = cols
    .map((g) => ({ g, b: cBack(g) }))
    .sort((a, b) => b.b - a.b)[0]

  // average of the per-group percentages (only groups that have a plan)
  const withPlan = cols.filter((g) => cPlan(g) > 0)
  const avgAchPct = withPlan.length
    ? Math.round(withPlan.reduce((t, g) => t + pct(cAch(g), cPlan(g)), 0) / withPlan.length)
    : 0
  const avgBacklogPct = withPlan.length
    ? Math.round(withPlan.reduce((t, g) => t + pct(cBack(g), cPlan(g)), 0) / withPlan.length)
    : 0

  // Build the day's per-group totals (plan/ach/backlog) from the current (edited) values.
  const dayGroups = () => {
    const g: Record<string, GroupTotal> = {}
    cols.forEach((k) => (g[k] = { plan: yPlan(k), ach: yAch(k), backlog: yBack(k) }))
    return g
  }

  const renderRow = (r: Row) => (
    <tr key={r.label} className="hover:bg-slate-50/60">
      <td
        className="font-semibold text-slate-700 whitespace-nowrap"
        style={{ borderLeft: `4px solid ${r.accent}`, background: r.tint }}
      >
        {r.edit && <Pencil size={11} className="inline mr-1 text-slate-400" />}
        {r.label}
      </td>
      {cols.map((g) => (
        <td key={g} className="tabular-nums text-slate-600" style={{ textAlign: 'right' }}>
          {r.edit ? (
            <input
              className="cell-input num edit-visible"
              inputMode="numeric"
              data-col={g}
              value={r.val(g) || ''}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                // Excel-like: Enter jumps to the input directly BELOW (same column, next row).
                // At the bottom of a column, wrap to the top of the next column.
                const table = e.currentTarget.closest('table')
                if (!table) return
                const all = Array.from(table.querySelectorAll<HTMLInputElement>('input.cell-input'))
                const colInputs = all.filter((el) => el.dataset.col === g)
                const idx = colInputs.indexOf(e.currentTarget)
                const next = colInputs[idx + 1]
                if (next) {
                  next.focus()
                } else {
                  const ci = cols.indexOf(g)
                  const nextCol = cols[ci + 1]
                  if (nextCol) all.find((el) => el.dataset.col === nextCol)?.focus()
                }
              }}
              onChange={(e) => {
                const v = e.target.value.trim() === '' ? 0 : Number(e.target.value.replace(/,/g, ''))
                if (Number.isFinite(v)) r.edit!(g, v)
              }}
            />
          ) : r.isPct ? (
            <span style={{ color: r.accent, fontWeight: 600 }}>{r.val(g)}%</span>
          ) : (
            fmt(r.val(g))
          )}
        </td>
      ))}
    </tr>
  )

  const sectionRow = (label: string, right?: string) => (
    <tr>
      <td
        colSpan={cols.length + 1}
        className="text-[11px] font-bold uppercase tracking-wide text-slate-400 bg-slate-50 py-2 px-3"
      >
        {label}
        {right && <span className="normal-case font-medium text-slate-400 ml-2">{right}</span>}
      </td>
    </tr>
  )

  const dayNote = daily
    ? 'saved entry — editable'
    : isToday
      ? 'from current report — editable'
      : hasUploaded
        ? 'from uploaded Excel — editable'
        : 'no report uploaded for this date — type to add'

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      {/* header — title only */}
      <div className="bento bento-pad flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl grid place-items-center grad-violet text-white shrink-0">
          <Sigma size={20} />
        </div>
        <div className="flex-1 min-w-[160px]">
          <div className="font-bold text-slate-800">Daily Production Plan Summary</div>
          <div className="text-xs text-slate-500">
            {isToday ? "Today's report" : fmtDate(addDate)} + month-to-date cumulative · {days} day(s) added in{' '}
            {fmtMonth(month)}
          </div>
        </div>
      </div>

      {/* cumulative summary cards — click for group-wise detail */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-4">
        <MiniStat icon={ClipboardList} tint="tint-blue" grad="grad-blue" label="Cumulative Plan" value={fmt(cPlanT)} sub={`all groups · ${fmtMonth(month)}`} onClick={onDetail} />
        <MiniStat icon={CheckCircle2} tint="tint-emerald" grad="grad-emerald" label="Cumulative Achievement" value={fmt(cAchT)} sub={`Avg ${avgAchPct}% achievement`} onClick={onDetail} />
        <MiniStat
          icon={Layers}
          tint="tint-orange"
          grad="grad-orange"
          label="Cumulative Backlog"
          value={fmt(cBackT)}
          sub={topGroup && topGroup.b > 0 ? `Avg ${avgBacklogPct}% · ${topGroup.g} top` : `Avg ${avgBacklogPct}% backlog`}
          onClick={onDetail}
        />
        <MiniStat icon={CalendarRange} tint="tint-violet" grad="grad-violet" label="Days Added" value={String(days)} sub="this month" />
      </div>

      {/* action bar (below the cards): pick a date, add to cumulative, save the day */}
      <div className="bento bento-pad flex items-center gap-2.5 flex-wrap">
        <div className="flex items-center gap-2 bg-white rounded-xl border border-[var(--hairline)] px-3 py-1.5">
          <CalendarDays size={16} className="text-slate-400 shrink-0" />
          <span className="text-xs text-slate-400">Date</span>
          <input
            type="date"
            value={addDate}
            max={todayISO()}
            onChange={(e) => setAddDate(e.target.value || todayISO())}
            className="text-sm font-semibold text-slate-700 bg-transparent outline-none"
          />
        </div>
        <div className="text-[11px] text-slate-400 flex items-center gap-1 min-w-0">
          {daily ? (
            <>
              <CheckCircle2 size={13} className="text-emerald-500 shrink-0" /> Saved entry loaded for {fmtDate(addDate)}
            </>
          ) : isToday ? (
            <>Prefilled from current report — edit &amp; Save</>
          ) : hasUploaded ? (
            <>Prefilled from uploaded Excel for {fmtDate(addDate)} — edit &amp; Save</>
          ) : (
            <>No report uploaded for {fmtDate(addDate)} — fields are blank</>
          )}
        </div>
        <div className="flex-1 min-w-[8px]" />
        <button
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-3.5 py-2 shadow-sm transition"
          onClick={() => onAdd(month, dayGroups())}
          title="Add this day's totals into the month's cumulative"
        >
          <CalendarPlus size={15} /> Add to Cumulative
        </button>
        <button
          className={`inline-flex items-center gap-1.5 rounded-xl text-white text-sm font-semibold px-3.5 py-2 shadow-sm transition ${
            saved ? 'bg-emerald-600' : 'bg-emerald-600 hover:bg-emerald-700'
          }`}
          onClick={() => {
            onSaveDay(addDate, dayGroups())
            setSaved(true)
            window.setTimeout(() => setSaved(false), 1600)
          }}
          title="Save this day's plan/achievement — recalled when you pick this date again"
        >
          {saved ? <>✓ Saved</> : <><Save size={15} /> Save</>}
        </button>
      </div>

      {/* detailed table (no Total column) */}
      <div className="bento p-3 md:p-4">
        <div className="scroll-area" style={{ overflow: 'auto' }}>
          <table className="tbl" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ background: 'var(--surface-2)', color: 'var(--ink-2)', textAlign: 'left' }}>Type</th>
                {cols.map((g) => (
                  <th key={g} style={{ background: 'var(--surface-2)', color: 'var(--ink-2)', textAlign: 'right' }}>
                    {g}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sectionRow(isToday ? 'Today · current report' : `${fmtDate(addDate)} · report`, dayNote)}
              {yesterdayRows.map(renderRow)}
              {sectionRow('Cumulative · month-to-date', 'auto — previous days + today (backlog = plan − ach)')}
              {cumulativeRows.map(renderRow)}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap mt-2.5 px-1">
          <div className="flex items-start gap-1.5 text-[11px] text-slate-400">
            <Info size={12} className="mt-0.5 shrink-0" />
            <span>
              Pick a date to view/edit that day, <b className="mx-0.5">Save</b> to store it, or{' '}
              <b className="mx-0.5">Add to Cumulative</b> to build the month total.
            </span>
          </div>
          {hasData && onReset && (
            <button
              className="icon-btn !text-red-600 hover:!bg-red-50 hover:!border-red-200"
              onClick={() => {
                if (confirm(`Reset all cumulative totals for ${fmtMonth(month)}?`)) onReset(month)
              }}
            >
              <RotateCcw size={13} /> Reset month
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
