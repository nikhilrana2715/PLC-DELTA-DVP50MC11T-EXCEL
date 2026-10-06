import { useState } from 'react'
import { Download, Eye, Loader2, Trash2 } from 'lucide-react'
import {
  PREVIEW_UNAVAILABLE,
  downloadNoteFile,
  fileKind,
  formatBytes,
  openInTab,
  openLabel,
  previewMode,
  type NoteFile,
} from '../lib/notes'

/** A file still being sent to the server, shown with its progress bar. */
export interface PendingUpload {
  name: string
  size: number
  /** 0–100, or -1 once it has failed. */
  pct: number
  error?: string
}

/**
 * One attached document — used by the "Add Note" modal and the saved note card alike, so both
 * behave identically and cannot drift apart.
 *
 * Open and Download are deliberately separate controls: Open shows the file (spreadsheet table,
 * PDF tab, photo lightbox), Download writes it to the device. Neither replaces the other.
 */
export function NoteFileRow({
  file,
  compact = false,
  onOpen,
  onDelete,
}: {
  file: NoteFile
  /** Denser padding + smaller text, for the note card's two-column grid. */
  compact?: boolean
  /** Sheets and images render in an app modal; the parent owns that state. */
  onOpen?: (f: NoteFile) => void
  /** Shown only where the file can still be removed (the modal). */
  onDelete?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const kind = fileKind(file.name)
  const mode = previewMode(file)

  const guard = async (fn: () => void | Promise<void>) => {
    setErr('')
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      const msg = (e as Error)?.message || 'This file is currently unavailable.'
      setErr(msg)
      console.error('[note file] action failed', { name: file.name, id: file.id, url: file.url }, e)
    } finally {
      setBusy(false)
    }
  }

  const open = () => {
    if (mode === 'none') return setErr(PREVIEW_UNAVAILABLE)
    // 'convert' asks the server to render Word/PowerPoint to PDF first; both land in a tab.
    if (mode === 'tab' || mode === 'convert') return void guard(() => openInTab(file, mode === 'convert'))
    onOpen?.(file) // sheet / lightbox — rendered inside the app
  }

  const pad = compact ? 'px-2 py-1.5' : 'px-2.5 py-2'
  const nameSize = compact ? 'text-[12px]' : 'text-[13px]'
  const metaSize = compact ? 'text-[10.5px]' : 'text-[11px]'
  const iconBtn =
    'shrink-0 p-1.5 rounded-md text-slate-400 outline-none focus-visible:ring-2 transition disabled:opacity-50'

  return (
    <div className="min-w-0">
      <div
        className={`flex items-center gap-2 rounded-lg border border-[var(--hairline)] bg-slate-50 ${pad} transition
                    hover:border-indigo-300 hover:bg-indigo-50/60 focus-within:border-indigo-400`}
      >
        {/* The row opens the file; the icon buttons beside it are separate actions. */}
        <button
          type="button"
          onClick={open}
          disabled={busy}
          data-file={file.name}
          data-action={mode}
          title={mode === 'none' ? PREVIEW_UNAVAILABLE : 'Open'}
          aria-label={openLabel(file)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left cursor-pointer rounded-md
                     outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-60"
        >
          <span
            className="w-8 h-8 shrink-0 rounded-md grid place-items-center text-white text-[10px] font-extrabold"
            style={{ background: kind.colour }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : kind.short}
          </span>
          <span className="min-w-0">
            {/* Long names truncate rather than break the row; the full name is in the tooltip. */}
            <span className={`block truncate font-semibold text-slate-800 ${nameSize}`} title={file.name}>
              {file.name}
            </span>
            <span className={`block text-slate-500 ${metaSize}`}>
              {kind.label} · {formatBytes(file.size)}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            open()
          }}
          disabled={busy}
          className={`${iconBtn} hover:text-indigo-700 focus-visible:ring-indigo-400`}
          title={mode === 'none' ? PREVIEW_UNAVAILABLE : 'Open'}
          aria-label={`Open ${file.name}`}
        >
          <Eye size={15} />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            void guard(() => downloadNoteFile(file))
          }}
          disabled={busy}
          className={`${iconBtn} hover:text-indigo-700 focus-visible:ring-indigo-400`}
          title="Download"
          aria-label={`Download ${file.name}`}
        >
          <Download size={15} />
        </button>

        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className={`${iconBtn} hover:text-red-600 focus-visible:ring-red-400`}
            title="Remove"
            aria-label={`Remove ${file.name}`}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {err && (
        /* Tailwind's red-600 is only 3.6:1 on the dark card; mixing toward --ink keeps it red
           and readable in both themes. */
        <div
          className="mt-1 text-[11px] font-semibold"
          style={{ color: 'color-mix(in srgb, #dc2626 46%, var(--ink))' }}
          role="alert"
        >
          {err}
        </div>
      )}
    </div>
  )
}

/** The same row shape while a file is still uploading, so the list does not jump on completion. */
export function NoteFileUploading({ item }: { item: PendingUpload }) {
  const kind = fileKind(item.name)
  const failed = item.pct < 0
  return (
    <div className="min-w-0 rounded-lg border border-[var(--hairline)] bg-slate-50 px-2.5 py-2">
      <div className="flex items-center gap-2.5">
        <span
          className="w-8 h-8 shrink-0 rounded-md grid place-items-center text-white text-[10px] font-extrabold"
          style={{ background: kind.colour, opacity: failed ? 0.5 : 1 }}
        >
          {failed ? '!' : <Loader2 size={14} className="animate-spin" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-slate-800" title={item.name}>
            {item.name}
          </span>
          <span className="block text-[11px] text-slate-500">
            {failed ? item.error : `Uploading… ${item.pct}% · ${formatBytes(item.size)}`}
          </span>
        </span>
        {!failed && <span className="shrink-0 text-[12px] font-bold tabular-nums text-slate-600">{item.pct}%</span>}
      </div>
      {!failed && (
        <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 overflow-hidden" role="progressbar" aria-valuenow={item.pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${item.pct}%`, background: 'var(--accent)' }} />
        </div>
      )}
    </div>
  )
}
