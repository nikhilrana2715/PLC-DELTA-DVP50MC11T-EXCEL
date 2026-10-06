import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Filter, Search, X } from 'lucide-react'
import { deadlineOf, rowState, type RouteCols, type RouteSheet, type RowState } from '../lib/routeCard'
import { useT } from '../lib/i18n'

/**
 * The sheet as a working grid: a filter on every column, and a TOTAL strip above the header
 * that adds up each numeric column — of the rows that survive the filters, so the totals
 * answer whatever question the filters were just asked.
 *
 * Same idea as the PD Report's grid on the KPI page, but this one knows nothing about the
 * columns: it is handed a header row and a block of cells, so it works on a route card whose
 * layout changes between revisions.
 */

const EMPTY_INK = 'color-mix(in srgb, var(--ink) 62%, var(--surface))'
/** The sheet's own fill, in the app's palette — the same three colours the pills use. */
const DEADLINE_INK: Record<RowState, { bg: string; fg: string }> = {
  closed: { bg: '#dff5df', fg: '#0a7a0a' },
  due: { bg: '#fde4e4', fg: '#b0201f' },
  open: { bg: '#fff2d6', fg: '#916200' },
}
/** How many ticks to render at once — a column like ITEM NAME has hundreds of distinct values. */
const MAX_OPTIONS = 400
/** What a blank cell is called in the tick list, so blanks can be filtered like any value. */
const BLANK = '(blank)'

const toNum = (v: string): number | null => {
  if (!v) return null
  const n = Number(v.replace(/,/g, '').replace(/\s/g, ''))
  return Number.isFinite(n) ? n : null
}
/** Whole numbers print plain; anything with a fraction keeps two places. */
const fmtNum = (n: number): string =>
  Number.isInteger(n) ? n.toLocaleString('en-IN') : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Headings that name a thing rather than count one. Item codes and batch numbers are
 * numeric on many rows, and adding them up produces a figure that means nothing — so they
 * are read as identifiers and left out of the TOTAL strip.
 */
const IDENTIFIER_HEAD = /(^|\s)(code|id|ids|ref|sr|serial)(\s|$)|\bno\.?(\s|$)/i

/**
 * Which columns get a sum.
 *
 * Stricter than the right-align test: EVERY filled value must be a number. A column holding
 * "HCJIR020.0" beside "103002.00" is a code list with numeric-looking entries, and summing
 * the half that parses would be worse than showing nothing. The first column is skipped too
 * — that is the serial number on every route card seen so far.
 */
function summableColumns(columns: string[], cells: string[][]): number[] {
  const out: number[] = []
  for (let c = 1; c < columns.length; c++) {
    if (IDENTIFIER_HEAD.test(columns[c] ?? '')) continue
    const vals = cells.map((r) => r[c] ?? '').filter((v) => v !== '')
    if (vals.length >= 1 && vals.every((v) => toNum(v) !== null)) out.push(c)
  }
  return out
}

/** Column index → the values ticked for it. An empty entry means "no filter". */
export type SheetFilters = Record<number, string[]>

const cellText = (v: string) => (v === '' ? BLANK : v)

/** Rows surviving every column's filter, optionally ignoring one column's own. */
function applyFilters(cells: string[][], filters: SheetFilters, exceptCol?: number): string[][] {
  const active = Object.entries(filters).filter(([c, vals]) => Number(c) !== exceptCol && vals.length > 0)
  if (!active.length) return cells
  return cells.filter((row) => active.every(([c, vals]) => vals.includes(cellText(row[Number(c)] ?? ''))))
}

/**
 * Excel's column filter: search, Select all, a tick per distinct value, Clear / Apply.
 *
 * The list is built from the rows that survive every OTHER column's filter, the way Excel
 * narrows its own drop-downs, so it never offers a value that would return nothing. Nothing
 * is committed until Apply.
 *
 * It is positioned fixed against the funnel that opened it, because the grid scrolls
 * sideways inside its own box — an absolutely positioned panel would be clipped by it.
 */
function ColumnFilterPopover({
  label,
  col,
  cells,
  filters,
  setFilters,
  anchor,
  onClose,
}: {
  label: string
  col: number
  cells: string[][]
  filters: SheetFilters
  setFilters: (f: SheetFilters) => void
  anchor: DOMRect
  onClose: () => void
}) {
  const t = useT()
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [query, setQuery] = useState('')

  const options = useMemo(() => {
    const seen = new Set<string>()
    for (const row of applyFilters(cells, filters, col)) seen.add(cellText(row[col] ?? ''))
    // Numbers sort as numbers, everything else as text — a column of quantities listed
    // 1, 10, 100, 2 is unreadable.
    return [...seen].sort((a, b) => {
      const na = toNum(a)
      const nb = toNum(b)
      if (na !== null && nb !== null) return na - nb
      return a.localeCompare(b, undefined, { numeric: true })
    })
  }, [cells, filters, col])

  // No filter yet means everything is in play, which shows as every box ticked.
  const [picked, setPicked] = useState<Set<string>>(() => new Set(filters[col]?.length ? filters[col] : options))
  const q = query.trim().toLowerCase()
  const searching = q !== ''
  const matches = searching ? options.filter((o) => o.toLowerCase().includes(q)) : options
  const visible = matches.slice(0, MAX_OPTIONS)
  const allVisiblePicked = visible.length > 0 && visible.every((o) => picked.has(o))

  // Keep the panel on screen: it opens under the funnel, and slides left / above when the
  // funnel is near an edge.
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 4 })
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))
    const below = anchor.bottom + 4
    const top = below + height > window.innerHeight - 8 ? Math.max(8, anchor.top - height - 4) : below
    setPos({ left, top })
  }, [anchor])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    // Deferred: the click that opened this panel is still travelling up.
    const id = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const toggle = (o: string) => {
    const next = new Set(picked)
    next.has(o) ? next.delete(o) : next.add(o)
    setPicked(next)
  }
  const apply = () => {
    const next = { ...filters }
    // Everything ticked is the same as no filter — keep the map clean so the count is honest.
    if (picked.size === 0 || picked.size === options.length) delete next[col]
    else next[col] = [...picked]
    setFilters(next)
    onClose()
  }
  const clear = () => {
    const next = { ...filters }
    delete next[col]
    setFilters(next)
    onClose()
  }

  return (
    <div
      ref={boxRef}
      className="fixed z-50 rounded-xl border border-[var(--hairline)] shadow-2xl text-left normal-case tracking-normal"
      style={{ background: 'var(--surface)', width: 280, maxWidth: 'calc(100vw - 16px)', left: pos.left, top: pos.top }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--hairline)]">
        <span className="text-[13px] font-bold flex-1 min-w-0 truncate" style={{ color: 'var(--ink)' }} title={label}>
          {t('Filter')}: {label || '—'}
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
            <input type="checkbox" className="w-4 h-4 accent-blue-600 shrink-0" checked={picked.has(o)} onChange={() => toggle(o)} />
            <span
              className={`text-[13px] min-w-0 truncate ${o === BLANK ? 'italic' : ''}`}
              style={{ color: o === BLANK ? 'var(--ink-hint)' : 'var(--ink)' }}
              title={o}
            >
              {o}
            </span>
          </label>
        ))}
        {visible.length === 0 && (
          <div className="py-4 text-center text-[12px]" style={{ color: 'var(--ink-hint)' }}>
            {t('No matching values.')}
          </div>
        )}
        {options.length > visible.length && !searching && (
          <div className="py-2 text-[11px]" style={{ color: 'var(--ink-hint)' }}>
            {t('Showing first')} {MAX_OPTIONS} {t('of')} {options.length} — {t('search to narrow.')}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 p-3 pt-2.5 border-t border-[var(--hairline)]">
        <button onClick={clear} className="flex-1 rounded-lg border py-2 text-[13px] font-bold" style={{ borderColor: '#f0a1a1', color: '#c0392b' }}>
          {t('Clear')}
        </button>
        <button onClick={apply} className="flex-1 rounded-lg py-2 text-[13px] font-bold text-white" style={{ background: '#0f172a' }}>
          {t('Apply')}
        </button>
      </div>
    </div>
  )
}

export function RouteCardTable({
  sheet,
  cols,
  tracked,
  todayISO,
  rows,
  filters,
  setFilters,
  scrollRef,
}: {
  sheet: RouteSheet
  cols: RouteCols
  tracked: boolean
  todayISO: string
  /** The rows to print — already through the search box and the column filters. */
  rows: string[][]
  filters: SheetFilters
  setFilters: (f: SheetFilters) => void
  scrollRef: React.MutableRefObject<HTMLDivElement | null>
}) {
  const t = useT()
  /** Which funnel is open, and where it sits — the panel is positioned against it. */
  const [open, setOpen] = useState<{ col: number; rect: DOMRect } | null>(null)

  /** Which columns are worth adding up — judged on the whole sheet, not the filtered slice,
   *  so a column does not start and stop having a total as the filters move. */
  const sumCols = useMemo(() => summableColumns(sheet.columns, sheet.cells), [sheet])

  /** Column sums over the rows on screen, so a filter moves every total with it. */
  const totals = useMemo(() => {
    const out: Record<number, number> = {}
    for (const c of sumCols) {
      let sum = 0
      let any = false
      for (const row of rows) {
        const n = toNum(row[c] ?? '')
        if (n !== null) {
          sum += n
          any = true
        }
      }
      if (any) out[c] = sum
    }
    return out
  }, [rows, sumCols])

  const thWrap = 'px-2 py-2 text-[10.5px] font-bold uppercase tracking-wide text-white align-bottom leading-[1.25]'
  const td = 'px-2 py-[7px] text-[12px] whitespace-nowrap'

  return (
    <>
      <div ref={scrollRef} className="scroll-area px-3 md:px-4 pb-4" style={{ overflowX: 'auto' }}>
        {/* The sheet's own columns, in its own order — this is the workbook, not a summary. */}
        <table className="qa-grid" style={{ minWidth: Math.max(720, sheet.columns.length * 96) }}>
          <thead>
            {/* TOTAL strip, above the header — the figure a supervisor reads first. */}
            <tr>
              {sheet.columns.map((_, i) => (
                <th
                  key={i}
                  className={`px-2 py-2 whitespace-nowrap font-extrabold text-[12px] ${
                    totals[i] !== undefined ? 'text-right tabular-nums' : 'text-left'
                  }`}
                  style={{ background: 'color-mix(in srgb, #f26464 12%, var(--surface))', color: 'var(--ink)' }}
                >
                  {/* The word goes in the first cell — that column is the serial number on
                      every route card seen so far, and adding serial numbers means nothing. */}
                  {i === 0 ? t('TOTAL') : totals[i] !== undefined ? fmtNum(totals[i]) : ''}
                </th>
              ))}
            </tr>
            <tr>
              {sheet.columns.map((h, i) => {
                const on = (filters[i]?.length ?? 0) > 0
                return (
                  <th
                    key={`${h}-${i}`}
                    // Headings come from the sheet and some run long. Let them wrap onto two
                    // or three lines instead of stretching the column to fit one — the values
                    // under a heading are short, so the width should follow them.
                    className={`${thWrap} ${sheet.numericCols.includes(i) ? 'text-right' : 'text-left'}`}
                    style={{ maxWidth: 150, minWidth: 72 }}
                    title={h}
                  >
                    <span className={`inline-flex items-start gap-1 ${sheet.numericCols.includes(i) ? 'flex-row-reverse' : ''}`}>
                      <button
                        onClick={(e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          setOpen(open?.col === i ? null : { col: i, rect })
                        }}
                        className="shrink-0 rounded p-0.5 mt-[1px] hover:bg-white/20"
                        style={{ color: on ? '#7dd3fc' : 'rgba(255,255,255,0.7)' }}
                        aria-label={`Filter ${h || 'column ' + (i + 1)}`}
                        title={on ? `${t('Filtered')} — ${filters[i].length} ${t('picked')}` : t('Filter')}
                      >
                        <Filter size={11} fill={on ? 'currentColor' : 'none'} />
                      </button>
                      <span>{h || '—'}</span>
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const state = tracked ? rowState(row, cols, todayISO) : null
              const due = cols.deadline >= 0 || cols.date >= 0 ? deadlineOf(row, cols) : null
              return (
                <tr key={r} style={{ background: r % 2 ? 'color-mix(in srgb, var(--ink) 5%, var(--surface))' : 'var(--surface)' }}>
                  {sheet.columns.map((_, c) => {
                    const deadlineCell = c === cols.deadline && state !== null && due !== null
                    const v = deadlineCell ? due.text : row[c] ?? ''
                    const numeric = sheet.numericCols.includes(c)
                    return (
                      <td
                        key={c}
                        className={`${td} ${numeric ? 'text-right tabular-nums' : ''} ${c === 0 || deadlineCell ? 'font-semibold' : ''}`}
                        style={
                          deadlineCell
                            ? { background: DEADLINE_INK[state].bg, color: DEADLINE_INK[state].fg }
                            : { color: c === 0 ? 'var(--ink)' : 'var(--ink-2)' }
                        }
                        title={
                          deadlineCell && due.computed ? `${due.text} — ${t('worked out from the date')}` : v
                        }
                      >
                        {v || <span style={{ color: EMPTY_INK }}>–</span>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={sheet.columns.length} className="px-3 py-10 text-center text-[13px]" style={{ color: 'var(--ink-hint)' }}>
                  {t('Nothing on this sheet matches the filters.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <ColumnFilterPopover
          label={sheet.columns[open.col] || `${t('Column')} ${open.col + 1}`}
          col={open.col}
          cells={sheet.cells}
          filters={filters}
          setFilters={setFilters}
          anchor={open.rect}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}

export { applyFilters }
