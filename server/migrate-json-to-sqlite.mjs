import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath, pathToFileURL } from 'url'
import { isDeepStrictEqual } from 'util'
import { effectiveUnitForResource, RESOURCE_NAMES, openDatabase } from './database.mjs'

const MARKER = 'json_migration_v1_complete'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UNITS = ['U1', 'U2', 'U3', 'ASS']

function anchorDay(record) {
  const day = record?.uploadDate || record?.meetingDate || record?.date
  let milliseconds = 0
  if (typeof day === 'string' && day) milliseconds = Date.parse(day) || 0
  if (!milliseconds && typeof record?.month === 'string' && /^\d{4}-\d{2}$/.test(record.month)) {
    const [year, month] = record.month.split('-').map(Number)
    milliseconds = Date.UTC(year, month, 0)
  }
  if (!milliseconds) milliseconds = Number(record?.savedAt || record?.createdAt || 0)
  if (!milliseconds) return null
  const date = new Date(milliseconds)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function dateRange(values) {
  const dates = values.filter(Boolean).sort()
  return { min: dates[0] || null, max: dates.at(-1) || null }
}

function comparePayloadSet(source, resource, sourceRows, targetRows, keyOf, sourcePayloadOf = (row) => row, targetPayloadOf = (row) => JSON.parse(row.payload_json), unit = '') {
  const expected = new Map(sourceRows.map((row) => [String(keyOf(row)), sourcePayloadOf(row)]))
  const actual = new Map(targetRows.map((row) => [String(keyOf(row)), targetPayloadOf(row)]))
  const missingIds = [...expected.keys()].filter((key) => !actual.has(key))
  const unexpectedIds = [...actual.keys()].filter((key) => !expected.has(key))
  const payloadMismatches = [...expected.keys()].filter((key) => actual.has(key) && !isDeepStrictEqual(expected.get(key), actual.get(key)))
  const dateOf = (row, payload) => {
    const anchor = anchorDay(row) || anchorDay(payload)
    if (anchor) return anchor
    const timestamp = Number(row?.at || row?.createdAt || row?.created_at || payload?.at || payload?.createdAt || 0)
    return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : null
  }
  const sourceDates = dateRange(sourceRows.map((row) => dateOf(row, sourcePayloadOf(row))))
  const targetDates = dateRange(targetRows.map((row) => dateOf(row, targetPayloadOf(row))))
  return {
    source, resource, unit,
    sourceCount: sourceRows.length, targetCount: targetRows.length,
    missingIds, unexpectedIds, payloadMismatches,
    sourceDateMin: sourceDates.min, sourceDateMax: sourceDates.max,
    targetDateMin: targetDates.min, targetDateMax: targetDates.max,
    matches: expected.size === sourceRows.length && actual.size === targetRows.length &&
      !missingIds.length && !unexpectedIds.length && !payloadMismatches.length &&
      sourceDates.min === targetDates.min && sourceDates.max === targetDates.max,
  }
}

function writeMigrationReports(backupPath, report) {
  const jsonPath = path.join(backupPath, 'migration-report.json')
  const textPath = path.join(backupPath, 'migration-report.txt')
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))
  const lines = [
    `Migration status: ${report.status}`,
    `Database: ${report.database}`,
    `Data snapshot: ${report.backupPath}`,
    `Snapshot files: ${report.backupFileCount ?? 0}`,
    `Resource records imported: ${report.importedRecords ?? 0}`,
    `Malformed rows: ${report.malformedRows?.length ?? 0}`,
    `Duplicate keys: ${Array.isArray(report.duplicateSourceRecords) ? report.duplicateSourceRecords.length : report.duplicateSourceRecords ?? 0}`,
    `Failed imports: ${report.failedImports?.length ?? 0}`,
    `Foreign-key violations: ${report.foreignKeyViolations?.length ?? 0}`,
    `Reconciliation mismatches: ${report.reconciliation?.filter((entry) => entry.matches === false).length ?? 0}`,
    ...((report.error && [`Error: ${report.error}`]) || []),
    '',
    'Reconciliation by source/resource/unit:',
    ...(report.reconciliation || []).map((entry) =>
      `${entry.source} ${entry.resource || ''} ${entry.unit || ''}: source=${entry.sourceCount} target=${entry.targetCount} matched=${entry.matches}`.trim(),
    ),
  ]
  fs.writeFileSync(textPath, lines.join('\n') + '\n')
  return { jsonPath, textPath }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function sourceCount(value) {
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object') return Object.keys(value).length
  return 0
}

function hashFile(file) {
  const hash = crypto.createHash('sha256')
  const descriptor = fs.openSync(file, 'r')
  const chunk = Buffer.allocUnsafe(1024 * 1024)
  try {
    let bytesRead
    while ((bytesRead = fs.readSync(descriptor, chunk, 0, chunk.length, null)) > 0) hash.update(chunk.subarray(0, bytesRead))
  } finally {
    fs.closeSync(descriptor)
  }
  return hash.digest('hex')
}

async function backupDataDirectory(dataDir, database) {
  const root = path.join(path.dirname(dataDir), 'data-migration-backups')
  fs.mkdirSync(root, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  let destination = path.join(root, stamp)
  let suffix = 1
  while (fs.existsSync(destination)) destination = path.join(root, `${stamp}-${suffix++}`)
  fs.mkdirSync(destination, { recursive: true })
  const snapshot = path.join(destination, path.basename(dataDir))
  fs.mkdirSync(snapshot, { recursive: true })
  const files = []
  const copyDirectory = (sourceDir, targetDir, relativeDir = '') => {
    fs.mkdirSync(targetDir, { recursive: true })
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      const source = path.join(sourceDir, entry.name)
      const target = path.join(targetDir, entry.name)
      const relative = path.join(relativeDir, entry.name)
      if (entry.isDirectory()) copyDirectory(source, target, relative)
      else if (entry.isFile() && !/^morning-meeting\.db(?:-(?:wal|shm))?$/.test(entry.name)) {
        fs.copyFileSync(source, target)
        files.push({ path: relative.split(path.sep).join('/'), bytes: fs.statSync(target).size, sha256: hashFile(target) })
      }
    }
  }
  copyDirectory(dataDir, snapshot)
  const databaseSnapshot = path.join(snapshot, 'morning-meeting.db')
  try {
    await database.handle.backup(databaseSnapshot)
  } catch (error) {
    error.migrationBackupPath = destination
    throw error
  }
  files.push({ path: 'morning-meeting.db', bytes: fs.statSync(databaseSnapshot).size, sha256: hashFile(databaseSnapshot) })
  for (const file of files) {
    const target = path.join(snapshot, file.path)
    if (fs.statSync(target).size !== file.bytes || hashFile(target) !== file.sha256)
      throw new Error(`Backup verification failed for ${file.path}`)
  }
  const manifest = {
    sourceDirectory: path.basename(dataDir),
    createdAt: new Date().toISOString(),
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  }
  fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2))
  return { path: destination, copied: files.length, totalBytes: manifest.totalBytes }
}

function recordRows(handle, resource) {
  return handle.prepare('SELECT count(*) AS count FROM records WHERE resource = ?').get(resource).count
}

async function migrateJsonDataOnce(dataDir, database) {
  const { handle } = database
  const existing = handle.prepare('SELECT value FROM schema_meta WHERE key = ?').get(MARKER)
  if (existing) return { ...JSON.parse(existing.value), status: 'already_migrated' }

  const backup = await backupDataDirectory(dataDir, database)
  const sourceResults = []
  const sourceValues = new Map()
  for (const resource of RESOURCE_NAMES) {
    const file = path.join(dataDir, `${resource}.json`)
    if (!fs.existsSync(file)) continue
    const value = readJson(file)
    if (!Array.isArray(value)) throw new Error(`${resource}.json must contain an array`)
    sourceValues.set(resource, value)
    sourceResults.push({ source: `${resource}.json`, sourceCount: value.length })
  }

  for (const source of ['users.json', 'sessions.json', 'audit.json', 'backup-clean-audit.json']) {
    const file = path.join(dataDir, source)
    if (!fs.existsSync(file)) continue
    const value = readJson(file)
    const validShape = source === 'sessions.json' ? value && typeof value === 'object' && !Array.isArray(value) : Array.isArray(value)
    if (!validShape) throw new Error(`${source} has an unexpected JSON root shape`)
    sourceValues.set(source, value)
    sourceResults.push({ source, sourceCount: sourceCount(value) })
  }

  const attachmentSources = []
  for (const relative of ['note-files', path.join('archive', 'files')]) {
    const directory = path.join(dataDir, relative)
    if (!fs.existsSync(directory)) continue
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.json')) attachmentSources.push(path.join(directory, entry.name))
    }
  }
  const attachments = attachmentSources.map((file) => ({ file, meta: readJson(file) }))
  sourceResults.push({ source: 'attachment sidecars', sourceCount: attachments.length })

  const archiveDir = path.join(dataDir, 'archive')
  const archives = fs.existsSync(archiveDir)
    ? fs.readdirSync(archiveDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => ({ fileName: entry.name, value: readJson(path.join(archiveDir, entry.name)) }))
    : []
  sourceResults.push({ source: 'archive/*.json', sourceCount: archives.length })

  const duplicateSources = []
  const malformedRows = []
  for (const resource of RESOURCE_NAMES) {
    const rows = sourceValues.get(resource) || []
    const seen = new Set()
    for (const [index, row] of rows.entries()) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        malformedRows.push({ source: `${resource}.json`, index, reason: 'record must be a JSON object' })
        continue
      }
      if (row.id === undefined || row.id === null || String(row.id) === '') {
        malformedRows.push({ source: `${resource}.json`, index, reason: 'record is missing id' })
        continue
      }
      const unit = effectiveUnitForResource(resource, row)
      const key = `${unit}\u0000${row.id}`
      if (seen.has(key)) duplicateSources.push(`${resource}:${unit}:${row.id}`)
      seen.add(key)
    }
  }
  for (const [index, user] of (sourceValues.get('users.json') || []).entries()) {
    if (!user || typeof user !== 'object' || Array.isArray(user) || !user.username)
      malformedRows.push({ source: 'users.json', index, reason: 'user must be an object with username' })
  }
  for (const [token, session] of Object.entries(sourceValues.get('sessions.json') || {})) {
    if (!session || typeof session.username !== 'string' || !session.username)
      malformedRows.push({ source: 'sessions.json', id: token, reason: 'session must contain username' })
  }
  for (const source of ['audit.json', 'backup-clean-audit.json']) {
    for (const [index, entry] of (sourceValues.get(source) || []).entries()) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !entry.id)
        malformedRows.push({ source, index, reason: 'audit entry must be an object with id' })
    }
  }
  for (const { file, meta } of attachments) {
    if (!meta?.id || !meta.name || !Number.isFinite(Number(meta.size)))
      malformedRows.push({ source: path.relative(dataDir, file), reason: 'attachment metadata is incomplete' })
    else if (!fs.existsSync(file.replace(/\.json$/i, '.bin')))
      malformedRows.push({ source: path.relative(dataDir, file), id: meta.id, reason: 'attachment binary is missing' })
  }
  const attachmentIds = new Set(attachments.map(({ meta }) => String(meta?.id || '')))
  for (const [index, note] of (sourceValues.get('notes') || []).entries()) {
    for (const file of note.files || []) {
      if (file?.id && !attachmentIds.has(String(file.id)))
        malformedRows.push({ source: 'notes.json', index, id: file.id, reason: 'note attachment metadata is missing' })
    }
  }
  if (malformedRows.length || duplicateSources.length) {
    const error = new Error(`Preflight validation failed: ${malformedRows.length} malformed row(s), ${duplicateSources.length} duplicate resource key(s)`)
    error.malformedRows = malformedRows
    error.duplicateSourceRecords = duplicateSources
    error.sourceResults = sourceResults
    error.migrationBackupPath = backup.path
    throw error
  }

  const orphanSessions = []
  const users = sourceValues.get('users.json') || []
  const usernames = new Set(users.map((user) => user.username))
  for (const [token, session] of Object.entries(sourceValues.get('sessions.json') || {})) {
    if (!usernames.has(session?.username)) orphanSessions.push(token)
  }

  let importedRecords = 0
  let importedAttachments = 0
  let importedArchives = 0
  let importedAudit = 0
  let importedBackupAudit = 0
  let reconciliation = []
  try {
    handle.transaction(() => {
      for (const { meta } of attachments) {
        if (!meta?.id || !meta.name || !Number.isFinite(Number(meta.size))) throw new Error('Invalid attachment metadata row')
        database.insertAttachment(meta)
        importedAttachments++
      }
      for (const resource of RESOURCE_NAMES) {
        for (const record of sourceValues.get(resource) || []) {
          database.saveRecord(resource, record, effectiveUnitForResource(resource, record))
          importedRecords++
        }
      }
      for (const user of users) {
        if (!user?.username) throw new Error('users.json contains a user without username')
        database.saveUser(user)
      }
      for (const [token, session] of Object.entries(sourceValues.get('sessions.json') || {})) {
        if (!session || typeof session.username !== 'string') throw new Error('sessions.json contains an invalid session')
        database.saveSession(token, session)
      }
      for (const entry of sourceValues.get('audit.json') || []) {
        database.insertAudit({
          id: String(entry.id), at: Number(entry.at), type: String(entry.type),
          username: String(entry.username), role: String(entry.role), detail: String(entry.detail),
          ...entry,
        })
        importedAudit++
      }
      for (const entry of sourceValues.get('backup-clean-audit.json') || []) {
        handle.prepare(`
          INSERT INTO backup_clean_audit (id, created_at, admin_user, action, status, payload_json)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO NOTHING
        `).run(String(entry.id), Number(entry.createdAt), entry.admin_user ?? null, entry.action ?? null, entry.status ?? null, JSON.stringify(entry))
        importedBackupAudit++
      }
      for (const { fileName, value } of archives) {
        if (!Array.isArray(value.records)) throw new Error(`Archive ${fileName} has no records array`)
        const archiveHeader = { archivedAt: value.archivedAt, by: value.by, keepUntil: value.keepUntil }
        handle.prepare(`
          INSERT INTO backup_archives (file_name, archived_at, by_username, keep_until, payload_json)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(file_name) DO NOTHING
        `).run(fileName, Number(value.archivedAt), String(value.by || ''), Number(value.keepUntil), JSON.stringify(archiveHeader))
        const insertArchive = handle.prepare(`
          INSERT INTO backup_archive_records (file_name, resource, record_id, unit, deleted_at, deleted_by, record_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(file_name, resource, record_id, unit) DO NOTHING
        `)
        for (const archived of value.records) {
          const resource = String(archived.type || '')
          const record = archived.record
          if (!record?.id) throw new Error(`Archive ${fileName} contains a record without id`)
          const unit = effectiveUnitForResource(resource, record)
          insertArchive.run(fileName, resource, String(record.id), unit, Number(archived.deletedAt) || null, archived.by ?? null, JSON.stringify(record))
          importedArchives++
        }
      }

      const foreignKeyViolations = handle.pragma('foreign_key_check')
      if (foreignKeyViolations.length) {
        const error = new Error(`Foreign-key check failed: ${JSON.stringify(foreignKeyViolations.slice(0, 10))}`)
        error.foreignKeyViolations = foreignKeyViolations
        throw error
      }
      reconciliation = []
      const insertReconciliation = handle.prepare(`
        INSERT INTO migration_reconciliation (
          source, resource, unit, source_count, target_count, missing_ids_json,
          unexpected_ids_json, payload_mismatches_json, source_date_min, source_date_max,
          target_date_min, target_date_max, matched
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const persistReconciliation = (detail) => {
        reconciliation.push(detail)
        insertReconciliation.run(
          detail.source, detail.resource, detail.unit || '', detail.sourceCount, detail.targetCount,
          JSON.stringify(detail.missingIds), JSON.stringify(detail.unexpectedIds), JSON.stringify(detail.payloadMismatches),
          detail.sourceDateMin, detail.sourceDateMax, detail.targetDateMin, detail.targetDateMax, detail.matches ? 1 : 0,
        )
      }
      for (const resource of RESOURCE_NAMES) {
        const sourceRows = sourceValues.get(resource) || []
        const targets = handle.prepare(`
          SELECT id, unit, payload_json, anchor_day FROM records WHERE resource = ?
        `).all(resource)
        for (const unit of UNITS) {
          const expected = sourceRows.filter((record) => effectiveUnitForResource(resource, record) === unit)
          const actual = targets.filter((record) => record.unit === unit)
          persistReconciliation(comparePayloadSet(
            `${resource}.json`, resource, expected, actual,
            (row) => row.id,
            (row) => row,
            (row) => JSON.parse(row.payload_json),
            unit,
          ))
        }
      }
      const compareAndPersist = (source, resource, sourceRows, targetSql, keyOf, sourcePayloadOf = (row) => row) => {
        const targetRows = handle.prepare(targetSql).all()
        persistReconciliation(comparePayloadSet(source, resource, sourceRows, targetRows, keyOf, sourcePayloadOf))
      }
      compareAndPersist('users.json', 'users', users,
        'SELECT username, payload_json FROM users', (row) => row.username)
      const sessionRows = Object.entries(sourceValues.get('sessions.json') || {}).map(([key, payload]) => ({ key, payload }))
      compareAndPersist('sessions.json', 'sessions', sessionRows,
        'SELECT token AS key, payload_json FROM sessions', (row) => row.key, (row) => row.payload)
      compareAndPersist('audit.json', 'audit', sourceValues.get('audit.json') || [],
        'SELECT id, payload_json FROM audit_events', (row) => row.id)
      compareAndPersist('backup-clean-audit.json', 'backup_clean_audit', sourceValues.get('backup-clean-audit.json') || [],
        'SELECT id, payload_json FROM backup_clean_audit', (row) => row.id)
      compareAndPersist('attachment sidecars', 'attachment_metadata', attachments.map(({ meta }) => meta),
        'SELECT id, payload_json FROM attachment_metadata', (row) => row.id)
      const archiveRows = archives.map(({ fileName, value }) => ({
        key: fileName,
        payload: { archivedAt: value.archivedAt, by: value.by, keepUntil: value.keepUntil },
      }))
      compareAndPersist('archive/*.json', 'backup_archives', archiveRows,
        'SELECT file_name AS key, payload_json FROM backup_archives', (row) => row.key, (row) => row.payload)
      const sourceArchiveRecords = archives.flatMap(({ fileName, value }) => (value.records || []).map((entry) => ({
        key: `${fileName}\u0000${entry.type}\u0000${effectiveUnitForResource(entry.type, entry.record)}\u0000${entry.record.id}`,
        payload: entry.record,
      })))
      const targetArchiveRecords = handle.prepare(`
        SELECT file_name || char(0) || resource || char(0) || unit || char(0) || record_id AS key,
          record_json AS payload_json FROM backup_archive_records
      `).all()
      persistReconciliation(comparePayloadSet('archive records', 'backup_archive_records', sourceArchiveRecords,
        targetArchiveRecords, (row) => row.key, (row) => row.payload, (row) => JSON.parse(row.payload_json)))
      for (const { source, sourceCount: count } of sourceResults) {
        let targetCount = null
        if (source.endsWith('.json') && RESOURCE_NAMES.includes(source.slice(0, -5))) targetCount = recordRows(handle, source.slice(0, -5))
        if (source === 'users.json') targetCount = handle.prepare('SELECT count(*) AS count FROM users').get().count
        if (source === 'sessions.json') targetCount = handle.prepare('SELECT count(*) AS count FROM sessions').get().count
        if (source === 'audit.json') targetCount = handle.prepare('SELECT count(*) AS count FROM audit_events').get().count
        if (source === 'backup-clean-audit.json') targetCount = handle.prepare('SELECT count(*) AS count FROM backup_clean_audit').get().count
        if (source === 'attachment sidecars') targetCount = handle.prepare('SELECT count(*) AS count FROM attachment_metadata').get().count
        if (source === 'archive/*.json') targetCount = handle.prepare('SELECT count(*) AS count FROM backup_archives').get().count
        const matches = targetCount === null ? null : count === targetCount
        reconciliation.push({ source, resource: source, unit: '', sourceCount: count, targetCount, missingIds: [], unexpectedIds: [], payloadMismatches: [], sourceDateMin: null, sourceDateMax: null, targetDateMin: null, targetDateMax: null, matches })
      }
      const failed = reconciliation.filter((entry) => entry.matches === false)
      if (failed.length) {
        const error = new Error(`Reconciliation failed: ${JSON.stringify(failed.slice(0, 10))}`)
        error.reconciliation = reconciliation
        error.sourceResults = sourceResults
        throw error
      }

      const report = {
        status: 'migrated',
        database: path.join(dataDir, 'morning-meeting.db'),
        backupPath: backup.path,
        backupFileCount: backup.copied,
        backupBytes: backup.totalBytes,
        sourceResults,
        reconciliation,
        importedRecords,
        importedAttachments,
        importedArchives,
        importedAudit,
        importedBackupAudit,
        orphanSessions: orphanSessions.length,
        orphanSessionTokens: orphanSessions,
        duplicateSourceRecords: duplicateSources,
        duplicateSourceCount: duplicateSources.length,
        malformedRows,
        foreignKeyViolations: [],
        failedImports: [],
        completedAt: Date.now(),
      }
      const saveSource = handle.prepare(`
        INSERT INTO migration_sources (source, source_count, imported_count, skipped_count, issues_json, backup_path, migrated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source) DO UPDATE SET source_count=excluded.source_count,
          imported_count=excluded.imported_count, skipped_count=excluded.skipped_count,
          issues_json=excluded.issues_json, backup_path=excluded.backup_path, migrated_at=excluded.migrated_at
      `)
      for (const result of sourceResults) {
        const target = reconciliation.find((entry) => entry.source === result.source && !entry.unit)?.targetCount ?? result.sourceCount
        saveSource.run(result.source, result.sourceCount, target, Math.max(0, result.sourceCount - target), JSON.stringify([]), backup.path, report.completedAt)
      }
      writeMigrationReports(backup.path, report)
      handle.prepare('INSERT INTO schema_meta (key, value) VALUES (?, ?)').run(MARKER, JSON.stringify(report))
    })()
  } catch (error) {
    error.migrationBackupPath = backup.path
    error.reconciliation ||= reconciliation
    error.sourceResults ||= sourceResults
    throw error
  }

  return JSON.parse(handle.prepare('SELECT value FROM schema_meta WHERE key = ?').get(MARKER).value)
}

export async function migrateJsonData(dataDir, database = openDatabase(dataDir)) {
  try {
    const report = await migrateJsonDataOnce(dataDir, database)
    if (report.backupPath) writeMigrationReports(report.backupPath, report)
    return report
  } catch (error) {
    const report = {
      status: 'failed',
      database: path.join(dataDir, 'morning-meeting.db'),
      backupPath: error.migrationBackupPath || null,
      sourceResults: error.sourceResults || [],
      reconciliation: error.reconciliation || [],
      malformedRows: error.malformedRows || [],
      duplicateSourceRecords: error.duplicateSourceRecords || [],
      duplicateSourceCount: (error.duplicateSourceRecords || []).length,
      failedImports: [{ error: String(error?.message || error) }],
      foreignKeyViolations: error.foreignKeyViolations || [],
      completedAt: Date.now(),
    }
    if (report.backupPath && fs.existsSync(report.backupPath)) {
      try {
        writeMigrationReports(report.backupPath, report)
      } catch (reportError) {
        error.reportWriteError = String(reportError?.message || reportError)
      }
    }
    error.migrationReport = report
    throw error
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath && pathToFileURL(invokedPath).href === import.meta.url) {
  const dataDir = process.env.MM_DATA_DIR ? path.resolve(process.env.MM_DATA_DIR) : path.join(__dirname, 'data')
  const database = openDatabase(dataDir)
  try {
    console.log(JSON.stringify(await migrateJsonData(dataDir, database), null, 2))
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', error: String(error?.message || error), backupPath: error.migrationBackupPath }, null, 2))
    process.exitCode = 1
  } finally {
    database.handle.close()
  }
}
