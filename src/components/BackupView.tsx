import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarRange, CheckCircle2, Database, Download, FolderTree, Loader2, RefreshCw } from 'lucide-react'
import {
  SOURCES,
  backupSummary,
  buildBackupFiles,
  downloadZip,
  fetchBackupData,
  makeZip,
  recordDate,
  type BackupData,
  type SourceId,
} from '../lib/backup'

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** Last day of the month `d` falls in. */
const monthEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0)
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

const EMPTY: BackupData = { meetings: [], uploads: [], assembly: [], monthlyplan: [], routecard: [], notes: [], cpk: [], cumulative: [], users: [], events: [] }

/**
 * Backup — pick a date range and which data to export, get a ZIP of date-wise CSV folders.
 *
 * The range is free-form on purpose: a full month is the common case (and the presets make
 * it one click), but a mid-month export for traceability is the same control.
 */
export function BackupView({ onBack }: { onBack: () => void }) {
  const today = new Date()
  const [from, setFrom] = useState(iso(monthStart(today)))
  const [to, setTo] = useState(iso(monthEnd(today)))
  const [sources, setSources] = useState<SourceId[]>(SOURCES.map((s) => s.id))
  const [data, setData] = useState<BackupData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  const load = () => {
    setLoading(true)
    fetchBackupData()
      .then(setData)
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const toggle = (id: SourceId) => setSources((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  /** How many records each source has inside the chosen range — shown per row. */
  const counts = useMemo(() => {
    const within = (list: Record<string, unknown>[]) => list.filter((r) => { const d = recordDate(r); return d >= from && d <= to }).length
    return {
      meetings: within(data.meetings),
      uploads: within(data.uploads),
      assembly: within(data.assembly),
      monthlyplan: data.monthlyplan.filter((p) => {
        const m = String(p.month || '')
        return m && `${m}-31` >= from && `${m}-01` <= to
      }).length,
      routecard: data.routecard.filter((c) => {
        const m = String(c.month || '')
        return m && `${m}-31` >= from && `${m}-01` <= to
      }).length,
      notes: within(data.notes),
      cpk: within(data.cpk),
      cumulative: within(data.cumulative),
      activity: within(data.events),
    } as Record<SourceId, number>
  }, [data, from, to])

  const summary = useMemo(
    () => (loading ? { files: 0, bytes: 0 } : backupSummary({ from, to, sources, data })),
    [loading, from, to, sources, data],
  )

  const rangeValid = from <= to
  const canDownload = rangeValid && sources.length > 0 && summary.files > 1 && !busy

  const run = () => {
    setBusy(true)
    setDone('')
    // Let the button paint its busy state before the (synchronous) zip build blocks.
    setTimeout(() => {
      try {
        const files = buildBackupFiles({ from, to, sources, data })
        const blob = makeZip(files)
        downloadZip(blob, `morning-meeting-backup_${from}_to_${to}.zip`)
        setDone(`${files.length} file(s) · ${fmtBytes(blob.size)} downloaded.`)
      } catch (e) {
        alert(`Could not build the backup.\n\n${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setBusy(false)
      }
    }, 30)
  }

  const preset = (f: Date, t: Date) => {
    setFrom(iso(f))
    setTo(iso(t))
  }
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      {/* header */}
      <div className="bento bento-pad flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="icon-btn shrink-0">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="flex-1 min-w-[200px]">
          <div className="font-bold text-slate-800">Backup</div>
          <div className="text-xs text-slate-500">
            Export saved data as a ZIP of date-wise CSV folders — take it before the 30-day cleanup removes old reports.
          </div>
        </div>
        <button onClick={load} className="icon-btn shrink-0" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* range */}
      <div className="bento bento-pad">
        <div className="flex items-center gap-2 mb-3">
          <CalendarRange size={16} className="text-indigo-500" />
          <span className="font-bold text-slate-800 text-sm">Date range</span>
          <span className="text-xs text-slate-500">any range — a full month, or mid-month for traceability</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-xl border border-[var(--hairline)] bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-500"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-xl border border-[var(--hairline)] bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-500"
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button className="icon-btn" onClick={() => preset(monthStart(today), monthEnd(today))}>
              This month
            </button>
            <button className="icon-btn" onClick={() => preset(monthStart(lastMonth), monthEnd(lastMonth))}>
              Last month
            </button>
            <button className="icon-btn" onClick={() => preset(new Date(today.getTime() - 29 * 864e5), today)}>
              Last 30 days
            </button>
            <button className="icon-btn" onClick={() => preset(monthStart(today), today)}>
              Month to date
            </button>
          </div>
        </div>
        {!rangeValid && <div className="mt-2 text-xs font-semibold text-red-600">“From” must be on or before “To”.</div>}
      </div>

      {/* sources */}
      <div className="bento bento-pad">
        <div className="flex items-center gap-2 mb-1">
          <Database size={16} className="text-indigo-500" />
          <span className="font-bold text-slate-800 text-sm">What to back up</span>
          <div className="ml-auto flex gap-1.5">
            <button className="icon-btn" onClick={() => setSources(SOURCES.map((s) => s.id))}>
              Select all
            </button>
            <button className="icon-btn" onClick={() => setSources([])}>
              Clear
            </button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-2 mt-3">
          {SOURCES.map((s) => {
            const on = sources.includes(s.id)
            const n = counts[s.id] ?? 0
            return (
              <label
                key={s.id}
                className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition ${
                  on ? 'border-indigo-400 bg-indigo-50/50' : 'border-[var(--hairline)] hover:bg-slate-50'
                }`}
              >
                <input type="checkbox" checked={on} onChange={() => toggle(s.id)} className="mt-0.5 w-4 h-4 shrink-0 accent-indigo-600" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-800">{s.label}</span>
                    <span
                      className={`text-[10px] font-bold rounded-full px-1.5 py-[1px] ${n ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}
                    >
                      {loading ? '…' : n}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 leading-snug mt-0.5">{s.hint}</div>
                </div>
              </label>
            )
          })}
        </div>
      </div>

      {/* what you'll get + download */}
      <div className="bento bento-pad flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <FolderTree size={16} className="text-indigo-500" />
          <span className="font-bold text-slate-800 text-sm">You will get</span>
        </div>
        <pre className="text-[11.5px] leading-relaxed rounded-xl p-3 overflow-x-auto scroll-area" style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
{`morning-meeting-backup_${from}_to_${to}.zip
├── README.csv                 what this backup contains
├── ${from}/
│   ├── production-report.csv
│   ├── excel-upload-Shift 1.csv
│   └── assembly.csv
├── …one folder per date in the range…
├── monthly-plan/Aug-2026.csv
├── notes.csv · cpk.csv · cumulative.csv
└── user-activity/users.csv · activity-log.csv`}
        </pre>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm text-slate-600 flex-1 min-w-[180px]">
            {loading ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 size={14} className="animate-spin" /> Loading data…
              </span>
            ) : summary.files > 1 ? (
              <>
                <b className="text-slate-800">{summary.files}</b> file(s) · about <b className="text-slate-800">{fmtBytes(summary.bytes)}</b> of CSV
              </>
            ) : (
              <span className="text-amber-600 font-semibold">Nothing to export for this range and selection.</span>
            )}
          </div>
          <button
            onClick={run}
            disabled={!canDownload}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-4 py-2.5 shadow-sm transition"
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
            {busy ? 'Building…' : 'Download backup (.zip)'}
          </button>
        </div>
        {done && (
          <div className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
            <CheckCircle2 size={14} /> {done}
          </div>
        )}
      </div>
    </div>
  )
}
