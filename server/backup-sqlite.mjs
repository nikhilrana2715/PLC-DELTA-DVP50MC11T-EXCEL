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

export async function createSqliteBackup(dataDir, outputRoot = process.env.MM_SQLITE_BACKUP_DIR || path.join(path.dirname(dataDir), 'sqlite-backups')) {
  const absoluteDataDir = path.resolve(dataDir)
  const absoluteOutputRoot = path.resolve(outputRoot)
  const relativeOutput = path.relative(absoluteDataDir, absoluteOutputRoot)
  const outputIsInsideData = relativeOutput === '' ||
    (!path.isAbsolute(relativeOutput) && relativeOutput !== '..' && !relativeOutput.startsWith(`..${path.sep}`))
  if (outputIsInsideData)
    throw new Error('SQLite backup output must be outside the source data directory.')
  const databasePath = path.join(dataDir, 'morning-meeting.db')
  if (!fs.existsSync(databasePath)) throw new Error(`SQLite database not found: ${databasePath}`)
  fs.mkdirSync(absoluteOutputRoot, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  let backupPath = path.join(absoluteOutputRoot, stamp)
  let suffix = 1
  while (fs.existsSync(backupPath)) backupPath = path.join(outputRoot, `${stamp}-${suffix++}`)
  const snapshotData = path.join(backupPath, 'data')
  fs.mkdirSync(snapshotData, { recursive: true })
  const files = []
  const copyDirectory = (sourceDir, targetDir, relativeDir = '') => {
    if (!fs.existsSync(sourceDir)) return
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

  const database = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    const integrity = database.pragma('integrity_check')
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok')
      throw new Error(`Source database integrity check failed: ${JSON.stringify(integrity.slice(0, 5))}`)
    if (database.pragma('foreign_key_check').length)
      throw new Error('Source database has foreign-key violations; refusing backup')
    copyDirectory(dataDir, snapshotData)
    const databaseSnapshot = path.join(snapshotData, 'morning-meeting.db')
    await database.backup(databaseSnapshot)
    files.push({ path: 'morning-meeting.db', bytes: fs.statSync(databaseSnapshot).size, sha256: hashFile(databaseSnapshot) })
  } catch (error) {
    fs.rmSync(backupPath, { recursive: true, force: true })
    throw error
  } finally {
    database.close()
  }

  for (const file of files) {
    const destination = path.join(snapshotData, file.path)
    if (fs.statSync(destination).size !== file.bytes || hashFile(destination) !== file.sha256) {
      fs.rmSync(backupPath, { recursive: true, force: true })
      throw new Error(`Backup verification failed for ${file.path}`)
    }
  }
  const snapshotDatabase = new Database(path.join(snapshotData, 'morning-meeting.db'), { readonly: true, fileMustExist: true })
  let schemaVersion
  try {
    schemaVersion = snapshotDatabase.pragma('user_version', { simple: true })
  } finally {
    snapshotDatabase.close()
  }
  const manifest = {
    format: 'morning-meeting-sqlite-backup-v1',
    createdAt: new Date().toISOString(),
    sourceDataDirectory: absoluteDataDir,
    schemaVersion,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  }
  fs.writeFileSync(path.join(backupPath, 'manifest.json'), JSON.stringify(manifest, null, 2))
  return { status: 'complete', backupPath, fileCount: manifest.fileCount, totalBytes: manifest.totalBytes, schemaVersion: manifest.schemaVersion }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath && pathToFileURL(invokedPath).href === import.meta.url) {
  const dataDir = process.env.MM_DATA_DIR ? path.resolve(process.env.MM_DATA_DIR) : path.join(__dirname, 'data')
  const outputRoot = process.argv[2] ? path.resolve(process.argv[2]) : undefined
  try {
    console.log(JSON.stringify(await createSqliteBackup(dataDir, outputRoot), null, 2))
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', error: String(error?.message || error) }, null, 2))
    process.exitCode = 1
  }
}
