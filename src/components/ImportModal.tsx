import { useState } from 'react'
import { X, FileSpreadsheet, Eye, EyeOff, Trash2, Clock, Layers, LayoutDashboard, Hourglass, CalendarDays } from 'lucide-react'
import { UploadArea } from './UploadArea'
import { MachineTable } from './MachineTable'
import { importShifts, type ImportedFile, type ShiftOverride } from '../lib/dataset'
import type { ParsedReport } from '../types'

function todayISO() {
  return new Date().toLocaleDateString('en-CA') // local YYYY-MM-DD
}
function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function shiftBadge(shifts: number[]): string {
  if (shifts.length === 2) return 'Shift 1 & 2'
  if (shifts[0] === 2) return 'Shift 2'
  return 'Shift 1'
}

export function ImportModal({
  pending,
  activeDate,
  activeMachines,
  activeName,
  onAdd,
  onRemove,
  onSetShift,
  onConvert,
  saveError = '',
  saving = false,
  onClose,
  shifts = true,
  splitUpload = true,
}: {
  pending: ImportedFile[]
  activeDate: string
  activeMachines: number
  activeName: string
  onAdd: (r: ParsedReport, shift?: ShiftOverride) => void
  onRemove: (id: string) => void
  onSetShift: (id: string, s: ShiftOverride) => void
  onConvert: (reportDate: string) => Promise<void> | void
  saveError?: string
  saving?: boolean
  onClose: () => void
  /** False in a single-shift workspace — then nothing here mentions shifts at all. */
  shifts?: boolean
  /**
   * True when the day arrives as one file PER SHIFT (Unit 1). False when a single workbook
   * covers the whole day, in which case there is one drop box and the rows carry the shift.
   */
  splitUpload?: boolean
}) {
  const [viewing, setViewing] = useState<string | null>(null)
  // The production day this upload is for — defaults to today. Same-date shifts combine.
  const [reportDate, setReportDate] = useState(todayISO())

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start justify-center p-4 overflow-auto scroll-area"
      style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="bento w-full max-w-3xl my-4 sm:my-6 min-w-0"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'rise 0.2s ease both' }}
      >
        {/* header */}
        <div className="flex items-center gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-[var(--hairline)]">
          <div className="w-9 h-9 rounded-xl grid place-items-center grad-blue text-white shrink-0">
            <FileSpreadsheet size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-slate-800">Import Excel</div>
            <div className="text-xs text-slate-500">
              Upload each shift's report below — it stays <b>pending</b> until you press{' '}
              <b>Convert into Dashboard</b>.
            </div>
          </div>
          <button className="text-slate-400 hover:text-slate-600 shrink-0" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="p-4 sm:p-5 flex flex-col gap-5">
          {/* report date — the production day this upload is for */}
          <div className="flex items-center gap-2.5 flex-wrap bg-indigo-50/60 border border-indigo-100 rounded-xl px-3 py-2.5">
            <CalendarDays size={16} className="text-indigo-600 shrink-0" />
            <span className="text-sm font-semibold text-slate-700">Report date</span>
            <input
              type="date"
              value={reportDate}
              max={todayISO()}
              onChange={(e) => setReportDate(e.target.value || todayISO())}
              className="text-sm font-semibold text-slate-800 bg-white border border-[var(--hairline)] rounded-lg px-2 py-1 outline-none focus:border-indigo-500"
            />
            <span className="text-[11px] text-slate-500 min-w-0">
              {!shifts
                ? 'Saved as its own day'
                : splitUpload
                  ? 'Shift 1 & Shift 2 of this date combine · saved as its own day'
                  : 'One sheet holds both shifts · saved as its own day'}
            </span>
          </div>

          {/* One box per shift only where each shift arrives as its own file. */}
          {splitUpload && shifts ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <UploadArea label="Shift 1" hint="Upload the Shift 1 report here" accent="indigo" onLoaded={(r) => onAdd(r, '1')} />
              <UploadArea label="Shift 2" hint="Upload the Shift 2 report here" accent="emerald" onLoaded={(r) => onAdd(r, '2')} />
            </div>
          ) : (
            <UploadArea
              label="Report"
              hint={shifts ? "Upload the day's sheet — both shifts are read from it" : "Upload the day's report here"}
              accent="indigo"
              onLoaded={(r) => onAdd(r, 'auto')}
            />
          )}

          {/* pending files */}
          <div>
            <div className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
              <Hourglass size={15} className="text-amber-500" /> Pending upload ({pending.length})
            </div>

            {pending.length === 0 ? (
              <div className="text-sm text-slate-400 py-6 text-center border border-dashed border-[var(--hairline)] rounded-xl">
                No files pending. Upload a report above to stage it.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {pending.map((imp) => {
                  const shifts = importShifts(imp)
                  const isOpen = viewing === imp.id
                  return (
                    <div key={imp.id} className="rounded-xl border border-amber-200 overflow-hidden">
                      <div className="p-3 bg-amber-50/50 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-lg grid place-items-center bg-white border border-[var(--hairline)] text-emerald-600 shrink-0">
                            <FileSpreadsheet size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-800 truncate">{imp.fileName}</div>
                            <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="inline-flex items-center gap-1">
                                <Clock size={11} /> {fmtTime(imp.importedAt)}
                              </span>
                              <span>· {imp.report.rows.length} machines</span>
                              <span className="pill pill-na !py-0">{shiftBadge(shifts)}</span>
                              <span className="pill pill-warning !py-0">Pending</span>
                            </div>
                          </div>
                        </div>

                        {/* controls: wrap on mobile, inline on desktop */}
                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:justify-end">
                          {splitUpload && shifts && (
                            <select
                              value={imp.shiftOverride}
                              onChange={(e) => onSetShift(imp.id, e.target.value as ShiftOverride)}
                              className="text-xs font-semibold text-slate-700 bg-white border border-[var(--hairline)] rounded-lg px-2 py-1.5 outline-none focus:border-indigo-500 flex-1 sm:flex-none min-w-0"
                              title="Tag this file's shift"
                            >
                              <option value="auto">Auto (detect)</option>
                              <option value="1">Shift 1</option>
                              <option value="2">Shift 2</option>
                            </select>
                          )}

                          <button className="icon-btn shrink-0" onClick={() => setViewing(isOpen ? null : imp.id)}>
                            {isOpen ? <EyeOff size={14} /> : <Eye size={14} />}
                            {isOpen ? 'Hide' : 'View'}
                          </button>
                          <button
                            className="icon-btn !text-red-600 hover:!bg-red-50 hover:!border-red-200 shrink-0"
                            onClick={() => onRemove(imp.id)}
                            title="Remove this pending file"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* imported data preview */}
                      {isOpen && (
                        <div className="border-t border-[var(--hairline)] p-2">
                          <div className="text-[11px] text-slate-500 px-1 pb-2">
                            Data imported from <b>{imp.fileName}</b> — {imp.report.groups.join(', ')}
                          </div>
                          <div style={{ maxHeight: 320 }} className="scroll-area overflow-auto">
                            <MachineTable rows={imp.report.rows} dense />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* currently-live dataset note */}
          {activeMachines > 0 && (
            <div className="flex items-center gap-2 text-[12px] text-slate-500 -mt-1">
              <Layers size={13} className="shrink-0" />
              <span>
                Currently on dashboard: <b className="text-slate-700">{activeName}</b> · {activeMachines} machines
                {activeDate && <> · {fmtDate(activeDate)}</>}
              </span>
            </div>
          )}

          {/* footer actions */}
          {saveError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{saveError}</div>}
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <button className="icon-btn" onClick={onClose}>
              Done
            </button>
            <button
              className="icon-btn !bg-emerald-600 !text-white !border-emerald-600 hover:!bg-emerald-700 disabled:!opacity-50 disabled:cursor-not-allowed"
              onClick={() => onConvert(reportDate)}
              disabled={pending.length === 0 || saving}
              title={
                pending.length === 0
                  ? 'Upload a report first'
                  : `Apply the pending file(s) to the dashboard for ${fmtDate(reportDate)}`
              }
            >
              <LayoutDashboard size={15} /> {saving ? 'Saving to database…' : 'Convert into Dashboard'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
