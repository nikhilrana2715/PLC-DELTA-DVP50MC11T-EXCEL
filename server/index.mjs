import express from 'express'
import { fileURLToPath, pathToFileURL } from 'url'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { execFile, execFileSync } from 'child_process'
import zlib from 'zlib'
import os from 'os'
import { setupAuth } from './auth.mjs'
import { makeAudit, makeWhoIs } from './audit.mjs'
import { ACCESS_UNITS, accessOf, can, normalizeAccess } from './access.mjs'
import { setupBackupClean } from './backupClean.mjs'
import { openDatabase } from './database.mjs'
import { migrateJsonData } from './migrate-json-to-sqlite.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DIST = path.join(ROOT, 'dist')

// Load secrets from .env (SMTP app password etc.) — kept out of git.
try {
  process.loadEnvFile(path.join(ROOT, '.env'))
} catch {
  /* no .env yet — OTPs fall back to on-screen demo codes */
}
// Where the records live. Overridable so a test or a container can run against its own
// copy instead of the real one — the default is unchanged.
const DATA_DIR = process.env.MM_DATA_DIR
  ? path.resolve(process.env.MM_DATA_DIR)
  : path.join(__dirname, 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })
const database = openDatabase(DATA_DIR)
const migrationReport = await migrateJsonData(DATA_DIR, database)
if (migrationReport.status === 'migrated') {
  console.log(`  SQLite migration: ${migrationReport.importedRecords} records, ${migrationReport.importedAttachments} attachments; backup at ${migrationReport.backupPath}`)
}

const app = express()
// Notes can carry up to 12 compressed photos (~250 KB each, +33% as base64).
/**
 * Compress every JSON response.
 *
 * A day's dashboard pulls about 13 MB of JSON — the PD Report alone is eight of them — and
 * on the plant's Wi-Fi that is the whole of what "the app is slow" means. This is the same
 * text repeated thousands of times over (column names, machine codes), so gzip takes it down
 * by roughly twenty to one for the cost of a few milliseconds of CPU.
 *
 * Written against zlib rather than pulling in a dependency: res.json is the only thing that
 * needs wrapping, and the rest of the app keeps calling it unchanged.
 */
const GZIP_MIN = 1024 // below this the header costs more than the saving
app.use((req, res, next) => {
  const accepts = String(req.headers['accept-encoding'] || '')
  if (!/\bgzip\b/.test(accepts)) return next()
  const json = res.json.bind(res)
  res.json = (body) => {
    let text
    try {
      text = JSON.stringify(body)
    } catch {
      return json(body) // circular or otherwise unserialisable — let express deal with it
    }
    if (!text || Buffer.byteLength(text) < GZIP_MIN) return json(body)
    zlib.gzip(text, { level: 6 }, (err, buf) => {
      if (err) return json(body)
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Content-Encoding', 'gzip')
      res.setHeader('Vary', 'Accept-Encoding')
      res.setHeader('Content-Length', String(buf.length))
      res.end(buf)
    })
    return res
  }
  next()
})

app.use(express.json({ limit: '32mb' }))

// Who did what (for the admin's User History) — created before the routes use it.
const audit = makeAudit(DATA_DIR, database)
const whoIs = makeWhoIs(database)

// ---- SSE ----
const clients = new Set()
function send(res, type, data) {
  try {
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`)
  } catch {
    clients.delete(res)
  }
}
/** `unit` undefined = everyone (activity pings); otherwise only that unit's devices. */
function broadcast(type, data, unit) {
  for (const res of clients) {
    if (unit && res.__unit && res.__unit !== unit) continue
    send(res, type, data)
  }
}
function pushActivity(kind, title, extra = {}) {
  broadcast('activity', {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind,
    title,
    at: Date.now(),
    ...extra,
  })
}

// ---- Generic SQLite resource (synced via SSE) ----
function bySaved(list) {
  return [...list].sort((a, b) => (b.savedAt || b.createdAt || 0) - (a.savedAt || a.createdAt || 0))
}

// The date a record "belongs to" (for retention): its report/upload day if present,
// otherwise when it was saved. 0 = unknown → never auto-deleted.
function anchorMs(r) {
  const day = r?.uploadDate || r?.meetingDate || r?.date
  if (typeof day === 'string' && day) {
    const t = Date.parse(day)
    if (!Number.isNaN(t)) return t
  }
  // A monthly plan covers a whole month — anchor it to the month's LAST day so the
  // retention window starts once the month is over, not when the sheet was uploaded.
  if (typeof r?.month === 'string' && /^\d{4}-\d{2}$/.test(r.month)) {
    const [y, m] = r.month.split('-').map(Number)
    return Date.UTC(y, m, 0) // day 0 of the next month = last day of this one
  }
  return r?.savedAt || r?.createdAt || 0
}

// ============================================================================
//  Units
//
//  The plant runs as four separate workspaces — three production units and Assembly.
//  Each keeps its own records: a meeting saved in U2 must never show up in U1. Rather
//  than four copies of every file, every record carries a `unit` and reads are filtered
//  by it, which keeps one place (makeResource) responsible for the split.
//
//  Records written before units existed have no `unit` field. They are treated as U1 —
//  the default workspace — so nothing that already exists disappears.
// ============================================================================
const UNITS = ['U1', 'U2', 'U3', 'ASS']
const DEFAULT_UNIT = 'U1'
/** The unit a request is talking about: ?unit=, the X-Unit header, or the body. */
const unitOf = (req) => {
  const raw = req.query?.unit || req.get?.('X-Unit') || req.body?.unit
  const u = String(raw || '').trim().toUpperCase()
  return UNITS.includes(u) ? u : DEFAULT_UNIT
}
const unitOfRecord = (r) => {
  const u = String(r?.unit || '').trim().toUpperCase()
  return UNITS.includes(u) ? u : DEFAULT_UNIT
}

// What each resource is called in the User History, and which POSTs are worth logging.
const AUDIT_KIND = { uploads: 'import', meetings: 'meeting', notes: 'note', cpk: 'cpk', cumulative: 'cumulative', monthlyplan: 'import', routecard: 'import', planvsach: 'import', maintenancereport: 'import', toolingreport: 'import', purchasereport: 'import' }

/**
 * @param pinnedUnit  When set, this resource ignores the caller's unit and always lives in
 *                    that one. Assembly is the plant's own workspace (the ASS button), so
 *                    an assembly report belongs to ASS no matter which unit uploaded it —
 *                    otherwise the same reports would scatter across four workspaces.
 */
function makeResource(name, activityFor, pinnedUnit, shared = false) {
  const read = () => database.listRecords(name)
  /** Only this unit's records. */
  const readUnit = (unit) => database.listUnitRecords(name, unit)
  // Each connected device is subscribed to one unit, so a change is pushed as that unit's
  // list — a device viewing U1 never receives U2's records at all.
  const unitFor = (req) => pinnedUnit || unitOf(req)
  const push = () => {
    // A pinned resource is the same list for everyone, so it is pushed to every device.
    if (pinnedUnit) return broadcast(name, bySaved(readUnit(pinnedUnit)))
    for (const u of UNITS) broadcast(name, bySaved(readUnit(u)), u)
  }

  /**
   * The access gate for a write.
   *
   * Judged here rather than in the UI because the UI is only a courtesy: hiding a button
   * stops a mistake, this stops a request. A caller the server cannot identify is left
   * alone — that is how the app behaved before access control, and no signed-in client
   * reaches these routes without its token.
   */
  const allowed = (req, res, need) => {
    const who = whoIs(req)
    if (!who) return true
    if (can(who, unitFor(req), need)) return true
    res.status(403).json({
      error: `You do not have permission to ${need === 'delete' ? 'delete' : 'change'} records in ${unitFor(req)}. Ask an admin for access.`,
    })
    return false
  }

  app.get(`/api/${name}`, (req, res) => {
    // "No access" means the workspace holds nothing as far as this account is concerned.
    // An empty list rather than a 403: the screen then simply has nothing in it, which is
    // what "you cannot see this unit" should look like. `shared` resources (app-wide
    // settings) carry no unit and are never withheld.
    const who = whoIs(req)
    if (!shared && who && !can(who, unitFor(req), 'view')) return res.json([])
    res.json(bySaved(readUnit(unitFor(req))))
  })
  app.post(`/api/${name}`, (req, res) => {
    if (!allowed(req, res, 'update')) return
    const item = req.body || {}
    if (!item.id) item.id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    if (!item.savedAt && !item.createdAt) item.createdAt = Date.now()
    item.unit = unitFor(req) // the workspace it belongs to, decided by the server
    // An id is only unique WITHIN a unit: an upload is keyed `up-<date>-<shift>` and an
    // auto-saved meeting `auto-<date>`, so U1 and U2 produce the same id for the same day.
    // Matching on id alone would let one workspace's save quietly delete another's record.
    const a = activityFor?.(item)
    const who = whoIs(req)
    try {
      database.transaction(() => {
        database.saveRecord(name, item, item.unit)
        if (who && AUDIT_KIND[name]) {
          audit.logStrict({ type: AUDIT_KIND[name], username: who.username, role: who.role, detail: a?.title || name })
        }
      })()
    } catch {
      return res.status(500).json({ error: 'Could not save record. Please try again.' })
    }
    push()
    if (a) pushActivity(a.kind, a.title, { priority: a.priority, by: item.by })
    res.json(item)
  })
  app.delete(`/api/${name}/:id`, (req, res) => {
    if (!allowed(req, res, 'delete')) return
    // Scoped to the caller's unit for the same reason as the POST above — ids repeat across
    // workspaces, so an unscoped delete would take another unit's record with it.
    const unit = unitFor(req)
    const gone = database.getRecord(name, req.params.id, unit)
    const who = whoIs(req)
    try {
      database.transaction(() => {
        database.deleteRecord(name, req.params.id, unit)
        if (who && AUDIT_KIND[name]) {
          const label = gone?.fileName || gone?.meetingDate || gone?.issue || gone?.machine || gone?.date || req.params.id
          audit.logStrict({ type: 'delete', username: who.username, role: who.role, detail: `Deleted ${name}: ${label}` })
        }
      })()
    } catch {
      return res.status(500).json({ error: 'Could not delete record. Please try again.' })
    }
    push()
    res.json({ ok: true })
  })

  // Drop records older than the cutoff (retention). Returns how many were removed.
  const purge = (cutoffMs) => {
    const removed = database.purgeRecords(name, cutoffMs)
    if (removed) {
      push() // tell every device the list shrank
      return removed
    }
    return 0
  }

  return { read, readUnit, purge, pinnedUnit }
}

const meetings = makeResource('meetings', (m) => ({
  kind: 'meeting',
  title: `Meeting saved — ${m.meetingDate || ''} ${m.shift || ''}`.trim(),
}))
const notes = makeResource('notes', (n) => ({
  kind: 'note',
  title: `New note (${n.priority || 'note'}) — ${n.issue || ''}`.slice(0, 120),
  priority: n.priority,
}))
const cpk = makeResource('cpk', (c) => ({
  kind: 'cpk',
  title: `Cp-Cpk added — ${c.machine || ''} (Cpk ${c.cpk ?? '-'})`,
}))
const cumulative = makeResource('cumulative', (c) => ({
  kind: 'cumulative',
  title: `Cumulative updated — ${c.date || ''}`,
}))
const uploads = makeResource('uploads', (u) => ({
  kind: 'upload',
  title: `Excel uploaded — ${u.fileName || ''}${u.shift ? ' · ' + u.shift : ''}`.trim(),
}))
// The shared "current dashboard" (one record, id = 'active'). No activity — convert already notifies.
const active = makeResource('active')
// App-wide settings shared across devices (one record, id = 'app'). No activity/audit.
const settings = makeResource('settings', undefined, undefined, true)
// Assembly production reports (one record per date, id = 'asm-<date>').
const assembly = makeResource('assembly', (a) => ({ kind: 'upload', title: `Assembly report — ${a.date || ''}`.trim() }), 'ASS')
// Monthly plan confirmation sheets (one record per month, id = 'mplan-<YYYY-MM>').
// The PD Report: the raw production log behind the KPI page. Unit-scoped like the rest.
const pdreport = makeResource('pdreport', (p) => ({ kind: 'upload', title: `PD Report — ${p.fileName || ''}`.trim() }))
const monthlyplan = makeResource('monthlyplan', (p) => ({ kind: 'upload', title: `Monthly plan — ${p.title || p.month || ''}`.trim() }))
// Route cards (one record per month, id = 'rcard-<YYYY-MM>'). No fixed layout — the
// client stores whatever sheets the workbook had.
// The plant's own Day / Month running tally (one record per date, id = 'pva-<date>').
const planvsach = makeResource('planvsach', (r) => ({ kind: 'upload', title: `Plan vs Achievement — ${r.date || ''}`.trim() }))
const routecard = makeResource('routecard', (c) => ({ kind: 'upload', title: `Route card — ${c.title || c.month || ''}`.trim() }))
const maintenancereport = makeResource('maintenancereport', (m) => ({ kind: 'upload', title: `Maintenance report — ${m.title || m.month || ''}`.trim() }))
const toolingreport = makeResource('toolingreport', (m) => ({ kind: 'upload', title: `Tooling report — ${m.title || m.month || ''}`.trim() }))
const purchasereport = makeResource('purchasereport', (m) => ({ kind: 'upload', title: `Purchase report — ${m.title || m.month || ''}`.trim() }))
// Unit 2 / Unit 3 upload a different workbook ("Production Summary Sheet"); it gets its own
// resource so a unit's KPI import can never be read with the wrong parser.
const prodsummary = makeResource('prodsummary', (p) => ({ kind: 'upload', title: `Production Summary — ${p.fileName || ''}`.trim() }))
const RESOURCES = { meetings, notes, cpk, cumulative, uploads, active, settings, assembly, monthlyplan, routecard, planvsach, pdreport, prodsummary, maintenancereport, toolingreport, purchasereport }

function qaStateIsValid(value) {
  return value && typeof value === 'object' &&
    value.raw && typeof value.raw === 'object' &&
    Array.isArray(value.raw.skf) && Array.isArray(value.raw.obs) &&
    Array.isArray(value.history)
}

function mergeQaStates(current, incoming) {
  const mergeRows = (existing, imported) => {
    const seen = new Set(existing.map((row) => JSON.stringify(row)))
    const merged = [...existing]
    for (const row of imported) {
      const key = JSON.stringify(row)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(row)
    }
    return merged
  }
  const currentTime = Date.parse(current.raw.generatedAt) || 0
  const incomingTime = Date.parse(incoming.raw.generatedAt) || 0
  const latest = incomingTime >= currentTime ? incoming.raw : current.raw
  const other = latest === incoming.raw ? current.raw : incoming.raw
  const history = new Map([...current.history, ...incoming.history].map((entry) => [entry.id, entry]))
  return {
    raw: {
      ...latest,
      generatedAt: new Date(Math.max(currentTime, incomingTime)).toISOString(),
      skf: mergeRows(current.raw.skf, incoming.raw.skf),
      obs: mergeRows(current.raw.obs, incoming.raw.obs),
      sheets: latest.sheets?.length ? latest.sheets : other.sheets,
    },
    history: [...history.values()].sort((a, b) => b.at - a.at).slice(0, 100),
  }
}

function allowQaData(req, res) {
  const who = whoIs(req)
  if (!who) {
    res.status(401).json({ error: 'Please sign in again.' })
    return false
  }
  if (who.role !== 'qa' && who.role !== 'admin') {
    res.status(403).json({ error: 'QA data is available to QA and admin accounts only.' })
    return false
  }
  return true
}

app.get('/api/qa', (req, res) => {
  if (!allowQaData(req, res)) return
  res.json(database.getQaData())
})

app.post('/api/qa', (req, res) => {
  if (!allowQaData(req, res)) return
  if (!qaStateIsValid(req.body)) return res.status(400).json({ error: 'Invalid QA data.' })
  try {
    database.saveQaData(req.body)
  } catch {
    return res.status(500).json({ error: 'Could not save QA data. Please try again.' })
  }
  res.json(req.body)
})

app.post('/api/qa/migrate', (req, res) => {
  if (!allowQaData(req, res)) return
  if (!qaStateIsValid(req.body)) return res.status(400).json({ error: 'Invalid QA data.' })
  try {
    const merged = database.transaction(() => {
      const current = database.getQaData()
      const next = current ? mergeQaStates(current, req.body) : req.body
      database.saveQaData(next)
      return next
    })()
    res.json(merged)
  } catch {
    res.status(500).json({ error: 'Could not migrate QA data to SQLite. Please try again.' })
  }
})

app.delete('/api/qa', (req, res) => {
  if (!allowQaData(req, res)) return
  try {
    database.deleteQaData()
  } catch {
    return res.status(500).json({ error: 'Could not clear QA data. Please try again.' })
  }
  res.json({ ok: true })
})

// ---- Housekeeping ---------------------------------------------------------
// CHANGED: the automatic 30-day record deletion is GONE. Nothing an admin can see in
// Backup Clean is ever removed on a timer — deletion happens only when an admin runs
// it there. What still runs daily is limited to things no admin ever chose to keep:
//   • attachments on disk that no note references any more (abandoned uploads)
//   • soft-delete archives whose 30-day restore window has expired
const RETENTION_DAYS = Number(process.env.RETENTION_DAYS) || 30
function housekeeping() {
  const files = purgeOrphanFiles()
  if (files) console.log(`  housekeeping: removed ${files} orphaned attachment(s)`)
  const archives = backupClean?.purgeExpiredArchives?.() ?? 0
  if (archives) console.log(`  housekeeping: removed ${archives} expired archive(s) past the restore window`)
  return files + archives
}

// ============================================================================
//  Note attachments
//
//  Attachments used to be base64 data URLs inside notes.json. That caps out fast:
//  every client re-fetches the whole notes list on each sync, so one big deck slowed
//  down every device. Files now live on disk and are streamed on demand, which is what
//  makes a 100 MB limit safe.
//
//  Path safety: the id is server-generated hex and is the ONLY thing used to build a
//  path. The client's filename is stored as metadata and never touches the filesystem,
//  so "..", absolute paths and traversal are impossible by construction.
// ============================================================================
const FILES_DIR = path.join(DATA_DIR, 'note-files')
fs.mkdirSync(FILES_DIR, { recursive: true })

const MAX_FILE_BYTES = 100 * 1024 * 1024 // 100 MB per file

const EXT_MIME = {
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pdf': 'application/pdf',
}
const extOf = (name) => {
  const m = String(name || '').toLowerCase().match(/\.[a-z0-9]+$/)
  return m ? m[0] : ''
}
/** The MIME we will serve. Derived from the extension, never from what the client claimed. */
const serveMime = (name) => EXT_MIME[extOf(name)] || 'application/octet-stream'
const isAllowed = (name) => Object.hasOwn(EXT_MIME, extOf(name))

const fileBin = (id) => path.join(FILES_DIR, `${id}.bin`)
/** Ids are generated here; reject anything that is not exactly what we generate. */
const validId = (id) => /^[a-f0-9]{24}$/.test(String(id || ''))

const readMeta = (id) => {
  if (!validId(id)) return null
  return database.getAttachment(id)
}

/**
 * Upload one file. The body is the raw bytes (no multipart parsing needed) and is streamed
 * straight to disk, so a 100 MB upload never sits in memory.
 */
app.post('/api/notes/files', (req, res) => {
  const who = whoIs(req)
  if (!who) return res.status(401).json({ error: 'Please sign in again.' })

  const name = (() => {
    try {
      return decodeURIComponent(req.headers['x-file-name'] || '').slice(0, 200)
    } catch {
      return ''
    }
  })()
  if (!name) return res.status(400).json({ error: 'Missing file name.' })
  if (!isAllowed(name)) return res.status(415).json({ error: 'This file type is not supported.' })

  const declared = Number(req.headers['content-length'] || 0)
  if (declared > MAX_FILE_BYTES) return res.status(413).json({ error: 'File size cannot exceed 100 MB.' })

  const id = crypto.randomBytes(12).toString('hex')
  const out = fs.createWriteStream(fileBin(id))
  let size = 0
  let failed = false

  const abort = (status, error) => {
    if (failed) return
    failed = true
    out.destroy()
    fs.rm(fileBin(id), { force: true }, () => {})
    req.destroy()
    if (!res.headersSent) res.status(status).json({ error })
  }

  req.on('data', (chunk) => {
    size += chunk.length
    // Enforced on the real byte count, not the header a client can lie about.
    if (size > MAX_FILE_BYTES) abort(413, 'File size cannot exceed 100 MB.')
  })
  req.on('error', () => abort(400, 'File upload failed. Please try again.'))
  out.on('error', () => abort(500, 'File upload failed. Please try again.'))

  req.pipe(out)
  out.on('close', () => {
    if (failed) return
    if (!size) return abort(400, 'The file was empty.')
    const meta = { id, name, size, type: serveMime(name), by: who.username, at: Date.now() }
    try {
      database.insertAttachment(meta)
    } catch {
      fs.rmSync(fileBin(id), { force: true })
      return res.status(500).json({ error: 'File upload failed. Please try again.' })
    }
    res.json({ ...meta, url: `/api/notes/files/${id}` })
  })
})

/** Stream a stored attachment back. `mode=download` forces a save, anything else is inline. */
app.get('/api/notes/files/:id', (req, res) => {
  const who = whoIs(req)
  if (!who) return res.status(401).json({ error: 'Please sign in again.' })

  const meta = readMeta(req.params.id)
  if (!meta || !fs.existsSync(fileBin(meta.id))) {
    return res.status(404).json({ error: 'File not found' })
  }
  const dl = req.query.mode === 'download' ? 'attachment' : 'inline'
  // RFC 5987 so non-ASCII names (Hindi/Gujarati) survive the round trip.
  const ascii = meta.name.replace(/["\\]/g, '_').replace(/[^\x20-\x7e]/g, '_')
  res.setHeader('Content-Type', serveMime(meta.name))
  res.setHeader('Content-Length', meta.size)
  res.setHeader('Content-Disposition', `${dl}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(meta.name)}`)
  res.setHeader('Cache-Control', 'private, max-age=3600')
  fs.createReadStream(fileBin(meta.id)).pipe(res)
})

// ---- Office → PDF preview (LibreOffice, headless) --------------------------------
//
// Word and PowerPoint have no in-browser renderer, and the Office Online Viewer needs a
// publicly reachable URL — this app lives on the factory LAN behind a login, so it would only
// ever show a blank page. LibreOffice converts locally, offline, and produces a faithful PDF
// that the browser's own viewer can show. The PDF is cached next to the original, so the cost
// is paid once per file.
const SOFFICE_CANDIDATES = [
  process.env.LIBREOFFICE_PATH,
  'C:/Program Files/LibreOffice/program/soffice.exe',
  'C:/Program Files (x86)/LibreOffice/program/soffice.exe',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  '/opt/libreoffice/program/soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
].filter(Boolean)

let sofficePath = null
let sofficeChecked = false
function findSoffice() {
  if (sofficeChecked) return sofficePath
  sofficeChecked = true
  for (const p of SOFFICE_CANDIDATES) {
    try {
      if (fs.existsSync(p)) {
        sofficePath = p
        break
      }
    } catch {
      /* keep looking */
    }
  }
  if (!sofficePath) {
    // Fall back to whatever is on PATH.
    try {
      const which = process.platform === 'win32' ? 'where' : 'which'
      const out = execFileSync(which, ['soffice'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim()
      if (out && fs.existsSync(out)) sofficePath = out
    } catch {
      /* not on PATH either */
    }
  }
  console.log(sofficePath ? `  Office preview: LibreOffice at ${sofficePath}` : '  Office preview: LibreOffice not found — Word/PowerPoint will offer Download only')
  return sofficePath
}

const CONVERTIBLE = new Set(['.doc', '.docx', '.ppt', '.pptx', '.odt', '.odp'])
const previewPdf = (id) => path.join(FILES_DIR, `${id}.preview.pdf`)
/** One conversion per file at a time — ten clicks must not spawn ten LibreOffice processes. */
const converting = new Map()
/** …and one at a time overall, because they share the profile directory below. */
let convertQueue = Promise.resolve()
/**
 * A persistent LibreOffice profile.
 *
 * Building a fresh profile is most of the cost of a conversion — measured at 8-16 s with a
 * throwaway one, about a second when it is reused. It is kept apart from the desktop
 * LibreOffice profile so an open Writer window cannot lock it out.
 */
const SOFFICE_PROFILE_DIR = path.join(DATA_DIR, 'lo-profile')
fs.mkdirSync(SOFFICE_PROFILE_DIR, { recursive: true })
// pathToFileURL percent-encodes spaces and normalises the drive letter. Hand-building this
// string breaks on any path containing a space — such as this project's own "VS CODE" folder —
// and LibreOffice reports that only by silently producing no output.
const SOFFICE_PROFILE = `-env:UserInstallation=${pathToFileURL(SOFFICE_PROFILE_DIR).href}`

function convertToPdf(meta) {
  const out = previewPdf(meta.id)
  if (fs.existsSync(out)) return Promise.resolve(out)
  if (converting.has(meta.id)) return converting.get(meta.id)

  const job = convertQueue.then(
    () =>
      new Promise((resolve, reject) => {
        const soffice = findSoffice()
        if (!soffice) return reject(Object.assign(new Error('LibreOffice is not installed on the server.'), { code: 'NO_SOFFICE' }))

        // LibreOffice converts by extension, so give it a copy with the right one.
        const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-conv-'))
        const src = path.join(work, `in${extOf(meta.name)}`)
        fs.copyFileSync(fileBin(meta.id), src)
        const child = execFile(
          soffice,
          [SOFFICE_PROFILE, '--headless', '--norestore', '--invisible', '--nologo', '--nolockcheck', '--convert-to', 'pdf', '--outdir', work, src],
          { timeout: 180_000, windowsHide: true },
          (err) => {
            const made = path.join(work, 'in.pdf')
            try {
              if (fs.existsSync(made)) {
                fs.copyFileSync(made, out)
                resolve(out)
              } else {
                reject(new Error(err?.killed ? 'Preview timed out.' : 'Could not build a preview for this file.'))
              }
            } finally {
              fs.rm(work, { recursive: true, force: true }, () => {})
            }
          },
        )
        child.on('error', () => reject(new Error('Could not start LibreOffice on the server.')))
      }),
  )
  // The queue must survive a failed conversion, so swallow the rejection on that branch only.
  convertQueue = job.then(
    () => {},
    () => {},
  )
  const tracked = job.then(
    (v) => {
      converting.delete(meta.id)
      return v
    },
    (e) => {
      converting.delete(meta.id)
      throw e
    },
  )
  return job
}

/** A PDF rendering of a Word/PowerPoint attachment, built on first request and then cached. */
app.get('/api/notes/files/:id/preview', async (req, res) => {
  const who = whoIs(req)
  if (!who) return res.status(401).json({ error: 'Please sign in again.' })

  const meta = readMeta(req.params.id)
  if (!meta || !fs.existsSync(fileBin(meta.id))) return res.status(404).json({ error: 'File not found' })
  if (!CONVERTIBLE.has(extOf(meta.name))) {
    return res.status(415).json({ error: 'Preview is not available for this file type. You can download the file instead.' })
  }
  try {
    const pdf = await convertToPdf(meta)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Length', fs.statSync(pdf).size)
    res.setHeader('Content-Disposition', `inline; filename="${meta.name.replace(/[^\x20-\x7e]/g, '_')}.pdf"`)
    res.setHeader('Cache-Control', 'private, max-age=86400')
    fs.createReadStream(pdf).pipe(res)
  } catch (e) {
    const missing = e?.code === 'NO_SOFFICE'
    res.status(missing ? 503 : 500).json({
      error: missing
        ? 'Preview needs LibreOffice on the server. Install it, restart the server, and this will work. You can download the file meanwhile.'
        : e?.message || 'Could not build a preview for this file.',
      code: e?.code,
    })
  }
})

// CHANGED: mount Backup Clean. It needs FILES_DIR, so it is set up here rather than
// at the top of the file.
const backupClean = setupBackupClean(app, { DATA_DIR, FILES_DIR, whoIs, audit, pushActivity, database })

/** Tells the client which formats it can offer an in-app preview for. */
app.get('/api/notes/files-capabilities', (_req, res) =>
  res.json({ officePreview: !!findSoffice(), convertible: [...CONVERTIBLE] }),
)

/** Remove attachments no note references any more (deleted notes, abandoned uploads). */
function purgeOrphanFiles() {
  let removed = 0
  try {
    const referenced = new Set()
    for (const n of notes.read()) for (const f of n.files || []) if (f.id) referenced.add(f.id)
    const grace = Date.now() - 6 * 60 * 60 * 1000 // keep very recent uploads: a note may still be open
    for (const entry of fs.readdirSync(FILES_DIR)) {
      const id = entry.replace(/\.(bin|json|preview\.pdf)$/, '')
      if (!validId(id) || referenced.has(id)) continue
      const meta = readMeta(id)
      if (meta && meta.at > grace) continue
      fs.rmSync(path.join(FILES_DIR, entry), { force: true })
      database.deleteAttachment(id)
      if (entry.endsWith('.bin')) removed++
    }
  } catch {
    /* best effort */
  }
  return removed
}

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    meetings: meetings.read().length,
    notes: notes.read().length,
    cpk: cpk.read().length,
    cumulative: cumulative.read().length,
    uploads: uploads.read().length,
    active: active.read().length,
  }),
)

// An activity that a client triggers directly (e.g. an Excel upload).
app.post('/api/activity', (req, res) => {
  const { kind = 'info', title = 'Update', by, priority } = req.body || {}
  pushActivity(kind, String(title).slice(0, 160), { by, priority })
  res.json({ ok: true })
})

// CHANGED: kept for the old "Run cleanup now" callers, but it no longer deletes
// records — it only sweeps orphaned files and expired archives.
app.post('/api/maintenance/purge', (_req, res) => {
  const removed = housekeeping()
  res.json({ ok: true, removed, retentionDays: RETENTION_DAYS })
})

// ---- SSE stream: send every resource's current state on connect ----
app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders?.()
  const unit = unitOf(req)
  res.__unit = unit
  for (const [name, r] of Object.entries(RESOURCES)) send(res, name, bySaved(r.readUnit(r.pinnedUnit || unit)))
  clients.add(res)
  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n')
    } catch {
      /* ignore */
    }
  }, 25000)
  req.on('close', () => {
    clearInterval(ping)
    clients.delete(res)
  })
})

// ---- Admin-only: User History + user management ----
/** Sign a user out everywhere (used when they're disabled or removed). */
const killSessions = (username) => database.deleteSessionsForUser(username)
const requireAdmin = (req, res) => {
  const who = whoIs(req)
  if (!who || who.role !== 'admin') {
    res.status(403).json({ error: 'Admins only.' })
    return null
  }
  return who
}

app.get('/api/admin/history', (req, res) => {
  const who = requireAdmin(req, res)
  if (!who) return
  const users = database.listUsers()
  res.json({
    ok: true,
    // A user record can be marked `hidden` (the primary/owner admin account) —
    // it never appears to ANY admin, not even a different one.
    users: users
      .filter((u) => !u.hidden)
      .map((u) => ({
        username: u.username,
        fullName: u.fullName || u.username,
        role: u.role || 'user',
        email: u.email || '',
        phone: u.phone || '',
        employeeId: u.employeeId || '',
        createdAt: u.createdAt || 0,
        disabled: !!u.disabled,
        access: accessOf(u),
        // True while the account has never been given an explicit map — it predates access
        // control and still holds everything. The panel says so rather than pretending an
        // admin chose it.
        accessSet: !!u.access || u.role === 'admin' || u.role === 'qa',
      })),
    events: audit.read().filter((e) => !users.some((u) => u.hidden && u.username === e.username)),
  })
})

// ---- Storage usage ------------------------------------------------------------
// Before an admin cleans anything they need to know how much there actually is, and
// where it sits. Sizes are read straight off disk (not estimated from record counts),
// because attachments dwarf the JSON and only the filesystem knows their real weight.
const dirSize = (dir, skip = () => false) => {
  let bytes = 0
  let files = 0
  const stack = [dir]
  while (stack.length) {
    const d = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      continue // removed under us, or never created - count it as empty
    }
    for (const e of entries) {
      const full = path.join(d, e.name)
      if (skip(full)) continue
      if (e.isDirectory()) stack.push(full)
      else {
        try {
          bytes += fs.statSync(full).size
          files++
        } catch {
          /* vanished mid-walk */
        }
      }
    }
  }
  return { bytes, files }
}

/**
 * node_modules is ~200 MB across tens of thousands of files. Walking it synchronously would
 * block the event loop for a minute and freeze every other request, so it is walked in small
 * slices between ticks and the answer is cached. Until the first pass finishes the endpoint
 * reports it as pending rather than lying with a zero.
 */
const NODE_MODULES = path.join(__dirname, '..', 'node_modules')
let depsCache = { bytes: 0, files: 0, at: 0, ready: false, running: false }
const measureDeps = () => {
  if (depsCache.running) return
  if (depsCache.ready && Date.now() - depsCache.at < 30 * 60_000) return // fresh enough
  depsCache.running = true
  const stack = [NODE_MODULES]
  let bytes = 0
  let files = 0
  const step = () => {
    const deadline = Date.now() + 12 // stay well inside one frame's worth of work
    while (stack.length && Date.now() < deadline) {
      const d = stack.pop()
      let entries
      try {
        entries = fs.readdirSync(d, { withFileTypes: true })
      } catch {
        continue
      }
      for (const e of entries) {
        const full = path.join(d, e.name)
        if (e.isDirectory()) stack.push(full)
        else {
          try {
            bytes += fs.statSync(full).size
            files++
          } catch {
            /* gone */
          }
        }
      }
    }
    if (stack.length) {
      setTimeout(step, 5).unref()
      return
    }
    depsCache = { bytes, files, at: Date.now(), ready: true, running: false }
  }
  setTimeout(step, 5).unref()
}
measureDeps() // start warming as soon as the server is up

const fileSize = (f) => {
  try {
    return fs.statSync(f).size
  } catch {
    return 0
  }
}
app.get('/api/admin/storage', (req, res) => {
  const who = requireAdmin(req, res)
  if (!who) return
  const records = database.resourceStats()
  const tableStats = (name) => database.handle.prepare(`
    SELECT count(*) AS count, COALESCE(sum(length(payload_json)), 0) AS bytes FROM ${name}
  `).get()
  const usersStats = tableStats('users')
  const sessionsStats = tableStats('sessions')
  const auditStats = tableStats('audit_events')
  const backupAuditStats = tableStats('backup_clean_audit')
  const attachments = dirSize(FILES_DIR)
  // The .preview.pdf files LibreOffice writes are a cache, not user data - worth separating
  // so nobody thinks deleting notes will reclaim that space twice. Attachment metadata is in SQLite.
  let previewBytes = 0
  let attachmentCount = 0
  const attachmentList = []
  try {
    for (const f of fs.readdirSync(FILES_DIR)) {
      if (f.endsWith('.preview.pdf')) previewBytes += fileSize(path.join(FILES_DIR, f))
      else if (f.endsWith('.bin')) {
        attachmentCount++
        const id = f.slice(0, -4)
        const meta = readMeta(id) || {}
        attachmentList.push({
          kind: 'attachment',
          name: meta.name || id + '.bin',
          date: meta.at ? new Date(meta.at).toISOString().slice(0, 10) : '',
          bytes: fileSize(path.join(FILES_DIR, f)),
        })
      }
    }
  } catch {
    /* no attachments yet */
  }
  const archive = database.handle.prepare(`
    SELECT count(*) AS count, COALESCE(sum(length(record_json)), 0) AS bytes FROM backup_archive_records
  `).get()
  // LibreOffice's private profile lives under data/ too. It is a cache, not anyone's data,
  // and it is big enough (hundreds of KB) that leaving it inside "Other" looks alarming.
  const loProfile = dirSize(SOFFICE_PROFILE_DIR)

  const groups = [
    { key: 'uploads', label: 'Uploaded Sheets', bytes: records.uploads.bytes, count: records.uploads.count, unit: 'upload(s)' },
    { key: 'meetings', label: 'Saved Meetings', bytes: records.meetings.bytes, count: records.meetings.count, unit: 'meeting(s)' },
    {
      key: 'notes',
      label: 'Notes & Attachments',
      bytes: records.notes.bytes + attachments.bytes,
      count: records.notes.count,
      unit: 'note(s)',
      detail: [
        { label: 'Notes text', bytes: records.notes.bytes },
        { label: 'Attachment files', bytes: attachments.bytes - previewBytes, count: attachmentCount },
        { label: 'Preview cache', bytes: previewBytes },
      ],
    },
    { key: 'assembly', label: 'Assembly', bytes: records.assembly.bytes, count: records.assembly.count, unit: 'record(s)' },
    { key: 'monthlyplan', label: 'Monthly Planning', bytes: records.monthlyplan.bytes, count: records.monthlyplan.count, unit: 'month(s)' },
    { key: 'planvsach', label: 'Plan vs Achievement', bytes: records.planvsach.bytes, count: records.planvsach.count, unit: 'day(s)' },
    { key: 'routecard', label: 'Route Card', bytes: records.routecard.bytes, count: records.routecard.count, unit: 'month(s)' },
    { key: 'cumulative', label: 'Cumulative', bytes: records.cumulative.bytes, count: records.cumulative.count, unit: 'record(s)' },
    { key: 'cpk', label: 'Cp-Cpk', bytes: records.cpk.bytes, count: records.cpk.count, unit: 'batch(es)' },
    { key: 'audit', label: 'Audit Log', bytes: auditStats.bytes + backupAuditStats.bytes, count: auditStats.count, unit: 'event(s)' },
    { key: 'accounts', label: 'Accounts & Sessions', bytes: usersStats.bytes + sessionsStats.bytes + records.settings.bytes, count: usersStats.count, unit: 'user(s)' },
    { key: 'archive', label: 'Soft-delete Archive', bytes: archive.bytes, count: archive.count, unit: 'record(s)' },
    { key: 'loprofile', label: 'LibreOffice Cache', bytes: loProfile.bytes, count: loProfile.files, unit: 'file(s)', cache: true },
  ]

  const total = dirSize(DATA_DIR)
  const accounted = groups.reduce((a, g) => a + g.bytes, 0)
  // Anything on disk the list above does not name (stray files, future features).
  const other = Math.max(0, total.bytes - accounted)
  if (other > 0) groups.push({ key: 'other', label: 'Other files', bytes: other, count: 0, unit: '' })

  // ---- the application itself, kept separate from the data it holds ----
  const root = path.join(__dirname, '..')
  const isBigSubtree = (f) => {
    const rel = path.relative(root, f)
    return (
      rel.startsWith('node_modules') ||
      rel.startsWith('dist') ||
      rel.startsWith('src') ||
      rel.startsWith('server') ||
      rel.startsWith('.git')
    )
  }
  const distSize = dirSize(path.join(root, 'dist'))
  const rootFiles = dirSize(root, isBigSubtree)
  const serverCode = dirSize(__dirname, (f) => f.startsWith(DATA_DIR))
  measureDeps()
  const appGroups = [
    { key: 'dist', label: 'Built App (dist)', bytes: distSize.bytes, count: distSize.files, unit: 'file(s)' },
    { key: 'src', label: 'Source Code (src)', bytes: dirSize(path.join(root, 'src')).bytes },
    { key: 'servercode', label: 'Server Code', bytes: serverCode.bytes },
    { key: 'config', label: 'Config & Docs', bytes: rootFiles.bytes },
    {
      key: 'deps',
      label: 'Dependencies (node_modules)',
      bytes: depsCache.bytes,
      count: depsCache.files,
      unit: 'file(s)',
      cache: true,
      pending: !depsCache.ready,
    },
  ]

  res.json({
    ok: true,
    generatedAt: Date.now(),
    app: {
      totalBytes: appGroups.reduce((a, g) => a + g.bytes, 0),
      pending: !depsCache.ready,
      groups: appGroups.filter((g) => g.bytes > 0 || g.pending),
    },
    totalBytes: total.bytes,
    totalFiles: total.files,
    attachmentFiles: attachmentCount,
    groups: groups.sort((a, b) => b.bytes - a.bytes),
    // Every file a user actually put into the app, largest first.
    files: [
      ...uploads.read().map((u) => ({
        kind: 'sheet',
        name: u.fileName || 'upload.xlsx',
        date: u.uploadDate || '',
        shift: u.shift || '',
        rows: Array.isArray(u.rows) ? u.rows.length : 0,
        bytes: Buffer.byteLength(JSON.stringify(u)),
      })),
      ...attachmentList,
    ].sort((a, b) => b.bytes - a.bytes),
  })
})

// Turn a user's login access on/off.
app.post('/api/admin/users/:username/enabled', (req, res) => {
  const who = requireAdmin(req, res)
  if (!who) return
  const target = String(req.params.username).toLowerCase()
  if (target === who.username) return res.status(400).json({ error: "You can't disable your own account." })
  const u = database.getUser(target)
  if (!u) return res.status(404).json({ error: 'User not found.' })
  if (u.hidden) return res.status(403).json({ error: 'This account cannot be managed here.' })
  const enabled = !!(req.body || {}).enabled
  u.disabled = !enabled
  try {
    database.transaction(() => {
      database.saveUser(u)
      if (!enabled) killSessions(target)
      audit.logStrict({
        type: 'access', username: who.username, role: 'admin',
        detail: `${enabled ? 'Enabled' : 'Disabled'} login for @${target}`,
      })
    })()
  } catch {
    return res.status(500).json({ error: 'Could not update account access.' })
  }
  res.json({ ok: true, disabled: !enabled })
})

// Set what one user may do in each workspace.
app.post('/api/admin/users/:username/access', (req, res) => {
  const who = requireAdmin(req, res)
  if (!who) return
  const target = String(req.params.username).toLowerCase()
  const u = database.getUser(target)
  if (!u) return res.status(404).json({ error: 'User not found.' })
  if (u.hidden) return res.status(403).json({ error: 'This account cannot be managed here.' })
  // Admins and QA answer to their own door; there is nothing here to hand out.
  if ((u.role || 'user') !== 'user')
    return res.status(400).json({ error: 'Admin and QA accounts already have full access.' })
  const before = accessOf(u)
  const access = normalizeAccess((req.body || {}).access)
  u.access = access
  const changed = ACCESS_UNITS.filter((unit) => before[unit] !== access[unit])
    .map((unit) => `${unit}: ${before[unit]} → ${access[unit]}`)
    .join(', ')
  try {
    database.transaction(() => {
      database.saveUser(u)
      audit.logStrict({
        type: 'access', username: who.username, role: 'admin',
        detail: changed ? `Access for @${target} — ${changed}` : `Access for @${target} left unchanged`,
      })
    })()
  } catch {
    return res.status(500).json({ error: 'Could not update account access.' })
  }
  // Their session stays; the app re-reads /api/auth/me and the change lands within a minute.
  res.json({ ok: true, access })
})

// Remove an account completely (also clears its history entries).
app.delete('/api/admin/users/:username', (req, res) => {
  const who = requireAdmin(req, res)
  if (!who) return
  const target = String(req.params.username).toLowerCase()
  if (target === who.username) return res.status(400).json({ error: "You can't remove your own account." })
  const existing = database.getUser(target)
  if (!existing) return res.status(404).json({ error: 'User not found.' })
  if (existing.hidden) return res.status(403).json({ error: 'This account cannot be managed here.' })
  try {
    database.transaction(() => {
      database.deleteUser(target)
      killSessions(target)
      audit.removeUserStrict(target)
      audit.logStrict({ type: 'access', username: who.username, role: 'admin', detail: `Removed account @${target}` })
    })()
  } catch {
    return res.status(500).json({ error: 'Could not remove account.' })
  }
  res.json({ ok: true })
})

// ---- Auth (login / register / forgot password) ----
setupAuth(app, DATA_DIR, audit, database)

// ---- Static app + SPA fallback ----
// The service worker file (and anything that decides whether a client is on the
// latest build) must never be served from a stale HTTP cache — otherwise phones
// keep running yesterday's bundle even after we ship a fix and they refresh.
const NEVER_CACHE = new Set(['/sw.js', '/registerSW.js', '/manifest.webmanifest', '/index.html', '/'])
app.use((req, res, next) => {
  if (NEVER_CACHE.has(req.path)) res.set('Cache-Control', 'no-cache')
  next()
})
app.use(express.static(DIST))
app.use((req, res) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.set('Cache-Control', 'no-cache')
    res.sendFile(path.join(DIST, 'index.html'))
  } else res.status(404).end()
})

const PORT = process.env.PORT || 5180
app.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces()
  const ips = []
  for (const name of Object.keys(nets)) for (const ni of nets[name] || []) if (ni.family === 'IPv4' && !ni.internal) ips.push(ni.address)
  console.log(`\n  Morning Meeting server running:`)
  console.log(`    Local:    http://localhost:${PORT}/`)
  for (const ip of ips) console.log(`    Network:  http://${ip}:${PORT}/`)
  console.log(`\n  Meetings, notes, Cp-Cpk, cumulative & notifications sync live.`)
  // CHANGED: was "reports are kept for N days, then deleted". Nothing is deleted on a
  // timer any more — an admin removes data in Backup Clean, or it stays.
  console.log(`  Data is kept until an admin removes it in Backup Clean (no automatic deletion).`)
  console.log(`  Soft-deleted records stay restorable for ${RETENTION_DAYS} days.\n`)

  // Daily housekeeping only: orphaned attachments and expired restore archives.
  housekeeping()
  setInterval(housekeeping, 24 * 60 * 60 * 1000)
})
