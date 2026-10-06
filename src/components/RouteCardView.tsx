import { useMemo, useRef, useState } from 'react'
import { CalendarClock, CheckCircle2, FileSpreadsheet, Filter, Layers, RotateCcw, Rows3, Search, TriangleAlert } from 'lucide-react'
import { DEADLINE_DAYS, DUE_AFTER_DAYS, routeCardColumns, routeCardTally, type RouteCard, type RowState } from '../lib/routeCard'
import { useT } from '../lib/i18n'
import { HScrollButtons } from './HScrollButtons'
import { RouteCardTable, applyFilters, type SheetFilters } from './RouteCardTable'

/**
 * A route card on screen: the month's headline counts on top, then the workbook's own tabs
 * with each sheet as it was written.
 *
 * Nothing here knows what a route card's columns are called, so a revision that renames or
 * adds a column shows up on its own. The one rule the screen does apply is the deadline
 * colour — see `routeCard.ts`.
 */

/** A stable colour per tab — the same sheet keeps its colour on every upload, so a tab is
 *  findable by eye rather than by reading every label. (Excel's own tab colours are not in
 *  the part of the file format SheetJS reads.) */
const TAB_COLOURS = ['#2f9e5e', '#7c5cd6', '#2b7fd4', '#d98324', '#8a8f2e', '#c0466b', '#3f8f8f', '#a8563a']
const tabColour = (name: string): string => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return TAB_COLOURS[h % TAB_COLOURS.length]
}

/** The sheet's own fill, in the app's palette — the same three colours the pills use. */
const DEADLINE_INK: Record<RowState, { bg: string; fg: string }> = {
  closed: { bg: '#dff5df', fg: '#0a7a0a' },
  due: { bg: '#fde4e4', fg: '#b0201f' },
  open: { bg: '#fff2d6', fg: '#916200' },
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tint,
  grad,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  tint: string
  grad: string
}) {
  const t = useT()
  return (
    <div className={`stat-card ${tint} rise`}>
      <div className="p-3 md:p-4">
        <div className={`stat-icon ${grad}`}>{icon}</div>
        <div className="mt-2 text-[11px] md:text-xs font-semibold uppercase tracking-wide text-slate-600 leading-tight">{t(label)}</div>
        <div className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 leading-tight">{value}</div>
        {sub && <div className="text-[11px] font-semibold text-slate-500 leading-tight mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

export function RouteCardView({ card, todayISO }: { card: RouteCard; todayISO: string }) {
  const t = useT()
  const [tab, setTab] = useState(0)
  const [q, setQ] = useState('')
  const scroller = useRef<HTMLDivElement | null>(null)

  /** Column filters for the sheet on screen, keyed by column index. */
  const [filters, setFilters] = useState<SheetFilters>({})

  const sheet = card.sheets[Math.min(tab, card.sheets.length - 1)]
  // Which columns carry the rule — worked out from the sheet on screen, not stored, so a
  // card saved before this rule existed is coloured the moment it is opened.
  const cols = useMemo(() => routeCardColumns(sheet.columns, sheet.cells), [sheet])
  // The closing rule only applies where the sheet actually tracks closing. A sheet with
  // dates but no status, close date or deadline (a rejection log, say) is just a table —
  // counting its rows as "overdue" would be inventing a rule it never had.
  const tracked = cols.date >= 0 && (cols.deadline >= 0 || cols.status >= 0 || cols.closedOn >= 0)

  const query = q.trim().toLowerCase()
  // Search runs across the whole row, because which column holds the batch number is
  // exactly the thing this screen refuses to assume. The column filters narrow it further,
  // and everything on the page — cards and totals alike — is read off what survives.
  const rows = useMemo(() => {
    const filtered = applyFilters(sheet.cells, filters)
    return query ? filtered.filter((r) => r.join(' ').toLowerCase().includes(query)) : filtered
  }, [sheet, filters, query])
  const filterCount = Object.values(filters).filter((v) => v.length > 0).length
  const narrowed = filterCount > 0 || query !== ''
  // Every card counts the rows on screen, so a filter moves the figures with it.
  const tally = useMemo(() => routeCardTally(rows, cols, todayISO), [rows, cols, todayISO])

  const fmt = (n: number) => n.toLocaleString('en-IN')

  return (
    <>
      {narrowed && (
        <div
          className="rounded-xl px-3 py-2 text-[12.5px] font-semibold flex items-center gap-2 flex-wrap"
          style={{ background: 'color-mix(in srgb, #3b82f6 12%, var(--surface))', color: 'var(--ink-2)' }}
        >
          <Filter size={14} style={{ color: '#2563eb' }} />
          {t('Every figure below is for the filtered rows only')} — {rows.length} {t('of')} {sheet.cells.length}.
          {filterCount > 0 && (
            <button
              onClick={() => setFilters({})}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-bold"
              style={{ borderColor: '#f0a1a1', color: '#c0392b' }}
            >
              <RotateCcw size={12} /> {t('Clear filters')} ({filterCount})
            </button>
          )}
        </div>
      )}

      {/* ---- KPI cards ---- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Kpi
          icon={<Layers size={20} />}
          label="Total Route Card"
          value={fmt(tally.total)}
          sub={`${sheet.name} · ${card.title}`}
          tint="tint-violet"
          grad="grad-violet"
        />
        {tracked && (
          <>
            <Kpi
              icon={<CheckCircle2 size={20} />}
              label="Closed"
              value={fmt(tally.closed)}
              sub={t('closed on or before deadline entry')}
              tint="tint-emerald"
              grad="grad-emerald"
            />
            <Kpi
              icon={<TriangleAlert size={20} />}
              label="Overdue"
              value={fmt(tally.due)}
              sub={`${t('open')} ${DUE_AFTER_DAYS}+ ${t('days')}`}
              tint="tint-red"
              grad="grad-red"
            />
            <Kpi
              icon={<CalendarClock size={20} />}
              label="Within Deadline"
              value={fmt(tally.open)}
              sub={`${t('open, under')} ${DUE_AFTER_DAYS} ${t('days')}`}
              tint="tint-yellow"
              grad="grad-yellow"
            />
          </>
        )}
      </div>

      <div className="bento overflow-hidden min-w-0">
        {/* ---- The workbook's sheets, exactly as Excel lists them ---- */}
        {card.sheets.length > 1 && (
          <div className="flex items-stretch gap-1 px-2 pt-2 overflow-x-auto scroll-area">
            {card.sheets.map((s, i) => {
              const on = i === tab
              return (
                <button
                  key={s.name + i}
                  onClick={() => {
                    setTab(i)
                    setQ('')
                    // Column 4 of one sheet is not column 4 of the next, so filters do not
                    // carry across tabs.
                    setFilters({})
                  }}
                  className="shrink-0 px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap transition"
                  style={{
                    // The active tab drops its bottom border so it joins the sheet below —
                    // the join is what makes a strip of buttons read as spreadsheet tabs.
                    borderRadius: '8px 8px 0 0',
                    border: '1px solid var(--hairline)',
                    borderBottomColor: on ? 'var(--surface)' : 'var(--hairline)',
                    marginBottom: -1,
                    background: on ? 'var(--surface)' : 'var(--surface-2)',
                    color: on ? 'var(--ink)' : s.cells.length === 0 ? 'var(--ink-hint)' : 'var(--ink-2)',
                  }}
                  title={s.cells.length === 0 ? `${s.name} — ${t('empty sheet')}` : s.name}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block rounded-sm"
                      style={{ width: 8, height: 8, background: s.cells.length === 0 ? 'var(--hairline)' : tabColour(s.name) }}
                    />
                    {s.name}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        <div className="border-t border-[var(--hairline)]" />

        <div className="px-4 md:px-5 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="font-bold text-slate-800 text-[15px] flex items-center gap-2">
              <FileSpreadsheet size={16} className="text-indigo-500 shrink-0" />
              <span className="truncate">
                {sheet.name} — {card.title}
              </span>
            </div>
            <div className="text-[12px] mt-0.5 flex items-center gap-3 flex-wrap" style={{ color: 'var(--ink-hint)' }}>
              <span className="inline-flex items-center gap-1">
                <Rows3 size={12} /> {rows.length}
                {query && ` / ${sheet.cells.length}`} {t('row(s)')}
              </span>
              <span className="inline-flex items-center gap-1">
                <Layers size={12} /> {sheet.columns.length} {t('column(s)')}
              </span>
              <span className="truncate">{card.fileName}</span>
            </div>
            {/* Whatever the sheet printed above its header — a title, a total strip, a revision. */}
            {sheet.preamble && (
              <div className="text-[11.5px] mt-1 truncate" style={{ color: 'var(--ink-hint)' }} title={sheet.preamble}>
                {sheet.preamble}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--hairline)] bg-white px-2 h-8">
              <Search size={14} className="text-slate-400 shrink-0" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('Search this sheet')}
                className="text-[12.5px] outline-none bg-transparent w-28 md:w-44"
              />
            </div>
            <HScrollButtons scrollRef={scroller} />
          </div>
        </div>

        {/* The colour key, so the fill in the deadline column reads without asking anyone. */}
        {tracked && (
          <div className="px-4 md:px-5 pb-3 flex items-center gap-2 flex-wrap text-[11.5px]" style={{ color: 'var(--ink-hint)' }}>
            <span>
              {t('Closing Deadline')} = {t('date')} + {DEADLINE_DAYS} {t('days')} ·
            </span>
            {(
              [
                ['closed', `${t('closed')}`],
                ['due', `${t('open')} ${DUE_AFTER_DAYS}+ ${t('days')}`],
                ['open', `${t('open, under')} ${DUE_AFTER_DAYS} ${t('days')}`],
              ] as [RowState, string][]
            ).map(([state, label]) => (
              <span
                key={state}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-semibold"
                style={{ background: DEADLINE_INK[state].bg, color: DEADLINE_INK[state].fg }}
              >
                {label}
              </span>
            ))}
          </div>
        )}

        {sheet.cells.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <div className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
              {sheet.name}
            </div>
            <div className="text-sm mt-1" style={{ color: 'var(--ink-hint)' }}>
              {t('This sheet has a heading but no rows.')}
            </div>
          </div>
        ) : (
          <RouteCardTable
            sheet={sheet}
            cols={cols}
            tracked={tracked}
            todayISO={todayISO}
            rows={rows}
            filters={filters}
            setFilters={setFilters}
            scrollRef={scroller}
          />
        )}
      </div>
    </>
  )
}
