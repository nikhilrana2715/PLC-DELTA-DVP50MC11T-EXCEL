import { useEffect, useState } from 'react'
import { Download, Loader2, X } from 'lucide-react'
import {
  PREVIEW_ROW_CAP,
  downloadNoteFile,
  fileKind,
  formatBytes,
  readSheet,
  type NoteFile,
  type SheetPreview,
} from '../lib/notes'

/**
 * Read-only viewer for spreadsheet attachments (CSV, .xls, .xlsx, .xlsm).
 *
 * Rendering is capped at PREVIEW_ROW_CAP rows: a production export can run to hundreds of
 * thousands of rows, and the point of the preview is to check the file at a glance, not to be
 * a second dashboard. The full file is one click away via Download.
 */
export function FilePreviewModal({ file, onClose }: { file: NoteFile; onClose: () => void }) {
  const [data, setData] = useState<SheetPreview | null>(null)
  const [sheet, setSheet] = useState<string | undefined>(undefined)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(true)
  const kind = fileKind(file.name)

  useEffect(() => {
    let alive = true
    setBusy(true)
    setErr('')
    readSheet(file, sheet)
      .then((d) => {
        if (!alive) return
        setData(d)
        setSheet(d.active)
      })
      .catch((e: Error) => {
        if (!alive) return
        console.error('[note file] preview failed', { name: file.name, id: file.id }, e)
        setErr(e?.message || 'Preview is not available for this file.')
      })
      .finally(() => alive && setBusy(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id, file.url, sheet])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center p-3 md:p-6"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${file.name}`}
    >
      {/* Column layout: header and footer hold their size, the table scrolls between them. */}
      <div
        className="bento w-full max-w-5xl flex flex-col overflow-hidden"
        style={{ maxHeight: 'min(88vh, 88dvh)', animation: 'rise 0.18s ease both' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center gap-3 px-4 md:px-5 py-3 border-b border-[var(--hairline)]">
          <span
            className="w-9 h-9 shrink-0 rounded-lg grid place-items-center text-white text-[10px] font-extrabold"
            style={{ background: kind.colour }}
          >
            {kind.short}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-slate-800 truncate" title={file.name}>
              {file.name}
            </div>
            <div className="text-xs text-slate-500">
              {kind.label} · {formatBytes(file.size)}
              {data && data.totalRows > 0 && (
                <>
                  {' · '}
                  {data.totalRows > PREVIEW_ROW_CAP
                    ? `showing first ${PREVIEW_ROW_CAP} of ${data.totalRows.toLocaleString('en-IN')} rows`
                    : `${data.totalRows.toLocaleString('en-IN')} row${data.totalRows === 1 ? '' : 's'}`}
                </>
              )}
            </div>
          </div>
          <button
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border text-[13px] font-semibold px-2.5 py-1.5 transition hover:brightness-[0.97]"
            style={{
              color: 'var(--accent)',
              background: 'color-mix(in srgb, var(--accent) 12%, var(--surface))',
              borderColor: 'color-mix(in srgb, var(--accent) 34%, var(--surface))',
            }}
            onClick={() => void downloadNoteFile(file)}
          >
            <Download size={14} /> Download
          </button>
          <button className="shrink-0 text-slate-400 hover:text-slate-700 p-1" onClick={onClose} aria-label="Close preview">
            <X size={20} />
          </button>
        </div>

        {/* sheet tabs — only when the workbook has more than one */}
        {data && data.sheets.length > 1 && (
          <div className="shrink-0 flex gap-1 overflow-x-auto scroll-area px-4 md:px-5 py-2 border-b border-[var(--hairline)]">
            {data.sheets.map((s) => (
              <button
                key={s}
                onClick={() => setSheet(s)}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-bold border transition ${
                  s === data.active ? 'text-white border-transparent' : 'hover:brightness-95'
                }`}
                style={
                  s === data.active
                    ? { background: 'var(--accent)' }
                    : { borderColor: 'var(--hairline)', color: 'var(--ink-2)' }
                }
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto scroll-area px-4 md:px-5 py-3">
          {busy && (
            <div className="py-16 text-center text-slate-500 text-sm">
              <Loader2 size={22} className="mx-auto mb-2 animate-spin" />
              Opening {file.name}…
            </div>
          )}
          {!busy && err && (
            <div className="py-16 text-center">
              <div className="text-sm font-semibold" style={{ color: 'color-mix(in srgb, #dc2626 46%, var(--ink))' }}>
                {err}
              </div>
              <button
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--hairline)] px-3 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => void downloadNoteFile(file)}
              >
                <Download size={14} /> Download instead
              </button>
            </div>
          )}
          {!busy && !err && data && (
            <table className="w-max min-w-full text-[12.5px] border-collapse">
              <tbody>
                {data.rows.map((row, r) => (
                  <tr key={r} className={r === 0 ? 'bg-slate-50 font-bold' : r % 2 ? 'bg-slate-50/40' : ''}>
                    <td className="px-2 py-1 text-right text-slate-400 tabular-nums border border-[var(--hairline)] select-none">
                      {r + 1}
                    </td>
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className="px-2.5 py-1 border border-[var(--hairline)] whitespace-nowrap max-w-[320px] truncate text-slate-800"
                        title={cell}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td className="px-2 py-6 text-center text-slate-500">This sheet is empty.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
