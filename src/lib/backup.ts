// Backup — export the app's saved data as a ZIP of date-wise CSV folders.
//
// Why a hand-rolled ZIP: the project has no archive dependency and CSV backups of this
// size do not need compression, so entries are written STORED (method 0). That produces a
// plain, universally readable .zip with no new package and no build-size cost.

// ---- CRC-32 (needed by the ZIP format) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** JS Date → the packed MS-DOS date/time pair ZIP entries carry. */
function dosStamp(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

export interface ZipFile {
  /** Path inside the archive; forward slashes make folders. */
  name: string
  text: string
}

/** Build a STORED (uncompressed) zip. Folders come from '/' in the entry names. */
export function makeZip(files: ZipFile[], when = new Date()): Blob {
  const enc = new TextEncoder()
  const { time, date } = dosStamp(when)
  // Uint8Array<ArrayBuffer> (not the default ArrayBufferLike) — only that is a BlobPart.
  const locals: Uint8Array<ArrayBuffer>[] = []
  const centrals: Uint8Array<ArrayBuffer>[] = []
  let offset = 0

  for (const f of files) {
    // Excel opens a CSV as UTF-8 only when it starts with a BOM; without it, Hindi /
    // Gujarati text and the ₹/– characters come out as mojibake.
    const body = enc.encode('﻿' + f.text)
    const nameBytes = enc.encode(f.name)
    const crc = crc32(body)

    // Allocate through an explicit ArrayBuffer: a Uint8Array typed over ArrayBufferLike
    // (which could be a SharedArrayBuffer) is not a valid BlobPart.
    const local = new Uint8Array(new ArrayBuffer(30 + nameBytes.length + body.length))
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true) // local file header signature
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0x0800, true) // flags: UTF-8 names
    lv.setUint16(8, 0, true) // method 0 = stored
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, body.length, true) // compressed size
    lv.setUint32(22, body.length, true) // uncompressed size
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true) // extra length
    local.set(nameBytes, 30)
    local.set(body, 30 + nameBytes.length)
    locals.push(local)

    const central = new Uint8Array(new ArrayBuffer(46 + nameBytes.length))
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true) // central directory signature
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, body.length, true)
    cv.setUint32(24, body.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true) // offset of the local header
    central.set(nameBytes, 46)
    centrals.push(central)

    offset += local.length
  }

  const centralSize = centrals.reduce((s, c) => s + c.length, 0)
  const end = new Uint8Array(new ArrayBuffer(22))
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true) // end of central directory
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  return new Blob([...locals, ...centrals, end], { type: 'application/zip' })
}

// ---- CSV ----------------------------------------------------------------

/** RFC-4180 escaping. Values that could be read as a formula are prefixed with ' so a
 *  spreadsheet shows them as text instead of executing them. */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n')
}

/** CSV from records, using `cols` as both the header and the key list. */
export function recordsToCsv<T extends Record<string, unknown>>(cols: { key: keyof T & string; label: string }[], rows: T[]): string {
  return toCsv(
    cols.map((c) => c.label),
    rows.map((r) => cols.map((c) => r[c.key])),
  )
}

// ---- what can be backed up ---------------------------------------------

export type SourceId = 'meetings' | 'uploads' | 'assembly' | 'monthlyplan' | 'routecard' | 'notes' | 'cpk' | 'cumulative' | 'activity'

export interface SourceInfo {
  id: SourceId
  label: string
  hint: string
  /** true when the source is split into one CSV per date. */
  dateWise: boolean
}

export const SOURCES: SourceInfo[] = [
  { id: 'meetings', label: 'Production Reports', hint: 'Saved daily meeting snapshots — one CSV per date', dateWise: true },
  { id: 'uploads', label: 'Excel Uploads', hint: 'Every converted shift report — one CSV per date & shift', dateWise: true },
  { id: 'assembly', label: 'Assembly Reports', hint: 'Assembly production sheets — one CSV per date', dateWise: true },
  { id: 'monthlyplan', label: 'Monthly Planning', hint: 'Plan Confirmation sheets — one CSV per month', dateWise: false },
  { id: 'routecard', label: 'Route Card', hint: 'Route card workbooks — one CSV per sheet, per month', dateWise: false },
  { id: 'notes', label: 'Notes', hint: 'All notes raised in the range', dateWise: false },
  { id: 'cpk', label: 'Cp-Cpk', hint: 'Capability entries', dateWise: false },
  { id: 'cumulative', label: 'Cumulative', hint: 'Day-wise cumulative entries', dateWise: false },
  { id: 'activity', label: 'User Activity', hint: 'Users list + the login / import / delete log', dateWise: false },
]

const authHeaders = (): Record<string, string> => {
  try {
    const tok = localStorage.getItem('mm.auth.token')
    return tok ? { Authorization: `Bearer ${tok}` } : {}
  } catch {
    return {}
  }
}

const getJson = async <T>(url: string, fallback: T): Promise<T> => {
  try {
    const r = await fetch(url, { headers: authHeaders() })
    if (!r.ok) return fallback
    return (await r.json()) as T
  } catch {
    return fallback
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>

export interface BackupData {
  meetings: Any[]
  uploads: Any[]
  assembly: Any[]
  monthlyplan: Any[]
  routecard: Any[]
  notes: Any[]
  cpk: Any[]
  cumulative: Any[]
  users: Any[]
  events: Any[]
}

/** Pull everything the backup page can offer, in one go. */
export async function fetchBackupData(): Promise<BackupData> {
  const [meetings, uploads, assembly, monthlyplan, routecard, notes, cpk, cumulative, hist] = await Promise.all([
    getJson<Any[]>('/api/meetings', []),
    getJson<Any[]>('/api/uploads', []),
    getJson<Any[]>('/api/assembly', []),
    getJson<Any[]>('/api/monthlyplan', []),
    getJson<Any[]>('/api/routecard', []),
    getJson<Any[]>('/api/notes', []),
    getJson<Any[]>('/api/cpk', []),
    getJson<Any[]>('/api/cumulative', []),
    getJson<{ users: Any[]; events: Any[] }>('/api/admin/history', { users: [], events: [] }),
  ])
  return { meetings, uploads, assembly, monthlyplan, routecard, notes, cpk, cumulative, users: hist.users, events: hist.events }
}

/** The date a record belongs to, as 'YYYY-MM-DD' ('' when it carries none). */
export const recordDate = (r: Any): string => {
  const d = r?.meetingDate || r?.uploadDate || r?.date || ''
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10)
  const t = r?.createdAt ?? r?.savedAt ?? r?.at
  return typeof t === 'number' && t > 0 ? new Date(t).toISOString().slice(0, 10) : ''
}

const inRange = (iso: string, from: string, to: string) => !!iso && iso >= from && iso <= to

// ---- per-source CSV builders -------------------------------------------

const MACHINE_COLS = [
  { key: 'section', label: 'Section' },
  { key: 'group', label: 'Group' },
  { key: 'shift', label: 'Shift' },
  { key: 'mc', label: 'Machine' },
  { key: 'itemCode', label: 'Item Code' },
  { key: 'operator', label: 'Operator' },
  { key: 'cycleTime', label: 'Cycle Time' },
  { key: 'planQty', label: 'Plan Qty' },
  { key: 'runningPlan', label: 'Running Plan' },
  { key: 'achQty', label: 'Ach Qty' },
  { key: 'backlog', label: 'Backlog' },
  { key: 'efficiency', label: 'Efficiency %' },
  { key: 'rework', label: 'Rework' },
  { key: 'rejection', label: 'Rejection' },
  { key: 'turningRejection', label: 'Turning Rejection' },
  { key: 'totalDowntime', label: 'Downtime' },
  { key: 'remark', label: 'Remark' },
  { key: 'setter', label: 'Setter' },
] as const

const ASSEMBLY_COLS = [
  { key: 'process', label: 'Process' },
  { key: 'line', label: 'Line' },
  { key: 'lineLeader', label: 'Line Leader' },
  { key: 'family', label: 'Family' },
  { key: 'itemCode', label: 'Item Code' },
  { key: 'itemName', label: 'Item Name' },
  { key: 'planQty', label: 'Plan Qty' },
  { key: 'operators', label: 'Operators' },
  { key: 'achQty', label: 'Ach Qty' },
  { key: 'backlogQty', label: 'Backlog Qty' },
  { key: 'rework', label: 'Rework' },
  { key: 'rejection', label: 'Rejection' },
  { key: 'remark', label: 'Remark' },
] as const

/** A filename-safe version of an arbitrary label. */
const safe = (s: string) => String(s || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'untitled'

export interface BackupOptions {
  from: string // 'YYYY-MM-DD'
  to: string
  sources: SourceId[]
  data: BackupData
}

/** Turn the selection into the exact list of files the zip will hold. */
export function buildBackupFiles({ from, to, sources, data }: BackupOptions): ZipFile[] {
  const files: ZipFile[] = []
  const has = (s: SourceId) => sources.includes(s)
  const counts: Record<string, number> = {}
  const bump = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n)

  // ---- date-wise: one folder per date ----
  if (has('meetings')) {
    for (const rec of data.meetings) {
      const d = recordDate(rec)
      if (!inRange(d, from, to)) continue
      files.push({ name: `${d}/production-report.csv`, text: recordsToCsv([...MACHINE_COLS], rec.rows ?? []) })
      bump('meetings')
    }
  }
  if (has('uploads')) {
    // Several shifts can share a date, so the shift goes in the filename.
    const seen = new Map<string, number>()
    for (const rec of data.uploads) {
      const d = recordDate(rec)
      if (!inRange(d, from, to)) continue
      const shift = safe(rec.shift || 'shift')
      const key = `${d}/${shift}`
      const n = (seen.get(key) ?? 0) + 1
      seen.set(key, n)
      files.push({
        name: `${d}/excel-upload-${shift}${n > 1 ? `-${n}` : ''}.csv`,
        text: recordsToCsv([...MACHINE_COLS], rec.rows ?? []),
      })
      bump('uploads')
    }
  }
  if (has('assembly')) {
    for (const rec of data.assembly) {
      const d = recordDate(rec)
      if (!inRange(d, from, to)) continue
      files.push({ name: `${d}/assembly.csv`, text: recordsToCsv([...ASSEMBLY_COLS], rec.rows ?? []) })
      bump('assembly')
    }
  }

  // ---- monthly plan: one CSV per month that overlaps the range ----
  if (has('monthlyplan')) {
    for (const p of data.monthlyplan) {
      const month = String(p.month || '')
      if (!month) continue
      const first = `${month}-01`
      const last = `${month}-31`
      if (last < from || first > to) continue
      const dayCols: string[] = (p.dayDates ?? []).map((d: string) => d.slice(8, 10))
      const headers = ['Sr.No.', 'SAP Code', 'Item Code', 'Name of Item', 'Plan Qty', 'Plan Confirmation Qty', 'Pending Qty', 'Planing status', 'Date From', 'Date To', ...dayCols]
      const rows = (p.rows ?? []).map((r: Any) => [r.srNo, r.sapCode, r.itemCode, r.itemName, r.planQty, r.confirmQty, r.pendingQty, r.status, r.dateFrom, r.dateTo, ...(r.days ?? [])])
      files.push({ name: `monthly-plan/${safe(p.title || month)}.csv`, text: toCsv(headers, rows) })
      bump('monthlyplan')
    }
  }

  // ---- route cards: one CSV per sheet of every month that overlaps the range ----
  // The columns come from the workbook, so the CSV carries the sheet's own header row —
  // there is no fixed column list to write here.
  if (has('routecard')) {
    for (const cRec of data.routecard) {
      const month = String(cRec.month || '')
      if (!month) continue
      if (`${month}-31` < from || `${month}-01` > to) continue
      for (const sh of cRec.sheets ?? []) {
        files.push({
          name: `route-card/${safe(cRec.title || month)}/${safe(sh.name || 'sheet')}.csv`,
          text: toCsv((sh.columns ?? []) as string[], (sh.cells ?? []) as Any[][]),
        })
      }
      bump('routecard')
    }
  }

  // ---- flat sources, filtered to the range ----
  if (has('notes')) {
    const rows = data.notes.filter((n) => inRange(recordDate(n), from, to))
    files.push({
      name: 'notes.csv',
      text: toCsv(
        ['Date', 'Priority', 'Issue', 'Machine', 'Detail', 'Status', 'By'],
        rows.map((n) => [recordDate(n), n.priority, n.issue, n.machine, n.detail ?? n.note, n.status, n.by]),
      ),
    })
    bump('notes', rows.length)
  }
  if (has('cpk')) {
    const rows = data.cpk.filter((c) => inRange(recordDate(c), from, to))
    files.push({
      name: 'cpk.csv',
      text: toCsv(
        ['Date', 'Machine', 'Item Code', 'Cp', 'Cpk', 'By'],
        rows.map((c) => [recordDate(c), c.machine, c.itemCode, c.cp, c.cpk, c.by]),
      ),
    })
    bump('cpk', rows.length)
  }
  if (has('cumulative')) {
    const rows = data.cumulative.filter((c) => inRange(recordDate(c), from, to))
    files.push({
      name: 'cumulative.csv',
      text: toCsv(
        ['Date', 'Group', 'Plan', 'Achievement', 'Backlog'],
        rows.flatMap((c) =>
          Object.entries((c.groups ?? {}) as Record<string, Any>).map(([g, v]) => [recordDate(c), g, v?.plan, v?.ach, v?.backlog]),
        ),
      ),
    })
    bump('cumulative', rows.length)
  }
  if (has('activity')) {
    files.push({
      name: 'user-activity/users.csv',
      text: toCsv(
        ['Username', 'Full Name', 'Role', 'Email', 'Phone', 'Employee ID', 'Created', 'Login allowed'],
        data.users.map((u) => [
          u.username,
          u.fullName,
          u.role,
          u.email,
          u.phone,
          u.employeeId,
          u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : '',
          u.disabled ? 'No' : 'Yes',
        ]),
      ),
    })
    const ev = data.events.filter((e) => inRange(recordDate(e), from, to))
    files.push({
      name: 'user-activity/activity-log.csv',
      text: toCsv(
        ['Date', 'Time', 'Type', 'Username', 'Role', 'Detail'],
        ev.map((e) => {
          const d = new Date(e.at)
          return [d.toISOString().slice(0, 10), d.toTimeString().slice(0, 8), e.type, e.username, e.role, e.detail]
        }),
      ),
    })
    bump('activity', ev.length)
  }

  // ---- a manifest, so a restored folder explains itself ----
  files.unshift({
    name: 'README.csv',
    text: toCsv(
      ['Field', 'Value'],
      [
        ['Backup taken', new Date().toLocaleString('en-IN')],
        ['Date range', `${from} to ${to}`],
        ['Sources', sources.join(', ')],
        ['Files', String(files.length)],
        ...Object.entries(counts).map(([k, v]) => [`${k} records/files`, String(v)]),
      ],
    ),
  })
  return files
}

/** Count what a selection would produce, without building the archive. */
export function backupSummary(opts: BackupOptions): { files: number; bytes: number } {
  const files = buildBackupFiles(opts)
  const bytes = files.reduce((s, f) => s + f.text.length, 0)
  return { files: files.length, bytes }
}

/** Trigger the browser download. */
export function downloadZip(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
