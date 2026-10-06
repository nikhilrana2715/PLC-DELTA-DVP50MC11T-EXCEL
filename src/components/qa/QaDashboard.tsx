import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, ChartTip, NoRows, WrapTick, C, EMPTY_INK, FOOT_BG, PLOT, ROW_BG, onSurface, wrapAxisHeight } from './qaUi'
import { CustomerAnalysis, DefectAnalysis, ProductAnalysis } from './QaAnalysisTabs'
import { QaSheetView } from './QaSheetView'
import { monthLabel, type QaSheet } from '../../lib/qaSheets'
import {
  Menu,
  RefreshCw,
  Filter,
  RotateCcw,
  UploadCloud,
  FileSpreadsheet,
  ClipboardList,
  Package,
  Users,
  Boxes,
  ListChecks,
  CheckCircle2,
  RefreshCcw,
  Ban,
  Percent,
  CalendarClock,
  AlertTriangle,
  ChevronDown,
  Search,
  X,
} from 'lucide-react'
import { KpiBreakdownModal, type BreakdownData } from '../KpiBreakdownModal'
import { INK } from '../../lib/palette'
import { useT } from '../../lib/i18n'
import {
  EMPTY_FILTERS,
  buildModel,
  filterOptions,
  getQaRaw,
  fmtInt,
  fmtPct,
  defectCategory,
  canonObservation,
  type MonthPivot,
  type QaFilters,
  type QaRaw,
} from '../../lib/qa'


const TABS = [
  'Executive Summary',
  'Customer Analysis',
  'Product Analysis',
  'Defect Analysis',
] as const
type Tab = (typeof TABS)[number]

/**
 * The QA upload is really TWO sheets with different columns:
 *   skf = "Customer Goods Return"  (customer, item, return qty, ok, rejection)
 *   obs = "MRS Observation"        (item, received qty, observation, rework)
 * Only some numbers exist on each side, so mixing them in one view hides which sheet a
 * figure came from. This picker splits them the way Shift 1 / Shift 2 splits the morning
 * meeting: choose one and every KPI, table, chart and tab narrows to that sheet alone.
 */
export type QaSource = 'both' | 'skf' | 'obs'
const SOURCES: { id: QaSource; label: string }[] = [
  { id: 'both', label: 'Both' },
  { id: 'skf', label: 'Goods Return' },
  { id: 'obs', label: 'Observation' },
]
/** Which sheet each analysis tab reads from; 'both' tabs always stay available. */
const TAB_SOURCE: Record<Tab, QaSource> = {
  'Executive Summary': 'both',
  'Customer Analysis': 'skf',
  'Product Analysis': 'both',
  'Defect Analysis': 'obs',
}
const showsFor = (want: QaSource, source: QaSource) => source === 'both' || want === 'both' || want === source

/* ---------- KPI colour palette ----------
   The tint is mixed over --surface so the cards stay readable in BOTH themes:
   a pale wash on white in light mode, a subtle tinted panel on dark. */
const KPI_ACCENT: Record<string, string> = {
  blue: '#3a7bd5',
  emerald: '#2e9e5b',
  violet: '#7c4dbc',
  orange: '#e8952f',
  red: '#d9534f',
  teal: '#17a2a8',
  yellow: '#d9a400',
}
const kpiTint = (accent: string) => ({
  background: `color-mix(in srgb, ${accent} 12%, var(--surface))`,
  borderColor: `color-mix(in srgb, ${accent} 28%, var(--surface))`,
})

/* ---------- small building blocks ---------- */
function Kpi({
  label,
  value,
  suffix,
  sub,
  icon,
  tint,
  onClick,
}: {
  label: string
  value: string
  /** Secondary reading shown after a slash, at a smaller weight — e.g. "42,100 PPM". */
  suffix?: string
  /** Small caption under the number — e.g. the customer name when one is filtered. */
  sub?: string
  icon: React.ReactNode
  tint: keyof typeof KPI_ACCENT
  onClick?: () => void
}) {
  const t = useT()
  const accent = KPI_ACCENT[tint]
  return (
    <div
      className={`rounded-xl border shadow-sm px-4 py-3 transition ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''}`}
      style={kpiTint(accent)}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      title={onClick ? 'View breakdown' : undefined}
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg grid place-items-center text-white shrink-0 shadow-sm" style={{ background: accent }}>
          {icon}
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-wide leading-tight" style={{ color: 'var(--ink-2)' }}>
          {t(label)}
        </div>
      </div>
      <div className="text-2xl font-extrabold mt-1.5 leading-tight" style={{ color: 'var(--ink)' }}>
        {value}
        {suffix && (
          <>
            {/* The space must sit OUTSIDE the nowrap span, otherwise there is no break
                opportunity and the pair overflows a narrow (2-col mobile) card. */}
            {' '}
            <span className="text-[13px] font-bold whitespace-nowrap" style={{ color: 'var(--ink-2)' }}>
              / {suffix}
            </span>
          </>
        )}
      </div>
      {sub && (
        <div className="text-[11px] font-semibold leading-tight mt-0.5 truncate" style={{ color: 'var(--ink-2)' }} title={sub}>
          {sub}
        </div>
      )}
    </div>
  )
}

/* ---------- Live clock (isolated so only this re-renders every second) ---------- */
function LiveClock() {
  const t = useT()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="text-right leading-tight">
      <div className="text-[10px] text-slate-500 flex items-center gap-1 justify-end">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {t('Live')}
      </div>
      <div className="text-[12px] font-bold text-slate-700 tabular-nums">
        {now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        {' · '}
        {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
      </div>
    </div>
  )
}

/* ---------- Filters panel ---------- */
/**
 * Every filter is multi-select and picks its values in a MODAL popup rather than in a
 * list that expands inside the sidebar. The sidebar is `overflow-y-auto`, so an inline
 * list both pushed the Apply button off-screen and could not show many options at once;
 * a `position: fixed` dialog escapes that scroll box entirely and gets the full screen
 * height for the list (the Observation filter has 130+ values).
 */

/** One row in the picker list. */
function OptionRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <label
      className="flex items-start gap-2.5 px-4 py-2 cursor-pointer text-[13px] hover:brightness-95 transition"
      style={on ? { background: 'color-mix(in srgb, #3a7bd5 12%, var(--surface))' } : undefined}
    >
      <input type="checkbox" checked={on} onChange={onToggle} className="mt-[3px] shrink-0 w-4 h-4 accent-blue-600" />
      <span className={on ? 'font-semibold' : ''} style={{ color: on ? 'var(--ink)' : 'var(--ink-2)' }}>
        {label}
      </span>
    </label>
  )
}

/** The value picker itself — a centred dialog, full-height list, search and bulk actions. */
function FilterPicker({
  label,
  opts,
  values,
  show,
  onChange,
  onClose,
}: {
  label: string
  opts: string[]
  values: string[]
  show: (o: string) => string
  onChange: (v: string[]) => void
  onClose: () => void
}) {
  const t = useT()
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const shown = query ? opts.filter((o) => show(o).toLowerCase().includes(query)) : opts
  const toggle = (o: string) => onChange(values.includes(o) ? values.filter((v) => v !== o) : [...values, o])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // PORTAL to <body>. Rendered in place (inside <aside>) the dialog sat in the same
  // stacking context as the data tables, whose sticky header/Total cells carry their own
  // z-index — they painted straight through the dialog. A portal takes it out of that
  // subtree entirely, so nothing in the page can stack above it.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--surface)', maxHeight: 'min(86vh, 620px)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t(label)}
      >
        {/* header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--hairline)' }}>
          <div className="flex-1 min-w-0">
            <div className="qa-heading text-[14px] font-extrabold uppercase tracking-wide truncate">{t(label)}</div>
            <div className="text-[11.5px]" style={{ color: 'var(--ink-muted)' }}>
              {opts.length} {t('options')} · {values.length} {t('selected')}
            </div>
          </div>
          <button onClick={onClose} aria-label={t('Close')} className="shrink-0 w-8 h-8 grid place-items-center rounded-lg hover:brightness-90" style={{ color: 'var(--ink-2)' }}>
            <X size={18} />
          </button>
        </div>

        {/* search */}
        {opts.length > 8 && (
          <div className="px-4 pt-3">
            <div className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5" style={{ borderColor: 'var(--hairline)' }}>
              <Search size={14} className="shrink-0" style={{ color: 'var(--ink-muted)' }} />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('Search…')}
                className="w-full text-[13px] outline-none bg-transparent"
                style={{ color: 'var(--ink)' }}
              />
              {q && (
                <button onClick={() => setQ('')} aria-label={t('Clear')} className="shrink-0" style={{ color: 'var(--ink-muted)' }}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* bulk actions */}
        <div className="flex items-center justify-between px-4 py-2 text-[12px] font-bold">
          <button onClick={() => onChange([...new Set([...values, ...shown])])} style={{ color: onSurface(C.bar) }}>
            {t('Select all')} ({shown.length})
          </button>
          <button onClick={() => onChange([])} style={{ color: 'var(--ink-2)' }} disabled={values.length === 0}>
            {t('Clear all')}
          </button>
        </div>

        {/* list */}
        <div className="scroll-area flex-1 overflow-y-auto border-y" style={{ borderColor: 'var(--hairline)' }}>
          {shown.length === 0 ? (
            <div className="py-10 text-center text-[13px]" style={{ color: 'var(--ink-muted)' }}>
              {t('No match')}
            </div>
          ) : (
            shown.map((o) => <OptionRow key={o} label={show(o)} on={values.includes(o)} onToggle={() => toggle(o)} />)
          )}
        </div>

        {/* footer */}
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex-1 text-[12px] font-semibold" style={{ color: 'var(--ink-2)' }}>
            {values.length ? `${values.length} ${t('selected')}` : t('All')}
          </span>
          <button onClick={onClose} className="rounded-lg text-white font-bold text-[13px] px-5 py-2 shadow-sm" style={{ background: C.barDark }}>
            {t('Done')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * The compact sidebar control: label, a summary button that opens the picker, and a chip
 * per selected value so the active filter is readable without opening anything.
 */
// Module-level (stable identity) — an inline component would remount on every parent
// re-render, losing the picker's search state mid-keystroke.
function FilterField({
  label,
  values,
  onOpen,
  onChange,
  translateOpts = false,
}: {
  label: string
  values: string[]
  onOpen: () => void
  onChange: (v: string[]) => void
  /** Only for app-defined vocabularies (Status). Customer / item / defect values are DATA:
   *  running them through t() would silently translate any value that collides with a
   *  dictionary key (e.g. a defect literally named "Rework"). */
  translateOpts?: boolean
}) {
  const t = useT()
  const show = (o: string) => (translateOpts ? t(o) : o)
  const summary = values.length === 0 ? t('All') : values.length === 1 ? show(values[0]) : `${values.length} ${t('selected')}`

  return (
    <div>
      <span className="text-[12px] font-semibold" style={{ color: 'var(--ink-2)' }}>
        {t(label)}
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="mt-1 w-full flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-2 text-left transition hover:border-blue-400"
        style={{ borderColor: values.length ? C.bar : undefined }}
      >
        <span className={`flex-1 min-w-0 truncate text-sm ${values.length ? 'font-semibold text-slate-800' : 'text-slate-500'}`} title={values.map(show).join(', ')}>
          {summary}
        </span>
        {values.length > 1 && (
          <span className="shrink-0 text-[10px] font-bold text-white rounded-full px-1.5 py-[1px]" style={{ background: C.bar }}>
            {values.length}
          </span>
        )}
        <ChevronDown size={15} className="shrink-0 text-slate-400" />
      </button>

      {/* chips — visible at a glance, each removable without opening the picker */}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {values.slice(0, 6).map((v) => (
            <button
              key={v}
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="inline-flex items-center gap-1 max-w-full rounded-full pl-2 pr-1 py-[2px] text-[10.5px] font-semibold"
              style={{ background: `color-mix(in srgb, ${C.bar} 16%, var(--surface))`, color: onSurface(C.bar) }}
              title={`${t('Remove')} ${show(v)}`}
            >
              <span className="truncate max-w-[112px]">{show(v)}</span>
              <X size={11} className="shrink-0" />
            </button>
          ))}
          {values.length > 6 && (
            <span className="text-[10.5px] font-semibold self-center" style={{ color: 'var(--ink-muted)' }}>
              +{values.length - 6}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function Filters({
  filters,
  options,
  onChange,
  onApply,
  onReset,
  source,
  onSource,
}: {
  filters: QaFilters
  options: ReturnType<typeof filterOptions> & { sheet: string[] }
  onChange: (f: QaFilters) => void
  onApply: () => void
  onReset: () => void
  source: QaSource
  onSource: (s: QaSource) => void
}) {
  const t = useT()
  const [openKey, setOpenKey] = useState<keyof QaFilters | null>(null)
  // Mobile only: the panel is collapsed so the dashboard is the first thing on screen.
  const [openOnMobile, setOpenOnMobile] = useState(false)
  const set = (k: keyof QaFilters) => (v: string[]) => onChange({ ...filters, [k]: v })
  const total = Object.values(filters).reduce((s, v) => s + v.length, 0)

  const FIELDS: { key: keyof QaFilters; label: string; opts: string[]; translate?: boolean }[] = [
    { key: 'month', label: 'Month', opts: options.month },
    { key: 'year', label: 'Year', opts: options.year },
    { key: 'customer', label: 'Customer', opts: options.customer },
    { key: 'sheet', label: 'Sheet', opts: options.sheet },
  ]
  const active = openKey ? FIELDS.find((f) => f.key === openKey) : null

  return (
    <aside className="w-full lg:w-60 shrink-0 bg-white lg:bg-[#f4f8fc] lg:border-r border-slate-200 p-4 lg:sticky lg:top-[68px] lg:self-start lg:h-[calc(100vh-68px)] lg:overflow-y-auto scroll-area">
      {/* header — doubles as the show/hide toggle on mobile */}
      <button
        onClick={() => setOpenOnMobile((v) => !v)}
        className="w-full flex items-center gap-2 lg:cursor-default"
        aria-expanded={openOnMobile}
      >
        <Filter size={16} className="qa-heading" />
        <span className="qa-heading font-extrabold tracking-wide">{t('FILTERS')}</span>
        {total > 0 && (
          <span className="text-[10px] font-bold text-white rounded-full px-2 py-[2px]" style={{ background: C.bar }}>
            {total}
          </span>
        )}
        <ChevronDown size={16} className={`ml-auto lg:hidden text-slate-400 transition ${openOnMobile ? 'rotate-180' : ''}`} />
      </button>

      <div className={`${openOnMobile ? 'grid' : 'hidden'} lg:grid grid-cols-2 lg:grid-cols-1 gap-3 mt-3`}>
        {FIELDS.map((f) => (
          <FilterField
            key={f.key}
            label={f.label}
            values={filters[f.key]}
            onOpen={() => setOpenKey(f.key)}
            onChange={set(f.key)}
            translateOpts={f.translate}
          />
        ))}

        {/* Sheet picker — sits directly under Status, and unlike the filters above it takes
            effect immediately (there is nothing to "apply": it only changes what is shown). */}
        <div className="col-span-2 lg:col-span-1">
          <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--ink-hint)' }}>
            {t('Summary Source')}
          </div>
          <div className="flex flex-col gap-1" role="radiogroup" aria-label={t('Summary Source')}>
            {SOURCES.map((sc) => (
              <button
                key={sc.id}
                role="radio"
                aria-checked={source === sc.id}
                onClick={() => onSource(sc.id)}
                className={`w-full rounded-lg text-[12.5px] font-bold py-2 px-2.5 text-left transition border ${
                  source === sc.id ? 'text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
                style={source === sc.id ? { background: C.barDark, borderColor: C.barDark } : { borderColor: '#cbd5e1' }}
              >
                {t(sc.label)}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onApply}
          className="col-span-2 lg:col-span-1 mt-1 w-full rounded-lg text-white font-bold text-sm py-2.5 shadow-sm"
          style={{ background: C.barDark }}
        >
          {t('APPLY FILTERS')}
        </button>
        <button
          onClick={() => {
            setOpenKey(null)
            onReset()
          }}
          disabled={total === 0}
          className="col-span-2 lg:col-span-1 w-full rounded-lg border border-slate-300 text-slate-600 font-bold text-sm py-2.5 hover:bg-slate-50 disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
        >
          <RotateCcw size={14} /> {t('RESET FILTERS')}
        </button>
      </div>

      {active && (
        <FilterPicker
          label={active.label}
          opts={active.opts}
          values={filters[active.key]}
          show={(o) => (active.translate ? t(o) : o)}
          onChange={set(active.key)}
          onClose={() => setOpenKey(null)}
        />
      )}
    </aside>
  )
}

/* ---------- main ---------- */
export function QaDashboard({ onMenu, onUpload, dataVersion = 0 }: { onMenu?: () => void; onUpload?: () => void; dataVersion?: number }) {
  const [raw, setRaw] = useState<QaRaw | null>(null)
  const [err, setErr] = useState('')
  const [draft, setDraft] = useState<QaFilters>(EMPTY_FILTERS)
  const [applied, setApplied] = useState<QaFilters>(EMPTY_FILTERS)
  const [tab, setTab] = useState<Tab>('Executive Summary')
  const [source, setSource] = useState<QaSource>('both')
  const [reload, setReload] = useState(0)
  const [kpiModal, setKpiModal] = useState<BreakdownData | null>(null)
  const t = useT()

  useEffect(() => {
    getQaRaw()
      .then((r) => setRaw(r))
      .catch((e) => setErr(String(e.message || e)))
  }, [dataVersion, reload])

  const sheets: QaSheet[] = useMemo(() => raw?.sheets ?? [], [raw])
  const options = useMemo(
    () => (raw ? { ...filterOptions(raw), sheet: sheets.map((x) => x.name) } : null),
    [raw, sheets],
  )
  // Months the Month/Year filters allow, as YYYY-MM — the sheet views slice their columns
  // by this so a filtered month range narrows the charts too.
  const allowedMonths = useMemo(() => {
    const all = [...new Set(sheets.flatMap((x) => (x.kind === 'matrix' ? x.months : [])))]
    const byMonth = applied.month.length ? all.filter((m) => applied.month.includes(monthLabel(m).split('-')[0])) : all
    return applied.year.length ? byMonth.filter((m) => applied.year.some((y) => y.includes(m.slice(2, 4)))) : byMonth
  }, [sheets, applied.month, applied.year])
  const activeSheet = useMemo(
    () => sheets.find((x) => x.name === applied.sheet[0]) ?? null,
    [sheets, applied.sheet],
  )
  const model = useMemo(() => (raw ? buildModel(raw, applied) : null), [raw, applied])

  if (err)
    return (
      <div className="p-8 text-center text-red-600 font-semibold">
        Could not load QA data: {err}
        <div className="text-slate-500 text-sm mt-2 font-normal">Please refresh and try again.</div>
      </div>
    )
  if (!raw || !model || !options) return <div className="p-8 text-center text-slate-500">Loading QA dashboard…</div>

  const k = model.kpis
  const isEmpty = raw.skf.length === 0 && raw.obs.length === 0

  // ---- KPI card drill-down (click any card → related breakdown popup) ----
  const openKpi = (label: string) => {
    const s = model.skf
    const o = model.obs
    const sum = <T,>(a: T[], g: (t: T) => number) => a.reduce((x, t) => x + g(t), 0)
    // group skf rows by a key
    const grpSkf = (keyFn: (r: (typeof s)[number]) => string) => {
      const m = new Map<string, { qty: number; ok: number; rej: number; ret: number }>()
      for (const r of s) {
        const key = keyFn(r) || '—'
        const c = m.get(key) || { qty: 0, ok: 0, rej: 0, ret: 0 }
        c.qty += r.qty
        c.ok += r.ok
        c.rej += r.rejection
        c.ret += 1
        m.set(key, c)
      }
      return [...m.entries()]
    }
    const grpObs = (keyFn: (r: (typeof o)[number]) => string) => {
      const m = new Map<string, { recv: number; rw: number; arw: number; cnt: number }>()
      for (const r of o) {
        const key = keyFn(r) || '—'
        const c = m.get(key) || { recv: 0, rw: 0, arw: 0, cnt: 0 }
        c.recv += r.received
        c.rw += r.rework
        c.arw += r.afterReworkOk
        c.cnt += 1
        m.set(key, c)
      }
      return [...m.entries()]
    }

    switch (label) {
      case 'Total Return Qty': {
        const rows = grpSkf((r) => r.item).sort((a, b) => b[1].qty - a[1].qty).map(([item, v]) => ({ item, ret: fmtInt(v.ret), qty: fmtInt(v.qty) }))
        setKpiModal({
          title: 'Total Return Qty — by product',
          columns: [{ key: 'item', label: 'Product', primary: true }, { key: 'ret', label: 'Returns', align: 'right' }, { key: 'qty', label: 'Return Qty', align: 'right' }],
          rows,
          total: { ret: fmtInt(s.length), qty: fmtInt(sum(s, (r) => r.qty)) },
        })
        break
      }
      case 'Total Customers': {
        const rows = grpSkf((r) => r.customer).sort((a, b) => b[1].qty - a[1].qty).map(([c, v]) => ({ c, ret: fmtInt(v.ret), qty: fmtInt(v.qty), ok: fmtInt(v.ok), rej: fmtInt(v.rej) }))
        setKpiModal({
          title: 'Total Customers — return summary',
          note: applied.customer.length ? applied.customer.join(", ") : undefined,
          columns: [{ key: 'c', label: 'Customer', primary: true }, { key: 'ret', label: 'Returns', align: 'right' }, { key: 'qty', label: 'Return Qty', align: 'right' }, { key: 'ok', label: 'Good', align: 'right' }, { key: 'rej', label: 'Rejection', align: 'right' }],
          rows,
          total: { ret: fmtInt(s.length), qty: fmtInt(sum(s, (r) => r.qty)), ok: fmtInt(sum(s, (r) => r.ok)), rej: fmtInt(sum(s, (r) => r.rejection)) },
        })
        break
      }
      case 'Total Products': {
        const rows = grpSkf((r) => r.item).sort((a, b) => b[1].qty - a[1].qty).map(([item, v]) => ({ item, ret: fmtInt(v.ret), qty: fmtInt(v.qty), rej: fmtInt(v.rej) }))
        setKpiModal({
          title: 'Total Products — return summary',
          columns: [{ key: 'item', label: 'Product', primary: true }, { key: 'ret', label: 'Returns', align: 'right' }, { key: 'qty', label: 'Return Qty', align: 'right' }, { key: 'rej', label: 'Rejection', align: 'right' }],
          rows,
          total: { ret: fmtInt(s.length), qty: fmtInt(sum(s, (r) => r.qty)), rej: fmtInt(sum(s, (r) => r.rejection)) },
        })
        break
      }
      case 'Total Returns':
      case 'Avg Return Qty / Month': {
        const rows = grpSkf((r) => r.month).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([mth, v]) => ({ mth, ret: fmtInt(v.ret), qty: fmtInt(v.qty) }))
        const months = new Set(s.map((r) => r.month)).size
        setKpiModal({
          title: label === 'Total Returns' ? 'Total Returns — by month' : 'Avg Return Qty / Month — by month',
          note: label === 'Avg Return Qty / Month' ? `Total Return Qty (${fmtInt(sum(s, (r) => r.qty))}) ÷ ${months} month(s) = ${fmtInt(k.avgReturnQtyPerMonth)}` : undefined,
          columns: [{ key: 'mth', label: 'Month', primary: true }, { key: 'ret', label: 'Returns', align: 'right' }, { key: 'qty', label: 'Return Qty', align: 'right' }],
          rows,
          total: { ret: fmtInt(s.length), qty: fmtInt(sum(s, (r) => r.qty)) },
        })
        break
      }
      case 'Good Qty': {
        const rows = grpSkf((r) => r.item).filter(([, v]) => v.ok > 0).sort((a, b) => b[1].ok - a[1].ok).map(([item, v]) => ({ item, ok: fmtInt(v.ok), qty: fmtInt(v.qty) }))
        setKpiModal({
          title: 'Good Qty — by product',
          columns: [{ key: 'item', label: 'Product', primary: true }, { key: 'ok', label: 'Good Qty', align: 'right' }, { key: 'qty', label: 'Return Qty', align: 'right' }],
          rows,
          total: { ok: fmtInt(sum(s, (r) => r.ok)), qty: fmtInt(sum(s, (r) => r.qty)) },
        })
        break
      }
      case 'Final Scrap': {
        const rows = grpSkf((r) => r.item).filter(([, v]) => v.rej > 0).sort((a, b) => b[1].rej - a[1].rej).map(([item, v]) => ({ item, rej: fmtInt(v.rej), qty: fmtInt(v.qty) }))
        setKpiModal({
          title: 'Final Scrap — by product',
          columns: [{ key: 'item', label: 'Product', primary: true }, { key: 'rej', label: 'Final Scrap', align: 'right' }, { key: 'qty', label: 'Return Qty', align: 'right' }],
          rows,
          total: { rej: fmtInt(sum(s, (r) => r.rejection)), qty: fmtInt(sum(s, (r) => r.qty)) },
        })
        break
      }
      case 'Total Number of Incidence': {
        const rows = grpObs((r) => canonObservation(r.observation)).sort((a, b) => b[1].cnt - a[1].cnt).map(([obs, v]) => ({ obs, cat: defectCategory(obs), cnt: fmtInt(v.cnt), recv: fmtInt(v.recv) }))
        setKpiModal({
          title: 'Total Number of Incidence — by observation',
          columns: [{ key: 'obs', label: 'Observation', primary: true, wrap: true }, { key: 'cat', label: 'Category' }, { key: 'cnt', label: 'Incidence', align: 'right' }, { key: 'recv', label: 'Received Qty', align: 'right' }],
          rows,
          total: { cnt: fmtInt(o.length), recv: fmtInt(sum(o, (r) => r.received)) },
        })
        break
      }
      case 'OK Qty': {
        const rows = grpObs((r) => canonObservation(r.observation)).filter(([, v]) => v.rw > 0 || v.arw > 0).sort((a, b) => b[1].arw - a[1].arw).map(([obs, v]) => ({ obs, rw: fmtInt(v.rw), arw: fmtInt(v.arw) }))
        setKpiModal({
          title: 'OK Qty (after rework) — by observation',
          columns: [{ key: 'obs', label: 'Observation', primary: true, wrap: true }, { key: 'rw', label: 'Rework Qty', align: 'right' }, { key: 'arw', label: 'OK Qty', align: 'right' }],
          rows,
          total: { rw: fmtInt(sum(o, (r) => r.rework)), arw: fmtInt(sum(o, (r) => r.afterReworkOk)) },
        })
        break
      }
      case 'Defect % / PPM': {
        setKpiModal({
          title: 'Defect % / PPM — calculation',
          note: 'Defect % = Final Scrap ÷ Total Return Qty × 100   •   PPM = Final Scrap ÷ Total Return Qty × 1,000,000',
          columns: [{ key: 'metric', label: 'Metric', primary: true }, { key: 'value', label: 'Value', align: 'right' }],
          rows: [
            { metric: 'Total Return Qty', value: fmtInt(k.totalReturnQty) },
            { metric: 'Final Scrap', value: fmtInt(k.afterRejection) },
            { metric: 'Defect %', value: fmtPct(k.defectPct) },
            { metric: 'Defect PPM', value: fmtInt(k.defectPpm) },
          ],
        })
        break
      }
    }
  }

  // ---- pivot row drill-down: one row of a table, month by month ----
  const openPivotRow = (title: string, unit: string, name: string, cells: number[], labels: string[]) => {
    setKpiModal({
      title: `${name} — ${title}`,
      columns: [
        { key: 'mth', label: 'Month', primary: true },
        { key: 'qty', label: unit, align: 'right' },
      ],
      // Months where this row contributed nothing add no information — drop them.
      rows: labels.map((mth, i) => ({ mth, qty: fmtInt(cells[i]), raw: cells[i] })).filter((r) => r.raw > 0).map(({ mth, qty }) => ({ mth, qty })),
      total: { qty: fmtInt(cells.reduce((s, n) => s + n, 0)) },
    })
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#eef4fa' }}>
      {kpiModal && <KpiBreakdownModal data={kpiModal} onClose={() => setKpiModal(null)} />}
      {/* header */}
      <header className="sticky top-0 z-30 flex items-center gap-2 md:gap-3 px-3 md:px-6 py-2.5 md:py-3 bg-white border-b border-slate-200 shadow-sm min-w-0">
        <button onClick={onMenu} className="w-10 h-10 grid place-items-center rounded-lg text-white shrink-0" style={{ background: C.barDark }} aria-label="Menu">
          <Menu size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="qa-heading text-[15px] sm:text-xl md:text-2xl font-extrabold tracking-tight leading-tight">
            <span className="sm:hidden">{t('Goods Return Analysis')}</span>
            <span className="hidden sm:inline">{t('GOODS RETURN ANALYSIS DASHBOARD')}</span>
          </h1>
          <div className="text-[11px] sm:text-[12px] md:text-sm font-semibold truncate sm:whitespace-normal" style={{ color: C.bar }}>
            Customer Goods Return 25-26 &nbsp;|&nbsp; MRS Observation_Return good
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50">
          <button
            onClick={() => setReload((r) => r + 1)}
            className="w-7 h-7 grid place-items-center rounded-md text-white shrink-0 hover:opacity-90 transition"
            style={{ background: C.barDark }}
            title="Refresh data"
            aria-label="Refresh"
          >
            <RefreshCw size={13} />
          </button>
          <LiveClock />
        </div>
      </header>

      {isEmpty ? (
        <div className="flex-1 grid place-items-center p-6">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-sm text-center p-8">
            <div className="w-16 h-16 mx-auto rounded-2xl grid place-items-center text-white shadow-sm mb-4" style={{ background: C.barDark }}>
              <FileSpreadsheet size={30} />
            </div>
            <h2 className="text-xl font-extrabold text-slate-800">{t('No data yet')}</h2>
            <p className="mt-2 text-slate-500 text-sm">
              Upload your <b>{t('Customer Goods Return')}</b> and <b>{t('MRS Observation Return good')}</b> Excel files to build the dashboard.
            </p>
            <button
              onClick={onUpload}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl text-white font-bold px-5 py-3 shadow-sm"
              style={{ background: C.barDark }}
            >
              <UploadCloud size={18} /> {t('Upload Excel')}
            </button>
          </div>
        </div>
      ) : (
      <>
      {/* body: filters + content */}
      <div className="flex flex-col lg:flex-row flex-1 min-w-0">
        <Filters
          filters={draft}
          options={options}
          onChange={setDraft}
          onApply={() => setApplied(draft)}
          onReset={() => {
            setDraft(EMPTY_FILTERS)
            setApplied(EMPTY_FILTERS)
          }}
          source={source}
          onSource={(sc) => {
            setSource(sc)
            // Narrowing to one sheet can hide the tab you are standing on — step back to a
            // tab that still exists rather than showing an empty screen.
            if (!showsFor(TAB_SOURCE[tab], sc)) setTab('Executive Summary')
          }}
        />

        <main className="flex-1 min-w-0 p-3 md:p-4 flex flex-col gap-3 md:gap-4">
          {/* Undated rows can't appear in any month-wise view — surface them so the
              source sheet can be corrected instead of the numbers quietly going missing. */}
          {model.undated.length > 0 && (
            <button
              onClick={() =>
                setKpiModal({
                  title: 'Rows with no readable date',
                  note: `${model.undated.length} row(s) — fix the date cell in the source sheet so they join the month-wise views`,
                  columns: [
                    { key: 'sheet', label: 'Sheet', primary: true },
                    { key: 'item', label: 'Item' },
                    { key: 'who', label: 'Customer / Observation', wrap: true },
                    { key: 'qty', label: 'Qty', align: 'right' },
                  ],
                  rows: model.undated.map((u) => ({ ...u, qty: fmtInt(u.qty) })),
                  total: { qty: fmtInt(model.undated.reduce((s, u) => s + u.qty, 0)) },
                })
              }
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px] font-semibold transition hover:brightness-95"
              style={{ background: 'color-mix(in srgb, #e8952f 14%, var(--surface))', borderColor: 'color-mix(in srgb, #e8952f 35%, var(--surface))', color: 'var(--ink-2)' }}
            >
              <AlertTriangle size={15} style={{ color: '#e8952f' }} className="shrink-0" />
              <span>
                {model.undated.length} row(s) have no readable date — they are missing from the month-wise views.
              </span>
              <span className="ml-auto shrink-0" style={{ color: C.bar }}>
                View ›
              </span>
            </button>
          )}

          {/* KPI strip — Executive Summary only; the other tabs carry their own metrics.
              Click any card for a breakdown popup. */}
          {tab === 'Executive Summary' && !activeSheet && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {/* Each card names the sheet its number comes from, so narrowing to one sheet
                drops the cards that sheet cannot answer instead of showing a stale figure. */}
            {([
              { src: 'obs', el: <Kpi key="inc" label="Total Number of Incidence" value={fmtInt(k.totalComplaints)} icon={<ClipboardList size={17} />} tint="red" onClick={() => openKpi('Total Number of Incidence')} /> },
              { src: 'skf', el: <Kpi key="rq" label="Total Return Qty" value={fmtInt(k.totalReturnQty)} icon={<Package size={17} />} tint="blue" onClick={() => openKpi('Total Return Qty')} /> },
              { src: 'skf', el: (
                <Kpi
                  key="cust"
                  label="Total Customers"
                  value={fmtInt(k.totalCustomers)}
                  sub={applied.customer.length ? applied.customer.join(", ") : undefined}
                  icon={<Users size={17} />}
                  tint="violet"
                  onClick={() => openKpi('Total Customers')}
                />
              ) },
              { src: 'both', el: <Kpi key="prod" label="Total Products" value={fmtInt(k.totalProducts)} icon={<Boxes size={17} />} tint="teal" onClick={() => openKpi('Total Products')} /> },
              { src: 'skf', el: <Kpi key="ret" label="Total Returns" value={fmtInt(k.totalReturns)} icon={<ListChecks size={17} />} tint="blue" onClick={() => openKpi('Total Returns')} /> },
              { src: 'skf', el: <Kpi key="good" label="Good Qty" value={fmtInt(k.good)} icon={<CheckCircle2 size={17} />} tint="emerald" onClick={() => openKpi('Good Qty')} /> },
              { src: 'obs', el: <Kpi key="ok" label="OK Qty" value={fmtInt(k.afterRework)} icon={<RefreshCcw size={17} />} tint="yellow" onClick={() => openKpi('OK Qty')} /> },
              { src: 'skf', el: <Kpi key="scrap" label="Final Scrap" value={fmtInt(k.afterRejection)} icon={<Ban size={17} />} tint="orange" onClick={() => openKpi('Final Scrap')} /> },
              { src: 'skf', el: (
                <Kpi
                  key="ppm"
                  label="Defect % / PPM"
                  value={fmtPct(k.defectPct)}
                  suffix={`${fmtInt(k.defectPpm)} PPM`}
                  icon={<Percent size={17} />}
                  tint="red"
                  onClick={() => openKpi('Defect % / PPM')}
                />
              ) },
              { src: 'skf', el: <Kpi key="avg" label="Avg Return Qty / Month" value={fmtInt(k.avgReturnQtyPerMonth)} icon={<CalendarClock size={17} />} tint="violet" onClick={() => openKpi('Avg Return Qty / Month')} /> },
            ] as { src: QaSource; el: JSX.Element }[])
              .filter((c) => showsFor(c.src, source))
              .map((c) => c.el)}
          </div>
          )}

          {activeSheet ? (
            <QaSheetView
              sheet={activeSheet}
              allSheets={sheets}
              months={allowedMonths}
              onOpenSheet={(name) => {
                setDraft({ ...draft, sheet: [name] })
                setApplied({ ...applied, sheet: [name] })
              }}
              onBack={() => {
                setDraft({ ...draft, sheet: [] })
                setApplied({ ...applied, sheet: [] })
              }}
            />
          ) : tab === 'Executive Summary' ? (
            <>
              {/* Each sheet's table with its own chart directly beneath it. With one sheet
                  selected the pair goes full width instead of leaving a hole beside it. */}
              <div className={`grid grid-cols-1 gap-3 md:gap-4 ${source === 'both' ? 'xl:grid-cols-2' : ''}`}>
                {showsFor('obs', source) && (
                  <Card title="Month-wise Defect" hint="click a row for detail">
                    <PivotTable head="Defect" pivot={model.defectPivot} onRow={(n, c, l) => openPivotRow('month-wise defect qty', 'Defect Qty', n, c, l)} />
                  </Card>
                )}
                {showsFor('skf', source) && (
                  <Card title="Month-wise Item Name" hint="click a row for detail">
                    <PivotTable head="Item Name" pivot={model.itemPivot} onRow={(n, c, l) => openPivotRow('month-wise return qty', 'Return Qty', n, c, l)} />
                  </Card>
                )}
              </div>

              <div className={`grid grid-cols-1 gap-3 md:gap-4 ${source === 'both' ? 'xl:grid-cols-2' : ''}`}>
                {showsFor('obs', source) && (
                  <Card title="Defect Trend Over Months">
                    <TrendChart pivot={model.defectPivot} unit="Defect Qty" />
                  </Card>
                )}
                {showsFor('skf', source) && (
                  <Card title="Item Wise Performance">
                    <ItemBarChart pivot={model.itemPivot} />
                  </Card>
                )}
              </div>
            </>
          ) : tab === 'Customer Analysis' ? (
            <CustomerAnalysis model={model} open={setKpiModal} />
          ) : tab === 'Product Analysis' ? (
            <ProductAnalysis model={model} open={setKpiModal} />
          ) : (
            <DefectAnalysis model={model} open={setKpiModal} />
          )}
        </main>
      </div>

      {/* bottom tab bar */}
      <nav className="sticky bottom-0 z-10 bg-white border-t border-slate-200 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <div className="flex gap-1.5 px-2 md:px-3 py-2 overflow-x-auto scroll-area">
          {TABS.filter((tb) => showsFor(TAB_SOURCE[tb], source)).map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={`shrink-0 px-3 md:px-4 py-2 rounded-md text-[12px] md:text-[13px] font-bold uppercase tracking-wide transition ${
                tab === tb ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
              }`}
              style={tab === tb ? { background: C.barDark } : undefined}
            >
              {t(tb)}
            </button>
          ))}
        </div>
      </nav>
      </>
      )}
    </div>
  )
}

function PivotTable({
  head,
  pivot,
  onRow,
}: {
  head: string
  pivot: MonthPivot
  onRow: (name: string, cells: number[], labels: string[]) => void
}) {
  const t = useT()
  if (pivot.rows.length === 0) return <NoRows />

  const th = 'px-2 py-2 text-[10.5px] font-bold uppercase tracking-wide text-center whitespace-nowrap'
  const td = 'px-2 py-[7px] text-[12px] tabular-nums whitespace-nowrap'
  const NAME_W = 148
  const MONTH_W = 68
  const TOTAL_W = 84

  return (
    <div className="scroll-area overflow-auto" style={{ maxHeight: 430 }}>
      <table className="qa-grid" style={{ minWidth: NAME_W + pivot.labels.length * MONTH_W + TOTAL_W }}>
        <thead>
          <tr>
            <th className={`${th} text-left sticky left-0`} style={{ minWidth: NAME_W, width: NAME_W }}>
              {t(head)}
            </th>
            {pivot.labels.map((l) => (
              <th key={l} className={th} style={{ minWidth: MONTH_W }}>
                {l}
              </th>
            ))}
            <th className={`${th} sticky right-0`} style={{ minWidth: TOTAL_W }}>
              {t('Total')}
            </th>
          </tr>
        </thead>
        <tbody>
          {pivot.rows.map((r, i) => {
            const bg = ROW_BG[i % 2]
            return (
              <tr
                key={r.name}
                onClick={() => onRow(r.name, r.cells, pivot.labels)}
                className="cursor-pointer hover:brightness-105 transition"
                style={{ background: bg }}
                title={t('View month-wise detail')}
              >
                <td
                  className={`${td} font-bold sticky left-0 z-[2] max-w-[148px] truncate`}
                  style={{ background: bg, color: 'var(--ink)' }}
                  title={r.name}
                >
                  {r.name}
                </td>
                {r.cells.map((v, j) => (
                  <td key={pivot.months[j]} className={`${td} text-right`} style={{ color: v ? 'var(--ink-2)' : EMPTY_INK }}>
                    {v ? fmtInt(v) : '–'}
                  </td>
                ))}
                <td className={`${td} text-right font-extrabold sticky right-0 z-[2]`} style={{ background: bg, color: onSurface(C.bar) }}>
                  {fmtInt(r.total)}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: FOOT_BG }}>
            <td className={`${td} font-extrabold sticky left-0 z-[2]`} style={{ background: FOOT_BG, color: 'var(--ink)' }}>
              {t('TOTAL')}
            </td>
            {pivot.colTotals.map((v, j) => (
              <td key={pivot.months[j]} className={`${td} text-right font-extrabold`} style={{ color: 'var(--ink)' }}>
                {fmtInt(v)}
              </td>
            ))}
            <td className={`${td} text-right font-extrabold sticky right-0 z-[2]`} style={{ background: FOOT_BG, color: 'var(--ink)' }}>
              {fmtInt(pivot.grand)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/* ---------- Defect trend — one line, month by month ---------- */
function TrendChart({ pivot, unit }: { pivot: MonthPivot; unit: string }) {
  const t = useT()
  if (pivot.labels.length === 0) return <NoRows />
  // The line plots exactly the TOTAL row of the table above it.
  const data = pivot.labels.map((label, i) => ({ label, qty: pivot.colTotals[i] }))

  // NO horizontal scroll here, unlike the bar charts. Two reasons: a trend only reads as a
  // trend when the whole series is on screen at once, and the scroll box was clipping the
  // hover tooltip at its right edge. Vertical month labels are ~15px wide, so every month
  // fits without one.
  return (
    <div>
      <div style={{ height: 380 }}>
        <ResponsiveContainer width="100%" height="100%">
          {/* Same treatment as the production dashboard's Efficiency chart: a monotone
              gradient area, dotted horizontal grid and white-ringed dots — in QA blue. */}
          <AreaChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="qaTrendArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5b9bf0" stopOpacity={0.5} />
                <stop offset="45%" stopColor="#2a78d6" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#1f4e8c" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="qaTrendLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#1f4e8c" />
                <stop offset="100%" stopColor="#3a7bd5" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={INK.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={<WrapTick chars={8} maxLines={1} fontSize={10.5} />}
              tickLine={false}
              axisLine={{ stroke: INK.axis }}
              interval={0}
              height={wrapAxisHeight(8, 10.5)}
              // padding keeps the first/last month label from hanging off the plot edge
              padding={{ left: 16, right: 16 }}
            />
            <YAxis tick={{ fontSize: 11, fill: INK.secondary }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => fmtInt(v)} />
            <Tooltip
              cursor={{ stroke: INK.axis, strokeWidth: 1 }}
              wrapperStyle={{ zIndex: 40 }}
              allowEscapeViewBox={{ x: false, y: true }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return <ChartTip title={String(label)} items={[{ label: t(unit), value: fmtInt(Number(payload[0].value) || 0), color: PLOT.line }]} />
              }}
            />
            <Area
              type="monotone"
              dataKey="qty"
              name={unit}
              stroke="url(#qaTrendLine)"
              strokeWidth={2.5}
              fill="url(#qaTrendArea)"
              isAnimationActive={false}
              dot={{ r: 4, fill: PLOT.dot, stroke: '#fff', strokeWidth: 1.5 }}
              activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff', fill: PLOT.dot }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ---------- Item wise performance — one bar per item ---------- */
function ItemBarChart({ pivot }: { pivot: MonthPivot }) {
  const t = useT()
  if (pivot.rows.length === 0) return <NoRows />
  // One bar per item = that item's Total column in the table above it.
  const data = pivot.rows.map((r) => ({ name: r.name, qty: r.total }))
  const minWidth = Math.max(420, data.length * 74)

  return (
    <div className="scroll-area" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
      <div style={{ minWidth, height: 380 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 4 }} barCategoryGap="30%">
            <defs>
              <linearGradient id="qaItemBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PLOT.barFrom} />
                <stop offset="100%" stopColor={PLOT.barTo} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={INK.grid} strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="name"
              tick={<WrapTick chars={14} maxLines={2} />}
              tickLine={false}
              axisLine={{ stroke: INK.axis }}
              interval={0}
              height={wrapAxisHeight(14)}
            />
            <YAxis tick={{ fontSize: 11, fill: INK.secondary }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => fmtInt(v)} />
            <Tooltip
              cursor={{ fill: 'rgba(31,78,140,0.08)' }}
              wrapperStyle={{ zIndex: 40 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return <ChartTip title={String(label)} items={[{ label: t('Return Qty'), value: fmtInt(Number(payload[0].value) || 0), color: PLOT.barTo }]} />
              }}
            />
            <Bar dataKey="qty" name="Return Qty" fill="url(#qaItemBar)" radius={[3, 3, 0, 0]} maxBarSize={38} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ================= TAB PAGES =================
   The remaining tabs are still an empty canvas — content is being rebuilt. */