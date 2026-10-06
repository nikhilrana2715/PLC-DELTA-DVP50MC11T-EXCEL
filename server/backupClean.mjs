// ============================================================================
//  Backup Clean — admin tool that replaces the old automatic 30-day retention.
//
//  Records and restore archives live in SQLite; attachment bytes remain on disk.
//
//  Timezone: report dates are plain 'YYYY-MM-DD' calendar strings typed by the
//  factory; savedAt/createdAt are epoch ms. Both are resolved through anchorOf()
//  and then bucketed with LOCAL calendar parts (the server's timezone, IST here).
//  Month grouping, the date-range filter and the preview all call that one
//  function, so a record can never fall in one bucket and be deleted by another.
// ============================================================================
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import XLSX from 'xlsx'

// ---- config ---------------------------------------------------------------
// CHANGED: soft delete is the default; the admin can switch to hard delete per run.
export const SOFT_DELETE_DEFAULT = process.env.BACKUP_CLEAN_SOFT_DELETE !== 'false'
/** Records newer than this are flagged in the UI. It is a warning, not a block. */
export const MIN_AGE_DAYS = Number(process.env.BACKUP_CLEAN_MIN_AGE_DAYS) || 30
/** How long a soft-deleted record stays restorable. */
export const ARCHIVE_KEEP_DAYS = Number(process.env.BACKUP_CLEAN_ARCHIVE_DAYS) || 30
/** Resources the tool can clean. `active`/`settings` are app state, not user data. */
const CLEANABLE = ['meetings', 'notes', 'cpk', 'cumulative', 'uploads', 'assembly', 'monthlyplan', 'routecard', 'planvsach']

const TYPE_LABEL = {
  meetings: 'Meetings',
  notes: 'Notes',
  cpk: 'Cp-Cpk',
  cumulative: 'Cumulative',
  uploads: 'Excel imports',
  assembly: 'Assembly reports',
  monthlyplan: 'Monthly plans',
  routecard: 'Route cards',
  planvsach: 'Plan vs Achievement',
}

// ---- date helpers ---------------------------------------------------------
/** The day a record belongs to. Mirrors the server's own anchorMs() exactly. */
function anchorOf(r) {
  const day = r?.uploadDate || r?.meetingDate || r?.date
  if (typeof day === 'string' && day) {
    const t = Date.parse(day)
    if (!Number.isNaN(t)) return t
  }
  if (typeof r?.month === 'string' && /^\d{4}-\d{2}$/.test(r.month)) {
    const [y, m] = r.month.split('-').map(Number)
    return Date.UTC(y, m, 0)
  }
  return r?.savedAt || r?.createdAt || 0
}
const pad = (n) => String(n).padStart(2, '0')
/** 'YYYY-MM-DD' in the server's local calendar. */
const dayKey = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const monthKey = (ms) => dayKey(ms).slice(0, 7)
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

// ---- size helpers ---------------------------------------------------------
const jsonBytes = (r) => Buffer.byteLength(JSON.stringify(r), 'utf8')
/** Photos are base64 inside the note; count their decoded size, not the JSON blow-up. */
const photoBytes = (n) => (n.images || []).reduce((s, src) => s + Math.floor((String(src).length * 3) / 4), 0)

export function humanBytes(n) {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function setupBackupClean(app, { DATA_DIR, FILES_DIR, whoIs, audit, pushActivity, database }) {
  const ARCHIVE_DIR = path.join(DATA_DIR, 'archive')
  const ARCHIVE_FILES = path.join(ARCHIVE_DIR, 'files')
  fs.mkdirSync(ARCHIVE_FILES, { recursive: true })

  // ---- audit ---------------------------------------------------------------
  // CHANGED: a dedicated, append-only log. The cleaner never reads this file as a
  // deletion target, so a Backup Clean run can never erase its own trail.
  const readAudit = () => database.listBackupCleanAudit()
  const logAudit = (entry) => {
    const row = { id: crypto.randomBytes(8).toString('hex'), createdAt: Date.now(), ...entry }
    database.transaction(() => {
      database.insertBackupCleanAudit(row)
      database.handle.prepare('DELETE FROM backup_clean_audit WHERE id IN (SELECT id FROM backup_clean_audit ORDER BY created_at DESC LIMIT -1 OFFSET 2000)').run()
    })()
    return row
  }
  const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim()

  // ---- permission ----------------------------------------------------------
  // CHANGED: every route re-checks the role server-side. The hidden button is a
  // convenience, never the control.
  const requireAdmin = (req, res) => {
    const who = whoIs(req)
    if (!who) {
      res.status(401).json({ error: 'Please sign in again.' })
      return null
    }
    if ((who.role || 'user') !== 'admin') {
      res.status(403).json({ error: 'Only an admin can use Backup Clean.' })
      return null
    }
    return who
  }

  // ---- the one shared selector --------------------------------------------
  // CHANGED: preview, export and delete all call this. They cannot disagree,
  // because there is only one place that decides what "matching" means.
  function selectRecords({ from, to, types, months }) {
    const wanted = new Set(types && types.length ? types.filter((type) => CLEANABLE.includes(type)) : CLEANABLE)
    const monthSet = months && months.length ? new Set(months) : null
    return database.selectCleanupRecords({ from, to, types: [...wanted], months: monthSet ? [...monthSet] : null })
  }

  /** Attachment ids referenced by a set of notes, with how many records use each. */
  function fileRefCounts() {
    return new Map(database.handle.prepare(`
      SELECT attachment_id, count(*) AS count FROM note_attachment_refs GROUP BY attachment_id
    `).all().map((row) => [row.attachment_id, row.count]))
  }

  function measure(rows) {
    const breakdown = {}
    const users = new Set()
    let bytes = 0
    let photos = 0
    let files = 0
    for (const { type, rec } of rows) {
      breakdown[type] = (breakdown[type] ?? 0) + 1
      bytes += jsonBytes(rec)
      if (rec.by) users.add(rec.by)
      if (type === 'notes') {
        photos += (rec.images || []).length
        bytes += photoBytes(rec)
        for (const f of rec.files || []) {
          files++
          bytes += f.size || 0
        }
      }
    }
    if (photos) breakdown.photos = photos
    if (files) breakdown.files = files
    return { count: rows.length, bytes, breakdown, users: [...users] }
  }

  // ---- 1. month-wise summary ----------------------------------------------
  app.get('/api/admin/backup-clean/summary', (req, res) => {
    if (!requireAdmin(req, res)) return
    const byMonth = new Map()
    for (const row of selectRecords({})) {
      const key = row.day.slice(0, 7)
      let m = byMonth.get(key)
      if (!m) {
        m = { month: key, label: monthLabel(key), record_count: 0, total_bytes: 0, first_date: row.day, last_date: row.day, breakdown: {} }
        byMonth.set(key, m)
      }
      const one = measure([row])
      m.record_count += 1
      m.total_bytes += one.bytes
      for (const [k, v] of Object.entries(one.breakdown)) m.breakdown[k] = (m.breakdown[k] ?? 0) + v
      if (row.day < m.first_date) m.first_date = row.day
      if (row.day > m.last_date) m.last_date = row.day
    }
    const months = [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month))
    const grand = months.reduce((s, m) => ({ records: s.records + m.record_count, bytes: s.bytes + m.total_bytes }), { records: 0, bytes: 0 })
    res.json({
      months,
      grand: { ...grand, months: months.length },
      types: CLEANABLE.map((t) => ({ id: t, label: TYPE_LABEL[t] })),
      config: { softDeleteDefault: SOFT_DELETE_DEFAULT, minAgeDays: MIN_AGE_DAYS, archiveKeepDays: ARCHIVE_KEEP_DAYS, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    })
  })

  // ---- 2. paginated detail for one month ----------------------------------
  app.get('/api/admin/backup-clean/items', (req, res) => {
    if (!requireAdmin(req, res)) return
    const { month, type, q } = req.query
    const page = Math.max(1, Number(req.query.page) || 1)
    const perPage = Math.min(200, Math.max(1, Number(req.query.per_page) || 50))
    const filters = {
      months: month ? [month] : null,
      types: type && type !== 'all' ? [type] : null,
      query: q,
      typeLabels: TYPE_LABEL,
    }
    const total = database.countCleanupRecords(filters)
    const slice = database.selectCleanupRecords({ ...filters, limit: perPage, offset: (page - 1) * perPage })
    res.json({
      total,
      page,
      per_page: perPage,
      pages: Math.max(1, Math.ceil(total / perPage)),
      items: slice.map(({ type: t, day, rec }) => ({
        id: rec.id,
        type: t,
        typeLabel: TYPE_LABEL[t],
        date: day,
        by: rec.by || '—',
        name: rec.fileName || rec.issue || rec.title || rec.machine || rec.date || rec.id,
        bytes: measure([{ type: t, rec }]).bytes,
        files: (rec.files || []).length,
        photos: (rec.images || []).length,
      })),
    })
  })

  // ---- 3. preview (dry run) -----------------------------------------------
  app.post('/api/admin/backup-clean/preview', (req, res) => {
    const who = requireAdmin(req, res)
    if (!who) return
    const { from, to, types, months } = req.body || {}
    const rows = selectRecords({ from, to, types, months })
    const m = measure(rows)
    const cutoff = dayKey(Date.now() - MIN_AGE_DAYS * 86400000)
    // CHANGED: recent data is *flagged*, never blocked — the admin decides.
    const recent = rows.filter((r) => r.day > cutoff)
    res.json({
      ...m,
      from: from ?? null,
      to: to ?? null,
      first_date: rows.length ? rows[rows.length - 1].day : null,
      last_date: rows.length ? rows[0].day : null,
      recent_count: recent.length,
      recent_cutoff: cutoff,
      humanBytes: humanBytes(m.bytes),
    })
  })

  // ---- 4. export ZIP -------------------------------------------------------
  // A minimal STORED-method zip written straight to the response: nothing is held
  // in memory beyond the file currently being written.
  const crcTable = (() => {
    const t = new Int32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[i] = c
    }
    return t
  })()
  const crc32 = (buf) => {
    let c = -1
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
  const dosStamp = (d) => ({
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 31),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  })

  function zipStream(res, entries, fileName) {
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    const now = new Date()
    const { time, date } = dosStamp(now)
    const central = []
    let offset = 0
    for (const e of entries) {
      const body = Buffer.isBuffer(e.body) ? e.body : Buffer.from(e.body, 'utf8')
      const name = Buffer.from(e.name, 'utf8')
      const crc = crc32(body)
      const local = Buffer.alloc(30 + name.length)
      local.writeUInt32LE(0x04034b50, 0)
      local.writeUInt16LE(20, 4)
      local.writeUInt16LE(0x0800, 6) // UTF-8 names
      local.writeUInt16LE(0, 8) // stored
      local.writeUInt16LE(time, 10)
      local.writeUInt16LE(date, 12)
      local.writeUInt32LE(crc, 14)
      local.writeUInt32LE(body.length, 18)
      local.writeUInt32LE(body.length, 22)
      local.writeUInt16LE(name.length, 26)
      local.writeUInt16LE(0, 28)
      name.copy(local, 30)
      res.write(local)
      res.write(body)
      const cen = Buffer.alloc(46 + name.length)
      cen.writeUInt32LE(0x02014b50, 0)
      cen.writeUInt16LE(20, 4)
      cen.writeUInt16LE(20, 6)
      cen.writeUInt16LE(0x0800, 8)
      cen.writeUInt16LE(0, 10)
      cen.writeUInt16LE(time, 12)
      cen.writeUInt16LE(date, 14)
      cen.writeUInt32LE(crc, 16)
      cen.writeUInt32LE(body.length, 20)
      cen.writeUInt32LE(body.length, 24)
      cen.writeUInt16LE(name.length, 28)
      cen.writeUInt32LE(offset, 42)
      name.copy(cen, 46)
      central.push(cen)
      offset += local.length + body.length
    }
    const dir = Buffer.concat(central)
    res.write(dir)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(central.length, 8)
    end.writeUInt16LE(central.length, 10)
    end.writeUInt32LE(dir.length, 12)
    end.writeUInt32LE(offset, 16)
    res.end(end)
  }

  app.post('/api/admin/backup-clean/export', (req, res) => {
    const who = requireAdmin(req, res)
    if (!who) return
    const { from, to, types, months } = req.body || {}
    const rows = selectRecords({ from, to, types, months })
    const m = measure(rows)

    const entries = []
    entries.push({ name: 'data.json', body: JSON.stringify(rows.map(({ type, day, rec }) => ({ type, date: day, record: rec })), null, 2) })

    // One sheet per type, so the export opens as something a person can read.
    const wb = XLSX.utils.book_new()
    for (const t of CLEANABLE) {
      const of = rows.filter((r) => r.type === t)
      if (!of.length) continue
      const flat = of.map(({ day, rec }) => {
        const o = { Date: day, Id: rec.id, By: rec.by || '' }
        for (const [k, v] of Object.entries(rec)) {
          if (k === 'images' || k === 'files' || k === 'rows') continue
          o[k] = typeof v === 'object' && v !== null ? JSON.stringify(v).slice(0, 500) : v
        }
        return o
      })
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat), TYPE_LABEL[t].slice(0, 31))
    }
    if (wb.SheetNames.length) entries.push({ name: 'data.xlsx', body: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) })

    // Attachments, de-duplicated by file id and prefixed with the owning record.
    const seen = new Set()
    const checksums = []
    for (const { type, rec } of rows) {
      if (type !== 'notes') continue
      for (const f of rec.files || []) {
        if (!f.id || seen.has(f.id)) continue
        seen.add(f.id)
        const bin = path.join(FILES_DIR, `${f.id}.bin`)
        if (!fs.existsSync(bin)) continue
        const buf = fs.readFileSync(bin)
        const safe = String(f.name).replace(/[\\/:*?"<>|]/g, '_')
        entries.push({ name: `files/${f.id}-${rec.id}-${safe}`, body: buf })
        checksums.push(`${crypto.createHash('sha256').update(buf).digest('hex')}  files/${f.id}-${rec.id}-${safe}`)
      }
      ;(rec.images || []).forEach((src, i) => {
        const b64 = String(src).split(',')[1]
        if (!b64) return
        const buf = Buffer.from(b64, 'base64')
        entries.push({ name: `files/${rec.id}-photo-${i + 1}.jpg`, body: buf })
        checksums.push(`${crypto.createHash('sha256').update(buf).digest('hex')}  files/${rec.id}-photo-${i + 1}.jpg`)
      })
    }

    entries.push({
      name: 'manifest.txt',
      body: [
        'Morning Meeting — Backup Clean export',
        `generated : ${new Date().toISOString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
        `by        : ${who.username}`,
        `range     : ${from || '(all)'} to ${to || '(all)'}${months?.length ? ` · months ${months.join(', ')}` : ''}`,
        `records   : ${m.count}`,
        `size      : ${humanBytes(m.bytes)} (${m.bytes} bytes)`,
        `breakdown : ${Object.entries(m.breakdown).map(([k, v]) => `${k}=${v}`).join(' · ')}`,
        '',
        'To restore: see README-restore.txt inside this archive.',
        '',
        'SHA-256 checksums',
        ...checksums,
      ].join('\n'),
    })
    entries.push({
      name: 'README-restore.txt',
      body: [
        'HOW TO RESTORE FROM THIS BACKUP',
        '',
        '1. data.json holds every deleted record with all of its fields, in the shape the',
        '   app stores them: [{ type, date, record }].',
        '2. Extract this ZIP, stop the server, and run:',
        '   node server/restore-backup-json.mjs <extracted>/data.json <extracted>/files',
        '   The import preserves ids, units, and attachment metadata; existing records are',
        '   skipped, so rerunning it does not create duplicates.',
        '3. data.xlsx is a readable copy for people; it is not used when restoring.',
        '4. manifest.txt lists SHA-256 checksums so you can verify nothing was altered.',
        '',
        'If the delete was a SOFT delete, you do not need this file at all — use',
        'Restore inside Backup Clean while the record is still in the archive.',
      ].join('\n'),
    })

    logAudit({
      admin_user: who.username,
      admin_ip: ipOf(req),
      action: 'export',
      range_from: from ?? null,
      range_to: to ?? null,
      months: months ?? [],
      types: types ?? CLEANABLE,
      record_count: m.count,
      total_bytes: m.bytes,
      status: 'ok',
    })

    const stamp = `${from || 'all'}_to_${to || 'all'}`
    zipStream(res, entries, `backup_${stamp}.zip`)
  })

  // ---- 5. delete (job based) ----------------------------------------------
  const jobs = new Map()
  let running = null // CHANGED: one cleanup at a time, app-wide.

  app.post('/api/admin/backup-clean/delete', (req, res) => {
    const who = requireAdmin(req, res)
    if (!who) return
    if (running && jobs.get(running)?.state === 'running') {
      return res.status(409).json({ error: 'Another cleanup is already running.', job_id: running })
    }
    const { from, to, types, months, soft = SOFT_DELETE_DEFAULT, expected_count, backup_taken = false } = req.body || {}
    const rows = selectRecords({ from, to, types, months })
    const m = measure(rows)

    // CHANGED: the server re-counts. If the world moved since the admin previewed,
    // stop rather than delete something they never saw.
    if (typeof expected_count === 'number' && Math.abs(expected_count - m.count) > 0) {
      logAudit({ admin_user: who.username, admin_ip: ipOf(req), action: 'delete', range_from: from ?? null, range_to: to ?? null, types: types ?? CLEANABLE, record_count: m.count, total_bytes: m.bytes, soft_delete: !!soft, status: 'aborted', error_summary: `expected ${expected_count}, found ${m.count}` })
      return res.status(409).json({ error: 'Data changed since preview — please refresh.', expected: expected_count, actual: m.count })
    }
    if (!rows.length) return res.status(400).json({ error: 'No data found in this range.' })

    const jobId = crypto.randomBytes(8).toString('hex')
    const job = { id: jobId, state: 'running', done: 0, total: rows.length, bytes: m.bytes, errors: [], soft: !!soft, startedAt: Date.now() }
    jobs.set(jobId, job)
    running = jobId
    res.json({ job_id: jobId, total: rows.length, bytes: m.bytes })

    // CHANGED: the work is detached from the request, so closing the browser mid-run
    // does not abandon it. Progress stays queryable by job id.
    setImmediate(() => runDelete(job, rows, { who, from, to, types, months, soft: !!soft, backup_taken, ip: ipOf(req) }))
  })

  function runDelete(job, rows, ctx) {
    const archiveStamp = new Date().toISOString().replace(/[:.]/g, '-')
    const archiveName = `${archiveStamp}.json`
    const archivedAt = Date.now()
    let archiveRecords = []
    const moves = []

    try {
      let fileIds = []
      database.transaction(() => {
        const currentRows = rows.map(({ type, unit, rec }) => {
          const current = database.getRecord(type, rec.id, unit)
          if (!current || JSON.stringify(current) !== JSON.stringify(rec)) {
            throw new Error('Data changed during cleanup; no records were deleted. Refresh and try again.')
          }
          return { type, unit, rec: current }
        })
        archiveRecords = currentRows.map(({ type, unit, rec }) => ({ type, unit, record: rec, deletedAt: archivedAt, by: ctx.who.username }))
        const refs = fileRefCounts()
        const selectedRefs = new Map()
        for (const { type, rec } of currentRows) {
          if (type !== 'notes') continue
          for (const file of rec.files || []) if (file.id) selectedRefs.set(file.id, (selectedRefs.get(file.id) || 0) + 1)
        }
        fileIds = [...selectedRefs]
          .filter(([id, selected]) => (refs.get(id) || 0) <= selected)
          .map(([id]) => id)

        if (ctx.soft) {
          for (const id of fileIds) {
            for (const ext of ['.bin', '.json']) {
              const source = safeFilePath(id, ext)
              const destination = path.join(ARCHIVE_FILES, `${id}${ext}`)
              if (source && fs.existsSync(source)) {
                fs.renameSync(source, destination)
                moves.push({ source, destination })
              }
            }
          }
        }

        const archive = {
          archivedAt,
          by: ctx.who.username,
          keepUntil: archivedAt + ARCHIVE_KEEP_DAYS * 86400000,
          records: archiveRecords,
        }
        if (ctx.soft) database.createBackupArchive(archiveName, archive)
        for (const { type, unit, rec } of currentRows) database.deleteRecord(type, rec.id, unit)
        if (!ctx.soft) for (const id of fileIds) database.deleteAttachment(id)
        logAudit({
          admin_user: ctx.who.username,
          admin_ip: ctx.ip,
          action: 'delete',
          range_from: ctx.from ?? null,
          range_to: ctx.to ?? null,
          months: ctx.months ?? [],
          types: ctx.types ?? CLEANABLE,
          record_count: currentRows.length,
          total_bytes: job.bytes,
          soft_delete: job.soft,
          backup_taken: !!ctx.backup_taken,
          job_id: job.id,
          archive: ctx.soft ? archiveName : null,
          status: 'done',
          error_summary: null,
        })
        audit?.logStrict?.({
          type: 'delete', username: ctx.who.username, role: 'admin',
          detail: `Backup Clean — ${currentRows.length} record(s) ${job.soft ? 'archived' : 'permanently deleted'}`,
        })
      })()

      if (!ctx.soft) {
        for (const id of fileIds) {
          for (const ext of ['.bin', '.json', '.preview.pdf']) {
            const file = safeFilePath(id, ext)
            if (file) {
              try {
                fs.rmSync(file, { force: true })
              } catch (error) {
                job.errors.push({ id, type: 'attachment', error: String(error?.message || error) })
              }
            }
          }
        }
      } else if (archiveRecords.length) job.archive = archiveName
      job.done = rows.length
      job.state = job.errors.length ? 'partial' : 'done'
    } catch (e) {
      for (const { source, destination } of moves.reverse()) {
        try {
          if (fs.existsSync(destination) && !fs.existsSync(source)) fs.renameSync(destination, source)
        } catch {
          /* leave the moved file in the archive for manual recovery */
        }
      }
      job.state = 'failed'
      job.errors.push({ error: String(e?.message || e) })
    } finally {
      job.finishedAt = Date.now()
      running = null
      if (job.state !== 'done') {
        try {
          logAudit({
            admin_user: ctx.who.username,
            admin_ip: ctx.ip,
            action: 'delete',
            range_from: ctx.from ?? null,
            range_to: ctx.to ?? null,
            months: ctx.months ?? [],
            types: ctx.types ?? CLEANABLE,
            record_count: job.done,
            total_bytes: job.bytes,
            soft_delete: job.soft,
            backup_taken: !!ctx.backup_taken,
            job_id: job.id,
            status: job.state,
            error_summary: job.errors.length ? job.errors.slice(0, 5).map((e) => e.error).join(' | ') : null,
          })
        } catch {
          /* keep the job result available even if failure logging cannot be stored */
        }
      }
      if (job.state !== 'failed') {
        pushActivity?.('info', `Backup Clean: ${job.done} record(s) ${job.soft ? 'archived' : 'deleted'} by ${ctx.who.username}`)
      }
    }
  }

  /** Never build a path from a stored string: ids are hex we generated. */
  function safeFilePath(id, ext) {
    if (!/^[a-f0-9]{24}$/.test(String(id || ''))) return null
    const p = path.resolve(FILES_DIR, `${id}${ext}`)
    return p.startsWith(path.resolve(FILES_DIR) + path.sep) ? p : null
  }

  app.get('/api/admin/backup-clean/job/:id', (req, res) => {
    if (!requireAdmin(req, res)) return
    const job = jobs.get(req.params.id)
    if (!job) return res.status(404).json({ error: 'Job not found.' })
    res.json(job)
  })

  // ---- 6. archive: list + restore -----------------------------------------
  app.get('/api/admin/backup-clean/archive', (req, res) => {
    if (!requireAdmin(req, res)) return
    res.json(database.listBackupArchives().map((archive) => ({ ...archive, expired: Date.now() > archive.keepUntil })))
  })

  app.post('/api/admin/backup-clean/restore', (req, res) => {
    const who = requireAdmin(req, res)
    if (!who) return
    const name = String(req.body?.file || '')
    if (!/^[\w.\-:]+\.json$/.test(name)) return res.status(400).json({ error: 'Bad archive name.' })
    const archive = database.getBackupArchive(name)
    if (!archive) return res.status(404).json({ error: 'Archive not found.' })
    let restored = 0
    const moves = []
    try {
      for (const { type, unit: archivedUnit, record } of archive.records) {
        if (!CLEANABLE.includes(type)) throw new Error(`Unknown archived resource: ${type}`)
        if (type !== 'notes') continue
        for (const file of record.files || []) for (const ext of ['.bin', '.json']) {
          const from = path.join(ARCHIVE_FILES, `${file.id}${ext}`)
          const to = safeFilePath(file.id, ext)
          if (to && fs.existsSync(from) && !fs.existsSync(to)) {
            fs.renameSync(from, to)
            moves.push({ from, to })
          }
        }
      }
      database.transaction(() => {
        for (const { type, unit: archivedUnit, record } of archive.records) {
          const unit = archivedUnit || database.effectiveUnit(type, record)
          if (!database.getRecord(type, record.id, unit)) {
            database.saveRecord(type, record, unit)
            restored++
          }
        }
        database.deleteBackupArchive(name)
      })()
    } catch (error) {
      for (const { from, to } of moves.reverse()) {
        try {
          if (fs.existsSync(to) && !fs.existsSync(from)) fs.renameSync(to, from)
        } catch {
          /* leave the moved file in place for manual recovery */
        }
      }
      return res.status(500).json({ error: error.message || 'Could not restore archive.' })
    }
    logAudit({ admin_user: who.username, admin_ip: ipOf(req), action: 'restore', record_count: restored, status: 'ok', archive: name })
    res.json({ ok: true, restored })
  })

  // ---- 7. history ----------------------------------------------------------
  app.get('/api/admin/backup-clean/history', (req, res) => {
    if (!requireAdmin(req, res)) return
    res.json(readAudit().slice(0, 200))
  })

  /** Drop archives past their grace period. Called by the daily housekeeping. */
  function purgeExpiredArchives() {
    let n = 0
    for (const archive of database.expiredBackupArchives(Date.now())) {
      try {
        const current = database.getBackupArchive(archive.file)
        for (const { type, record } of current?.records || []) {
          if (type !== 'notes') continue
          for (const file of record.files || []) {
            const archiveUses = database.handle.prepare(`
              SELECT count(*) AS count FROM backup_archive_records AS ar,
                json_each(ar.record_json, '$.files') AS f
              WHERE ar.file_name <> ? AND json_extract(f.value, '$.id') = ?
            `).get(archive.file, file.id).count
            const liveUses = database.handle.prepare('SELECT count(*) AS count FROM note_attachment_refs WHERE attachment_id = ?').get(file.id).count
            if (archiveUses || liveUses) continue
            for (const ext of ['.bin', '.json']) {
              const archivedFile = path.join(ARCHIVE_FILES, `${file.id}${ext}`)
              if (fs.existsSync(archivedFile)) fs.rmSync(archivedFile, { force: true })
            }
            database.deleteAttachment(file.id)
          }
        }
        database.deleteBackupArchive(archive.file)
        n++
      } catch {
        /* leave anything unreadable alone */
      }
    }
    return n
  }

  return { purgeExpiredArchives }
}
