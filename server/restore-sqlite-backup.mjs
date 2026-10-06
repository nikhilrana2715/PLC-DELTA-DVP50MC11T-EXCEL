import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

function assertDatabaseIntegrity(databasePath) {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    const integrity = database.pragma('integrity_check')
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok')
      throw new Error(`Database integrity check failed: ${JSON.stringify(integrity.slice(0, 5))}`)
    const violations = database.pragma('foreign_key_check')
    if (violations.length) throw new Error(`Database has foreign-key violations: ${JSON.stringify(violations.slice(0, 5))}`)
    const tables = new Set(database.pragma('table_list').map((row) => row.name))
    if (!tables.has('records') || !tables.has('users') || !tables.has('sessions') || !tables.has('audit_events'))
      throw new Error('Backup database is missing required application tables')
    return database.pragma('user_version', { simple: true })
  } finally {
    database.close()
  }
}

export function restoreSqliteBackup(backupPath, targetDataDir) {
  const source = path.resolve(backupPath)
  const target = path.resolve(targetDataDir)
  const manifestPath = path.join(source, 'manifest.json')
  const snapshotData = path.join(source, 'data')
  if (!fs.existsSync(manifestPath) || !fs.existsSync(snapshotData)) throw new Error('Backup bundle is missing its manifest or data directory')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (manifest.format !== 'morning-meeting-sqlite-backup-v1' || !Array.isArray(manifest.files))
    throw new Error('Unrecognized SQLite backup bundle format')

  const required = new Set(manifest.files.map((file) => file.path))
  if (!required.has('morning-meeting.db')) throw new Error('Backup manifest does not include the SQLite database')
  for (const file of manifest.files) {
    if (path.isAbsolute(file.path) || file.path.split(/[\\/]/).includes('..')) throw new Error(`Unsafe path in backup manifest: ${file.path}`)
    const filePath = path.resolve(snapshotData, file.path)
    if (!filePath.startsWith(path.resolve(snapshotData) + path.sep) || !fs.existsSync(filePath))
      throw new Error(`Backup file is missing or outside the snapshot: ${file.path}`)
    if (fs.statSync(filePath).size !== file.bytes || hashFile(filePath) !== file.sha256)
      throw new Error(`Backup file verification failed: ${file.path}`)
  }
  const schemaVersion = assertDatabaseIntegrity(path.join(snapshotData, 'morning-meeting.db'))

  const parent = path.dirname(target)
  fs.mkdirSync(parent, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const staging = path.join(parent, `${path.basename(target)}.restore-staging-${stamp}`)
  let previous = null
  fs.mkdirSync(staging, { recursive: true })
  try {
    const copyDirectory = (sourceDir, targetDir) => {
      fs.mkdirSync(targetDir, { recursive: true })
      for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        const sourceFile = path.join(sourceDir, entry.name)
        const targetFile = path.join(targetDir, entry.name)
        if (entry.isDirectory()) copyDirectory(sourceFile, targetFile)
        else if (entry.isFile()) fs.copyFileSync(sourceFile, targetFile)
      }
    }
    copyDirectory(snapshotData, staging)
    assertDatabaseIntegrity(path.join(staging, 'morning-meeting.db'))
    for (const file of manifest.files) {
      const copied = path.join(staging, file.path)
      if (fs.statSync(copied).size !== file.bytes || hashFile(copied) !== file.sha256)
        throw new Error(`Staged restore verification failed: ${file.path}`)
    }

    if (fs.existsSync(target)) {
      previous = `${target}.pre-restore-${stamp}`
      let suffix = 1
      while (fs.existsSync(previous)) previous = `${target}.pre-restore-${stamp}-${suffix++}`
      fs.renameSync(target, previous)
    }
    try {
      fs.renameSync(staging, target)
    } catch (error) {
      if (previous && fs.existsSync(previous) && !fs.existsSync(target)) fs.renameSync(previous, target)
      throw error
    }
    return { status: 'restored', targetDataDirectory: target, previousDataDirectory: previous, schemaVersion, restoredFiles: manifest.fileCount }
  } catch (error) {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true })
    throw error
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath && pathToFileURL(invokedPath).href === import.meta.url) {
  const [, , backupPath, targetDataDir] = process.argv
  if (!backupPath || !targetDataDir) {
    console.error('Usage: node server/restore-sqlite-backup.mjs <backup-bundle-directory> <target-data-directory>')
    process.exitCode = 2
  } else {
    try {
      console.log(JSON.stringify(restoreSqliteBackup(backupPath, targetDataDir), null, 2))
    } catch (error) {
      console.error(JSON.stringify({ status: 'failed', error: String(error?.message || error) }, null, 2))
      process.exitCode = 1
    }
  }
}
