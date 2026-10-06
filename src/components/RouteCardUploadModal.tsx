import { useRef, useState } from 'react'
import { CalendarDays, FileSpreadsheet, Route, UploadCloud, X } from 'lucide-react'
import { currentMonth } from '../lib/routeCard'
import { MonthYearSelect } from './MonthRangePicker'

/**
 * Picks the Route Card workbook — and the month it belongs to.
 *
 * The Monthly Plan reads its month off the day columns; a route card has no such column and
 * no fixed layout, so the month and year are asked for here instead of guessed. They default
 * to the current month, which is the answer nearly every time.
 */

export function RouteCardUploadModal({
  onClose,
  onUpload,
  busy,
}: {
  onClose: () => void
  onUpload: (file: File, month: string) => void
  busy: boolean
}) {
  const [file, setFile] = useState<File | null>(null)
  const [drag, setDrag] = useState(false)
  const [month, setMonth] = useState(currentMonth)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div className="bento w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 md:px-5 pt-4 pb-3 border-b border-[var(--hairline)]">
          <div className="w-9 h-9 rounded-xl grid place-items-center grad-violet text-white">
            <Route size={18} />
          </div>
          <div className="flex-1">
            <div className="font-bold text-slate-800">Upload Route Card</div>
            <div className="text-xs text-slate-500">Any layout — every sheet in the file is read.</div>
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
                <div className="text-xs text-slate-400 mt-0.5">.xlsx / .xls — every sheet in the workbook is read</div>
              </>
            )}
          </div>

          {/* Month — the sheet is never asked for it. */}
          <div className="rounded-xl border border-[var(--hairline)] px-3 py-2.5 flex items-center gap-3 flex-wrap">
            <CalendarDays size={16} className="shrink-0" style={{ color: '#4f46e5' }} />
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-slate-800 leading-tight">File this card under</div>
              <div className="text-[11.5px] leading-tight" style={{ color: 'var(--ink-hint)' }}>
                Uploading this month again replaces the card already filed under it.
              </div>
            </div>
            <div className="ml-auto">
              <MonthYearSelect value={month} onChange={setMonth} disabled={busy} />
            </div>
          </div>

          <button
            onClick={() => file && onUpload(file, month)}
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
