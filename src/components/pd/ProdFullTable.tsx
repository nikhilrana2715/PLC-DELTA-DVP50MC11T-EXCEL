import { useEffect, useMemo, useRef, useState } from 'react'
import { Filter, RotateCcw, Search, X } from 'lucide-react'
import type { ProdRow } from '../../lib/prodSummary'
import { prodDowntimeCategory } from '../../lib/prodSummary'
import { DT_CATEGORY_META } from '../../lib/downtime'
import { useT } from '../../lib/i18n'
import { DateRangePicker } from '../DateRangePicker'
import { HScrollButtons } from '../HScrollButtons'

/**
 * The Production Summary sheet, row by row — Unit 2 (Shell) and Unit 3 (Roller).
 *
 * Deliberately its own table rather than a shared one with the Unit 1 report: that sheet has
 * 74 columns and 1,000+ rows and needs windowing, this one has ~30 columns and a few hundred
 * rows and does not. Keeping them apart means a change to one cannot quietly reshape the other.
 */

const fmt = (n: number) => (n ? Math.round(n).toLocaleString('en-IN') : '—')
const fmt2 = (n: number) => (n ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')
const pct = (n: number) => (n ? `${n.toFixed(2)}%` : '—')
const dash = (s: string) => (s && s.trim() ? s : '—')
const fmtDate = (d: string) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

type Col = {
  key: string
  label: string
  title?: string
  num?: boolean
  dec?: boolean
  total?: boolean
  /** Weighted average in the TOTAL row instead of a sum — percentages do not add up. */
  avg?: boolean
  width: number
  get: (r: ProdRow) => string | number
  disp?: (r: ProdRow) => string
  cell?: (r: ProdRow) => React.ReactNode
}

function buildColumns(reasons: string[], descriptionLabel: string, shifts: boolean): Col[] {
  const head: Col[] = [
    { key: 'sr', label: 'SR', num: true, width: 62, get: (r) => r.sr },
    { key: 'date', label: 'DATE', width: 118, get: (r) => r.date, disp: (r) => fmtDate(r.date), cell: (r) => fmtDate(r.date) },
    {
      key: 'shift',
      label: 'SHIFT',
      width: 84,
      get: (r) => (r.shift === 'I' ? 'Shift 1' : r.shift === 'II' ? 'Shift 2' : r.shift),
      cell: (r) => (
        <span className="inline-block rounded-md px-1.5 py-0.5 text-[10.5px] font-bold" style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
          {r.shift === 'I' ? 'Shift 1' : r.shift === 'II' ? 'Shift 2' : dash(r.shift)}
        </span>
      ),
    },
    { key: 'machine', label: 'M/C NAME', width: 100, get: (r) => r.machine, cell: (r) => <b className="text-slate-800">{dash(r.machine)}</b> },
    { key: 'operator', label: 'OPERATOR', width: 130, get: (r) => r.operator },
    { key: 'itemCode', label: 'ITEM CODE', width: 120, get: (r) => r.itemCode, cell: (r) => <b className="text-slate-800">{dash(r.itemCode)}</b> },
    { key: 'routecard', label: 'ROUTECARD NO.', width: 130, get: (r) => r.routecard },
    { key: 'description', label: descriptionLabel.toUpperCase() || 'DESCRIPTION', width: 160, get: (r) => r.description },
    { key: 'process', label: 'PROCESS', width: 120, get: (r) => r.process },
    { key: 'cycleRate', label: 'CYCLE TIME (KG/HR)', num: true, dec: true, width: 150, get: (r) => r.cycleRate },
    { key: 'good', label: 'GOOD QTY (KG)', num: true, dec: true, total: true, width: 130, get: (r) => r.goodQty, cell: (r) => <span style={{ color: r.goodQty ? '#0f9d58' : undefined }}>{fmt2(r.goodQty)}</span> },
    { key: 'rework', label: 'REWORK', num: true, dec: true, total: true, width: 96, get: (r) => r.rework, cell: (r) => <span style={{ color: r.rework ? '#ea580c' : undefined }}>{fmt2(r.rework)}</span> },
    { key: 'rej', label: 'REJ.', num: true, dec: true, total: true, width: 90, get: (r) => r.rejection, cell: (r) => <span style={{ color: r.rejection ? '#d03b3b' : undefined }}>{fmt2(r.rejection)}</span> },
    { key: 'totalQty', label: 'TOTAL QTY (KG)', num: true, dec: true, total: true, width: 136, get: (r) => r.totalQty, cell: (r) => <b>{fmt2(r.totalQty)}</b> },
    { key: 'working', label: 'WORKING MINS', num: true, total: true, width: 128, get: (r) => r.workingMin },
  ]

  // One column per downtime reason, tinted by the factor it belongs to.
  const dt: Col[] = reasons.map((name) => ({
    key: `dt:${name}`,
    label: name.toUpperCase(),
    title: `${name} — ${DT_CATEGORY_META[prodDowntimeCategory(name)].label}`,
    num: true,
    total: true,
    width: Math.max(110, name.length * 8),
    get: (r) => r.downtime[name] || 0,
    cell: (r) => {
      const v = r.downtime[name] || 0
      return <span style={{ color: v ? DT_CATEGORY_META[prodDowntimeCategory(name)].color : undefined }}>{fmt(v)}</span>
    },
  }))

  const tail: Col[] = [
    {
      key: 'dtTotal',
      label: 'TOTAL DOWNTIME',
      title: 'Every downtime reason added up — the figure the Total Downtime card shows',
      num: true,
      total: true,
      width: 150,
      get: (r) => r.downtimeTotal,
      cell: (r) => <span style={{ color: r.downtimeTotal ? '#ea580c' : undefined }}>{fmt(r.downtimeTotal)}</span>,
    },
    { key: 'availMin', label: 'TOTAL', title: "The sheet's own Total — working minutes plus downtime", num: true, total: true, width: 104, get: (r) => r.availableMin },
    // The Shell workbook mislabels the next three; they are read by position. See lib/prodSummary.
    { key: 'idealQty', label: 'IDEAL QTY', title: 'Ideal production quantity: cycle rate x available hours', num: true, dec: true, total: true, width: 122, get: (r) => r.idealQty },
    { key: 'availHrs', label: 'AVAILABLE HRS', num: true, dec: true, total: true, width: 136, get: (r) => r.availableHrs },
    { key: 'runHrs', label: 'ACT RUN HRS', num: true, dec: true, total: true, width: 130, get: (r) => r.runHrs },
    { key: 'avail', avg: true, label: 'AVAILABILITY %', num: true, width: 136, get: (r) => r.availability, disp: (r) => pct(r.availability), cell: (r) => pct(r.availability) },
    { key: 'perf', avg: true, label: 'PERFORMANCE %', num: true, width: 142, get: (r) => r.performance, disp: (r) => pct(r.performance), cell: (r) => pct(r.performance) },
    { key: 'qual', avg: true, label: 'QUALITY %', num: true, width: 114, get: (r) => r.quality, disp: (r) => pct(r.quality), cell: (r) => pct(r.quality) },
    {
      key: 'oee',
      label: 'OEE %',
      num: true,
      avg: true,
      width: 96,
      get: (r) => r.oee,
      disp: (r) => pct(r.oee),
      cell: (r) => (
        <span
          className="inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold"
          style={{
            background: `color-mix(in srgb, ${r.oee >= 60 ? '#22c88a' : r.oee > 0 ? '#f26464' : 'var(--ink)'} 14%, var(--surface))`,
            color: `color-mix(in srgb, ${r.oee >= 60 ? '#0f9d58' : r.oee > 0 ? '#d03b3b' : 'var(--ink)'} 55%, var(--ink))`,
          }}
        >
          {pct(r.oee)}
        </span>
      ),
    },
  ]
  // A single-shift unit has nothing to tell apart, so the column would only ever repeat itself.
  return [...(shifts ? head : head.filter((c) => c.key !== 'shift')), ...dt, ...tail]
}

interface ColFilter {
  values?: string[]
  from?: string
  to?: string
}

const isActive = (f?: ColFilter) => !!(f && ((f.values && f.values.length) || f.from || f.to))
const shownText = (c: Col, r: ProdRow) =>
  c.disp ? c.disp(r) : c.num ? (c.dec ? fmt2(Number(c.get(r))) : fmt(Number(c.get(r)))) : dash(String(c.get(r) ?? ''))

function passes(r: ProdRow, col: Col, f: ColFilter): boolean {
  if (f.from || f.to) {
    const raw = String(col.get(r) ?? '')
    if (f.from && raw < f.from) return false
    if (f.to && raw > f.to) return false
  }
  if (f.values && f.values.length && !f.values.includes(shownText(col, r))) return false
  return true
}

function applyFilters(rows: ProdRow[], cols: Col[], filters: Record<string, ColFilter>, exceptKey?: string): ProdRow[] {
  const active = Object.entries(filters).filter(([k, f]) => k !== exceptKey && isActive(f))
  if (!active.length) return rows
  const pairs = active.map(([k, f]) => [cols.find((c) => c.key === k), f] as const).filter(([c]) => !!c)
  return rows.filter((r) => pairs.every(([c, f]) => passes(r, c as Col, f)))
}

const MAX_OPTIONS = 400
/** Excel's column filter: search, Select all, a tick per distinct value, Clear / Apply. */
function ColumnFilterPopover({
  col,
  cols,
  rows,
  filters,
  setFilters,
  onClose,
  alignRight,
  popRef,
}: {
  col: Col
  cols: Col[]
  rows: ProdRow[]
  filters: Record<string, ColFilter>
  setFilters: (f: Record<string, ColFilter>) => void
  onClose: () => void
  alignRight: boolean
  popRef: React.MutableRefObject<HTMLDivElement | null>
}) {
  const t = useT()
  const [query, setQuery] = useState('')

  const options = useMemo(() => {
    const base = applyFilters(rows, cols, filters, col.key)
    const seen = new Set<string>()
    for (const r of base) seen.add(shownText(col, r))
    return [...seen].sort((a, b) => (a === '—' ? 1 : b === '—' ? -1 : a.localeCompare(b, undefined, { numeric: true })))
  }, [rows, cols, filters, col])

  const [picked, setPicked] = useState<Set<string>>(() => {
    const f = filters[col.key]
    return new Set(f?.values?.length ? f.values : options)
  })

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (q ? options.filter((o) => o.toLowerCase().includes(q)) : options).slice(0, MAX_OPTIONS)
  }, [options, query])

  const searching = query.trim() !== ''
  const allVisiblePicked = searching
    ? visible.length > 0 && picked.size === visible.length && visible.every((o) => picked.has(o))
    : visible.length > 0 && visible.every((o) => picked.has(o))

  return (
    <div
      ref={popRef}
      className={`absolute z-40 mt-1 ${alignRight ? 'right-0' : 'left-0'} rounded-xl border border-[var(--hairline)] shadow-2xl text-left normal-case tracking-normal`}
      style={{ background: 'var(--surface)', width: 280, maxWidth: 'calc(100vw - 16px)' }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--hairline)]">
        <span className="text-[13px] font-bold flex-1 min-w-0 truncate" style={{ color: 'var(--ink)' }}>
          {t('Filter')}: {col.title || col.label}
        </span>
        <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-700" aria-label={t('Close')}>
          <X size={15} />
        </button>
      </div>

      <div className="p-3 pb-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-[var(--hairline)] px-2.5 py-1.5">
          <Search size={13} style={{ color: 'var(--ink-hint)' }} />
          <input
            autoFocus
            value={query}
            placeholder={t('Search…')}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-w-0 text-[13px] bg-transparent outline-none"
            style={{ color: 'var(--ink)' }}
          />
        </div>
      </div>

      <div className="max-h-[230px] overflow-y-auto scroll-area px-3">
        <label className="flex items-center gap-2 py-1.5 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 accent-blue-600 shrink-0"
            checked={allVisiblePicked}
            onChange={() => {
              if (searching) {
                setPicked(allVisiblePicked ? new Set() : new Set(visible))
                return
              }
              const next = new Set(picked)
              if (allVisiblePicked) visible.forEach((o) => next.delete(o))
              else visible.forEach((o) => next.add(o))
              setPicked(next)
            }}
          />
          <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>
            {searching ? t('Select results') : t('Select all')}
          </span>
          <span className="ml-auto text-[11px] tabular-nums" style={{ color: 'var(--ink-hint)' }}>
            {picked.size}/{options.length}
          </span>
        </label>
        {visible.map((o) => (
          <label key={o} className="flex items-center gap-2 py-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-blue-600 shrink-0"
              checked={picked.has(o)}
              onChange={() => {
                const next = new Set(picked)
                if (next.has(o)) next.delete(o)
                else next.add(o)
                setPicked(next)
              }}
            />
            <span className="text-[13px] min-w-0 truncate" style={{ color: 'var(--ink)' }} title={o}>
              {o}
            </span>
          </label>
        ))}
        {visible.length === 0 && (
          <div className="py-4 text-center text-[12px]" style={{ color: 'var(--ink-hint)' }}>
            {t('No matching values.')}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 p-3 pt-2.5 border-t border-[var(--hairline)]">
        <button
          onClick={() => {
            const next = { ...filters }
            delete next[col.key]
            setFilters(next)
            onClose()
          }}
          className="flex-1 rounded-lg border py-2 text-[13px] font-bold"
          style={{ borderColor: '#f0a1a1', color: '#c0392b' }}
        >
          {t('Clear')}
        </button>
        <button
          onClick={() => {
            const next = { ...filters }
            const existing = filters[col.key]
            const range = existing?.from || existing?.to ? { from: existing.from, to: existing.to } : {}
            const all = picked.size === 0 || picked.size === options.length
            if (all && !range.from && !range.to) delete next[col.key]
            else next[col.key] = { ...range, ...(all ? {} : { values: [...picked] }) }
            setFilters(next)
            onClose()
          }}
          className="flex-1 rounded-lg py-2 text-[13px] font-bold text-white"
          style={{ background: '#0f172a' }}
        >
          {t('Apply')}
        </button>
      </div>
    </div>
  )
}

export function ProdFullTable({
  rows,
  reasons,
  descriptionLabel,
  shifts = true,
  onFilteredChange,
}: {
  rows: ProdRow[]
  reasons: string[]
  descriptionLabel: string
  /** False where the unit runs one shift — the shift column and filter disappear. */
  shifts?: boolean
  onFilteredChange?: (rows: ProdRow[]) => void
}) {
  const t = useT()
  const cols = useMemo(() => buildColumns(reasons, descriptionLabel, shifts), [reasons, descriptionLabel, shifts])
  const [filters, setFilters] = useState<Record<string, ColFilter>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [barOpen, setBarOpen] = useState<string | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)
  const barPopRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [bar, setBar] = useState({ shift: '', machine: '', item: '' })

  // Click anywhere else, or press Escape, and an open filter goes away.
  useEffect(() => {
    if (!open && !barOpen) return
    const away = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (popRef.current?.contains(el) || barPopRef.current?.contains(el)) return
      if (el.closest('button[aria-label^="Filter "]')) return
      setOpen(null)
      setBarOpen(null)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(null)
      setBarOpen(null)
    }
    document.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [open, barOpen])

  const shown = useMemo(() => applyFilters(rows, cols, filters), [rows, cols, filters])
  useEffect(() => {
    onFilteredChange?.(shown)
  }, [shown, onFilteredChange])

  const totals = useMemo(() => {
    const out: Record<string, number> = {}
    for (const c of cols) {
      if (c.avg) {
        // Weighted by minutes covered, matching prodKpis() so the strip agrees with the cards.
        let w = 0
        let acc = 0
        for (const r of shown) {
          const v = Number(c.get(r)) || 0
          if (r.availableMin > 0 && v > 0) {
            w += r.availableMin
            acc += v * r.availableMin
          }
        }
        out[c.key] = w > 0 ? acc / w : 0
      } else if (c.total) {
        out[c.key] = shown.reduce((s, r) => s + (Number(c.get(r)) || 0), 0)
      }
    }
    return out
  }, [shown, cols])

  const activeCount = Object.values(filters).filter(isActive).length
  const colBy = (key: string) => cols.find((c) => c.key === key) as Col
  const optionsFor = (key: string) => {
    const c = colBy(key)
    if (!c) return []
    const seen = new Set<string>()
    for (const r of rows) seen.add(shownText(c, r))
    return [...seen].filter((v) => v !== '—').sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }

  const [minDate, maxDate] = useMemo(() => {
    let lo = ''
    let hi = ''
    for (const r of rows) {
      if (!r.date) continue
      if (!lo || r.date < lo) lo = r.date
      if (!hi || r.date > hi) hi = r.date
    }
    return [lo, hi]
  }, [rows])

  const applyBar = () => {
    const next = { ...filters }
    const set = (key: string, value: string) => {
      if (!value) delete next[key]
      else next[key] = { values: [value] }
    }
    if (shifts) set('shift', bar.shift)
    else delete next.shift
    set('machine', bar.machine)
    if (bar.item) next.itemCode = { values: optionsFor('itemCode').filter((o) => o.toLowerCase().includes(bar.item.toLowerCase())) }
    else delete next.itemCode
    setFilters(next)
  }
  const clearAll = () => {
    setBar({ shift: '', machine: '', item: '' })
    setFilters({})
  }

  const FIELD = 'w-full rounded-lg border border-[var(--hairline)] px-2.5 py-1.5 text-[12.5px] bg-[var(--surface)] outline-none'
  const barPopover = (key: string) =>
    colBy(key) ? (
      <ColumnFilterPopover
        col={colBy(key)}
        cols={cols}
        rows={rows}
        filters={filters}
        setFilters={setFilters}
        onClose={() => setBarOpen(null)}
        alignRight
        popRef={barPopRef}
      />
    ) : null

  const Field = ({ label, colKey, width, children }: { label: string; colKey: string; width: string; children: React.ReactNode }) => (
    <div className="min-w-0">
      <span className="block text-[11px] font-bold mb-1" style={{ color: 'var(--ink-hint)' }}>
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <div className={`${width} max-w-full min-w-0`}>{children}</div>
        <div className="relative shrink-0">
          <button
            onClick={() => setBarOpen(barOpen === colKey ? null : colKey)}
            className="w-8 h-8 grid place-items-center rounded-lg border border-[var(--hairline)] hover:bg-black/5"
            style={{ color: barOpen === colKey ? '#2563eb' : 'var(--ink-hint)' }}
            aria-label={`Filter ${label}`}
          >
            <Filter size={14} fill={barOpen === colKey ? 'currentColor' : 'none'} />
          </button>
          {barOpen === colKey && barPopover(colKey)}
        </div>
      </div>
    </div>
  )

  return (
    <div className="bento overflow-hidden min-w-0">
      <div className="px-3 md:px-4 py-2.5 border-b border-[var(--hairline)] flex items-center gap-3 flex-wrap">
        <div className="font-bold text-slate-800 text-sm">{t('Production Summary')}</div>
        <div className="text-xs" style={{ color: 'var(--ink-hint)' }}>
          {fmt(shown.length)} {t('row(s)')}
          {shown.length !== rows.length && ` ${t('of')} ${fmt(rows.length)}`} · {cols.length} {t('columns')}
        </div>
        <div className="ml-auto">
          <HScrollButtons scrollRef={scrollRef} />
        </div>
      </div>

      <div className="px-3 md:px-4 py-2.5 border-b border-[var(--hairline)] flex flex-col sm:flex-row sm:items-end gap-x-3 gap-y-2.5 sm:flex-wrap">
        <Field label={t('Date range')} colKey="date" width="w-full sm:w-[260px]">
          <DateRangePicker
            value={filters.date?.from || filters.date?.to ? { from: filters.date.from || minDate, to: filters.date.to || maxDate } : null}
            onApply={(r) => setFilters({ ...filters, date: { from: r.from, to: r.to } })}
            onClear={() => {
              const next = { ...filters }
              delete next.date
              setFilters(next)
            }}
            maxDate={maxDate}
          />
        </Field>

        {shifts && (
          <Field label={t('Shift')} colKey="shift" width="w-full sm:w-[140px]">
            <select value={bar.shift} onChange={(e) => setBar({ ...bar, shift: e.target.value })} className={FIELD}>
              <option value="">{t('All')}</option>
              {optionsFor('shift').map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label={t('Machine')} colKey="machine" width="w-full sm:w-[150px]">
          <select value={bar.machine} onChange={(e) => setBar({ ...bar, machine: e.target.value })} className={FIELD}>
            <option value="">{t('All')}</option>
            {optionsFor('machine').map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('Item Code')} colKey="itemCode" width="w-full sm:w-[170px]">
          <input
            value={bar.item}
            placeholder={t('Enter Item Code')}
            onChange={(e) => setBar({ ...bar, item: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && applyBar()}
            className={FIELD}
          />
        </Field>

        <div className="flex items-center gap-2">
          <button onClick={applyBar} className="inline-flex items-center gap-1.5 rounded-lg text-white text-[12.5px] font-bold px-3 py-2" style={{ background: '#0f172a' }}>
            <Filter size={14} /> {t('Filters')}
          </button>
          <button onClick={clearAll} className="inline-flex items-center gap-1.5 rounded-lg border text-[12.5px] font-bold px-3 py-2" style={{ borderColor: '#f0a1a1', color: '#c0392b' }}>
            <RotateCcw size={14} /> {t('Clear')}
          </button>
          {activeCount > 0 && (
            <span className="text-[11.5px] font-semibold whitespace-nowrap" style={{ color: 'var(--ink-hint)' }}>
              {activeCount} {t('active')}
            </span>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="overflow-auto scroll-area" style={{ maxHeight: '68vh' }}>
        <table className="w-max text-[12px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th
                  key={c.key}
                  className={`sticky top-0 z-20 px-2 py-2 whitespace-nowrap font-extrabold text-[12px] ${c.num ? 'text-right' : 'text-left'} ${i === 0 ? 'left-0 z-30' : ''}`}
                  style={{ background: 'color-mix(in srgb, #f26464 10%, var(--surface))', color: 'var(--ink)', minWidth: c.width }}
                >
                  {i === 1
                    ? t('TOTAL')
                    : c.avg
                      ? pct(totals[c.key] || 0)
                      : c.total
                        ? c.dec
                          ? fmt2(totals[c.key] || 0)
                          : fmt(totals[c.key] || 0)
                        : ''}
                </th>
              ))}
            </tr>
            <tr>
              {cols.map((c, i) => {
                const on = isActive(filters[c.key])
                return (
                  <th
                    key={c.key}
                    title={c.title || c.label}
                    className={`sticky z-20 px-2 py-2 whitespace-nowrap font-bold uppercase tracking-wide text-[10.5px] border-b border-[var(--hairline)] ${
                      c.num ? 'text-right' : 'text-left'
                    } ${i === 0 ? 'left-0 z-30' : ''}`}
                    style={{ top: 33, background: 'var(--surface-2)', color: 'var(--ink-hint)', minWidth: c.width }}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      <button
                        onClick={() => setOpen(open === c.key ? null : c.key)}
                        className="shrink-0 rounded p-0.5 hover:bg-black/5"
                        style={{ color: on ? '#2563eb' : 'var(--ink-hint)' }}
                        aria-label={`Filter ${c.label}`}
                      >
                        <Filter size={11} fill={on ? 'currentColor' : 'none'} />
                      </button>
                    </span>
                    {open === c.key && (
                      <ColumnFilterPopover
                        col={c}
                        cols={cols}
                        rows={rows}
                        filters={filters}
                        setFilters={setFilters}
                        onClose={() => setOpen(null)}
                        alignRight={i > cols.length / 2}
                        popRef={popRef}
                      />
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.sr}-${r.date}-${r.machine}-${i}`}>
                {cols.map((c, ci) => (
                  <td
                    key={c.key}
                    className={`px-2 py-1.5 border-t border-[var(--hairline)] whitespace-nowrap ${c.num ? 'text-right tabular-nums' : ''} ${ci === 0 ? 'sticky left-0' : ''}`}
                    style={{
                      color: 'var(--ink-2)',
                      background: ci === 0 ? (i % 2 ? 'var(--surface-2)' : 'var(--surface)') : i % 2 ? 'var(--surface-2)' : undefined,
                      minWidth: c.width,
                    }}
                  >
                    {c.cell ? c.cell(r) : shownText(c, r)}
                  </td>
                ))}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={cols.length} className="px-4 py-12 text-center text-sm" style={{ color: 'var(--ink-hint)' }}>
                  {t('No rows match these filters.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
