import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import test from 'node:test'
import { createSqliteBackup } from './backup-sqlite.mjs'
import { migrateJsonData } from './migrate-json-to-sqlite.mjs'
import { openDatabase } from './database.mjs'
import { restoreExport } from './restore-backup-json.mjs'
import { restoreSqliteBackup } from './restore-sqlite-backup.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function makeDataDirectory() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'morning-meeting-test-'))
  const dataDir = path.join(root, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  return { root, dataDir }
}

function writeJson(dataDir, name, value) {
  fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value))
}

function writeMinimalSources(dataDir, { meetings = [], assembly = [], users = [], sessions = {}, audit = [], backupAudit = [] } = {}) {
  writeJson(dataDir, 'meetings.json', meetings)
  writeJson(dataDir, 'assembly.json', assembly)
  writeJson(dataDir, 'users.json', users)
  writeJson(dataDir, 'sessions.json', sessions)
  writeJson(dataDir, 'audit.json', audit)
  writeJson(dataDir, 'backup-clean-audit.json', backupAudit)
  fs.mkdirSync(path.join(dataDir, 'note-files'), { recursive: true })
  fs.mkdirSync(path.join(dataDir, 'archive'), { recursive: true })
}

test('records preserve duplicate IDs across units and failed note references roll back', (t) => {
  const { root, dataDir } = makeDataDirectory()
  const database = openDatabase(dataDir)
  t.after(() => database.handle.close())
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  database.saveRecord('meetings', { id: 'same-id', meetingDate: '2026-10-02', savedAt: 10 }, 'U1')
  database.saveRecord('meetings', { id: 'same-id', meetingDate: '2026-10-02', savedAt: 20 }, 'U2')
  assert.equal(database.listRecords('meetings').length, 2)
  assert.equal(database.listUnitRecords('meetings', 'U1').length, 1)
  assert.equal(database.listUnitRecords('meetings', 'U2').length, 1)

  assert.throws(() => database.saveRecord('notes', {
    id: 'invalid-note', files: [{ id: 'missing-attachment' }],
  }, 'U1'))
  assert.equal(database.getRecord('notes', 'invalid-note', 'U1'), null)
  assert.equal(database.handle.pragma('user_version', { simple: true }), 3)
  assert.deepEqual(database.handle.pragma('foreign_key_check'), [])
})

test('migration preserves payloads and emits exact resource/unit reconciliation', async (t) => {
  const { root, dataDir } = makeDataDirectory()
  const meetingU1 = { id: 'duplicate', unit: 'U1', meetingDate: '2026-10-01', savedAt: 10, rows: [{ machine: 'M1', achievement: 12 }] }
  const meetingU2 = { id: 'duplicate', unit: 'U2', meetingDate: '2026-10-02', savedAt: 20, rows: [{ machine: 'M2', achievement: 34 }] }
  const legacyAssembly = { id: 'legacy-ass', date: '2026-10-03', savedAt: 30, rows: [] }
  const user = {
    username: 'test-user', fullName: 'Test User', email: 'test@example.invalid', phone: '12345',
    employeeId: 'EMP-1', role: 'user', pw: 'salt:existing-scrypt-hash', createdAt: 100,
  }
  const session = { username: user.username, at: 200 }
  const auditEntry = { id: 'event-1', at: 300, type: 'login', username: user.username, role: 'user', detail: 'Test login' }
  writeMinimalSources(dataDir, {
    meetings: [meetingU1, meetingU2],
    assembly: [legacyAssembly],
    users: [user],
    sessions: { token1: session },
    audit: [auditEntry],
  })

  const database = openDatabase(dataDir)
  t.after(() => database.handle.close())
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const report = await migrateJsonData(dataDir, database)
  assert.equal(report.status, 'migrated')
  assert.equal(report.importedRecords, 3)
  assert.equal(report.importedAudit, 1)
  assert.equal(report.reconciliation.filter((entry) => entry.matches === false).length, 0)
  assert.deepEqual(database.getRecord('meetings', 'duplicate', 'U1'), meetingU1)
  assert.deepEqual(database.getRecord('meetings', 'duplicate', 'U2'), meetingU2)
  assert.deepEqual(database.getRecord('assembly', 'legacy-ass', 'ASS'), legacyAssembly)
  assert.equal(database.getRecord('assembly', 'legacy-ass', 'U1'), null)
  assert.equal(database.getUser(user.username).pw, user.pw)
  assert.equal(database.handle.prepare('SELECT password_hash FROM users WHERE username = ?').get(user.username).password_hash, user.pw)
  assert.ok(database.handle.pragma('table_info(users)').some((column) => column.name === 'employee_id'))
  assert.ok(database.handle.pragma('table_list').some((table) => table.name === 'audit_events'))
  assert.equal(database.handle.pragma('user_version', { simple: true }), 3)
  assert.deepEqual(database.getSession('token1'), session)
  assert.deepEqual(database.listAudit(), [auditEntry])

  const rerun = await migrateJsonData(dataDir, database)
  assert.equal(rerun.status, 'already_migrated')
  assert.equal(database.resourceStats().meetings.count, 2)
  assert.equal(database.handle.prepare('SELECT count(*) AS count FROM schema_migrations').get().count, 3)
})

test('QA state persists in SQLite and can be cleared', (t) => {
  const { root, dataDir } = makeDataDirectory()
  const database = openDatabase(dataDir)
  t.after(() => database.handle.close())
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const original = { raw: { generatedAt: '2026-10-04', skf: [{ item: 'A' }], obs: [] }, history: [] }
  database.saveQaData(original)
  assert.deepEqual(database.getQaData(), original)
  assert.equal(database.handle.prepare('SELECT count(*) AS count FROM qa_data').get().count, 1)
  assert.equal(database.deleteQaData(), 1)
  assert.equal(database.getQaData(), null)
  assert.equal(database.handle.pragma('user_version', { simple: true }), 3)
})

test('malformed resource rows abort migration and produce readable failure reports', async (t) => {
  const { root, dataDir } = makeDataDirectory()
  writeMinimalSources(dataDir, { meetings: [{ meetingDate: '2026-10-02' }] })
  const database = openDatabase(dataDir)
  t.after(() => database.handle.close())
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  await assert.rejects(migrateJsonData(dataDir, database), /Preflight validation failed/)
  const manifestPath = path.join(path.dirname(dataDir), 'data-migration-backups')
  const backups = fs.readdirSync(manifestPath)
  assert.equal(backups.length, 1)
  const reportPath = path.join(manifestPath, backups[0], 'migration-report.json')
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  assert.equal(report.status, 'failed')
  assert.match(fs.readFileSync(path.join(manifestPath, backups[0], 'migration-report.txt'), 'utf8'), /Malformed rows: 1/)
  assert.equal(database.handle.prepare('SELECT count(*) AS count FROM records').get().count, 0)
  assert.equal(database.handle.prepare('SELECT count(*) AS count FROM schema_meta').get().count, 0)
})

test('failed record/audit transaction emits no SSE; committed write emits SSE', async (t) => {
  const { root, dataDir } = makeDataDirectory()
  const user = { username: 'sse-test', fullName: 'SSE Test', role: 'admin', email: 'sse@example.invalid', pw: 'salt:hash', createdAt: 100 }
  writeMinimalSources(dataDir, { users: [user], sessions: { 'sse-test-token': { username: user.username, at: 200 } } })
  const portServer = net.createServer()
  portServer.listen(0, '127.0.0.1')
  await once(portServer, 'listening')
  const port = portServer.address().port
  await new Promise((resolve, reject) => portServer.close((error) => error ? reject(error) : resolve()))

  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, MM_DATA_DIR: dataDir, PORT: String(port) },
    stdio: 'ignore',
  })
  let database
  let reader
  try {
    const base = `http://127.0.0.1:${port}`
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      try { ready = (await fetch(`${base}/api/health`)).ok } catch {}
      if (ready) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.ok(ready, 'server did not become ready')

    const eventController = new AbortController()
    const events = await fetch(`${base}/api/events?unit=U1`, { signal: eventController.signal })
    reader = events.body.getReader()
    const decode = new TextDecoder()
    let initial = ''
    for (let attempt = 0; attempt < 20 && !initial.includes('"type":"meetings"'); attempt++) {
      const result = await Promise.race([
        reader.read(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('initial SSE state timed out')), 1000)),
      ])
      if (result.done) throw new Error('SSE stream closed during initial state')
      initial += decode.decode(result.value)
    }
    assert.ok(initial.includes('"type":"meetings"'))

    database = new Database(path.join(dataDir, 'morning-meeting.db'))
    database.exec(`CREATE TRIGGER fail_audit_insert BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'forced audit failure'); END;`)
    const headers = { authorization: 'Bearer sse-test-token', 'X-Unit': 'U1', 'content-type': 'application/json' }
    const failed = await fetch(`${base}/api/meetings`, {
      method: 'POST', headers,
      body: JSON.stringify({ id: 'rolled-back-meeting', meetingDate: '2026-10-02', rows: [] }),
    })
    assert.equal(failed.status, 500)
    assert.equal(database.prepare("SELECT count(*) AS count FROM records WHERE resource='meetings' AND id='rolled-back-meeting'").get().count, 0)
    const pendingEvent = reader.read()
    const noEvent = await Promise.race([
      pendingEvent.then((value) => ({ event: value })),
      new Promise((resolve) => setTimeout(() => resolve({ event: null }), 150)),
    ])
    assert.equal(noEvent.event, null)

    database.exec('DROP TRIGGER fail_audit_insert')
    const saved = await fetch(`${base}/api/meetings`, {
      method: 'POST', headers,
      body: JSON.stringify({ id: 'committed-meeting', meetingDate: '2026-10-02', rows: [] }),
    })
    assert.equal(saved.status, 200)
    const event = await Promise.race([
      pendingEvent,
      new Promise((_, reject) => setTimeout(() => reject(new Error('committed SSE event timed out')), 1500)),
    ])
    assert.ok(decode.decode(event.value).includes('"type":"meetings"'))
    assert.equal(database.prepare("SELECT count(*) AS count FROM records WHERE resource='meetings' AND id='committed-meeting'").get().count, 1)

    const noteCreated = await fetch(`${base}/api/notes`, {
      method: 'POST', headers,
      body: JSON.stringify({ id: 'cleaner-note', date: '2020-01-02', issue: 'Cleaner test', files: [] }),
    })
    assert.equal(noteCreated.status, 200)
    let creationEvents = ''
    for (let attempt = 0; attempt < 5 && !creationEvents.includes('"type":"activity"'); attempt++) {
      const result = await reader.read()
      if (result.done) throw new Error('SSE closed after note create')
      creationEvents += decode.decode(result.value)
    }
    assert.ok(creationEvents.includes('"type":"notes"'))
    assert.ok(creationEvents.includes('"type":"activity"'))
    const preview = await (await fetch(`${base}/api/admin/backup-clean/preview`, {
      method: 'POST', headers,
      body: JSON.stringify({ from: '2020-01-02', to: '2020-01-02', types: ['notes'] }),
    })).json()
    assert.equal(preview.count, 1)
    database.exec(`CREATE TRIGGER fail_clean_audit BEFORE INSERT ON backup_clean_audit BEGIN SELECT RAISE(ABORT, 'forced cleaner audit failure'); END;`)
    const rejectedDeletion = await (await fetch(`${base}/api/admin/backup-clean/delete`, {
      method: 'POST', headers,
      body: JSON.stringify({ from: '2020-01-02', to: '2020-01-02', types: ['notes'], soft: true, expected_count: 1 }),
    })).json()
    let job
    for (let attempt = 0; attempt < 50; attempt++) {
      job = await (await fetch(`${base}/api/admin/backup-clean/job/${rejectedDeletion.job_id}`, { headers })).json()
      if (job.state !== 'running') break
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    assert.equal(job.state, 'failed')
    assert.equal(database.prepare("SELECT count(*) AS count FROM records WHERE resource='notes' AND id='cleaner-note'").get().count, 1)
    const noNotesEvent = reader.read()
    const noNotesBroadcast = await Promise.race([
      noNotesEvent.then((value) => ({ event: value })),
      new Promise((resolve) => setTimeout(() => resolve({ event: null }), 150)),
    ])
    assert.equal(noNotesBroadcast.event, null)
    database.exec('DROP TRIGGER fail_clean_audit')

    const deletion = await (await fetch(`${base}/api/admin/backup-clean/delete`, {
      method: 'POST', headers,
      body: JSON.stringify({ from: '2020-01-02', to: '2020-01-02', types: ['notes'], soft: true, expected_count: 1 }),
    })).json()
    for (let attempt = 0; attempt < 50; attempt++) {
      job = await (await fetch(`${base}/api/admin/backup-clean/job/${deletion.job_id}`, { headers })).json()
      if (job.state !== 'running') break
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    assert.equal(job.state, 'done')
    const archive = (await (await fetch(`${base}/api/admin/backup-clean/archive`, { headers })).json())
      .find((entry) => entry.file === job.archive)
    assert.equal(archive.count, 1)
    const restored = await (await fetch(`${base}/api/admin/backup-clean/restore`, {
      method: 'POST', headers,
      body: JSON.stringify({ file: job.archive }),
    })).json()
    assert.equal(restored.restored, 1)
    assert.ok((await (await fetch(`${base}/api/notes`, { headers })).json()).some((note) => note.id === 'cleaner-note'))
    eventController.abort()
  } finally {
    database?.close()
    await reader?.cancel().catch(() => {})
    child.kill('SIGTERM')
    if (child.exitCode === null) await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 2000))])
    if (child.exitCode === null) child.kill('SIGKILL')
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('QA upload API saves shared QA state in SQLite and guards migration from overwriting it', async () => {
  const { root, dataDir } = makeDataDirectory()
  const qaUser = {
    username: 'qa-test', fullName: 'QA Test', email: 'qa@example.invalid',
    role: 'qa', pw: 'salt:hash', createdAt: 100,
  }
  writeMinimalSources(dataDir, {
    users: [qaUser],
    sessions: { 'qa-test-token': { username: qaUser.username, at: 200 } },
  })
  const portServer = net.createServer()
  portServer.listen(0, '127.0.0.1')
  await once(portServer, 'listening')
  const port = portServer.address().port
  await new Promise((resolve, reject) => portServer.close((error) => error ? reject(error) : resolve()))
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, MM_DATA_DIR: dataDir, PORT: String(port) },
    stdio: 'ignore',
  })
  let database
  try {
    const base = `http://127.0.0.1:${port}`
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      try { ready = (await fetch(`${base}/api/health`)).ok } catch {}
      if (ready) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.ok(ready, 'server did not become ready')

    const headers = { authorization: 'Bearer qa-test-token', 'content-type': 'application/json' }
    assert.equal(await (await fetch(`${base}/api/qa`, { headers })).json(), null)
    const state = {
      raw: { generatedAt: '2026-10-04T00:00:00.000Z', skf: [{ item: 'part-1', qty: 12 }], obs: [], sheets: [] },
      history: [{ id: 'qa-upload-1', at: 10, kind: 'skf', label: 'Goods Return', fileName: 'returns.xlsx', rows: 1 }],
    }
    const saved = await fetch(`${base}/api/qa`, { method: 'POST', headers, body: JSON.stringify(state) })
    assert.equal(saved.status, 200)
    assert.deepEqual(await saved.json(), state)

    database = new Database(path.join(dataDir, 'morning-meeting.db'))
    const stored = JSON.parse(database.prepare('SELECT payload_json FROM qa_data WHERE id = 1').get().payload_json)
    assert.deepEqual(stored, state)

    const upload = {
      id: 'excel-upload-test', uploadDate: '2026-10-04', shift: 'Shift 1',
      fileName: 'production.xlsx', machines: 1, groups: [], downtimeReasons: [], rows: [],
    }
    const uploadResponse = await fetch(`${base}/api/uploads?unit=U1`, {
      method: 'POST', headers, body: JSON.stringify(upload),
    })
    assert.equal(uploadResponse.status, 200)
    const savedUpload = await uploadResponse.json()
    const storedUpload = database.prepare("SELECT payload_json FROM records WHERE resource = 'uploads' AND unit = 'U1' AND id = ?").get(upload.id)
    assert.deepEqual(JSON.parse(storedUpload.payload_json), savedUpload)

    const cpk = {
      id: 'cpk-entry-test', date: '2026-10-04', machine: 'IG-01',
      itemCode: 'part-1', cp: 1.5, cpk: 1.33,
    }
    const cpkResponse = await fetch(`${base}/api/cpk?unit=U1`, {
      method: 'POST', headers, body: JSON.stringify(cpk),
    })
    assert.equal(cpkResponse.status, 200)
    const savedCpk = await cpkResponse.json()
    const storedCpk = database.prepare("SELECT payload_json FROM records WHERE resource = 'cpk' AND unit = 'U1' AND id = ?").get(cpk.id)
    assert.deepEqual(JSON.parse(storedCpk.payload_json), savedCpk)

    const stale = {
      raw: { generatedAt: '2026-10-03T00:00:00.000Z', skf: [{ item: 'legacy-part', qty: 4 }], obs: [], sheets: [] },
      history: [{ id: 'qa-upload-old', at: 9, kind: 'obs', label: 'Observation', fileName: 'old.xlsx', rows: 1 }],
    }
    const migrated = await fetch(`${base}/api/qa/migrate`, { method: 'POST', headers, body: JSON.stringify(stale) })
    assert.equal(migrated.status, 200)
    const merged = await migrated.json()
    assert.deepEqual(merged.raw.skf, [...state.raw.skf, ...stale.raw.skf])
    assert.deepEqual(merged.history.map((entry) => entry.id), ['qa-upload-1', 'qa-upload-old'])
    assert.equal(merged.raw.generatedAt, state.raw.generatedAt)

    const cleared = await fetch(`${base}/api/qa`, { method: 'DELETE', headers })
    assert.equal(cleared.status, 200)
    assert.equal(database.prepare('SELECT count(*) AS count FROM qa_data').get().count, 0)
  } finally {
    database?.close()
    child.kill('SIGTERM')
    if (child.exitCode === null) await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 2000))])
    if (child.exitCode === null) child.kill('SIGKILL')
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('SQLite backup and restore preserve records and attachment binaries together', async (t) => {
  const { root, dataDir } = makeDataDirectory()
  const backupRoot = path.join(root, 'bundles')
  const attachmentId = 'a'.repeat(24)
  const attachmentBytes = Buffer.from('persisted attachment bytes')
  const attachmentDir = path.join(dataDir, 'note-files')
  fs.mkdirSync(attachmentDir, { recursive: true })
  fs.writeFileSync(path.join(attachmentDir, `${attachmentId}.bin`), attachmentBytes)

  const database = openDatabase(dataDir)
  t.after(() => database.handle.close())
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  database.insertAttachment({ id: attachmentId, name: 'report.pdf', size: attachmentBytes.length, type: 'application/pdf', by: 'backup-test', at: 300 })
  database.saveRecord('notes', {
    id: 'backup-note', date: '2026-10-02', issue: 'Backup test',
    files: [{ id: attachmentId, name: 'report.pdf', size: attachmentBytes.length, type: 'application/pdf', by: 'backup-test', at: 300 }],
  }, 'U1')

  const backup = await createSqliteBackup(dataDir, backupRoot)
  assert.equal(backup.status, 'complete')
  const manifest = JSON.parse(fs.readFileSync(path.join(backup.backupPath, 'manifest.json'), 'utf8'))
  assert.ok(manifest.files.some((file) => file.path === `note-files/${attachmentId}.bin`))

  const targetDataDir = path.join(root, 'restored-data')
  fs.mkdirSync(targetDataDir, { recursive: true })
  fs.writeFileSync(path.join(targetDataDir, 'pre-restore-marker.txt'), 'keep as rollback')
  const restore = restoreSqliteBackup(backup.backupPath, targetDataDir)
  assert.equal(restore.status, 'restored')
  assert.ok(fs.existsSync(path.join(restore.previousDataDirectory, 'pre-restore-marker.txt')))
  assert.deepEqual(fs.readFileSync(path.join(targetDataDir, 'note-files', `${attachmentId}.bin`)), attachmentBytes)

  const restoredDatabase = openDatabase(targetDataDir)
  try {
    assert.equal(restoredDatabase.getRecord('notes', 'backup-note', 'U1').issue, 'Backup test')
    assert.equal(restoredDatabase.getAttachment(attachmentId).name, 'report.pdf')
    assert.deepEqual(restoredDatabase.handle.pragma('foreign_key_check'), [])
  } finally {
    restoredDatabase.handle.close()
  }
})

test('Backup Clean JSON export restore imports note payload and attachment bytes', (t) => {
  const { root, dataDir } = makeDataDirectory()
  const extracted = path.join(root, 'extracted')
  const filesDir = path.join(extracted, 'files')
  fs.mkdirSync(filesDir, { recursive: true })
  const attachmentId = 'b'.repeat(24)
  const attachmentBytes = Buffer.from('hard-delete archive attachment')
  const record = {
    id: 'zip-note', unit: 'U1', date: '2020-01-02', issue: 'ZIP restore',
    by: 'zip-test', createdAt: 100,
    files: [{ id: attachmentId, name: 'proof.pdf', size: attachmentBytes.length, type: 'application/pdf', by: 'zip-test', at: 200 }],
  }
  const dataFile = path.join(extracted, 'data.json')
  fs.writeFileSync(dataFile, JSON.stringify([{ type: 'notes', date: record.date, record }]))
  fs.writeFileSync(path.join(filesDir, `${attachmentId}-${record.id}-proof.pdf`), attachmentBytes)

  const report = restoreExport(dataFile, filesDir, dataDir)
  assert.deepEqual(report, { restored: 1, skippedExisting: 0, restoredAttachments: 1, recordsInExport: 1 })
  const database = openDatabase(dataDir)
  try {
    assert.deepEqual(database.getRecord('notes', record.id, 'U1'), record)
    assert.equal(database.getAttachment(attachmentId).name, 'proof.pdf')
    assert.deepEqual(fs.readFileSync(path.join(dataDir, 'note-files', `${attachmentId}.bin`)), attachmentBytes)
    assert.deepEqual(database.handle.pragma('foreign_key_check'), [])
  } finally {
    database.handle.close()
  }
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
})

test('concurrent writer processes retain every committed record', async (t) => {
  const { root, dataDir } = makeDataDirectory()
  const initialized = openDatabase(dataDir)
  initialized.handle.close()
  const moduleUrl = pathToFileURL(path.join(__dirname, 'database.mjs')).href
  const writerCode = `
    import { openDatabase } from '${moduleUrl}'
    const repository = openDatabase(process.env.MM_TEST_DATA)
    try {
      for (let index = 0; index < 40; index++) {
        repository.saveRecord('uploads', { id: process.env.MM_WRITER + '-' + index, uploadDate: '2026-10-02', savedAt: index, rows: [] }, 'U1')
      }
    } finally { repository.handle.close() }
  `
  const writers = ['writer-a', 'writer-b'].map((writer) => spawn(process.execPath, ['--input-type=module', '-e', writerCode], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, MM_TEST_DATA: dataDir, MM_WRITER: writer },
    stdio: 'ignore',
  }))
  const exits = await Promise.all(writers.map((writer) => once(writer, 'exit')))
  for (const [code] of exits) assert.equal(code, 0)
  const database = openDatabase(dataDir)
  try {
    assert.equal(database.resourceStats().uploads.count, 80)
    assert.deepEqual(database.handle.pragma('integrity_check'), [{ integrity_check: 'ok' }])
    assert.deepEqual(database.handle.pragma('foreign_key_check'), [])
  } finally {
    database.handle.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('schema v1 upgrades attachment storage keys and QA state to v3 without recreating the database', (t) => {
  const { root, dataDir } = makeDataDirectory()
  const databasePath = path.join(dataDir, 'morning-meeting.db')
  const legacy = new Database(databasePath)
  legacy.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, purpose TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES (1, '2026-10-02', 'legacy v1');
    CREATE TABLE attachment_metadata (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, size INTEGER NOT NULL, type TEXT NOT NULL,
      by_username TEXT NOT NULL, at INTEGER NOT NULL, payload_json TEXT NOT NULL
    );
    INSERT INTO attachment_metadata VALUES (
      'legacy-attachment', 'legacy.pdf', 10, 'application/pdf', 'test', 100,
      '{"id":"legacy-attachment","name":"legacy.pdf","size":10,"type":"application/pdf","by":"test","at":100}'
    );
    PRAGMA user_version = 1;
  `)
  legacy.close()

  const upgraded = openDatabase(dataDir)
  try {
    assert.equal(upgraded.handle.pragma('user_version', { simple: true }), 3)
    assert.equal(upgraded.handle.prepare('SELECT storage_key FROM attachment_metadata WHERE id = ?').get('legacy-attachment').storage_key, 'legacy-attachment')
    assert.deepEqual(upgraded.handle.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((row) => row.version), [1, 2, 3])
    assert.deepEqual(upgraded.handle.pragma('foreign_key_check'), [])
  } finally {
    upgraded.handle.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
