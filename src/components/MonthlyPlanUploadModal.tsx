import { useRef, useState } from 'react'
import { CalendarDays, CalendarRange, FileSpreadsheet, UploadCloud, X } from 'lucide-react'
import { MonthYearSelect } from './MonthRangePicker'

/**
 * Picks the Plan Confirmation workbook, and which month to file it under.
 *
 * The month normally comes from the sheet itself — its day columns ARE the month — so that
 * is the default and nothing is touched. But a sheet is sometimes prepared by copying last
 * month's and the header dates come along with it, so there is a way to say "this one is
 * September": the day columns are then moved with it (1st stays the 1st), because relabelling
 * the month while leaving August dates underneath would make the plan read empty every day.
 */
export function MonthlyPlanUploadModal({
  onClose,
  onUpload,
  busy,
}: {
  onClose: () => void
  /** `month` is undefined when the sheet's own month is to be kept. */
  onUpload: (file: File, month?: string) => void
  busy: boolean
}) {
  const [file, setFile] = useState<File | null>(null)
  const [drag, setDrag] = useState(false)
  /** false = take the month from the sheet (the default and the usual case). */
  const [override, setOverride] = useState(false)
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 overflow-auto scroll-area" style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div className="bento w-full max-w-md my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 md:px-5 pt-4 pb-3 border-b border-[var(--hairline)]">
          <div className="w-9 h-9 rounded-xl grid place-items-center grad-violet text-white">
            <CalendarRange size={18} />
          </div>
          <div className="flex-1">
            <div className="font-bold text-slate-800">Upload Monthly Plan</div>
            <div className="text-xs text-slate-500">Plan Confirmation Sheet — the month comes from the sheet unless you choose one.</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 md:p-5 flex flex-col gap-4">
          <div
            className={`rounded-2xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition ${
              drag ? 'border-indigo-500 bg-indigo-50/60' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0])
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) setFile(e.target.files[0])
                e.target.value = ''
              }}
            />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-700">
                <FileSpreadsheet size={18} className="text-emerald-600" /> {file.name}
              </div>
            ) : (
              <>
                <UploadCloud size={26} className="mx-auto text-slate-400" />
                <div className="mt-2 text-sm font-semibold text-slate-600">Click to choose or drop the Excel here</div>
                <div className="text-xs text-slate-400 mt-0.5">.xlsx / .xls — e.g. “Aug-2026_Plan Confirmation Sheet_R01.xlsx”</div>
              </>
            )}
          </div>

          {/* Month: the sheet's, or one you pick. */}
          <div className="rounded-xl border border-[var(--hairline)] px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <CalendarDays size={16} className="shrink-0" style={{ color: '#4f46e5' }} />
              <div className="text-[13px] font-bold text-slate-800">Month of this plan</div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 mt-2" role="radiogroup" aria-label="Month of this plan">
              {[
                { on: false, label: 'From the sheet' },
                { on: true, label: 'Choose a month' },
              ].map((opt) => {
                const active = override === opt.on
                return (
                  <button
                    key={opt.label}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setOverride(opt.on)}
                    className="rounded-lg py-1.5 text-[12.5px] font-bold border transition"
                    style={{
                      borderColor: active ? '#4f46e5' : 'var(--hairline)',
                      background: active ? 'color-mix(in srgb, #4f46e5 12%, var(--surface))' : 'var(--surface)',
                      color: active ? '#4338ca' : 'var(--ink-2)',
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>

            {override ? (
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                <MonthYearSelect value={month} onChange={setMonth} disabled={busy} />
                <span className="text-[11.5px] leading-snug flex-1 min-w-[160px]" style={{ color: 'var(--ink-hint)' }}>
                  The day columns move with it — the 1st stays the 1st.
                </span>
              </div>
            ) : (
              <div className="text-[11.5px] leading-snug mt-2" style={{ color: 'var(--ink-hint)' }}>
                Read from the sheet's own day columns — 1/Aug/2026, 2/Aug/2026 and so on.
              </div>
            )}
          </div>

          <button
            onClick={() => file && onUpload(file, override ? month : undefined)}
            disabled={!file || busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-4 py-2.5 shadow-sm transition"
          >
            <UploadCloud size={18} /> {busy ? 'Reading…' : 'Upload & Preview'}
          </button>
        </div>
      </div>
    </div>
  )
}
