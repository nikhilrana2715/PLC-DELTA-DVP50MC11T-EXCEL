import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell as PieCell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowLeft, Table2 } from 'lucide-react'
import { Card, ChartTip, NoRows, C, PLOT } from './qaUi'
import { detailSheetFor, isBlankLabel, monthLabel, type QaSheet } from '../../lib/qaSheets'
import { CATEGORICAL, INK } from '../../lib/palette'
import { useT } from '../../lib/i18n'

const fmt = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-IN') : '—')

/**
 * Any workbook sheet, rendered.
 *
 * The workbook's built sheets come in two shapes, so this covers both rather than needing a
 * component per sheet: a "<label> × month" grid gets a trend, a top-10 bar and a share pie
 * on top of its table; a flat sheet gets its table plus a bar of whichever column carries
 * the largest numbers. Item rows link on to the per-item defect sheet named after the code.
 */
export function QaSheetView({
  sheet,
  allSheets,
  months,
  onOpenSheet,
  onBack,
}: {
  sheet: QaSheet
  allSheets: QaSheet[]
  /** Months allowed by the Month/Year filters; empty = no restriction. */
  months: string[]
  onOpenSheet: (name: string) => void
  onBack: () => void
}) {
  const t = useT()
  const [q, setQ] = useState('')
  const names = useMemo(() => allSheets.map((s) => s.name), [allSheets])

  // ---------- matrix ----------
  if (sheet.kind === 'matrix') {
    const keep = sheet.months.map((m, i) => ({ m, i })).filter(({ m }) => months.length === 0 || months.includes(m))
    const cols = keep.map(({ i }) => i)
    const labels = keep.map(({ m }) => monthLabel(m))
    const rows = sheet.rows
      .map((r) => {
        const cells = cols.map((i) => r.cells[i])
        return { name: r.name, cells, total: cells.reduce((s, v) => s + v, 0) }
      })
      .filter((r) => r.total !== 0)
      .filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.total - a.total)

    const colTotals = cols.map((_, ci) => rows.reduce((s, r) => s + r.cells[ci], 0))
    const grand = colTotals.reduce((s, v) => s + v, 0)
    const trend = labels.map((l, i) => ({ month: l, qty: colTotals[i] }))
    const top = rows.slice(0, 10).map((r) => ({ name: r.name, qty: r.total }))
    const share = rows.slice(0, 8).map((r) => ({ name: r.name, value: r.total }))

    return (
      <div className="flex flex-col gap-3 md:gap-4">
        <Head sheet={sheet} onBack={onBack} q={q} setQ={setQ} stats={[
          { label: t('Total Qty'), value: fmt(grand) },
          { label: sheet.labelHeader, value: fmt(rows.length) },
          { label: t('Months'), value: fmt(labels.length) },
        ]} />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-4">
          <Card title={`${sheet.name} — ${t('Trend Over Months')}`}>
            {trend.length === 0 ? <NoRows /> : (
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 16, right: 16, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="qaSheetArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={PLOT.line} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={PLOT.line} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={INK.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: INK.primary }} tickLine={false} interval={0} angle={-40} textAnchor="end" height={54} />
                    <YAxis tick={{ fontSize: 11, fill: INK.primary }} tickLine={false} axisLine={false} width={54} />
                    <Tooltip content={({ active, payload, label }) => (active && payload?.length
                      ? <ChartTip title={String(label)} items={[{ label: t('Qty'), value: fmt(Number(payload[0].value) || 0), color: PLOT.line }]} />
                      : null)} />
                    <Area type="monotone" dataKey="qty" stroke={PLOT.line} strokeWidth={2.5} fill="url(#qaSheetArea)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card title={`${t('Top')} ${sheet.labelHeader}`}>
            {top.length === 0 ? <NoRows /> : (
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={top} margin={{ top: 16, right: 16, left: 0, bottom: 4 }} barCategoryGap="28%">
                    <CartesianGrid stroke={INK.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: INK.primary }} tickLine={false} interval={0} angle={-40} textAnchor="end" height={76} />
                    <YAxis tick={{ fontSize: 11, fill: INK.primary }} tickLine={false} axisLine={false} width={54} />
                    <Tooltip cursor={{ fill: 'rgba(58,123,213,0.06)' }} content={({ active, payload, label }) => (active && payload?.length
                      ? <ChartTip title={String(label)} items={[{ label: t('Qty'), value: fmt(Number(payload[0].value) || 0), color: PLOT.barTo }]} />
                      : null)} />
                    <Bar dataKey="qty" fill={PLOT.barTo} radius={[5, 5, 0, 0]} maxBarSize={34} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-4">
          <Card title={`${t('Share')} — ${sheet.labelHeader}`}>
            {share.length === 0 ? <NoRows /> : (
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={share} dataKey="value" nameKey="name" cx="50%" cy="47%" outerRadius="72%" innerRadius="45%" isAnimationActive={false}>
                      {share.map((_, i) => <PieCell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip content={({ active, payload }) => (active && payload?.length
                      ? <ChartTip title={String(payload[0].name)} items={[{ label: t('Qty'), value: fmt(Number(payload[0].value) || 0), color: String(payload[0].payload.fill || PLOT.barTo) }]} />
                      : null)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card title={`${sheet.name} — ${t('Month-wise table')}`} hint={t('click a row for its detail sheet')}>
            <MatrixTable
              labelHeader={sheet.labelHeader}
              labels={labels}
              rows={rows}
              colTotals={colTotals}
              grand={grand}
              linkFor={(name) => detailSheetFor(name, names)}
              onOpen={onOpenSheet}
            />
          </Card>
        </div>
      </div>
    )
  }

  // ---------- flat ----------
  const rows = sheet.rows.filter((r) => !q || r.some((c) => String(c ?? '').toLowerCase().includes(q.toLowerCase())))
  // Chart the numeric column with the biggest spread, grouped by the first text column.
  const textCol = sheet.columns.findIndex((_, i) => !sheet.numericCols.includes(i))
  const valueCol = sheet.numericCols.length
    ? sheet.numericCols.reduce((best, i) => {
        const sum = (c: number) => rows.reduce((s, r) => s + (typeof r[c] === 'number' ? (r[c] as number) : 0), 0)
        return sum(i) > sum(best) ? i : best
      }, sheet.numericCols[0])
    : -1
  // Rows whose grouping cell is blank are not a category — they are an unfilled cell. They
  // are left out of the chart (a single "—" bar otherwise dwarfed every real one) and the
  // amount is reported underneath instead of vanishing.
  const { grouped, blank } = useMemo(() => {
    if (textCol < 0 || valueCol < 0) return { grouped: [] as { name: string; qty: number }[], blank: { rows: 0, qty: 0 } }
    const m = new Map<string, number>()
    const skipped = { rows: 0, qty: 0 }
    for (const r of rows) {
      const v = typeof r[valueCol] === 'number' ? (r[valueCol] as number) : 0
      const k = String(r[textCol] ?? '').trim()
      if (isBlankLabel(k)) {
        skipped.rows++
        skipped.qty += v
        continue
      }
      m.set(k, (m.get(k) || 0) + v)
    }
    return {
      grouped: [...m.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 12),
      blank: skipped,
    }
  }, [rows, textCol, valueCol])

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      <Head sheet={sheet} onBack={onBack} q={q} setQ={setQ} stats={[
        { label: t('Rows'), value: fmt(rows.length) },
        { label: t('Columns'), value: fmt(sheet.columns.length) },
        ...(valueCol >= 0
          ? [{ label: sheet.columns[valueCol], value: fmt(rows.reduce((s, r) => s + (typeof r[valueCol] === 'number' ? (r[valueCol] as number) : 0), 0)) }]
          : []),
      ]} />

      {grouped.length > 0 && (
        <Card title={`${sheet.columns[valueCol]} ${t('by')} ${sheet.columns[textCol]}`}>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grouped} margin={{ top: 16, right: 16, left: 0, bottom: 4 }} barCategoryGap="28%">
                <CartesianGrid stroke={INK.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: INK.primary }} tickLine={false} interval={0} angle={-40} textAnchor="end" height={86} />
                <YAxis tick={{ fontSize: 11, fill: INK.primary }} tickLine={false} axisLine={false} width={54} />
                <Tooltip cursor={{ fill: 'rgba(58,123,213,0.06)' }} content={({ active, payload, label }) => (active && payload?.length
                  ? <ChartTip title={String(label)} items={[{ label: sheet.columns[valueCol], value: fmt(Number(payload[0].value) || 0), color: PLOT.barTo }]} />
                  : null)} />
                <Bar dataKey="qty" fill={PLOT.barTo} radius={[5, 5, 0, 0]} maxBarSize={34} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {blank.rows > 0 && (
            <div className="text-[11px] px-2 pt-2" style={{ color: 'var(--ink-hint)' }}>
              {blank.rows} {t('row(s) have no')} {sheet.columns[textCol]} {t('and are left out of this chart')} ({fmt(blank.qty)})
            </div>
          )}
        </Card>
      )}

      <Card title={`${sheet.name} — ${t('Data')}`} hint={`${fmt(rows.length)} ${t('row(s)')}`}>
        <FlatTable columns={sheet.columns} rows={rows.slice(0, 400)} numericCols={sheet.numericCols} />
        {rows.length > 400 && (
          <div className="text-[11px] px-2 py-2" style={{ color: 'var(--ink-hint)' }}>
            {t('Showing the first 400 rows — narrow the search to see the rest.')}
          </div>
        )}
      </Card>
    </div>
  )
}

function Head({
  sheet,
  onBack,
  q,
  setQ,
  stats,
}: {
  sheet: QaSheet
  onBack: () => void
  q: string
  setQ: (v: string) => void
  stats: { label: string; value: string }[]
}) {
  const t = useT()
  return (
    <div className="bento overflow-hidden">
      <div className="flex items-center gap-2 md:gap-3 px-3 md:px-5 py-2.5 md:py-3 border-b border-[var(--hairline)] flex-wrap min-w-0">
        <button className="icon-btn shrink-0" onClick={onBack}>
          <ArrowLeft size={14} /> {t('Summary')}
        </button>
        <div className="stat-icon stat-icon-sm grad-blue shrink-0">
          <Table2 size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-slate-800 text-[13px] md:text-base truncate">{sheet.name}</div>
          {sheet.title && (
            <div className="text-xs truncate" style={{ color: 'var(--ink-hint)' }}>
              {sheet.title}
            </div>
          )}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('Search…')}
          className="text-sm rounded-xl border border-[var(--hairline)] px-3 py-1.5 bg-[var(--surface)] outline-none text-slate-700 w-full sm:w-56 order-last sm:order-none"
        />
      </div>
      <div className="grid grid-cols-3 gap-2 md:gap-2.5 p-3 md:p-4">
        {stats.map((s, i) => (
          <div key={s.label} className={`stat-card ${['tint-blue', 'tint-emerald', 'tint-violet'][i % 3]} p-3`}>
            <div className="text-[10px] md:text-[11px] font-semibold uppercase tracking-wide text-slate-600 truncate">{s.label}</div>
            <div className="text-base md:text-2xl font-extrabold tracking-tight leading-tight" style={{ color: 'var(--ink)' }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MatrixTable({
  labelHeader,
  labels,
  rows,
  colTotals,
  grand,
  linkFor,
  onOpen,
}: {
  labelHeader: string
  labels: string[]
  rows: { name: string; cells: number[]; total: number }[]
  colTotals: number[]
  grand: number
  linkFor: (name: string) => string | null
  onOpen: (name: string) => void
}) {
  if (rows.length === 0) return <NoRows />
  return (
    <div className="overflow-auto scroll-area" style={{ maxHeight: 420 }}>
      <table className="w-max min-w-full text-[12.5px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          <tr>
            <th className="sticky top-0 left-0 z-20 bg-slate-50 text-left px-3 py-2.5 font-bold uppercase tracking-wide text-[11px]" style={{ color: 'var(--ink-hint)' }}>
              {labelHeader}
            </th>
            {labels.map((l) => (
              <th key={l} className="sticky top-0 z-10 bg-slate-50 text-right px-3 py-2.5 font-bold uppercase tracking-wide text-[11px] whitespace-nowrap" style={{ color: 'var(--ink-hint)' }}>
                {l}
              </th>
            ))}
            <th className="sticky top-0 z-10 bg-slate-50 text-right px-3 py-2.5 font-bold uppercase tracking-wide text-[11px]" style={{ color: 'var(--ink-hint)' }}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const link = linkFor(r.name)
            return (
              <tr
                key={r.name}
                className={link ? 'cursor-pointer hover:bg-slate-50' : ''}
                onClick={link ? () => onOpen(link) : undefined}
                title={link ? `Open sheet ${link}` : undefined}
              >
                <td className="sticky left-0 bg-[var(--surface)] px-3 py-2 border-t border-[var(--hairline)] font-semibold text-slate-700 whitespace-nowrap">
                  {r.name}
                  {link && <span className="ml-1.5 text-[10px] font-bold" style={{ color: C.bar }}>› {link}</span>}
                </td>
                {r.cells.map((v, i) => (
                  <td key={i} className="px-3 py-2 border-t border-[var(--hairline)] text-right tabular-nums text-slate-600">
                    {v ? fmt(v) : '—'}
                  </td>
                ))}
                <td className="px-3 py-2 border-t border-[var(--hairline)] text-right tabular-nums font-extrabold text-slate-800">{fmt(r.total)}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="sticky left-0 bg-slate-50 px-3 py-2.5 border-t-2 border-slate-300 font-extrabold text-slate-900">Total</td>
            {colTotals.map((v, i) => (
              <td key={i} className="px-3 py-2.5 border-t-2 border-slate-300 text-right tabular-nums font-bold text-slate-800">{fmt(v)}</td>
            ))}
            <td className="px-3 py-2.5 border-t-2 border-slate-300 text-right tabular-nums font-extrabold text-slate-900">{fmt(grand)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function FlatTable({ columns, rows, numericCols }: { columns: string[]; rows: unknown[][]; numericCols: number[] }) {
  if (rows.length === 0) return <NoRows />
  return (
    <div className="overflow-auto scroll-area" style={{ maxHeight: 460 }}>
      <table className="w-max min-w-full text-[12.5px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th
                key={i}
                className={`sticky top-0 z-10 bg-slate-50 px-3 py-2.5 font-bold uppercase tracking-wide text-[11px] whitespace-nowrap ${numericCols.includes(i) ? 'text-right' : 'text-left'}`}
                style={{ color: 'var(--ink-hint)' }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {columns.map((_, ci) => (
                <td
                  key={ci}
                  className={`px-3 py-2 border-t border-[var(--hairline)] whitespace-nowrap ${numericCols.includes(ci) ? 'text-right tabular-nums text-slate-700' : 'text-slate-600'}`}
                >
                  {typeof r[ci] === 'number' ? fmt(r[ci] as number) : String(r[ci] ?? '') || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
