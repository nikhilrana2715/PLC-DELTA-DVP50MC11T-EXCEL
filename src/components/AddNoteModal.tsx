import { useRef, useState } from 'react'
import { StickyNote, X, ImagePlus, Loader2, Trash2, Paperclip } from 'lucide-react'
import { NoteFileRow, NoteFileUploading, type PendingUpload } from './NoteFileRow'
import { FilePreviewModal } from './FilePreviewModal'
import {
  PRIORITY_META,
  MAX_NOTE_IMAGES,
  MAX_NOTE_FILES,
  MAX_FILE_MB,
  FILE_ACCEPT,
  compressImage,
  previewMode,
  uploadNoteFile,
  type NoteFile,
  type Priority,
} from '../lib/notes'

const PRIORITIES: Priority[] = ['high', 'medium', 'low']

export function AddNoteModal({
  defaultDate,
  onCancel,
  onSave,
}: {
  defaultDate: string
  onCancel: () => void
  onSave: (n: { date: string; name: string; issue: string; priority: Priority; images: string[]; files: NoteFile[] }) => void
}) {
  const [date, setDate] = useState(defaultDate)
  const [name, setName] = useState('')
  const [issue, setIssue] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [images, setImages] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [imgErr, setImgErr] = useState('')
  const [files, setFiles] = useState<NoteFile[]>([])
  const [uploading, setUploading] = useState<PendingUpload[]>([])
  const [docErr, setDocErr] = useState('')
  const [preview, setPreview] = useState<NoteFile | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const docRef = useRef<HTMLInputElement>(null)

  // A note can be just photos, just documents, just text, or any mix — but never while an
  // upload is still in flight, or the note would save without its attachment.
  const inFlight = uploading.some((u) => u.pct >= 0)
  const canSave = !inFlight && (issue.trim().length > 0 || images.length > 0 || files.length > 0)

  const addDocs = async (picked: FileList | null) => {
    if (!picked || picked.length === 0) return
    setDocErr('')
    const room = MAX_NOTE_FILES - files.length - uploading.length
    if (room <= 0) {
      setDocErr(`You can attach up to ${MAX_NOTE_FILES} files.`)
      return
    }
    const all = Array.from(picked)
    // Validate before a single byte goes over the wire; the server checks again.
    const tooBig = all.filter((f) => f.size > MAX_FILE_MB * 1024 * 1024)
    const unsupported = all.filter(
      (f) => f.size <= MAX_FILE_MB * 1024 * 1024 && !FILE_ACCEPT.split(',').some((e) => f.name.toLowerCase().endsWith(e)),
    )
    const okFiles = all.filter((f) => !tooBig.includes(f) && !unsupported.includes(f)).slice(0, room)
    const skipped: string[] = []
    // Wording kept exact so the message reads the same everywhere it can appear.
    if (tooBig.length) skipped.push(`File size cannot exceed ${MAX_FILE_MB} MB. (${tooBig.map((f) => f.name).join(', ')})`)
    if (unsupported.length) skipped.push(`This file type is not supported. (${unsupported.map((f) => f.name).join(', ')})`)
    if (all.length - tooBig.length - unsupported.length > okFiles.length) skipped.push(`You can attach up to ${MAX_NOTE_FILES} files.`)
    if (skipped.length) setDocErr(skipped.join(' '))
    if (!okFiles.length) return

    // Upload one at a time: a 100 MB file should get the whole connection, and the progress
    // bars stay honest instead of all crawling at once.
    for (const f of okFiles) {
      const key = `${f.name}-${f.size}-${Date.now()}`
      setUploading((prev) => [...prev, { name: f.name, size: f.size, pct: 0, key } as PendingUpload & { key: string }])
      const patch = (u: Partial<PendingUpload>) =>
        setUploading((prev) => prev.map((x) => ((x as { key?: string }).key === key ? { ...x, ...u } : x)))
      try {
        const saved = await uploadNoteFile(f, (pct) => patch({ pct }))
        setUploading((prev) => prev.filter((x) => (x as { key?: string }).key !== key))
        setFiles((prev) => [...prev, saved])
      } catch (e) {
        const msg = (e as Error)?.message || 'File upload failed. Please try again.'
        console.error('[note file] upload failed', { name: f.name, size: f.size }, e)
        patch({ pct: -1, error: msg })
      }
    }
  }

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setImgErr('')
    const room = MAX_NOTE_IMAGES - images.length
    if (room <= 0) {
      setImgErr(`You can attach up to ${MAX_NOTE_IMAGES} photos.`)
      return
    }
    const picked = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, room)
    if (picked.length < files.length) setImgErr(`Only ${room} more photo(s) could be added (max ${MAX_NOTE_IMAGES}).`)
    setBusy(true)
    try {
      const shrunk = await Promise.all(picked.map((f) => compressImage(f)))
      setImages((prev) => [...prev, ...shrunk])
    } catch (e) {
      setImgErr(String((e as Error)?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-3 md:p-4"
      style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Add note"
    >
      {/* Column layout so the modal never leaves the viewport: the header and the action row
          hold their height, and only the middle scrolls. `dvh` follows the mobile keyboard,
          which `vh` does not — without it the Save row hides behind the keyboard. */}
      <div
        className="bento w-full max-w-md flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: 'min(92vh, 92dvh)', animation: 'rise 0.2s ease both' }}
      >
        <div className="shrink-0 flex items-center gap-3 px-5 pt-4 pb-3 border-b border-[var(--hairline)]">
          <div className="w-9 h-9 rounded-xl grid place-items-center grad-violet text-white">
            <StickyNote size={18} />
          </div>
          <div className="flex-1">
            <div className="font-bold text-slate-800">Add Note</div>
            <div className="text-xs text-slate-500">Record an issue with its priority</div>
          </div>
          <button className="text-slate-400 hover:text-slate-600" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>

        {/* min-h-0 lets this flex child actually shrink, which is what allows it to scroll.
            overscroll-contain stops a touch scroll here from dragging the page behind it. */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-area p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--hairline)] px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="mt-1 w-full rounded-xl border border-[var(--hairline)] px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_META[p].label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Who is raising this?"
              className="mt-1 w-full rounded-xl border border-[var(--hairline)] px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Issue</span>
            <textarea
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              rows={4}
              placeholder="Describe the issue / point to discuss…"
              className="mt-1 w-full rounded-xl border border-[var(--hairline)] px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 resize-none"
            />
          </label>

          {/* photos */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">
                Photos <span className="font-normal" style={{ color: 'var(--ink-hint)' }}>({images.length}/{MAX_NOTE_IMAGES})</span>
              </span>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy || images.length >= MAX_NOTE_IMAGES}
                className="inline-flex items-center gap-1.5 rounded-lg border text-[13px] font-semibold px-2.5 py-1.5 hover:brightness-[0.97] disabled:opacity-50 transition"
                style={{
                  color: 'var(--accent)',
                  background: 'color-mix(in srgb, var(--accent) 12%, var(--surface))',
                  borderColor: 'color-mix(in srgb, var(--accent) 34%, var(--surface))',
                }}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                {busy ? 'Adding…' : 'Add photos'}
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void addFiles(e.target.files)
                e.target.value = ''
              }}
            />

            {images.length > 0 ? (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {images.map((src, i) => (
                  <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-[var(--hairline)] bg-slate-50">
                    <img src={src} alt={`photo ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((_, x) => x !== i))}
                      className="absolute top-1 right-1 w-6 h-6 grid place-items-center rounded-md bg-white/90 text-red-600 shadow-sm opacity-0 group-hover:opacity-100 transition"
                      title="Remove photo"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div
                onClick={() => fileRef.current?.click()}
                className="mt-2 rounded-xl border-2 border-dashed border-slate-200 px-3 py-5 text-center cursor-pointer hover:border-indigo-300 hover:bg-slate-50 transition"
              >
                <ImagePlus size={20} className="mx-auto text-slate-400" />
                <div className="text-xs text-slate-500 mt-1">Attach up to {MAX_NOTE_IMAGES} photos with this note</div>
              </div>
            )}
            {imgErr && <div className="mt-1.5 text-xs font-semibold text-red-600">{imgErr}</div>}
          </div>

          {/* documents */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">
                Attached Files <span className="font-normal" style={{ color: 'var(--ink-hint)' }}>({files.length + uploading.length}/{MAX_NOTE_FILES})</span>
              </span>
              <button
                type="button"
                onClick={() => docRef.current?.click()}
                disabled={busy || files.length + uploading.length >= MAX_NOTE_FILES}
                className="inline-flex items-center gap-1.5 rounded-lg border text-[13px] font-semibold px-2.5 py-1.5 hover:brightness-[0.97] disabled:opacity-50 transition"
                style={{
                  color: 'var(--accent)',
                  background: 'color-mix(in srgb, var(--accent) 12%, var(--surface))',
                  borderColor: 'color-mix(in srgb, var(--accent) 34%, var(--surface))',
                }}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
                {busy ? 'Adding…' : 'Add files'}
              </button>
            </div>
            <input
              ref={docRef}
              type="file"
              accept={FILE_ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                void addDocs(e.target.files)
                e.target.value = ''
              }}
            />

            {files.length > 0 || uploading.length > 0 ? (
              <div className="mt-2 flex flex-col gap-1.5">
                {files.map((f, i) => (
                  <NoteFileRow
                    key={f.id ?? `${f.name}-${i}`}
                    file={f}
                    onOpen={setPreview}
                    onDelete={() => setFiles((prev) => prev.filter((_, x) => x !== i))}
                  />
                ))}
                {uploading.map((u, i) => (
                  <NoteFileUploading key={(u as { key?: string }).key ?? i} item={u} />
                ))}
              </div>
            ) : (
              <div
                onClick={() => docRef.current?.click()}
                className="mt-2 rounded-xl border-2 border-dashed border-slate-200 px-3 py-5 text-center cursor-pointer hover:border-indigo-300 hover:bg-slate-50 transition"
              >
                <Paperclip size={20} className="mx-auto text-slate-400" />
                <div className="text-xs text-slate-500 mt-1">
                  Excel, CSV, Word, PowerPoint or PDF — up to {MAX_NOTE_FILES} files, {MAX_FILE_MB} MB each
                </div>
              </div>
            )}
            {docErr && <div className="mt-1.5 text-xs font-semibold text-red-600">{docErr}</div>}
          </div>

        </div>

        <div className="shrink-0 flex items-center gap-2 justify-end px-5 py-3 border-t border-[var(--hairline)]">
          {inFlight && <span className="mr-auto text-[12px] font-semibold text-slate-500">Uploading…</span>}
          <button className="icon-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="icon-btn !bg-indigo-600 !text-white !border-indigo-600 hover:!bg-indigo-700 disabled:opacity-50"
            onClick={() => canSave && !busy && onSave({ date, name: name.trim(), issue: issue.trim(), priority, images, files })}
            disabled={!canSave || busy}
          >
            Save Note
          </button>
        </div>
      </div>

      {preview && (
        <div onClick={(e) => e.stopPropagation()}>
          {previewMode(preview) === 'lightbox' ? null : <FilePreviewModal file={preview} onClose={() => setPreview(null)} />}
        </div>
      )}
    </div>
  )
}
