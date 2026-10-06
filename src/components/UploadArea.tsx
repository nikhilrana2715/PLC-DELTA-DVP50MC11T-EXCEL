import { useRef, useState } from 'react'
import { UploadCloud, FileSpreadsheet, Loader2 } from 'lucide-react'
import { parseWorkbook } from '../lib/parseExcel'
import type { ParsedReport } from '../types'

export function UploadArea({
  onLoaded,
  compact = false,
  label,
  hint,
  accent = 'indigo',
}: {
  onLoaded: (r: ParsedReport) => void
  compact?: boolean
  /** When set, renders a smaller labelled tile (used for the per-shift sections). */
  label?: string
  hint?: string
  accent?: 'indigo' | 'emerald'
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const report = parseWorkbook(buf, file.name)
      if (report.rows.length === 0) {
        setError('No machine rows found. Is this the Morning Meeting report?')
      } else {
        onLoaded(report)
      }
    } catch (e) {
      setError(`Could not read the file: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDrag(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  if (compact) {
    return (
      <>
        <button
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-3.5 py-2 shadow-sm transition"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
          Upload Excel
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {error && <span className="text-xs text-red-600 ml-2">{error}</span>}
      </>
    )
  }

  // labelled tile — used for the per-shift upload sections
  if (label) {
    const accentText = accent === 'emerald' ? 'text-emerald-600' : 'text-indigo-600'
    const accentBorder = accent === 'emerald' ? '#10b981' : '#6366f1'
    return (
      <div
        className={`dropzone ${drag ? 'drag' : ''} p-6 text-center cursor-pointer`}
        style={{ borderTop: `3px solid ${accentBorder}` }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        <div className={`w-12 h-12 mx-auto rounded-2xl grid place-items-center bg-white shadow-sm ${accentText}`}>
          {busy ? <Loader2 size={24} className="animate-spin" /> : <FileSpreadsheet size={24} />}
        </div>
        <div className="mt-3 font-bold text-slate-800">{label}</div>
        <div className="text-xs text-slate-500 mt-1">{hint ?? 'Drag & drop or click to browse'}</div>
        <div className="text-[11px] text-slate-400 mt-1.5">.xlsx, .xls, .csv</div>
        {error && <div className="mt-2 text-sm text-red-600 font-medium">{error}</div>}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </div>
    )
  }

  return (
    <div
      className={`dropzone ${drag ? 'drag' : ''} p-10 text-center cursor-pointer`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      <div className="w-16 h-16 mx-auto rounded-2xl grid place-items-center bg-white shadow-sm text-indigo-600">
        {busy ? <Loader2 size={30} className="animate-spin" /> : <FileSpreadsheet size={30} />}
      </div>
      <div className="mt-4 font-bold text-slate-800 text-lg">Upload Morning Meeting Report</div>
      <div className="text-sm text-slate-500 mt-1">
        Drag &amp; drop your Excel file here, or click to browse
      </div>
      <div className="text-xs text-slate-400 mt-2">Supports .xlsx, .xls and .csv</div>
      {error && <div className="mt-3 text-sm text-red-600 font-medium">{error}</div>}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        hidden
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </div>
  )
}
