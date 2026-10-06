import { clientId } from './realtime'
import { authHeaders } from './auth'
import { apiUrl, getUnit, unitKey } from './unit'
import type { Unit } from './unit'
import { cacheList } from './cacheLimit'

export type Priority = 'high' | 'medium' | 'low'

/**
 * A document attached to a note — Excel, Word, PowerPoint, PDF or CSV.
 *
 * The bytes live on the server (`/api/notes/files/<id>`), streamed on demand. They are stored
 * and returned untouched: no conversion, no re-compression, no re-encoding. (Photos are handled
 * separately and *are* shrunk — a phone snap has no fidelity worth preserving; a spreadsheet does.)
 *
 * `data` is the legacy shape: attachments saved before the server file store existed are base64
 * data URLs inside the note. Those keep working — every reader below accepts either form.
 */
export interface NoteFile {
  /** Server file id. Absent on legacy (embedded) attachments. */
  id?: string
  name: string
  /** MIME type, derived from the extension by the server. */
  type: string
  /** Size in bytes of the original file. */
  size: number
  /** Server path to stream the file from. Absent on legacy attachments. */
  url?: string
  /** Legacy inline copy (base64 data URL). Absent on anything uploaded since. */
  data?: string
}

export interface Note {
  id: string
  createdAt: number
  date: string // YYYY-MM-DD
  name: string
  issue: string
  priority: Priority
  /** Attached photos as compressed JPEG data URLs (see compressImage). */
  images?: string[]
  /** Attached documents, stored unmodified (see NoteFile). */
  files?: NoteFile[]
  by?: string
}

/** How many photos a single note can carry. */
export const MAX_NOTE_IMAGES = 12
/** How many documents a single note can carry. */
export const MAX_NOTE_FILES = 6
/** Per-file ceiling. Enforced here AND on the server, which counts the real bytes. */
export const MAX_FILE_MB = 100

/** Extensions offered in the picker, and what each one is. */
export const FILE_KINDS: { ext: string[]; label: string; colour: string; short: string }[] = [
  { ext: ['.xls', '.xlsx', '.xlsm', '.csv'], label: 'Excel', colour: '#137a4a', short: 'XLS' },
  { ext: ['.doc', '.docx'], label: 'Word', colour: '#20548f', short: 'DOC' },
  { ext: ['.ppt', '.pptx'], label: 'PowerPoint', colour: '#b3441d', short: 'PPT' },
  { ext: ['.pdf'], label: 'PDF', colour: '#a3202b', short: 'PDF' },
]

/** `accept` attribute for the file input. */
export const FILE_ACCEPT = FILE_KINDS.flatMap((k) => k.ext).join(',')

/** Which kind a file name belongs to — falls back to a neutral "file" entry. */
export function fileKind(name: string): { label: string; colour: string; short: string } {
  const lower = String(name || '').toLowerCase()
  const hit = FILE_KINDS.find((k) => k.ext.some((e) => lower.endsWith(e)))
  return hit ?? { label: 'File', colour: '#5b6478', short: 'FILE' }
}

export const formatBytes = (n: number): string => {
  if (!n) return '0 KB'
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Send a file to the server as raw bytes and get back its stored descriptor.
 *
 * The body is the file itself — no multipart, no base64 — so nothing is re-encoded and a
 * 100 MB upload never has to be held in memory as a string. `onProgress` reports 0–100.
 */
export function uploadNoteFile(file: File, onProgress?: (pct: number) => void): Promise<NoteFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/notes/files')
    const auth = authHeaders(false) as Record<string, string>
    for (const [k, v] of Object.entries(auth)) if (v) xhr.setRequestHeader(k, v)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    // Names can carry Hindi/Gujarati characters, which are not legal in a raw header.
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name))
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        /* fall through to the generic message */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.id) {
        onProgress?.(100)
        resolve(body as unknown as NoteFile)
      } else {
        reject(new Error(String(body.error || 'File upload failed. Please try again.')))
      }
    }
    xhr.onerror = () => reject(new Error('File upload failed. Please try again.'))
    xhr.onabort = () => reject(new Error('Upload cancelled.'))
    xhr.send(file)
  })
}

/**
 * Shrink a picked image before it is stored with the note.
 * Phone photos are 3–8 MB each; scaling the long edge to 1400px and re-encoding as JPEG keeps
 * each one ~100–250 KB, so a full 12-photo note still saves comfortably. (Documents are never
 * touched this way — a spreadsheet's bytes have to survive exactly.)
 */
export function compressImage(file: File, maxEdge = 1400, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas not supported'))
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image'))
    }
    img.src = url
  })
}

/** Extensions we can render inside the app. */
const RE_IMAGE = /\.(jpe?g|png|webp|gif|bmp)$/i
const RE_SHEET = /\.(csv|xlsx?|xlsm)$/i
const RE_PDF = /\.pdf$/i
/** Formats the server can render to PDF with LibreOffice. */
const RE_OFFICE = /\.(docx?|pptx?|odt|odp)$/i

/**
 * How "Open" should behave for this file.
 *
 * - `lightbox` / `sheet` render inside the app.
 * - `tab` streams the file to a new browser tab (PDF renders natively there).
 * - `convert` asks the server to render it to PDF with LibreOffice first — that is how Word and
 *   PowerPoint get a faithful preview without any internet round trip.
 * - `none` is the last resort: nothing can show it, so the row says so and offers Download.
 */
export function previewMode(f: NoteFile): 'lightbox' | 'sheet' | 'tab' | 'convert' | 'none' {
  const n = f?.name ?? ''
  if (RE_IMAGE.test(n) || /^image\//.test(f?.type ?? '')) return 'lightbox'
  if (RE_SHEET.test(n)) return 'sheet'
  if (RE_PDF.test(n)) return 'tab'
  // Word/PowerPoint go through the server's LibreOffice conversion. Legacy notes that carry
  // their bytes inline have nothing on the server to convert, so those stay download-only.
  if (RE_OFFICE.test(n) && f?.id) return 'convert'
  return 'none'
}

export const PREVIEW_UNAVAILABLE = 'Preview is not available for this file type. You can download the file instead.'

/** Aria label for the Open control. */
export const openLabel = (f: NoteFile): string =>
  previewMode(f) === 'none' ? `${PREVIEW_UNAVAILABLE} (${f.name})` : `Open ${f.name}`

/**
 * Fetch an attachment's bytes.
 *
 * Server-stored files are streamed through the authenticated API — the URL is never handed to
 * the browser directly, so a file cannot be read by anyone without a session. Legacy notes carry
 * the bytes inline; those are decoded locally.
 */
export async function fileBlob(f: NoteFile): Promise<Blob> {
  if (f.url) {
    const r = await fetch(f.url, { headers: authHeaders(false), cache: 'no-store' })
    if (r.status === 404) throw new Error('This file is currently unavailable.')
    if (r.status === 401) throw new Error('Please sign in again to open this file.')
    if (!r.ok) throw new Error('This file is currently unavailable.')
    return await r.blob()
  }
  if (!f.data || !String(f.data).includes(',')) {
    throw new Error('This file is currently unavailable.')
  }
  const bin = atob(String(f.data).split(',')[1] ?? '')
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: f.type || 'application/octet-stream' })
}

/** Save a file to disk under its ORIGINAL name. */
export async function downloadNoteFile(f: NoteFile) {
  const url = URL.createObjectURL(await fileBlob(f))
  const a = document.createElement('a')
  a.href = url
  a.download = f.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Stream a file into a new browser tab (PDF).
 *
 * Two things have to be right here, and both are easy to get wrong:
 *
 * 1. The tab is opened SYNCHRONOUSLY, before any `await`. `window.open` is only permitted while
 *    a user gesture is live, and fetching a large file takes far longer than that window — open
 *    first, navigate once the bytes arrive.
 * 2. No `noopener` in the feature string. Per spec `window.open` returns *null* when noopener is
 *    set, so there would be no handle to navigate, and a null return would be indistinguishable
 *    from a blocked pop-up. The opener link is severed after navigating instead, which gives the
 *    same protection without losing the handle.
 */
export async function openInTab(f: NoteFile, convert = false) {
  const win = window.open('', '_blank')
  if (!win) {
    // A real pop-up block. Say so rather than silently downloading something else.
    throw new Error('Your browser blocked the new tab. Allow pop-ups for this site, or use Download.')
  }
  // Something to look at while a large file streams in.
  try {
    win.document.write(
      `<title>${f.name}</title><body style="font:14px system-ui;padding:24px;color:#475069">` +
        `${convert ? 'Building a preview of' : 'Opening'} ${f.name}…</body>`,
    )
    win.document.close()
  } catch {
    /* some browsers disallow writing into the blank tab — harmless */
  }
  let url = ''
  try {
    url = URL.createObjectURL(convert ? await loadConvertedPreview(f) : await fileBlob(f))
  } catch (e) {
    win.close()
    throw e
  }
  try {
    win.opener = null
  } catch {
    /* ignore */
  }
  win.location.replace(url)
  setTimeout(() => URL.revokeObjectURL(url), 120_000)
}

/**
 * Ask the server for a PDF rendering of a Word/PowerPoint file and show it in `win`.
 *
 * The tab is opened by the caller *before* this runs — see openInTab for why that ordering
 * matters. Conversion takes a second or two the first time and is cached after that.
 */
export async function loadConvertedPreview(f: NoteFile): Promise<Blob> {
  const r = await fetch(`/api/notes/files/${f.id}/preview`, { headers: authHeaders(false), cache: 'no-store' })
  if (!r.ok) {
    let msg = 'Could not build a preview for this file.'
    try {
      msg = (await r.json()).error || msg
    } catch {
      /* keep the default */
    }
    throw new Error(msg)
  }
  return await r.blob()
}

/** One sheet of a workbook / a CSV, as rows of display strings. */
export interface SheetPreview {
  sheets: string[]
  active: string
  rows: string[][]
  /** Total rows in the sheet before the preview cap. */
  totalRows: number
}

/** How many rows a preview renders before it stops, so a 200k-row export cannot hang the tab. */
export const PREVIEW_ROW_CAP = 500

/**
 * Read a CSV or Excel file into a table. Uses the same SheetJS parser the dashboard already
 * relies on for its uploads, so there is one spreadsheet reader in the app, not two.
 */
export async function readSheet(f: NoteFile, sheetName?: string): Promise<SheetPreview> {
  const XLSX = await import('xlsx')
  const buf = await (await fileBlob(f)).arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheets = wb.SheetNames
  const active = sheetName && sheets.includes(sheetName) ? sheetName : sheets[0]
  if (!active) return { sheets, active: '', rows: [], totalRows: 0 }
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[active], { header: 1, blankrows: false, defval: '' })
  const rows = grid.slice(0, PREVIEW_ROW_CAP).map((r) => (r as unknown[]).map((c) => (c == null ? '' : String(c))))
  return { sheets, active, rows, totalRows: grid.length }
}

const KEY_BASE = 'mm.notes.v1'
/** Cache key for the ACTIVE unit — each workspace caches separately. */
const KEY = (unit: Unit) => unitKey(KEY_BASE, unit)
const API = '/api/notes'

export const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

export const PRIORITY_META: Record<Priority, { label: string; pill: string; dot: string }> = {
  high: { label: 'High', pill: 'pill pill-critical', dot: '#d03b3b' },
  medium: { label: 'Medium', pill: 'pill pill-warning', dot: '#fab219' },
  low: { label: 'Low', pill: 'pill pill-good', dot: '#0ca30c' },
}

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

export function sortNotes(list: Note[]): Note[] {
  return [...list].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.createdAt - a.createdAt,
  )
}

function readLocal(unit: Unit): Note[] {
  try {
    const raw = localStorage.getItem(KEY(unit))
    return raw ? sortNotes(JSON.parse(raw) as Note[]) : []
  } catch {
    return []
  }
}
function writeLocal(list: Note[], unit: Unit) {
  try {
    cacheList(KEY(unit), list)
  } catch {
    /* ignore */
  }
}

export async function fetchNotes(): Promise<Note[]> {
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(API, unit), { cache: 'no-store' })
    if (!r.ok) throw new Error('bad status')
    const list = (await r.json()) as Note[]
    writeLocal(list, unit)
    return sortNotes(list)
  } catch {
    return readLocal(unit)
  }
}

export async function saveNote(n: Omit<Note, 'id' | 'createdAt' | 'by'>): Promise<Note> {
  const unit = getUnit()
  const entry: Note = { ...n, id: genId(), createdAt: Date.now(), by: clientId() }
  try {
    const r = await fetch(apiUrl(API, unit), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(entry),
    })
    if (!r.ok) throw new Error('bad status')
    return (await r.json()) as Note
  } catch {
    writeLocal([entry, ...readLocal(unit)], unit)
    return entry
  }
}

export async function deleteNote(id: string): Promise<void> {
  const unit = getUnit()
  try {
    const r = await fetch(apiUrl(`${API}/${id}`, unit), { method: 'DELETE', headers: authHeaders(false) })
    if (!r.ok) throw new Error('bad status')
  } catch {
    writeLocal(readLocal(unit).filter((n) => n.id !== id), unit)
  }
}
