import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Filter, RotateCcw, Search, X } from 'lucide-react'
import { cgGoodsOf, type PdRow, type TextNumberCell } from '../../lib/pdReport'
import { useT } from '../../lib/i18n'
import { DateRangePicker } from '../DateRangePicker'
import { HScrollButtons } from '../HScrollButtons'
import { DT_CATEGORY_META, downtimeCategory, downtimeColor } from '../../lib/downtime'
import { GROUP_SEQUENCE } from '../../lib/aggregate'

/**
 * The PD Report exactly as the sheet holds it — every column, in sheet order, with a filter
 * on each one and a TOTAL row pinned above the header.
 *
 * The downtime columns are headed by their SHORT CODE ("11OV", "14I") because the full
 * reason ("Ovality Problem 11Ov") is far too wide for 36 columns side by side; the full text
 * stays on the header's tooltip and inside the filter popover.
 */

const fmt = (n: number) => (n ? Math.round(n).toLocaleString('en-IN') : '—')
const fmt2 = (n: number) => (n ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')
const pct = (n: number) => (n ? `${n.toFixed(2)}%` : '—')
const dash = (s: string) => (s && s.trim() ? s : '—')
const fmtDate = (d: string) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

/**
 * A couple of the sheet's downtime headers carry no code in their text, but the plant still
 * numbers them — "RE SETTING,LODING" is reason 11, the parent of every 11xx sub-reason. There
 * is nothing in the string to derive that from, so it is stated here.
 */
const REASON_ALIAS: Record<string, string> = { 'RE SETTING,LODING': '11' }

/**
 * The short code the plant heads its columns with.
 *
 * "Ovality Problem 11Ov" → "11OV", "No Material 14(INTERNAL)" → "14I", "Mech.Maint.21" → "21",
 * "Size variation Problem 11 Sv IPG Pro" → "11SV" — the code is not always at the end, so the
 * LAST number-plus-suffix in the string wins rather than an end-anchored match.
 */
export function reasonCode(reason: string): string {
  const alias = REASON_ALIAS[reason.trim().toUpperCase()]
  if (alias) return alias

  // "14(INTERNAL)" / "14(EXTERNAL)" → the initial tells the two apart.
  const paren = reason.match(/(\d+)\s*\(\s*([A-Za-z])/)
  if (paren) return `${paren[1]}${paren[2].toUpperCase()}`

  const suffixed = [...reason.matchAll(/(\d+)\s*([A-Za-z]{1,2})(?![A-Za-z])/g)]
  if (suffixed.length) {
    const m = suffixed[suffixed.length - 1]
    return `${m[1]}${m[2].toUpperCase()}`
  }

  const plain = [...reason.matchAll(/(\d+)/g)]
  if (plain.length) return plain[plain.length - 1][1]

  // No number anywhere — fall back to initials so the column is still identifiable.
  return reason
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 4)
    .toUpperCase()
}

type Col = {
  key: string
  label: string
  title?: string
  num?: boolean
  /** Show two decimals — hours and cycle times lose meaning when rounded to whole units. */
  dec?: boolean
  /** Sum this column into the TOTAL row. */
  total?: boolean
  /**
   * Show a weighted AVERAGE in the TOTAL row instead of a sum — percentages do not add up.
   * Weighted by each row's available minutes, and blank rows are left out, so the figure
   * matches the OEE card above exactly.
   */
  avg?: boolean
  width?: number
  get: (r: PdRow) => string | number
  cell?: (r: PdRow) => React.ReactNode
  /**
   * The cell's text, for the value list in the filter. Filled in by buildColumns unless a
   * column formats itself differently from its raw value (dates, percentages).
   */
  disp?: (r: PdRow) => string
  /**
   * Sorts this column's filter list into headed sections. Machines are the case that needs it:
   * 33 of them flat is a wall, but under FG / CG / EG / IG / HO it is a shop-floor layout.
   */
  groupBy?: (r: PdRow) => string
  /** Filled in by buildColumns — see the note there. */
  cls?: string
  stEven?: React.CSSProperties
  stOdd?: React.CSSProperties
}

function buildColumns(reasons: string[]): Col[] {
  const base: Col[] = [
    { key: 'sr', label: 'SR NO', num: true, width: 70, get: (r) => r.sr },
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
    { key: 'group', label: 'M/C', width: 64, get: (r) => r.group },
    {
      key: 'machine',
      label: 'MACHINE',
      width: 92,
      get: (r) => r.machine,
      groupBy: (r) => r.group,
      cell: (r) => <b className="text-slate-800">{dash(r.machine)}</b>,
    },
    { key: 'operation', label: 'OPERATION', width: 96, get: (r) => r.operation },
    { key: 'op1', label: 'OPERATOR 1', width: 150, get: (r) => r.operators[0] || '' },
    { key: 'op2', label: 'OPERATOR 2', width: 150, get: (r) => r.operators[1] || '' },
    { key: 'op3', label: 'OPERATOR 3', width: 150, get: (r) => r.operators[2] || '' },
    // The SAP code is the one the store system keys on — it must never be dropped.
    { key: 'sap', label: 'SAP ITEM CODE', width: 130, get: (r) => r.sapItemCode, cell: (r) => <b className="text-slate-800">{dash(r.sapItemCode)}</b> },
    { key: 'itemCode', label: 'ITEM CODE', width: 110, get: (r) => r.itemCode, cell: (r) => <b className="text-slate-800">{dash(r.itemCode)}</b> },
    { key: 'itemName', label: 'ITEM NAME', width: 160, get: (r) => r.itemName },
    { key: 'batch', label: 'BATCH NO', width: 118, get: (r) => r.batchNo },
    { key: 'orIr', label: 'OR/IR', width: 72, get: (r) => r.orIr },
    { key: 'cycle', label: 'CYCLE TIME (S)', num: true, dec: true, width: 118, get: (r) => r.cycleTime },
    { key: 'php', label: 'P.H.P', num: true, width: 78, get: (r) => r.php },
    { key: 'pass', label: 'PASS', num: true, total: true, width: 74, get: (r) => r.pass },
    { key: 'good', label: 'GOOD', num: true, total: true, width: 90, get: (r) => r.good, cell: (r) => <span style={{ color: r.good ? '#0f9d58' : undefined }}>{fmt(r.good)}</span> },
    { key: 'rework', label: 'REWORK', num: true, total: true, width: 90, get: (r) => r.rework, cell: (r) => <span style={{ color: r.rework ? '#ea580c' : undefined }}>{fmt(r.rework)}</span> },
    { key: 'rej', label: 'REJECTION', num: true, total: true, width: 100, get: (r) => r.runningRej, cell: (r) => <span style={{ color: r.runningRej ? '#d03b3b' : undefined }}>{fmt(r.runningRej)}</span> },
    { key: 'tr', label: 'T.R (TURNING REJ)', num: true, total: true, width: 140, get: (r) => r.turningRej, cell: (r) => <span style={{ color: r.turningRej ? '#d03b3b' : undefined }}>{fmt(r.turningRej)}</span> },
    { key: 'total', label: 'TOTAL QTY', num: true, total: true, width: 106, get: (r) => r.total, cell: (r) => <b>{fmt(r.total)}</b> },
    { key: 'working', label: 'WORKING MINS', num: true, total: true, width: 126, get: (r) => r.workingMin },
  ]

  // One column per downtime reason, in sheet order, tinted by the category it belongs to —
  // the same three colours the Dashboard and the Downtime page use.
  const dt: Col[] = reasons.map((name) => ({
    key: `dt:${name}`,
    label: reasonCode(name),
    title: `${name} — ${DT_CATEGORY_META[downtimeCategory(name)].label}`,
    num: true,
    total: true,
    width: 74,
    get: (r) => r.downtime[name] || 0,
    cell: (r) => (
      <span style={{ color: r.downtime[name] ? downtimeColor(name) : undefined }}>{fmt(r.downtime[name] || 0)}</span>
    ),
  }))

  // Sheet order from here on, so the screen and the workbook read the same left to right.
  // DOWNTIME MIN is the one addition: it is what the 36 reason columns add up to, which the
  // sheet never puts in a column of its own but is the figure the meeting actually asks for.
  const tail: Col[] = [
    {
      key: 'downtimeMin',
      label: 'TOTAL DOWNTIME',
      title: 'Every downtime reason added up — the figure the Total Downtime card shows',
      num: true,
      total: true,
      width: 148,
      get: (r) => r.downtimeTotal ?? Object.values(r.downtime).reduce((a, b) => a + b, 0),
      cell: (r) => {
        const v = r.downtimeTotal ?? Object.values(r.downtime).reduce((a, b) => a + b, 0)
        return <span style={{ color: v ? '#ea580c' : undefined }}>{fmt(v)}</span>
      },
    },
    // The sheet's own TOTAL after the reasons is AVAILABLE minutes (Plan Hrs x 60), not downtime.
    { key: 'availMin', label: 'TOTAL', title: 'Available minutes (Plan Hrs x 60)', num: true, total: true, width: 100, get: (r) => r.availableMin },
    { key: 'planHrs', label: 'PLAN HRS', num: true, dec: true, total: true, width: 100, get: (r) => r.planHrs },
    { key: 'runHrs', label: 'RUN HRS', title: 'The sheet heads this column "0"', num: true, dec: true, total: true, width: 98, get: (r) => r.runHrs },
    { key: 'avail', avg: true, label: 'AVAILABILITY %', num: true, width: 132, get: (r) => r.availability, disp: (r) => pct(r.availability), cell: (r) => pct(r.availability) },
    { key: 'perf', avg: true, label: 'PERFORMANCE %', num: true, width: 140, get: (r) => r.performance, disp: (r) => pct(r.performance), cell: (r) => pct(r.performance) },
    { key: 'qual', avg: true, label: 'QUALITY %', num: true, width: 110, get: (r) => r.quality, disp: (r) => pct(r.quality), cell: (r) => pct(r.quality) },
    {
      key: 'oee',
      label: 'OEE %',
      num: true,
      avg: true,
      width: 92,
      disp: (r) => pct(r.oee),
      get: (r) => r.oee,
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
    { key: 'ad', label: 'AD', num: true, dec: true, total: true, width: 78, get: (r) => r.ad },
    { key: 'planQty', label: 'M/C PLAN QTY', num: true, total: true, width: 130, get: (r) => r.planQty, cell: (r) => fmt(r.planQty) },
    { key: 'dtHrs', label: 'DOWN TIME (HRS)', num: true, dec: true, total: true, width: 140, get: (r) => r.downtimeHrs },
    { key: 'loss', label: 'TOTAL LOSS QTY', num: true, total: true, width: 138, get: (r) => r.lossQty, cell: (r) => fmt(r.lossQty) },
    { key: 'oi', label: 'OI (OPERATOR DT)', num: true, total: true, width: 146, get: (r) => r.operatorInefficiency },
    { key: 'mi', label: 'MI (MACHINE DT)', num: true, total: true, width: 142, get: (r) => r.machineInefficiency },
    {
      key: 'cgGoods',
      label: 'CG GOODS ACCORDING TO PASS',
      title: "CG Goods According to PASS — the sheet's own column (formula: Good x PASS). Total Achievement counts this for CG machines instead of Good.",
      num: true,
      total: true,
      width: 220,
      get: (r) => cgGoodsOf(r),
    },
  ]
  const all = [...base, ...dt, ...tail]

  // Each cell's class string and style object depend only on its column and the row's stripe,
  // never on the row's data. Building them once here — instead of 73 string concatenations
  // and 146 object allocations per row — is what keeps a block swap off the frame budget.
  return all.map((c, ci) => ({
    ...c,
    disp: c.disp ?? ((r: PdRow) => (c.num ? (c.dec ? fmt2(Number(c.get(r))) : fmt(Number(c.get(r)))) : dash(String(c.get(r) ?? '')))),
    cls: `px-2 py-1.5 border-t border-[var(--hairline)] whitespace-nowrap${c.num ? ' text-right tabular-nums' : ''}${
      ci === 0 ? ' sticky left-0' : ''
    }`,
    stEven: { color: 'var(--ink-2)', background: ci === 0 ? 'var(--surface)' : undefined, minWidth: c.width },
    stOdd: { color: 'var(--ink-2)', background: 'var(--surface-2)', minWidth: c.width },
  }))
}

/** Fixed row height, in px — the windowing maths below depends on it, so the <tr> sets it. */
const ROW_H = 30
/**
 * Rows are re-windowed a block at a time rather than on every frame.
 *
 * Swapping rows in and out is what costs — a synthetic 200px-per-frame fling spent ~280ms a
 * frame doing it, while the same table with no DOM mutation scrolled in 17ms. Moving the
 * window only when the scroll crosses a whole block turns that into one swap every BLOCK
 * rows, and OVERSCAN (which must exceed BLOCK) keeps rendered rows ahead of the viewport so
 * nothing blank is ever on screen.
 */
const BLOCK = 12
const OVERSCAN = 24

/**
 * One row, memoised.
 *
 * Every scroll event moves the window, which re-renders this table. Without memo each of the
 * ~33 on-screen rows would rebuild all 73 of its cells on every frame; with it, only the
 * handful of rows that just scrolled into view do any work. `cols` comes from a useMemo and
 * each `r` is a stable object, so the comparison is a cheap reference check.
 */
const Row = memo(function Row({ r, cols, zebra }: { r: PdRow; cols: Col[]; zebra: boolean }) {
  return (
    <tr style={{ height: ROW_H }}>
      {cols.map((c) => (
        <td key={c.key} className={c.cls} style={zebra ? c.stOdd : c.stEven}>
          {c.cell ? c.cell(r) : c.num ? (c.dec ? fmt2(Number(c.get(r))) : fmt(Number(c.get(r)))) : dash(String(c.get(r) ?? ''))}
        </td>
      ))}
    </tr>
  )
})

/**
 * One column's filter.
 *
 * `values` is the tick list — the same shape Excel's column filter uses, holding the cell
 * TEXT as shown on screen so what is ticked is what is read. `text` is the contains-match the
 * quick bar's Item Code box writes; a column can carry either.
 */
interface ColFilter {
  values?: string[]
  text?: string
  /**
   * An inclusive range over the column's RAW value, which for the date column is the ISO
   * yyyy-mm-dd the sheet was parsed into — those sort correctly as plain strings, so a
   * From/To pair needs no date maths.
   */
  from?: string
  to?: string
}

const isActive = (f?: ColFilter) => !!(f && ((f.values && f.values.length) || f.text || f.from || f.to))

/** Does one row survive one column's filter? */
function passes(r: PdRow, col: Col, f: ColFilter): boolean {
  if (f.from || f.to) {
    const raw = String(col.get(r) ?? '')
    if (f.from && raw < f.from) return false
    if (f.to && raw > f.to) return false
  }
  const shownText = col.disp ? col.disp(r) : String(col.get(r) ?? '')
  if (f.values && f.values.length && !f.values.includes(shownText)) return false
  if (f.text && !shownText.toLowerCase().includes(f.text.toLowerCase())) return false
  return true
}

/** Rows surviving every filter, optionally ignoring one column's own. */
function applyFilters(rows: PdRow[], cols: Col[], filters: Record<string, ColFilter>, exceptKey?: string): PdRow[] {
  const active = Object.entries(filters).filter(([k, f]) => k !== exceptKey && isActive(f))
  if (!active.length) return rows
  const pairs = active.map(([k, f]) => [cols.find((c) => c.key === k), f] as const).filter(([c]) => !!c)
  return rows.filter((r) => pairs.every(([c, f]) => passes(r, c as Col, f)))
}

const FIELD =
  'w-full rounded-lg border border-[var(--hairline)] px-2.5 py-1.5 text-[12.5px] bg-[var(--surface)] outline-none'

/**
 * One labelled box in the quick bar, with the funnel that opens its full tick list.
 *
 * The popover is rendered from HERE rather than at the foot of the bar, so it opens against
 * the funnel that was clicked — with four fields side by side, one shared popover at the
 * bottom left gave no clue which column it belonged to.
 */
function BarField({
  label,
  colKey,
  barOpen,
  setBarOpen,
  width = 'w-full sm:w-[190px]',
  children,
  popover,
}: {
  label: string
  colKey: string
  barOpen: string | null
  setBarOpen: (k: string | null) => void
  /** Tailwind width for the control; the date range needs more room than a select. */
  width?: string
  children: React.ReactNode
  popover?: React.ReactNode
}) {
  return (
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
          {barOpen === colKey && popover}
        </div>
      </div>
    </div>
  )
}

/** How many ticks to render at once — a column like ITEM NAME has hundreds of distinct values. */
const MAX_OPTIONS = 400

/**
 * Excel's column filter: search, Select all, a tick per distinct value, Clear / Apply.
 *
 * The list is built from the rows that survive every OTHER column's filter, the way Excel
 * narrows its own drop-downs, so it never offers a value that would return nothing. Nothing
 * is committed until Apply — with ~1,000 rows behind the table, filtering on each tick would
 * re-render the whole window per click.
 */
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
  rows: PdRow[]
  filters: Record<string, ColFilter>
  setFilters: (f: Record<string, ColFilter>) => void
  onClose: () => void
  alignRight: boolean
  popRef: React.MutableRefObject<HTMLDivElement | null>
}) {
  const t = useT()
  const [query, setQuery] = useState('')

  /*
   * Nudged back on screen after it lands.
   *
   * The box is anchored to the funnel that was clicked, which on a phone can sit close enough
   * to an edge that a 280px panel hangs off it — measured at x=-67 on a 390px screen. Rather
   * than guess a side, it is measured once and shifted by exactly the overhang.
   */
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [shift, setShift] = useState(0)
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const pad = 8
    if (r.left < pad) setShift(pad - r.left)
    else if (r.right > window.innerWidth - pad) setShift(window.innerWidth - pad - r.right)
  }, [])

  const options = useMemo(() => {
    const base = applyFilters(rows, cols, filters, col.key)
    const seen = new Set<string>()
    for (const r of base) seen.add(col.disp ? col.disp(r) : String(col.get(r) ?? ''))
    return [...seen].sort((a, b) =>
      a === '—' ? 1 : b === '—' ? -1 : a.localeCompare(b, undefined, { numeric: true }),
    )
  }, [rows, cols, filters, col])

  /**
   * Which section each value sits under, and in what order the sections run.
   *
   * GROUP_SEQUENCE is the app's existing shop-floor order (FG, CG, EG, IG, HO) — the same one
   * the Cumulative page uses — so the filter reads in the order the plant talks about itself.
   * Anything the sequence does not name follows, alphabetically.
   */
  const sectionOf = useMemo(() => {
    const m = new Map<string, string>()
    if (!col.groupBy) return m
    for (const r of rows) {
      const value = col.disp ? col.disp(r) : String(col.get(r) ?? '')
      const g = col.groupBy(r)
      if (value && g && !m.has(value)) m.set(value, g)
    }
    return m
  }, [rows, col])

  const sectionRank = (g: string) => {
    const i = GROUP_SEQUENCE.indexOf(g)
    return i === -1 ? GROUP_SEQUENCE.length : i
  }

  // No filter yet means everything is in play, which shows as every box ticked.
  const [picked, setPicked] = useState<Set<string>>(() => {
    const f = filters[col.key]
    return new Set(f?.values?.length ? f.values : options)
  })

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? options.filter((o) => o.toLowerCase().includes(q)) : options
    return list.slice(0, MAX_OPTIONS)
  }, [options, query])

  /*
   * What "Select all" means depends on whether a search is running.
   *
   * With no search it is the plain toggle. With one, it means "the results ARE the filter" —
   * type IG., tick it once, Apply, and you get the IG machines. Treating it as a plain toggle
   * there took two clicks to land back where it started, because the hidden values stayed
   * ticked underneath.
   */
  const searching = query.trim() !== ''
  /** The visible values, cut into headed sections when the column defines one. */
  const sections = useMemo(() => {
    if (!col.groupBy || sectionOf.size === 0) return [{ name: '', values: visible }]
    const by = new Map<string, string[]>()
    for (const v of visible) {
      const g = sectionOf.get(v) || '—'
      if (!by.has(g)) by.set(g, [])
      by.get(g)!.push(v)
    }
    return [...by.entries()]
      .sort((a, b) => sectionRank(a[0]) - sectionRank(b[0]) || a[0].localeCompare(b[0]))
      .map(([name, values]) => ({ name, values }))
  }, [visible, sectionOf, col])

  const allVisiblePicked = searching
    ? visible.length > 0 && picked.size === visible.length && visible.every((o) => picked.has(o))
    : visible.length > 0 && visible.every((o) => picked.has(o))

  const toggle = (v: string) => {
    const next = new Set(picked)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    setPicked(next)
  }

  const apply = () => {
    const next = { ...filters }
    const existing = filters[col.key]
    // A date range set in the quick bar lives on the same column; ticking values must narrow
    // it, not silently drop it.
    const range = existing?.from || existing?.to ? { from: existing.from, to: existing.to } : {}
    // Everything ticked is the same as no value filter — keep the map clean so the count is honest.
    const all = picked.size === 0 || picked.size === options.length
    if (all && !range.from && !range.to) delete next[col.key]
    else next[col.key] = { ...range, ...(all ? {} : { values: [...picked] }) }
    setFilters(next)
    onClose()
  }

  const clear = () => {
    const next = { ...filters }
    delete next[col.key]
    setFilters(next)
    onClose()
  }

  return (
    <div
      ref={(el) => {
        boxRef.current = el
        popRef.current = el
      }}
      className={`absolute z-40 mt-1 ${alignRight ? 'right-0' : 'left-0'} rounded-xl border border-[var(--hairline)] shadow-2xl text-left normal-case tracking-normal`}
      style={{
        background: 'var(--surface)',
        width: 280,
        maxWidth: 'calc(100vw - 16px)',
        transform: shift ? `translateX(${shift}px)` : undefined,
      }}
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
        {sections.map(({ name, values }) => (
          <div key={name}>
            {name && (
              // The section header ticks its whole group at once — "all of FG" is one click,
              // while the machines under it stay individually selectable.
              <label
                className="flex items-center gap-2 py-1.5 mt-1 cursor-pointer sticky top-0"
                style={{ background: 'var(--surface)' }}
              >
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-blue-600 shrink-0"
                  checked={values.every((v) => picked.has(v))}
                  onChange={() => {
                    const next = new Set(picked)
                    if (values.every((v) => picked.has(v))) values.forEach((v) => next.delete(v))
                    else values.forEach((v) => next.add(v))
                    setPicked(next)
                  }}
                />
                <span className="text-[11.5px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>
                  {name}
                </span>
                <span className="ml-auto text-[11px] tabular-nums" style={{ color: 'var(--ink-hint)' }}>
                  {values.filter((v) => picked.has(v)).length}/{values.length}
                </span>
              </label>
            )}
            {values.map((o) => (
              <label key={o} className={`flex items-center gap-2 py-1.5 cursor-pointer ${name ? 'pl-5' : ''}`}>
                <input type="checkbox" className="w-4 h-4 accent-blue-600 shrink-0" checked={picked.has(o)} onChange={() => toggle(o)} />
                <span className="text-[13px] min-w-0 truncate" style={{ color: 'var(--ink)' }} title={o}>
                  {o}
                </span>
              </label>
            ))}
          </div>
        ))}
        {visible.length === 0 && (
          <div className="py-4 text-center text-[12px]" style={{ color: 'var(--ink-hint)' }}>
            {t('No matching values.')}
          </div>
        )}
        {options.length > visible.length && query.trim() === '' && (
          <div className="py-2 text-[11px]" style={{ color: 'var(--ink-hint)' }}>
            {t('Showing first')} {MAX_OPTIONS} {t('of')} {options.length} — {t('search to narrow.')}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 p-3 pt-2.5 border-t border-[var(--hairline)]">
        <button
          onClick={clear}
          className="flex-1 rounded-lg border py-2 text-[13px] font-bold"
          style={{ borderColor: '#f0a1a1', color: '#c0392b' }}
        >
          {t('Clear')}
        </button>
        <button onClick={apply} className="flex-1 rounded-lg py-2 text-[13px] font-bold text-white" style={{ background: '#0f172a' }}>
          {t('Apply')}
        </button>
      </div>
    </div>
  )
}

/**
 * The two header rows, memoised.
 *
 * They are 73 sticky cells with an icon button each. Scrolling re-renders the table on every
 * frame, and rebuilding this block each time cost more than the rows did — none of what it
 * depends on changes while the user is scrolling.
 */
const TableHead = memo(function TableHead({
  cols,
  rows,
  totals,
  filters,
  setFilters,
  open,
  setOpen,
  popRef,
}: {
  cols: Col[]
  rows: PdRow[]
  totals: Record<string, number>
  filters: Record<string, ColFilter>
  setFilters: (f: Record<string, ColFilter>) => void
  open: string | null
  setOpen: (k: string | null) => void
  popRef: React.MutableRefObject<HTMLDivElement | null>
}) {
  // Taken from the hook rather than a prop: useT() hands back a new closure every render, so
  // as a prop it would make this memo useless.
  const t = useT()
  return (
          <thead>
            {/* TOTAL strip, above the header — the figure a supervisor reads first. */}
            <tr>
              {cols.map((c, i) => (
                <th
                  key={c.key}
                  className={`sticky top-0 z-20 px-2 py-2 whitespace-nowrap font-extrabold text-[12px] ${c.num ? 'text-right' : 'text-left'} ${
                    i === 0 ? 'left-0 z-30' : ''
                  }`}
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
  )
})

export function PdFullTable({
  rows,
  reasons,
  textNumbers = [],
  onFilteredChange,
}: {
  rows: PdRow[]
  reasons: string[]
  textNumbers?: TextNumberCell[]
  /**
   * The surviving rows, reported upward so the KPI cards read the same slice the table shows.
   * Filtering to one machine has to move every number on the page, not just the grid.
   */
  onFilteredChange?: (rows: PdRow[]) => void
}) {
  const t = useT()
  const cols = useMemo(() => buildColumns(reasons), [reasons])
  const [filters, setFilters] = useState<Record<string, ColFilter>>({})
  const [open, setOpen] = useState<string | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)

  /** The quick bar's own boxes. Held as a draft and committed by its Filters button. */
  const [bar, setBar] = useState({ shift: '', machine: '', item: '' })
  const [barOpen, setBarOpen] = useState<string | null>(null)
  const barPopRef = useRef<HTMLDivElement | null>(null)

  // The quick bar's popover closes the same way the header ones do.
  useEffect(() => {
    if (!barOpen) return
    const away = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (barPopRef.current?.contains(el)) return
      if (el.closest('button[aria-label^="Filter "]')) return
      setBarOpen(null)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setBarOpen(null)
    document.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [barOpen])

  // Click anywhere else — including on another header — and the popover goes away. Without
  // this it sits over the rows while the table is scrolled sideways underneath it.
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (popRef.current?.contains(el)) return
      if (el.closest('button[aria-label^="Filter "]')) return
      setOpen(null)
    }

    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    document.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  const shown = useMemo(() => applyFilters(rows, cols, filters), [rows, cols, filters])

  useEffect(() => {
    onFilteredChange?.(shown)
  }, [shown, onFilteredChange])

  const totals = useMemo(() => {
    const out: Record<string, number> = {}
    for (const c of cols) {
      if (c.avg) {
        // Weighted by minutes covered, ignoring rows the sheet left blank — the same maths
        // pdKpis() uses, so the strip and the cards can never disagree.
        let w = 0
        let acc = 0
        for (const r of shown) {
          const v = Number(c.get(r)) || 0
          const m = r.availableMin || r.planHrs * 60
          if (m > 0 && v > 0) {
            w += m
            acc += v * m
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

  /*
   * Only the rows on screen are in the DOM.
   *
   * A full month is ~1,000 rows x 73 columns = ~74,000 cells. Rendering all of them took 30 s
   * to paint and 7.6 s per filter keystroke on a 4x-throttled phone — the table was unusable
   * on the devices most likely to open it. Rows are a fixed height, so the visible slice can
   * be computed straight from scrollTop, with two spacer rows holding the scrollbar honest.
   */
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewH, setViewH] = useState(600)
  const rafRef = useRef(0)

  // Scroll fires far more often than the screen repaints; coalescing to one update per frame
  // keeps a flick from queueing dozens of renders it will never show.
  const onScroll = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      // Snapped to a block boundary, so most frames leave state — and the DOM — untouched.
      const top = scrollRef.current?.scrollTop ?? 0
      setScrollTop(Math.floor(top / (ROW_H * BLOCK)) * ROW_H * BLOCK)
    })
  }, [])
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setViewH(el.clientHeight || 600)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Filtering changes which rows exist, so an old offset would leave the view blank.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    setScrollTop(0)
  }, [filters])


  // The picker's "Last 7d" should mean the last seven days OF THIS REPORT, not of the calendar.
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

  const colBy = useCallback((key: string) => cols.find((c) => c.key === key) as Col, [cols])
  const optionsFor = useCallback(
    (key: string) => {
      const c = colBy(key)
      if (!c) return []
      const seen = new Set<string>()
      for (const r of rows) seen.add(c.disp ? c.disp(r) : String(c.get(r) ?? ''))
      return [...seen].filter((v) => v !== '—').sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    },
    [rows, colBy],
  )

  /** The bar writes into the same filter map the column headers use — one source of truth. */
  const applyBar = () => {
    const next = { ...filters }
    const set = (key: string, value: string, asText = false) => {
      if (!value) delete next[key]
      else next[key] = asText ? { text: value } : { values: [value] }
    }
    set('shift', bar.shift)
    set('machine', bar.machine)
    set('itemCode', bar.item, true)
    setFilters(next)
  }

  const clearAll = () => {
    setBar({ shift: '', machine: '', item: '' })
    setFilters({})
  }

  /** The tick list for one bar field, anchored under that field's funnel. */
  const barPopover = (key: string) => {
    const c = colBy(key)
    if (!c) return null
    return (
      <ColumnFilterPopover
        col={c}
        cols={cols}
        rows={rows}
        filters={filters}
        setFilters={setFilters}
        onClose={() => setBarOpen(null)}
        alignRight
        popRef={barPopRef}
      />
    )
  }

  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const last = Math.min(shown.length, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN)
  const slice = shown.slice(first, last)
  const padTop = first * ROW_H
  const padBottom = Math.max(0, (shown.length - last) * ROW_H)

  return (
    <div className="bento overflow-hidden min-w-0">
      <div className="px-3 md:px-4 py-2.5 border-b border-[var(--hairline)] flex items-center gap-3 flex-wrap">
        <div className="font-bold text-slate-800 text-sm">{t('PD Report')}</div>
        <div className="text-xs" style={{ color: 'var(--ink-hint)' }}>
          {fmt(shown.length)} {t('row(s)')}
          {shown.length !== rows.length && ` ${t('of')} ${fmt(rows.length)}`} · {cols.length} {t('columns')}
        </div>
        <div className="ml-auto">
          <HScrollButtons scrollRef={scrollRef} />
        </div>
      </div>

      {/*
        * Excel's SUM skips text cells while its `+` operator counts them, so a column footer in
        * the workbook can disagree with the workbook's own Total column. This table counts them
        * — they are real output — and says which cells to correct at source.
        */}
      {textNumbers.length > 0 && (
        <div
          className="px-3 md:px-4 py-2 text-[12px] border-b border-[var(--hairline)] flex items-start gap-2"
          style={{ background: 'color-mix(in srgb, #f59e0b 12%, var(--surface))', color: 'var(--ink-2)' }}
        >
          <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: '#a16207' }} />
          <span className="min-w-0">
            <b>
              {textNumbers.length} {t('cell(s) hold a number stored as text')}
            </b>{' '}
            — {textNumbers.map((c) => `${c.ref} "${c.value}" (${c.column})`).join(', ')}.{' '}
            {t("Excel's SUM skips these, so its column footer reads low; this table and the sheet's own Total column count them.")}
          </span>
        </div>
      )}

      {/*
        * The quick bar: the four things anyone actually filters by, above the table where they
        * can be reached without scrolling 74 headers sideways. Each funnel opens that column's
        * full tick list against its own field, and everything lands in the same filter map the
        * column headers write to.
        */}
      <div className="px-3 md:px-4 py-2.5 border-b border-[var(--hairline)] flex flex-col sm:flex-row sm:items-end gap-x-3 gap-y-2.5 sm:flex-wrap">
        <BarField
          label={t('Date range')}
          colKey="date"
          barOpen={barOpen}
          setBarOpen={setBarOpen}
          width="w-auto"
          popover={barPopover('date')}
        >
          {/* The Dashboard's picker, reused as-is — one date control, one behaviour. */}
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
        </BarField>

        <BarField
          label={t('Shift')}
          colKey="shift"
          barOpen={barOpen}
          setBarOpen={setBarOpen}
          width="w-full sm:w-[140px]"
          popover={barPopover('shift')}
        >
          <select value={bar.shift} onChange={(e) => setBar({ ...bar, shift: e.target.value })} className={FIELD}>
            <option value="">{t('All')}</option>
            {optionsFor('shift').map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </BarField>

        <BarField
          label={t('Machine')}
          colKey="machine"
          barOpen={barOpen}
          setBarOpen={setBarOpen}
          width="w-full sm:w-[150px]"
          popover={barPopover('machine')}
        >
          <select value={bar.machine} onChange={(e) => setBar({ ...bar, machine: e.target.value })} className={FIELD}>
            <option value="">{t('All')}</option>
            {optionsFor('machine').map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </BarField>

        <BarField
          label={t('Item Code')}
          colKey="itemCode"
          barOpen={barOpen}
          setBarOpen={setBarOpen}
          width="w-full sm:w-[170px]"
          popover={barPopover('itemCode')}
        >
          <input
            value={bar.item}
            placeholder={t('Enter Item Code')}
            onChange={(e) => setBar({ ...bar, item: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && applyBar()}
            className={FIELD}
          />
        </BarField>

        <div className="flex items-center gap-2">
          <button
            onClick={applyBar}
            className="inline-flex items-center gap-1.5 rounded-lg text-white text-[12.5px] font-bold px-3 py-2"
            style={{ background: '#0f172a' }}
          >
            <Filter size={14} /> {t('Filters')}
          </button>
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1.5 rounded-lg border text-[12.5px] font-bold px-3 py-2"
            style={{ borderColor: '#f0a1a1', color: '#c0392b' }}
          >
            <RotateCcw size={14} /> {t('Clear')}
          </button>
          {activeCount > 0 && (
            <span className="text-[11.5px] font-semibold whitespace-nowrap" style={{ color: 'var(--ink-hint)' }}>
              {activeCount} {t('active')}
            </span>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="overflow-auto scroll-area"
        style={{ height: '68vh' }}
      >
        <table className="w-max text-[12px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <TableHead
            cols={cols}
            rows={rows}
            totals={totals}
            filters={filters}
            setFilters={setFilters}
            open={open}
            setOpen={setOpen}
            popRef={popRef}
          />
          <tbody>
            {padTop > 0 && (
              <tr style={{ height: padTop }} aria-hidden>
                <td colSpan={cols.length} style={{ padding: 0, border: 0 }} />
              </tr>
            )}
            {slice.map((r, si) => {
              const i = first + si
              return <Row key={`${r.sr}-${r.date}-${r.machine}-${i}`} r={r} cols={cols} zebra={i % 2 === 1} />
            })}
            {padBottom > 0 && (
              <tr style={{ height: padBottom }} aria-hidden>
                <td colSpan={cols.length} style={{ padding: 0, border: 0 }} />
              </tr>
            )}
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
