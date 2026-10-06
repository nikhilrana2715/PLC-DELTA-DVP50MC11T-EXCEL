import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

export const RESOURCE_NAMES = [
  'meetings', 'notes', 'cpk', 'cumulative', 'uploads', 'active', 'settings', 'assembly',
  'monthlyplan', 'routecard', 'planvsach', 'pdreport', 'prodsummary', 'maintenancereport',
  'toolingreport', 'purchasereport',
]
const RESOURCE_SET = new Set(RESOURCE_NAMES)
const VALID_UNITS = new Set(['U1', 'U2', 'U3', 'ASS'])

export function effectiveUnitForResource(resource, record) {
  const unit = String(record?.unit || '').trim().toUpperCase()
  if (VALID_UNITS.has(unit)) return unit
  return resource === 'assembly' ? 'ASS' : 'U1'
}

const anchorMs = (record) => {
  const day = record?.uploadDate || record?.meetingDate || record?.date
  if (typeof day === 'string' && day) {
    const parsed = Date.parse(day)
    if (!Number.isNaN(parsed)) return parsed
  }
  if (typeof record?.month === 'string' && /^\d{4}-\d{2}$/.test(record.month)) {
    const [year, month] = record.month.split('-').map(Number)
    return Date.UTC(year, month, 0)
  }
  return Number(record?.savedAt || record?.createdAt || 0)
}
const dayKey = (milliseconds) => {
  if (!milliseconds) return null
  const date = new Date(milliseconds)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
const json = (value) => JSON.stringify(value)
const parse = (value) => JSON.parse(value)

function columnsFor(resource, record, unit) {
  const anchor = anchorMs(record)
  return [
    resource, unit, String(record.id),
    Number(record.createdAt) || null, Number(record.savedAt) || null,
    typeof (record.date || record.uploadDate || record.meetingDate) === 'string' ? record.date || record.uploadDate || record.meetingDate : null,
    typeof record.month === 'string' ? record.month : null,
    typeof record.uploadDate === 'string' ? record.uploadDate : null,
    typeof record.meetingDate === 'string' ? record.meetingDate : null,
    typeof record.shift === 'string' ? record.shift : null,
    anchor || null, dayKey(anchor), json(record),
  ]
}

export function openDatabase(dataDir) {
  const absoluteDataDir = path.resolve(dataDir)
  if (process.platform === 'win32' && /^\\\\/.test(absoluteDataDir))
    throw new Error('SQLite must use durable local storage; UNC/SMB database paths are unsupported.')
  fs.mkdirSync(dataDir, { recursive: true })
  const filename = path.join(absoluteDataDir, 'morning-meeting.db')
  const handle = new Database(filename)
  handle.pragma('journal_mode = WAL')
  handle.pragma('foreign_keys = ON')
  handle.pragma('busy_timeout = 5000')
  handle.pragma('synchronous = NORMAL')
  const currentSchemaVersion = handle.pragma('user_version', { simple: true })
  if (currentSchemaVersion > 3)
    throw new Error(`Database schema version ${currentSchemaVersion} is newer than this application supports (3).`)

  handle.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS migration_sources (
      source TEXT PRIMARY KEY,
      source_count INTEGER NOT NULL,
      imported_count INTEGER NOT NULL,
      skipped_count INTEGER NOT NULL,
      issues_json TEXT NOT NULL,
      backup_path TEXT NOT NULL,
      migrated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS migration_reconciliation (
      source TEXT NOT NULL,
      resource TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      source_count INTEGER NOT NULL,
      target_count INTEGER NOT NULL,
      missing_ids_json TEXT NOT NULL CHECK (json_valid(missing_ids_json)),
      unexpected_ids_json TEXT NOT NULL CHECK (json_valid(unexpected_ids_json)),
      payload_mismatches_json TEXT NOT NULL CHECK (json_valid(payload_mismatches_json)),
      source_date_min TEXT,
      source_date_max TEXT,
      target_date_min TEXT,
      target_date_max TEXT,
      matched INTEGER NOT NULL CHECK (matched IN (0, 1)),
      PRIMARY KEY (source, resource, unit)
    );
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL,
      purpose TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS records (
      resource TEXT NOT NULL CHECK (resource IN (${RESOURCE_NAMES.map((name) => `'${name}'`).join(', ')})),
      unit TEXT NOT NULL DEFAULT 'U1' CHECK (unit IN ('U1', 'U2', 'U3', 'ASS')),
      id TEXT NOT NULL,
      created_at INTEGER,
      saved_at INTEGER,
      record_date TEXT,
      month_key TEXT,
      upload_date TEXT,
      meeting_date TEXT,
      shift TEXT,
      anchor_at INTEGER,
      anchor_day TEXT,
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
      sort_at INTEGER GENERATED ALWAYS AS (COALESCE(NULLIF(saved_at, 0), created_at, 0)) STORED,
      PRIMARY KEY (resource, unit, id)
    );
    CREATE INDEX IF NOT EXISTS ix_records_lookup ON records(resource, unit, record_date);
    CREATE INDEX IF NOT EXISTS ix_records_sort ON records(resource, unit, sort_at DESC);
    CREATE INDEX IF NOT EXISTS ix_records_anchor_day ON records(resource, anchor_day);
    CREATE INDEX IF NOT EXISTS ix_records_month ON records(resource, month_key);
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      full_name TEXT,
      email TEXT,
      phone TEXT,
      employee_id TEXT,
      password_hash TEXT NOT NULL CHECK (instr(password_hash, ':') > 0),
      role TEXT,
      disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
      created_at INTEGER,
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
    );
    CREATE INDEX IF NOT EXISTS users_email_lookup ON users(lower(email));
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      at INTEGER,
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
    );
    CREATE INDEX IF NOT EXISTS sessions_username_at ON sessions(username, at DESC);
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      at INTEGER NOT NULL,
      type TEXT NOT NULL,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      detail TEXT NOT NULL,
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
    );
    CREATE INDEX IF NOT EXISTS audit_events_at ON audit_events(at DESC);
    CREATE INDEX IF NOT EXISTS audit_events_username_at ON audit_events(username, at DESC);
    CREATE TABLE IF NOT EXISTS backup_clean_audit (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      admin_user TEXT,
      action TEXT,
      status TEXT,
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
    );
    CREATE INDEX IF NOT EXISTS backup_clean_audit_created ON backup_clean_audit(created_at DESC);
    CREATE TABLE IF NOT EXISTS attachment_metadata (
      id TEXT PRIMARY KEY,
      storage_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      size INTEGER NOT NULL CHECK (size >= 0),
      type TEXT NOT NULL,
      by_username TEXT NOT NULL,
      at INTEGER NOT NULL,
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
    );
    CREATE TABLE IF NOT EXISTS backup_archives (
      file_name TEXT PRIMARY KEY,
      archived_at INTEGER NOT NULL,
      by_username TEXT NOT NULL,
      keep_until INTEGER NOT NULL,
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
    );
    CREATE TABLE IF NOT EXISTS qa_data (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      updated_at INTEGER NOT NULL,
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
    );
  `)

  const schemaV1 = handle.prepare('SELECT version FROM schema_migrations WHERE version = 1').get()
  if (currentSchemaVersion === 1 && !schemaV1)
    throw new Error('SQLite user_version is 1 but schema_migrations has no version 1 record.')
  if (!schemaV1) {
    handle.transaction(() => {
      handle.prepare('INSERT INTO schema_migrations (version, applied_at, purpose) VALUES (?, ?, ?)')
        .run(1, '2026-10-02', 'Compatibility-first SQLite records, identity, audit, attachment, and archive tables')
      handle.pragma('user_version = 1')
    })()
  }
  const attachmentColumns = new Set(handle.pragma('table_info(attachment_metadata)').map((column) => column.name))
  const schemaV2 = handle.prepare('SELECT version FROM schema_migrations WHERE version = 2').get()
  if (currentSchemaVersion >= 2 && (!schemaV2 || !attachmentColumns.has('storage_key')))
    throw new Error('SQLite schema version 2 is missing its migration record or attachment storage_key column.')
  if (!schemaV2) {
    handle.transaction(() => {
      if (!attachmentColumns.has('storage_key')) {
        handle.exec("ALTER TABLE attachment_metadata ADD COLUMN storage_key TEXT NOT NULL DEFAULT ''")
        handle.exec('UPDATE attachment_metadata SET storage_key = id WHERE storage_key = \'\'')
      }
      handle.exec('CREATE UNIQUE INDEX IF NOT EXISTS attachment_storage_key ON attachment_metadata(storage_key)')
      handle.prepare('INSERT INTO schema_migrations (version, applied_at, purpose) VALUES (?, ?, ?)')
        .run(2, '2026-10-02', 'Explicit local attachment storage keys backfilled from existing attachment IDs')
      handle.pragma('user_version = 2')
    })()
  }
  const schemaV3 = handle.prepare('SELECT version FROM schema_migrations WHERE version = 3').get()
  const qaColumns = new Set(handle.pragma('table_info(qa_data)').map((column) => column.name))
  if (currentSchemaVersion >= 3 && (!schemaV3 || !qaColumns.has('payload_json')))
    throw new Error('SQLite schema version 3 is missing its migration record or QA data table.')
  if (!schemaV3) {
    handle.transaction(() => {
      handle.prepare('INSERT INTO schema_migrations (version, applied_at, purpose) VALUES (?, ?, ?)')
        .run(3, new Date().toISOString().slice(0, 10), 'Persist QA report data and upload history in SQLite')
      handle.pragma('user_version = 3')
    })()
  }
  handle.exec(`
    CREATE TABLE IF NOT EXISTS note_attachment_refs (
      resource TEXT NOT NULL DEFAULT 'notes' CHECK (resource = 'notes'),
      note_id TEXT NOT NULL,
      unit TEXT NOT NULL,
      attachment_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      file_json TEXT NOT NULL CHECK (json_valid(file_json)),
      PRIMARY KEY (resource, unit, note_id, position),
      FOREIGN KEY (resource, unit, note_id) REFERENCES records(resource, unit, id) ON DELETE CASCADE,
      FOREIGN KEY (attachment_id) REFERENCES attachment_metadata(id)
    );
    CREATE INDEX IF NOT EXISTS note_attachment_id ON note_attachment_refs(attachment_id);
    CREATE TABLE IF NOT EXISTS backup_archive_records (
      file_name TEXT NOT NULL,
      resource TEXT NOT NULL,
      record_id TEXT NOT NULL,
      unit TEXT NOT NULL,
      deleted_at INTEGER,
      deleted_by TEXT,
      record_json TEXT NOT NULL CHECK (json_valid(record_json)),
      PRIMARY KEY (file_name, resource, record_id, unit),
      FOREIGN KEY (file_name) REFERENCES backup_archives(file_name) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS archive_records_type ON backup_archive_records(resource, unit);
  `)

  const insertRecord = handle.prepare(`
    INSERT INTO records (
      resource, unit, id, created_at, saved_at, record_date, month_key,
      upload_date, meeting_date, shift, anchor_at, anchor_day, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(resource, unit, id) DO UPDATE SET
      payload_json = excluded.payload_json,
      created_at = excluded.created_at,
      saved_at = excluded.saved_at,
      record_date = excluded.record_date,
      month_key = excluded.month_key,
      upload_date = excluded.upload_date,
      meeting_date = excluded.meeting_date,
      shift = excluded.shift,
      anchor_at = excluded.anchor_at,
      anchor_day = excluded.anchor_day
  `)
  const listRecords = handle.prepare('SELECT payload_json FROM records WHERE resource = ? ORDER BY sort_at DESC')
  const listUnitRecords = handle.prepare('SELECT payload_json FROM records WHERE resource = ? AND unit = ? ORDER BY sort_at DESC')
  const getRecord = handle.prepare('SELECT payload_json FROM records WHERE resource = ? AND id = ? AND unit = ?')
  const deleteRecord = handle.prepare('DELETE FROM records WHERE resource = ? AND id = ? AND unit = ?')
  const cleanupQuery = ({ types, from, to, months, query, typeLabels = {} } = {}) => {
    const wanted = types?.length ? new Set(types.filter((type) => RESOURCE_SET.has(type))) : RESOURCE_SET
    const resources = [...wanted]
    const search = String(query || '').trim().toLowerCase().replace(/[\\%_]/g, '\\$&')
    const pattern = `%${search}%`
    if (!resources.length) return { sql: 'SELECT resource AS type, unit, payload_json, anchor_at, anchor_day FROM records WHERE 0', values: [] }
    const clauses = [`resource IN (${resources.map(() => '?').join(',')})`, 'anchor_day IS NOT NULL']
    const values = [...resources]
    if (months?.length) {
      clauses.push(`substr(anchor_day, 1, 7) IN (${months.map(() => '?').join(',')})`)
      values.push(...months)
    } else {
      if (from) { clauses.push('anchor_day >= ?'); values.push(from) }
      if (to) { clauses.push('anchor_day <= ?'); values.push(to) }
    }
    if (search) {
      const searchable = ['fileName', 'issue', 'machine', 'title', 'by', 'name']
        .map((field) => `lower(coalesce(json_extract(payload_json, '$.${field}'), '')) LIKE ? ESCAPE '\\'`)
      searchable.push("lower(?) LIKE ? ESCAPE '\\'")
      clauses.push(`(${searchable.join(' OR ')})`)
      values.push(...Array(6).fill(pattern), resources.map((name) => String(typeLabels[name] || name).toLowerCase()).join(' '), pattern)
    }
    return { sql: `SELECT resource AS type, unit, payload_json, anchor_at, anchor_day FROM records WHERE ${clauses.join(' AND ')}`, values }
  }

  const upsertAttachmentRefs = handle.prepare(`
    INSERT INTO note_attachment_refs (note_id, unit, attachment_id, position, file_json)
    VALUES (?, ?, ?, ?, ?)
  `)
  const saveRecord = (name, record, unit = effectiveUnitForResource(name, record)) => {
    if (!RESOURCE_SET.has(name)) throw new Error(`Unknown resource: ${name}`)
    if (!record || record.id === undefined || record.id === null || String(record.id) === '') throw new Error(`${name} record is missing id`)
    const normalizedUnit = ['U1', 'U2', 'U3', 'ASS'].includes(String(unit).toUpperCase()) ? String(unit).toUpperCase() : 'U1'
    const write = () => {
      insertRecord.run(...columnsFor(name, record, normalizedUnit))
      if (name === 'notes') {
        handle.prepare("DELETE FROM note_attachment_refs WHERE resource = 'notes' AND note_id = ? AND unit = ?").run(String(record.id), normalizedUnit)
        for (const [position, file] of (Array.isArray(record.files) ? record.files : []).entries()) {
          if (file?.id) upsertAttachmentRefs.run(String(record.id), normalizedUnit, String(file.id), position, json(file))
        }
      }
    }
    if (name === 'notes') handle.transaction(write)()
    else write()
    return record
  }
  const transaction = (callback) => handle.transaction(callback)

  return {
    filename,
    handle,
    transaction,
    saveRecord,
    effectiveUnit: effectiveUnitForResource,
    getRecord: (name, id, unit = 'U1') => {
      if (!RESOURCE_SET.has(name)) throw new Error(`Unknown resource: ${name}`)
      const row = getRecord.get(name, String(id), unit)
      return row ? parse(row.payload_json) : null
    },
    getQaData: () => {
      const row = handle.prepare('SELECT payload_json FROM qa_data WHERE id = 1').get()
      return row ? parse(row.payload_json) : null
    },
    saveQaData: (value) => handle.prepare(`
      INSERT INTO qa_data (id, updated_at, payload_json) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, payload_json = excluded.payload_json
    `).run(Date.now(), json(value)),
    deleteQaData: () => handle.prepare('DELETE FROM qa_data WHERE id = 1').run().changes,
    listRecords: (name) => {
      if (!RESOURCE_SET.has(name)) throw new Error(`Unknown resource: ${name}`)
      return listRecords.all(name).map((row) => parse(row.payload_json))
    },
    listUnitRecords: (name, unit) => {
      if (!RESOURCE_SET.has(name)) throw new Error(`Unknown resource: ${name}`)
      return listUnitRecords.all(name, unit).map((row) => parse(row.payload_json))
    },
    deleteRecord: (name, id, unit) => {
      if (!RESOURCE_SET.has(name)) throw new Error(`Unknown resource: ${name}`)
      return deleteRecord.run(name, String(id), unit).changes
    },
    purgeRecords: (name, cutoff) => {
      if (!RESOURCE_SET.has(name)) throw new Error(`Unknown resource: ${name}`)
      return handle.prepare('DELETE FROM records WHERE resource = ? AND anchor_at > 0 AND anchor_at < ?').run(name, cutoff).changes
    },
    resourceStats: () => {
      const counts = handle.prepare('SELECT resource, count(*) AS count, COALESCE(sum(length(payload_json)), 0) AS bytes FROM records GROUP BY resource').all()
      return Object.fromEntries(RESOURCE_NAMES.map((name) => [name, counts.find((row) => row.resource === name) || { count: 0, bytes: 0 }]))
    },
    selectCleanupRecords: ({ limit, offset = 0, ...filters }) => {
      const { sql, values } = cleanupQuery(filters)
      const pageLimit = Number.isFinite(Number(limit)) ? Math.max(0, Number(limit)) : -1
      return handle.prepare(`SELECT * FROM (${sql}) ORDER BY anchor_at DESC LIMIT ? OFFSET ?`)
        .all(...values, pageLimit, Math.max(0, Number(offset) || 0))
        .map((row) => ({ type: row.type, unit: row.unit, day: row.anchor_day, ms: row.anchor_at, rec: parse(row.payload_json) }))
    },
    countCleanupRecords: (filters) => {
      const { sql, values } = cleanupQuery(filters)
      return handle.prepare(`SELECT count(*) AS count FROM (${sql})`).get(...values).count
    },
    getUser: (username) => {
      const row = handle.prepare('SELECT payload_json FROM users WHERE username = ?').get(String(username))
      return row ? parse(row.payload_json) : null
    },
    listUsers: () => handle.prepare('SELECT payload_json FROM users ORDER BY username').all().map((row) => parse(row.payload_json)),
    findUserByEmail: (email) => {
      const row = handle.prepare('SELECT payload_json FROM users WHERE lower(email) = lower(?) LIMIT 1').get(String(email))
      return row ? parse(row.payload_json) : null
    },
    saveUser: (user) => handle.prepare(`
      INSERT INTO users (username, full_name, email, phone, employee_id, password_hash, role, disabled, created_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET full_name=excluded.full_name, email=excluded.email,
        phone=excluded.phone, employee_id=excluded.employee_id, password_hash=excluded.password_hash, role=excluded.role,
        disabled=excluded.disabled, created_at=excluded.created_at, payload_json=excluded.payload_json
    `).run(String(user.username), user.fullName ?? null, user.email ?? null, user.phone ?? null, user.employeeId ?? null,
      String(user.pw || ''), user.role ?? null, user.disabled ? 1 : 0, Number(user.createdAt) || null, json(user)),
    deleteUser: (username) => handle.prepare('DELETE FROM users WHERE username = ?').run(String(username)).changes,
    getSession: (token) => {
      const row = handle.prepare('SELECT payload_json FROM sessions WHERE token = ?').get(String(token))
      return row ? parse(row.payload_json) : null
    },
    listSessionsForUser: (username) => handle.prepare('SELECT token, at FROM sessions WHERE username = ? ORDER BY at DESC').all(String(username)),
    saveSession: (token, session) => handle.prepare(`
      INSERT INTO sessions (token, username, at, payload_json) VALUES (?, ?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET username=excluded.username, at=excluded.at, payload_json=excluded.payload_json
    `).run(String(token), String(session.username), Number(session.at) || null, json(session)),
    deleteSession: (token) => handle.prepare('DELETE FROM sessions WHERE token = ?').run(String(token)).changes,
    deleteSessionsForUser: (username) => handle.prepare('DELETE FROM sessions WHERE username = ?').run(String(username)).changes,
    deleteOldestSessions: (username, keep) => handle.prepare(`
      DELETE FROM sessions WHERE token IN (
        SELECT token FROM sessions WHERE username = ? ORDER BY COALESCE(at, 0) DESC LIMIT -1 OFFSET ?
      )
    `).run(String(username), keep).changes,
    insertAudit: (entry) => handle.prepare(`
      INSERT INTO audit_events (id, at, type, username, role, detail, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(String(entry.id), Number(entry.at), String(entry.type), String(entry.username), String(entry.role), String(entry.detail), json(entry)),
    listAudit: () => handle.prepare('SELECT payload_json FROM audit_events ORDER BY at DESC LIMIT 1000').all().map((row) => parse(row.payload_json)),
    removeAuditForUser: (username) => handle.prepare('DELETE FROM audit_events WHERE username = ?').run(String(username)).changes,
    insertAttachment: (meta) => handle.prepare(`
      INSERT INTO attachment_metadata (id, storage_key, name, size, type, by_username, at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, size=excluded.size, type=excluded.type,
        storage_key=excluded.storage_key, by_username=excluded.by_username, at=excluded.at, payload_json=excluded.payload_json
    `).run(String(meta.id), String(meta.storageKey || meta.id), String(meta.name), Number(meta.size), String(meta.type), String(meta.by), Number(meta.at), json(meta)),
    getAttachment: (id) => {
      const row = handle.prepare('SELECT payload_json FROM attachment_metadata WHERE id = ?').get(String(id))
      return row ? parse(row.payload_json) : null
    },
    deleteAttachment: (id) => handle.prepare('DELETE FROM attachment_metadata WHERE id = ?').run(String(id)).changes,
    insertBackupCleanAudit: (entry) => handle.prepare(`
      INSERT INTO backup_clean_audit (id, created_at, admin_user, action, status, payload_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).run(String(entry.id), Number(entry.createdAt), entry.admin_user ?? null, entry.action ?? null, entry.status ?? null, json(entry)),
    listBackupCleanAudit: (limit = 2000) => handle.prepare(`
      SELECT payload_json FROM backup_clean_audit ORDER BY created_at DESC LIMIT ?
    `).all(limit).map((row) => parse(row.payload_json)),
    createBackupArchive: (fileName, archive) => {
      handle.prepare(`
        INSERT INTO backup_archives (file_name, archived_at, by_username, keep_until, payload_json)
        VALUES (?, ?, ?, ?, ?)
      `).run(fileName, archive.archivedAt, archive.by, archive.keepUntil, json({ archivedAt: archive.archivedAt, by: archive.by, keepUntil: archive.keepUntil }))
      const insert = handle.prepare(`
        INSERT INTO backup_archive_records (file_name, resource, record_id, unit, deleted_at, deleted_by, record_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      for (const archived of archive.records) {
        const record = archived.record
        const unit = archived.unit || effectiveUnitForResource(archived.type, record)
        insert.run(fileName, archived.type, String(record.id), unit, Number(archived.deletedAt) || null, archived.by ?? null, json(record))
      }
    },
    listBackupArchives: () => handle.prepare(`
      SELECT a.file_name AS file, a.archived_at AS archivedAt, a.by_username AS by,
        a.keep_until AS keepUntil, count(r.record_id) AS count
      FROM backup_archives a LEFT JOIN backup_archive_records r ON r.file_name = a.file_name
      GROUP BY a.file_name ORDER BY a.archived_at DESC
    `).all(),
    getBackupArchive: (fileName) => {
      const archive = handle.prepare(`
        SELECT file_name AS file, archived_at AS archivedAt, by_username AS by,
          keep_until AS keepUntil, payload_json FROM backup_archives WHERE file_name = ?
      `).get(String(fileName))
      if (!archive) return null
      const records = handle.prepare(`
        SELECT resource AS type, unit, deleted_at AS deletedAt, deleted_by AS by, record_json
        FROM backup_archive_records WHERE file_name = ? ORDER BY rowid
      `).all(String(fileName)).map((row) => ({
        type: row.type,
        unit: row.unit,
        deletedAt: row.deletedAt,
        by: row.by,
        record: parse(row.record_json),
      }))
      return { ...parse(archive.payload_json), file: archive.file, records }
    },
    deleteBackupArchive: (fileName) => handle.prepare('DELETE FROM backup_archives WHERE file_name = ?').run(String(fileName)).changes,
    expiredBackupArchives: (now) => handle.prepare(`
      SELECT file_name AS file, payload_json FROM backup_archives WHERE keep_until < ?
    `).all(now).map((row) => ({ file: row.file, ...parse(row.payload_json) })),
    deleteOrphanAttachments: () => handle.prepare(`
      DELETE FROM attachment_metadata WHERE NOT EXISTS (
        SELECT 1 FROM note_attachment_refs WHERE attachment_id = attachment_metadata.id
      )
    `).run().changes,
  }
}
