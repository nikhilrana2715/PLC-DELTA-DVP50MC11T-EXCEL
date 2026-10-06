import { useRef, useState } from 'react'
import { Calendar, FileSpreadsheet, UploadCloud, Wrench, X } from 'lucide-react'
import { currentDateISO } from '../lib/maintenanceReport'

export function MaintenanceReportUploadModal({
  onClose,
  onUpload,
  busy,
  title = 'Upload Maintenance Report',
  description = 'Every sheet in the workbook will be read & stored.',
  icon,
  accentGrad = 'linear-gradient(150deg,#0284c7,#06b6d4 55%,#3b82f6)',
}: {
  onClose: () => void
  onUpload: (file: File, date: string) => void
  busy: boolean
  title?: string
  description?: string
  icon?: React.ReactNode
  accentGrad?: string
}) {
  const [file, setFile] = useState<File | null>(null)
  const [drag, setDrag] = useState(false)
  const [date, setDate] = useState(currentDateISO)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div className="bento w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 md:px-5 pt-4 pb-3 border-b border-[var(--hairline)]">
          <div className="w-9 h-9 rounded-xl grid place-items-center text-white shrink-0" style={{ background: accentGrad }}>
            {icon ?? <Wrench size={18} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-slate-800">{title}</div>
            <div className="text-xs text-slate-500 truncate">{description}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 md:p-5 flex flex-col gap-4">
          <div
            className={`rounded-2xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition ${
              drag ? 'border-sky-500 bg-sky-50/60' : 'border-slate-200 hover:border-sky-300 hover:bg-slate-50'
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
                <div className="mt-2 text-sm font-semibold text-slate-600">Click to choose or drop the Excel file here</div>
                <div className="text-xs text-slate-400 mt-0.5">.xlsx / .xls — workbook sheets</div>
              </>
            )}
          </div>

          {/* Full Date Selector (Day, Month, Year) */}
          <div className="rounded-xl border border-[var(--hairline)] px-3.5 py-3 flex items-center gap-3 flex-wrap bg-slate-50/50">
            <Calendar size={18} className="shrink-0 text-sky-600" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold text-slate-800 leading-tight">Select Date (Day, Month, Year)</div>
              <div className="text-[11.5px] leading-tight text-slate-500 mt-0.5">
                File this report under a specific date.
              </div>
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={busy}
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 shadow-sm focus:outline-none focus:border-sky-500 cursor-pointer"
            />
          </div>

          <button
            onClick={() => file && onUpload(file, date)}
            disabled={!file || busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-semibold px-4 py-2.5 shadow-sm transition"
          >
            <UploadCloud size={18} /> {busy ? 'Reading…' : 'Upload & Preview'}
          </button>
        </div>
      </div>
    </div>
  )
}
