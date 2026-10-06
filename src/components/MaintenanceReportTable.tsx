import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Filter, Search, X } from 'lucide-react'
import {
  maintenanceColumns,
  rowMaintenanceStatus,
  type MaintenanceCols,
  type MaintenanceRowStatus,
  type MaintenanceSheet,
} from '../lib/maintenanceReport'

const EMPTY_INK = 'color-mix(in srgb, var(--ink) 62%, var(--surface))'
const MAX_OPTIONS = 400
const BLANK = '(blank)'

export const STATUS_COL_IDX = -99

export const STATUS_LABEL_MAP: Record<MaintenanceRowStatus, string> = {
  pending: 'Pending',
  overdue: 'Overdue',
  completed: 'Completed',
  delayed: 'Completed (Delayed)',
  none: '—',
}

const toNum = (v: string): number | null => {
  if (!v) return null
  const n = Number(v.replace(/,/g, '').replace(/\s/g, ''))
  return Number.isFinite(n) ? n : null
}

const fmtNum = (n: number): string =>
  Number.isInteger(n) ? n.toLocaleString('en-IN') : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const IDENTIFIER_HEAD = /(^|\s)(code|id|ids|ref|sr|serial)(\s|$)|\bno\.?(\s|$)/i

function summableColumns(columns: string[], cells: string[][]): number[] {
  const out: number[] = []
  for (let c = 1; c < columns.length; c++) {
    if (IDENTIFIER_HEAD.test(columns[c] ?? '')) continue
    const vals = cells.map((r) => r[c] ?? '').filter((v) => v !== '')
    if (vals.length >= 1 && vals.every((v) => toNum(v) !== null)) out.push(c)
  }
  return out
}

export type SheetFilters = Record<number, string[]>

const cellText = (v: string) => (v === '' ? BLANK : v)

export function applyFilters(
  cells: string[][],
  filters: SheetFilters,
  exceptCol?: number,
  cols?: MaintenanceCols,
  todayISO?: string
): string[][] {
  const active = Object.entries(filters).filter(([c, vals]) => Number(c) !== exceptCol && vals.length > 0)
  if (!active.length) return cells
  return cells.filter((row) =>
    active.every(([c, vals]) => {
      const colIdx = Number(c)
      if (colIdx === STATUS_COL_IDX) {
        if (!cols || !todayISO) return true
        const status = rowMaintenanceStatus(row, cols, todayISO)
        const label = STATUS_LABEL_MAP[status] ?? '—'
        return vals.includes(label)
      }
      return vals.includes(cellText(row[colIdx] ?? ''))
    })
  )
}

function ColumnFilterPopover({
  label,
  col,
  cells,
  filters,
  setFilters,
  anchor,
  onClose,
  cols,
  todayISO,
}: {
  label: string
  col: number
  cells: string[][]
  filters: SheetFilters
  setFilters: (f: SheetFilters) => void
  anchor: DOMRect
  onClose: () => void
  cols?: MaintenanceCols
  todayISO?: string
}) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const isStatus = col === STATUS_COL_IDX

  const available = useMemo(() => {
    const candidates = applyFilters(cells, filters, col, cols, todayISO)
    const counts = new Map<string, number>()
    for (const row of candidates) {
      const txt = isStatus
        ? cols && todayISO
          ? STATUS_LABEL_MAP[rowMaintenanceStatus(row, cols, todayISO)]
          : '—'
        : cellText(row[col] ?? '')
      counts.set(txt, (counts.get(txt) ?? 0) + 1)
    }
    const list = Array.from(counts.entries()).map(([val, cnt]) => ({ val, cnt }))
    list.sort((a, b) => {
      if (a.val === BLANK) return 1
      if (b.val === BLANK) return -1
      if (isStatus) {
        const order = ['Pending', 'Overdue', 'Completed', 'Completed (Delayed)', '—']
        const ia = order.indexOf(a.val)
        const ib = order.indexOf(b.val)
        if (ia !== -1 && ib !== -1) return ia - ib
        if (ia !== -1) return -1
        if (ib !== -1) return 1
      }
      const na = toNum(a.val)
      const nb = toNum(b.val)
      if (na !== null && nb !== null) return na - nb
      return a.val.localeCompare(b.val, undefined, { numeric: true, sensitivity: 'base' })
    })
    return list
  }, [cells, filters, col, cols, todayISO, isStatus])

  const initial = useMemo(() => {
    const set = filters[col]
    return set && set.length > 0 ? new Set(set) : new Set(available.map((x) => x.val))
  }, [filters, col, available])

  const [draft, setDraft] = useState<Set<string>>(initial)

  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onClickOutside)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onClickOutside)
    }
  }, [onClose])

  const matching = useMemo(() => {
    if (!q.trim()) return available
    const query = q.trim().toLowerCase()
    return available.filter((x) => x.val.toLowerCase().includes(query))
  }, [available, q])

  const allVisibleSelected = matching.length > 0 && matching.every((x) => draft.has(x.val))
  const toggleSelectAll = () => {
    const next = new Set(draft)
    if (allVisibleSelected) {
      for (const x of matching) next.delete(x.val)
    } else {
      for (const x of matching) next.add(x.val)
    }
    setDraft(next)
  }

  const apply = () => {
    const next = { ...filters }
    if (draft.size === available.length || draft.size === 0) {
      delete next[col]
    } else {
      next[col] = Array.from(draft)
    }
    setFilters(next)
    onClose()
  }

  const clear = () => {
    const next = { ...filters }
    delete next[col]
    setFilters(next)
    onClose()
  }

  const screenW = typeof window !== 'undefined' ? window.innerWidth : 1024
  const screenH = typeof window !== 'undefined' ? window.innerHeight : 768
  const width = Math.min(280, screenW - 32)
  let left = anchor.left
  if (left + width > screenW - 16) left = screenW - width - 16
  if (left < 16) left = 16

  let top = anchor.bottom + 6
  if (top + 340 > screenH - 16) top = Math.max(16, anchor.top - 340 - 6)

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 rounded-xl shadow-xl border border-slate-200 bg-white text-slate-800 text-[12.5px] flex flex-col"
      style={{ left, top, width, maxHeight: 360 }}
    >
      <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
        <Filter size={13} className="text-sky-600 shrink-0" />
        <div className="font-bold text-slate-800 truncate flex-1">
          {label || (isStatus ? 'Status' : `Column ${col + 1}`)}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X size={15} />
        </button>
      </div>

      <div className="p-2 border-b border-slate-100">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${label || 'values'}…`}
            className="w-full pl-7 pr-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[12px] focus:outline-none focus:border-sky-500"
          />
          {q && (
            <button onClick={() => setQ('')} className="text-slate-400 hover:text-slate-600 absolute right-2.5 top-2">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between text-[11.5px] font-semibold text-slate-600">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleSelectAll}
            className="rounded border-slate-300 text-sky-600 focus:ring-0"
          />
          <span>(Select All)</span>
        </label>
        <span className="text-[11px] text-slate-400">
          {draft.size} / {available.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
        {matching.slice(0, MAX_OPTIONS).map(({ val, cnt }) => {
          const checked = draft.has(val)
          return (
            <label
              key={val}
              className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer select-none text-[12px] hover:bg-slate-50 ${
                checked ? 'text-slate-900 font-medium' : 'text-slate-500'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  const next = new Set(draft)
                  if (checked) next.delete(val)
                  else next.add(val)
                  setDraft(next)
                }}
                className="rounded border-slate-300 text-sky-600 focus:ring-0"
              />
              <span className="truncate flex-1 flex items-center gap-1.5">
                {isStatus ? (
                  val === 'Completed' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                      ✓ Completed
                    </span>
                  ) : val === 'Completed (Delayed)' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                      ⏱ Completed (Delayed)
                    </span>
                  ) : val === 'Pending' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-800">
                      ⏳ Pending
                    </span>
                  ) : val === 'Overdue' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800">
                      ⚠ Overdue
                    </span>
                  ) : (
                    <span>{val}</span>
                  )
                ) : (
                  val
                )}
              </span>
              <span className="text-[10.5px] text-slate-400 font-normal">({cnt})</span>
            </label>
          )
        })}
      </div>

      <div className="p-2 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50 rounded-b-xl">
        <button
          onClick={clear}
          className="px-2.5 py-1 text-[11.5px] font-semibold text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-200/50"
        >
          Clear
        </button>
        <button
          onClick={apply}
          className="px-3 py-1 text-[11.5px] font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-sm"
        >
          Apply
        </button>
      </div>
    </div>
  )
}

const isWrapCol = (colIndex: number, colName: string, cols: ReturnType<typeof maintenanceColumns>): boolean => {
  if (colIndex === cols.issue || colIndex === cols.remark) return true
  const h = (colName || '').toLowerCase()
  return /issue|problem|remark|note|comment|description|action|reason|detail|work\s*done|root\s*cause/i.test(h)
}

export function MaintenanceReportTable({
  sheet,
  rows,
  baseRows,
  filters,
  setFilters,
  todayISO,
  scrollerRef,
}: {
  sheet: MaintenanceSheet
  rows: string[][]
  baseRows?: string[][]
  filters: SheetFilters
  setFilters: (f: SheetFilters) => void
  todayISO: string
  scrollerRef?: React.RefObject<HTMLDivElement | null> | React.MutableRefObject<HTMLDivElement | null>
}) {
  const ownRef = useRef<HTMLDivElement | null>(null)
  const scroller = scrollerRef ?? ownRef

  const [popover, setPopover] = useState<{ col: number; anchor: DOMRect } | null>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)
  const [hasOverflow, setHasOverflow] = useState(false)

  const thWrap = 'px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-white align-bottom leading-[1.25]'

  const cols = useMemo(() => maintenanceColumns(sheet.columns), [sheet.columns])
  const hasStatusCol = cols.expectedDate >= 0 || cols.actualDate >= 0

  const checkScroll = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    const maxScroll = scrollWidth - clientWidth
    setHasOverflow(maxScroll > 6)
    setCanLeft(scrollLeft > 6)
    setCanRight(maxScroll > 6 && scrollLeft < maxScroll - 6)
  }, [scroller])

  useEffect(() => {
    checkScroll()
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(checkScroll)
    ro.observe(el)
    window.addEventListener('resize', checkScroll)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', checkScroll)
    }
  }, [checkScroll, rows.length])

  const step = (dir: -1 | 1) => {
    scroller.current?.scrollBy({ left: dir * 300, behavior: 'smooth' })
    setTimeout(checkScroll, 320)
  }

  const summable = useMemo(() => summableColumns(sheet.columns, sheet.cells), [sheet])
  const sums = useMemo(() => {
    if (!summable.length) return new Map<number, number>()
    const map = new Map<number, number>()
    for (const c of summable) {
      let sum = 0
      for (const r of rows) {
        const n = toNum(r[c] ?? '')
        if (n !== null) sum += n
      }
      map.set(c, sum)
    }
    return map
  }, [summable, rows])

  return (
    <div className="bento overflow-hidden flex flex-col shadow-sm relative group">
      {sheet.preamble && (
        <div className="px-4 py-2 border-b border-[var(--hairline)] text-xs font-semibold text-slate-500 bg-slate-50/50">
          {sheet.preamble}
        </div>
      )}

      {/* Floating Left Button on Table Edge */}
      {hasOverflow && canLeft && (
        <button
          type="button"
          onClick={() => step(-1)}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-slate-900/85 hover:bg-slate-900 text-white shadow-lg flex items-center justify-center transition-transform hover:scale-110 active:scale-95 cursor-pointer backdrop-blur-xs select-none touch-manipulation"
          title="Scroll Table Left"
        >
          <ChevronLeft size={20} />
        </button>
      )}

      {/* Floating Right Button on Table Edge */}
      {hasOverflow && canRight && (
        <button
          type="button"
          onClick={() => step(1)}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-slate-900/85 hover:bg-slate-900 text-white shadow-lg flex items-center justify-center transition-transform hover:scale-110 active:scale-95 cursor-pointer backdrop-blur-xs select-none touch-manipulation"
          title="Scroll Table Right"
        >
          <ChevronRight size={20} />
        </button>
      )}

      <div
        ref={scroller as React.RefObject<HTMLDivElement>}
        className="overflow-x-auto max-h-[70vh] scroll-area"
        onScroll={checkScroll}
      >
        <table className="w-full text-left border-collapse min-w-max">
          <thead>
            <tr style={{ background: 'linear-gradient(180deg,#1e293b,#0f172a)' }}>
              {sheet.columns.map((colName, c) => {
                const isNumCol = sheet.numericCols.includes(c)
                const hasFilter = filters[c] && filters[c].length > 0
                const isWrap = isWrapCol(c, colName, cols)
                return (
                  <th
                    key={c}
                    className={`${thWrap} ${isNumCol ? 'text-right' : 'text-left'} ${
                      isWrap ? 'min-w-[180px] max-w-[280px] sm:min-w-[220px] sm:max-w-[360px]' : ''
                    }`}
                  >
                    <div className={`flex items-center gap-1.5 ${isNumCol ? 'justify-end' : 'justify-start'}`}>
                      <span>{colName || `Col ${c + 1}`}</span>
                      <button
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect()
                          setPopover(popover?.col === c ? null : { col: c, anchor: rect })
                        }}
                        title="Filter column"
                        className={`p-1 rounded transition ${
                          hasFilter ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                        }`}
                      >
                        <Filter size={11} />
                      </button>
                    </div>
                  </th>
                )
              })}
              {hasStatusCol && (
                <th className={`${thWrap} text-center min-w-[130px]`}>
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Status</span>
                    <button
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        setPopover(popover?.col === STATUS_COL_IDX ? null : { col: STATUS_COL_IDX, anchor: rect })
                      }}
                      title="Filter by status"
                      className={`p-1 rounded transition ${
                        filters[STATUS_COL_IDX] && filters[STATUS_COL_IDX].length > 0
                          ? 'bg-sky-500 text-white'
                          : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                      }`}
                    >
                      <Filter size={11} />
                    </button>
                  </div>
                </th>
              )}
            </tr>

            {/* Total Strip */}
            {sums.size > 0 && (
              <tr className="bg-sky-900/10 border-b-2 border-sky-500/20 text-[11.5px] font-bold text-sky-900">
                {sheet.columns.map((_, c) => {
                  const sum = sums.get(c)
                  return (
                    <td key={c} className={`px-3 py-2 whitespace-nowrap ${sheet.numericCols.includes(c) ? 'text-right' : 'text-left'}`}>
                      {c === 0 ? 'TOTAL' : sum !== undefined ? fmtNum(sum) : ''}
                    </td>
                  )
                })}
                {hasStatusCol && <td />}
              </tr>
            )}
          </thead>

          <tbody className="divide-y divide-[var(--hairline)]">
            {rows.map((row, r) => {
              const status = hasStatusCol ? rowMaintenanceStatus(row, cols, todayISO) : 'none'
              return (
                <tr key={r} className="hover:bg-sky-50/40 transition-colors">
                  {sheet.columns.map((_, c) => {
                    const val = row[c] ?? ''
                    const isNumCol = sheet.numericCols.includes(c)
                    const isMachineCol = c === cols.machine
                    const isWrap = isWrapCol(c, sheet.columns[c] ?? '', cols)
                    return (
                      <td
                        key={c}
                        className={`px-3 py-2.5 text-[12.5px] ${
                          isNumCol
                            ? 'text-right font-mono whitespace-nowrap'
                            : isWrap
                            ? 'text-left whitespace-normal break-words min-w-[180px] max-w-[280px] sm:min-w-[220px] sm:max-w-[360px] leading-relaxed'
                            : 'text-left whitespace-nowrap'
                        } ${isMachineCol ? 'font-bold text-slate-800' : ''}`}
                        style={{ color: val ? 'var(--ink)' : EMPTY_INK }}
                      >
                        {val || '–'}
                      </td>
                    )
                  })}
                  {hasStatusCol && (
                    <td className="px-3 py-2.5 text-center whitespace-nowrap min-w-[130px]">
                      {status === 'completed' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          ✓ Completed
                        </span>
                      )}
                      {status === 'delayed' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                          ⏱ Completed (Delayed)
                        </span>
                      )}
                      {status === 'pending' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-800">
                          ⏳ Pending
                        </span>
                      )}
                      {status === 'overdue' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800">
                          ⚠ Overdue
                        </span>
                      )}
                      {status === 'none' && <span className="text-slate-400">–</span>}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {popover && (
        <ColumnFilterPopover
          label={popover.col === STATUS_COL_IDX ? 'Status' : (sheet.columns[popover.col] ?? '')}
          col={popover.col}
          cells={baseRows ?? sheet.cells}
          filters={filters}
          setFilters={setFilters}
          anchor={popover.anchor}
          onClose={() => setPopover(null)}
          cols={cols}
          todayISO={todayISO}
        />
      )}
    </div>
  )
}
