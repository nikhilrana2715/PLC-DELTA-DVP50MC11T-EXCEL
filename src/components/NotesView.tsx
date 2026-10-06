import { useEffect, useState } from 'react'
import { StickyNote, Plus, Trash2, CalendarDays, User, X, ChevronLeft, ChevronRight, ImageIcon, Paperclip } from 'lucide-react'
import { PRIORITY_META, PRIORITY_ORDER, sortNotes, type Note, type NoteFile, type Priority } from '../lib/notes'
import { NoteFileRow } from './NoteFileRow'
import { FilePreviewModal } from './FilePreviewModal'

/** Full-screen photo viewer for a note's attachments (arrow keys / Esc supported). */
function PhotoViewer({ images, index, onClose }: { images: string[]; index: number; onClose: () => void }) {
  const [i, setI] = useState(index)
  const prev = () => setI((x) => (x - 1 + images.length) % images.length)
  const next = () => setI((x) => (x + 1) % images.length)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length])

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" style={{ background: 'rgba(15,23,42,0.88)' }} onClick={onClose}>
      <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={onClose} aria-label="Close">
        <X size={26} />
      </button>
      {images.length > 1 && (
        <>
          <button
            className="absolute left-3 md:left-6 w-11 h-11 grid place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 transition"
            onClick={(e) => {
              e.stopPropagation()
              prev()
            }}
            aria-label="Previous"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            className="absolute right-3 md:right-6 w-11 h-11 grid place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 transition"
            onClick={(e) => {
              e.stopPropagation()
              next()
            }}
            aria-label="Next"
          >
            <ChevronRight size={22} />
          </button>
        </>
      )}
      <img
        src={images[i]}
        alt={`photo ${i + 1}`}
        className="max-w-full rounded-xl shadow-2xl"
        style={{ maxHeight: '86vh' }}
        onClick={(e) => e.stopPropagation()}
      />
      <div className="absolute bottom-5 text-white/80 text-sm font-semibold">
        {i + 1} / {images.length}
      </div>
    </div>
  )
}

function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function NotesView({
  notes,
  range,
  onAdd,
  onDelete,
}: {
  notes: Note[]
  /** When set, notes are already filtered to this date range (for the subtitle/empty text). */
  range?: { from: string; to: string } | null
  onAdd: () => void
  onDelete?: (id: string) => void
}) {
  const sorted = sortNotes(notes)
  const [viewer, setViewer] = useState<{ images: string[]; index: number } | null>(null)
  const [preview, setPreview] = useState<NoteFile | null>(null)
  const rangeLabel = range ? `${fmtDate(range.from)} – ${fmtDate(range.to)}` : ''
  const counts = (['high', 'medium', 'low'] as Priority[]).map((p) => ({
    p,
    n: notes.filter((x) => x.priority === p).length,
  }))

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      {/* header row */}
      <div className="bento bento-pad flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl grid place-items-center grad-violet text-white shrink-0">
          <StickyNote size={20} />
        </div>
        <div className="flex-1 min-w-[140px]">
          <div className="font-bold text-slate-800">Summary Notes</div>
          <div className="text-xs text-slate-500">
            {notes.length} note{notes.length !== 1 ? 's' : ''} · sorted by priority
            {rangeLabel && <span className="text-indigo-600 font-semibold"> · {rangeLabel}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {counts.map(({ p, n }) => (
            <span key={p} className={PRIORITY_META[p].pill}>
              {PRIORITY_META[p].label}: {n}
            </span>
          ))}
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-xl border border-transparent bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-3.5 py-2 shadow-sm transition"
          onClick={onAdd}
        >
          <Plus size={16} /> Add Notes
        </button>
      </div>

      {/* summary list */}
      {sorted.length === 0 ? (
        <div className="bento bento-pad text-center py-12">
          <div className="w-14 h-14 mx-auto rounded-2xl grid place-items-center bg-indigo-50 text-indigo-500">
            <StickyNote size={26} />
          </div>
          <div className="mt-3 font-bold text-slate-800">{range ? 'No notes in this range' : 'No notes yet'}</div>
          <div className="text-sm text-slate-500 mt-1">
            {range ? (
              <>No notes between <b>{rangeLabel}</b>. Try a different range.</>
            ) : (
              <>Click <b>Add Notes</b> to record an issue with its priority.</>
            )}
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
          {sorted.map((n) => {
            const meta = PRIORITY_META[n.priority]
            return (
              <div
                key={n.id}
                className="bento rise overflow-hidden"
                style={{ borderLeft: `4px solid ${meta.dot}` }}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className={meta.pill}>{meta.label} priority</span>
                    {onDelete && (
                      <button
                        className="text-slate-300 hover:text-red-600 transition p-1"
                        onClick={() => onDelete(n.id)}
                        title="Delete note"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  <div className="mt-2.5 text-[15px] font-semibold text-slate-800 leading-snug break-words">
                    {n.issue || '—'}
                  </div>

                  {/* attached photos — click any to open the full-screen viewer */}
                  {n.images && n.images.length > 0 && (
                    <div className="mt-3 grid grid-cols-4 gap-1.5">
                      {n.images.slice(0, 4).map((src, i) => {
                        const more = n.images!.length - 4
                        const isLast = i === 3 && more > 0
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setViewer({ images: n.images!, index: i })}
                            className="relative aspect-square rounded-lg overflow-hidden border border-[var(--hairline)] bg-slate-50 hover:opacity-90 transition"
                            title="View photo"
                          >
                            <img src={src} alt={`photo ${i + 1}`} className="w-full h-full object-cover" />
                            {isLast && (
                              <span className="absolute inset-0 grid place-items-center bg-slate-900/60 text-white text-sm font-bold">
                                +{more}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* attached documents — same tile rhythm as the photos above, but the
                      thumbnail is the file type, since a spreadsheet has no preview image.
                      Identical row component (and so identical behaviour) as the modal. */}
                  {n.files && n.files.length > 0 && (
                    <div className="mt-3 grid sm:grid-cols-2 gap-1.5">
                      {n.files.map((f, i) => (
                        <NoteFileRow key={f.id ?? `${f.name}-${i}`} file={f} compact onOpen={setPreview} />
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <User size={13} /> {n.name || '—'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays size={13} /> {fmtDate(n.date)}
                    </span>
                    {n.images && n.images.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <ImageIcon size={13} /> {n.images.length} photo{n.images.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {n.files && n.files.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Paperclip size={13} /> {n.files.length} file{n.files.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {viewer && <PhotoViewer images={viewer.images} index={viewer.index} onClose={() => setViewer(null)} />}
      {preview && <FilePreviewModal file={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

export { PRIORITY_ORDER }
