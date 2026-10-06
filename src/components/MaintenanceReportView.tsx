import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  RotateCcw,
  Rows3,
  Search,
  UploadCloud,
  Wrench,
} from 'lucide-react'
import {
  maintenanceDateLabel,
  maintenanceColumns,
  maintenanceSummary,
  type MaintenanceReportRecord,
} from '../lib/maintenanceReport'
import { toISODate } from '../lib/monthlyPlan'
import { useT } from '../lib/i18n'
import { HScrollButtons } from './HScrollButtons'
import { MaintenanceReportTable, applyFilters, type SheetFilters } from './MaintenanceReportTable'

const TAB_COLOURS = ['#0284c7', '#7c5cd6', '#0d9488', '#d98324', '#8a8f2e', '#c0466b', '#2563eb', '#a8563a']
const tabColour = (name: string): string => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return TAB_COLOURS[h % TAB_COLOURS.length]
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
    <div className={`stat-card ${tint} rise shadow-xs border border-slate-100/80`}>
      <div className="p-3.5 md:p-4">
        <div className={`stat-icon ${grad}`}>{icon}</div>
        <div className="mt-2.5 text-[11px] md:text-xs font-bold uppercase tracking-wider text-slate-500 leading-tight">
          {t(label)}
        </div>
        <div className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 leading-tight mt-1">{value}</div>
        {sub && <div className="text-[11.5px] font-medium text-slate-500 leading-tight mt-1">{sub}</div>}
      </div>
    </div>
  )
}

export function MaintenanceReportView({
  reports,
  activeDate,
  todayISO,
  onOpenUpload,
  onClearDate,
  title = 'Maintenance Report',
  emptyTitle,
  emptyDesc,
  uploadBtnText,
  totalKpiLabel = 'Total Maintenance Issues',
  icon,
  accentGrad = 'linear-gradient(150deg,#0284c7,#06b6d4 55%,#3b82f6)',
}: {
  reports: MaintenanceReportRecord[]
  activeDate: string
  todayISO: string
  onOpenUpload: () => void
  onClearDate?: () => void
  title?: string
  emptyTitle?: string
  emptyDesc?: string
  uploadBtnText?: string
  totalKpiLabel?: string
  icon?: React.ReactNode
  accentGrad?: string
}) {
  const t = useT()
  const [tab, setTab] = useState(0)
  const [q, setQ] = useState('')
  const scroller = useRef<HTMLDivElement | null>(null)
  const tableScroller = useRef<HTMLDivElement | null>(null)
  const [filters, setFilters] = useState<SheetFilters>({})

  const currentRecord =
    (activeDate
      ? reports.find((r) => r.date === activeDate || r.month === activeDate || r.id.endsWith(activeDate))
      : null) ??
    reports[0] ??
    null

  const sheet = currentRecord?.sheets[Math.min(tab, (currentRecord?.sheets.length || 1) - 1)] ?? null

  const dateFilteredRows = useMemo(() => {
    if (!sheet) return []
    if (!activeDate || activeDate.trim() === '') return sheet.cells

    const cols = maintenanceColumns(sheet.columns)
    if (cols.date < 0) return sheet.cells

    const selectedDateISO = toISODate(activeDate) || activeDate

    // Check if any row matches activeDate
    const hasMatch = sheet.cells.some((r) => {
      const rDate = toISODate(r[cols.date] ?? '')
      return rDate === selectedDateISO || (r[cols.date] ?? '').trim().includes(activeDate)
    })

    if (!hasMatch) return sheet.cells

    return sheet.cells.filter((r) => {
      const rDate = toISODate(r[cols.date] ?? '')
      return rDate === selectedDateISO || (r[cols.date] ?? '').trim().includes(activeDate)
    })
  }, [sheet, activeDate])

  const query = q.trim().toLowerCase()
  const rows = useMemo(() => {
    const cols = sheet ? maintenanceColumns(sheet.columns) : undefined
    const filtered = applyFilters(dateFilteredRows, filters, undefined, cols, todayISO)
    return query ? filtered.filter((r) => r.join(' ').toLowerCase().includes(query)) : filtered
  }, [dateFilteredRows, filters, query, sheet, todayISO])

  const filterCount = Object.values(filters).filter((v) => v.length > 0).length
  const dateFilteringActive = sheet ? dateFilteredRows.length < sheet.cells.length : false
  const narrowed = filterCount > 0 || query !== '' || dateFilteringActive

  const summary = useMemo(() => {
    if (!sheet) return null
    return maintenanceSummary(
      [
        {
          ...sheet,
          cells: dateFilteredRows,
        },
      ],
      todayISO
    )
  }, [sheet, dateFilteredRows, todayISO])

  const fmt = (n: number) => n.toLocaleString('en-IN')

  return (
    <div className="flex flex-col gap-4">
      {!currentRecord ? (
        /* Empty State */
        <div className="bento p-12 text-center flex flex-col items-center justify-center gap-4 my-6">
          <div className="w-16 h-16 rounded-3xl grid place-items-center text-white shadow-md" style={{ background: accentGrad }}>
            {icon ?? <Wrench size={32} />}
          </div>
          <div>
            <div className="text-lg font-bold text-slate-800">{emptyTitle ?? t(`No ${title} uploaded yet`)}</div>
            <div className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {emptyDesc ?? `Upload your ${title.toLowerCase()} workbook for ${maintenanceDateLabel(activeDate)}.`}
            </div>
          </div>
          <button
            onClick={onOpenUpload}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold px-5 py-2.5 shadow-md transition"
          >
            <UploadCloud size={18} /> {uploadBtnText ?? t(`Upload ${title}`)}
          </button>
        </div>
      ) : (
        <>
          {/* Headline Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <Kpi
              icon={<Rows3 size={20} />}
              label={totalKpiLabel}
              value={fmt(summary?.total ?? rows.length)}
              sub={`${currentRecord.sheets.length} sheet tab(s)`}
              tint="tint-blue"
              grad="grad-blue"
            />
            <Kpi
              icon={<CheckCircle2 size={20} />}
              label="Completed Issues"
              value={fmt(summary?.completed ?? 0)}
              sub={summary?.delayed ? `${summary.delayed} completed with delay` : 'All completed on-time'}
              tint="tint-teal"
              grad="grad-teal"
            />
            <Kpi
              icon={<Clock size={20} />}
              label="Pending Issues"
              value={fmt(summary?.pending ?? 0)}
              sub="Awaiting completion date"
              tint="tint-violet"
              grad="grad-violet"
            />
            <Kpi
              icon={<AlertTriangle size={20} />}
              label="Overdue / Delayed"
              value={fmt((summary?.overdue ?? 0) + (summary?.delayed ?? 0))}
              sub={`${summary?.overdue ?? 0} overdue · ${summary?.delayed ?? 0} delayed`}
              tint="tint-rose"
              grad="grad-red"
            />
          </div>

          {/* Filter Status Pill */}
          {(narrowed || activeDate) && sheet && (
            <div
              className="rounded-xl px-3 py-2 text-[12.5px] font-semibold flex items-center gap-2 flex-wrap border border-sky-200"
              style={{ background: 'color-mix(in srgb, #0284c7 10%, var(--surface))', color: 'var(--ink-2)' }}
            >
              <Filter size={14} style={{ color: '#0284c7' }} />
              {activeDate ? (
                <span>
                  {t('Filtered by Date')}: <b>{activeDate}</b> — {rows.length} {t('of')} {sheet.cells.length} rows shown.
                </span>
              ) : (
                <span>
                  {t('Filtered view')} — {rows.length} {t('of')} {sheet.cells.length} rows.
                </span>
              )}

              {activeDate && onClearDate && (
                <button
                  onClick={onClearDate}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1 text-[12px] font-bold text-sky-700 hover:bg-sky-100 transition shadow-2xs"
                >
                  <RotateCcw size={12} /> {t('Show All Rows')} ({sheet.cells.length})
                </button>
              )}

              {filterCount > 0 && (
                <button
                  onClick={() => setFilters({})}
                  className={`${!activeDate ? 'ml-auto' : ''} inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-bold`}
                  style={{ borderColor: '#f0a1a1', color: '#c0392b' }}
                >
                  <RotateCcw size={12} /> {t('Clear column filters')} ({filterCount})
                </button>
              )}
            </div>
          )}

          {/* Sheet Tab Bar & Search Filter */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <HScrollButtons scrollRef={tableScroller} />
              <div ref={scroller} className="hscroll-row pb-1 flex-1">
                {currentRecord.sheets.map((s, idx) => {
                  const active = idx === tab
                  const color = tabColour(s.name)
                  return (
                    <button
                      key={s.name}
                      onClick={() => {
                        setTab(idx)
                        setFilters({})
                      }}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-2 border ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 shadow-sm'
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                      <span>{s.name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                          active ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {s.cells.length}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search across sheet…"
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-[var(--hairline)] rounded-xl text-xs focus:outline-none focus:border-sky-500 shadow-sm"
              />
            </div>
          </div>

          {/* Sheet Table */}
          {sheet && (
            <MaintenanceReportTable
              sheet={sheet}
              rows={rows}
              baseRows={dateFilteredRows}
              filters={filters}
              setFilters={setFilters}
              todayISO={todayISO}
              scrollerRef={tableScroller}
            />
          )}
        </>
      )}
    </div>
  )
}
