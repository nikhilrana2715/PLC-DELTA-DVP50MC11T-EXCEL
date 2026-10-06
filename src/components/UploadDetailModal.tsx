import { X, CalendarDays, Factory, Layers, Clock, LayoutDashboard } from 'lucide-react'
import type { UploadRecord } from '../lib/uploads'
import { MachineTable } from './MachineTable'
import { roundRow } from '../lib/dataset'
import { downtimeColor, categoryLabel } from '../lib/downtime'

function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Full read-only detail of one uploaded Excel: every machine + downtime. */
export function UploadDetailModal({
  upload,
  onClose,
  onOpenDashboard,
}: {
  upload: UploadRecord
  onClose: () => void
  onOpenDashboard: () => void
}) {
  // round any Excel-formula floats (also cleans older saved uploads)
  const rows = upload.rows.map(roundRow)
  // machines that recorded any downtime, with their reason breakdown
  const withDowntime = rows
    .map((r) => ({
      mc: r.mc,
      entries: Object.entries(r.downtime || {})
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]),
    }))
    .filter((x) => x.entries.length > 0)

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center p-3 sm:p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh', animation: 'rise 0.18s ease both' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-[var(--hairline)]">
          <div className="w-10 h-10 rounded-xl grid place-items-center grad-emerald text-white shrink-0">
            <CalendarDays size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-slate-800 truncate">{upload.fileName}</div>
            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="inline-flex items-center gap-1">
                <Clock size={11} /> {fmtDate(upload.uploadDate)}
              </span>
              <span className="pill pill-na !py-0">{upload.shift}</span>
              <span className="inline-flex items-center gap-1">
                <Factory size={11} /> {upload.machines} machines
              </span>
              {upload.groups.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Layers size={11} /> {upload.groups.join(', ')}
                </span>
              )}
            </div>
          </div>
          <button
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-3 py-2 shadow-sm shrink-0"
            onClick={onOpenDashboard}
            title={`Show ${fmtDate(upload.uploadDate)} on the dashboard`}
          >
            <LayoutDashboard size={15} /> <span className="hidden sm:inline">Open in Dashboard</span>
          </button>
          <button className="text-slate-400 hover:text-slate-700 shrink-0" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="p-3 sm:p-4 overflow-auto scroll-area">
          {/* full machine register (read-only) — the modal body is the single scroll area */}
          <MachineTable rows={rows} />

          {/* downtime breakdown */}
          {withDowntime.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Downtime</div>
              <div className="flex flex-col gap-2">
                {withDowntime.map((m) => (
                  <div key={m.mc} className="rounded-xl border border-[var(--hairline)] px-3 py-2">
                    <div className="font-semibold text-slate-800 text-sm mb-1">{m.mc}</div>
                    <div className="flex flex-col gap-1">
                      {m.entries.map(([reason, mins]) => (
                        <div key={reason} className="flex items-center gap-2 text-sm">
                          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: downtimeColor(reason) }} />
                          <span className="text-slate-700 flex-1">{reason}</span>
                          <span className="text-[11px] text-slate-400">
                            {categoryLabel(reason).replace(' Downtime', '')}
                          </span>
                          <span className="font-semibold text-slate-800 tabular-nums">{mins} min</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
