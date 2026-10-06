import { FileClock, Eye, Trash2, CalendarDays, Factory, Layers, LayoutDashboard, CheckCircle2 } from 'lucide-react'
import type { UploadRecord } from '../lib/uploads'

function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtMonth(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

interface DayGroup {
  date: string
  ups: UploadRecord[]
  shiftNums: number[]
  machines: number
  groups: string[]
  reasons: string[]
  fileName: string
}

/** Group the flat upload records by production day (both shifts under one date). */
function groupByDate(uploads: UploadRecord[]): DayGroup[] {
  const map = new Map<string, UploadRecord[]>()
  for (const u of uploads) {
    const arr = map.get(u.uploadDate) ?? []
    arr.push(u)
    map.set(u.uploadDate, arr)
  }
  return Array.from(map.entries())
    .map(([date, ups]) => {
      const shiftNums = new Set<number>()
      const groups: string[] = []
      const reasons: string[] = []
      const names = new Set<string>()
      let machines = 0
      for (const u of ups) {
        if (u.shift.includes('1')) shiftNums.add(1)
        if (u.shift.includes('2')) shiftNums.add(2)
        machines += u.machines
        names.add(u.fileName)
        for (const g of u.groups) if (!groups.includes(g)) groups.push(g)
        for (const r of u.downtimeReasons) if (!reasons.includes(r)) reasons.push(r)
      }
      return {
        date,
        ups,
        shiftNums: Array.from(shiftNums).sort(),
        machines,
        groups,
        reasons,
        fileName: names.size === 1 ? [...names][0] : `${ups.length} files`,
      }
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

/** Build one combined record for a day so the detail modal shows both shifts together. */
function combinedRecord(g: DayGroup): UploadRecord {
  let id = 0
  return {
    id: `day-${g.date}`,
    savedAt: Math.max(...g.ups.map((u) => u.savedAt || 0)),
    uploadDate: g.date,
    shift: g.shiftNums.length === 2 ? 'Shift 1 & 2' : g.shiftNums[0] === 2 ? 'Shift 2' : 'Shift 1',
    fileName: g.fileName,
    machines: g.machines,
    groups: g.groups,
    downtimeReasons: g.reasons,
    rows: g.ups.flatMap((u) => u.rows).map((r) => ({ ...r, id: id++ })),
  }
}

const shiftPillClass = (n: number) => (n === 2 ? 'pill pill-warning' : 'pill pill-good')

export function UploadHistory({
  uploads,
  currentDate,
  onView,
  onOpenDashboard,
  onDeleteDate,
}: {
  uploads: UploadRecord[]
  currentDate: string
  onView: (u: UploadRecord) => void
  onOpenDashboard: (date: string) => void
  onDeleteDate?: (date: string) => void
}) {
  if (uploads.length === 0) {
    return (
      <div className="bento bento-pad text-center py-12">
        <div className="w-14 h-14 mx-auto rounded-2xl grid place-items-center bg-emerald-50 text-emerald-500">
          <FileClock size={26} />
        </div>
        <div className="mt-3 font-bold text-slate-800">No uploads yet</div>
        <div className="text-sm text-slate-500 mt-1">
          Every Excel you <b>Convert into Dashboard</b> is logged here by date. Click a day to review
          its Shift 1 &amp; Shift 2, or open it on the dashboard.
        </div>
      </div>
    )
  }

  const days = groupByDate(uploads)
  // group the day-cards under their month heading (current month first)
  let lastMonth = ''

  return (
    <div className="flex flex-col gap-3">
      {days.map((g) => {
        const month = fmtMonth(g.date)
        const showMonth = month !== lastMonth
        lastMonth = month
        const onDash = g.date === currentDate
        return (
          <div key={g.date} className="flex flex-col gap-2">
            {showMonth && (
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 px-1 pt-1">{month}</div>
            )}
            <div className="bento rise overflow-hidden">
              <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="w-11 h-11 rounded-xl grid place-items-center grad-emerald text-white shrink-0">
                  <CalendarDays size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                    {fmtDate(g.date)}
                    {onDash && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600">
                        <CheckCircle2 size={11} /> on dashboard
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-500">
                    {g.shiftNums.map((n) => (
                      <span key={n} className={`${shiftPillClass(n)} !py-0`}>
                        Shift {n}
                      </span>
                    ))}
                    {g.shiftNums.length < 2 && (
                      <span className="text-amber-600">· {g.shiftNums.includes(1) ? 'Shift 2 missing' : 'Shift 1 missing'}</span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Factory size={12} /> {g.machines} machines
                    </span>
                    {g.groups.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Layers size={12} /> {g.groups.join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    className="icon-btn !bg-indigo-600 !text-white !border-indigo-600 hover:!bg-indigo-700"
                    onClick={() => onOpenDashboard(g.date)}
                    title={`Show ${fmtDate(g.date)} on the dashboard`}
                  >
                    <LayoutDashboard size={14} /> Open in Dashboard
                  </button>
                  <button className="icon-btn" onClick={() => onView(combinedRecord(g))} title="View both shifts' machine details">
                    <Eye size={14} /> Details
                  </button>
                  {onDeleteDate && (
                    <button
                      className="icon-btn !text-red-600 hover:!bg-red-50 hover:!border-red-200"
                      onClick={() => {
                        if (confirm(`Delete all reports for ${fmtDate(g.date)}? (both shifts)`)) onDeleteDate(g.date)
                      }}
                      title="Delete this day's reports"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
