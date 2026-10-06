import { useRef, useState } from 'react'
import { X, UploadCloud, CalendarDays, FileSpreadsheet } from 'lucide-react'

function todayISO() {
  return new Date().toLocaleDateString('en-CA')
}

/** Upload the Assembly Excel and choose which date the report is for. */
export function AssemblyUploadModal({
  onClose,
  onUpload,
  busy,
}: {
  onClose: () => void
  onUpload: (file: File, date: string) => void
  busy: boolean
}) {
  const [date, setDate] = useState(todayISO())
  const [file, setFile] = useState<File | null>(null)
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const pick = (f: File | null | undefined) => {
    if (f) setFile(f)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div className="bento w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 md:px-5 pt-4 pb-3 border-b border-[var(--hairline)]">
          <div className="w-9 h-9 rounded-xl grid place-items-center grad-violet text-white">
            <UploadCloud size={18} />
          </div>
          <div className="flex-1">
            <div className="font-bold text-slate-800">Upload Assembly Excel</div>
            <div className="text-xs text-slate-500">Pick the report date, then choose the file.</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 md:p-5 flex flex-col gap-4">
          {/* date */}
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Report date</span>
            <div className="mt-1 flex items-center gap-2 bg-white rounded-xl border border-[var(--hairline)] px-3 py-2.5">
              <CalendarDays size={16} className="text-indigo-500 shrink-0" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value || todayISO())}
                className="text-sm font-semibold text-slate-800 bg-transparent outline-none flex-1"
              />
              <span className="text-[11px] text-slate-400 shrink-0">any date (incl. future)</span>
            </div>
          </label>

          {/* file dropzone */}
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
              pick(e.dataTransfer.files?.[0])
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                pick(e.target.files?.[0])
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
                <div className="text-xs text-slate-400 mt-0.5">.xlsx / .xls — Assembly Production Report</div>
              </>
            )}
          </div>

          <button
            onClick={() => file && onUpload(file, date)}
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
