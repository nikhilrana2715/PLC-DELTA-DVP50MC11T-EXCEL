import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { effectiveUnitForResource, openDatabase, RESOURCE_NAMES } from './database.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const validAttachmentId = (id) => /^[a-f0-9]{24}$/.test(String(id || ''))

export function restoreExport(dataFile, filesDir, dataDir = process.env.MM_DATA_DIR ? path.resolve(process.env.MM_DATA_DIR) : path.join(__dirname, 'data')) {
  const exported = JSON.parse(fs.readFileSync(path.resolve(dataFile), 'utf8'))
  if (!Array.isArray(exported)) throw new Error('data.json must contain an array')
  const records = []
  const seen = new Set()
  for (const row of exported) {
    const { type, record } = row || {}
    if (!RESOURCE_NAMES.includes(type)) throw new Error(`Unknown resource type: ${type}`)
    if (!record || record.id === undefined || record.id === null || String(record.id) === '') throw new Error(`${type} record is missing id`)
    const unit = effectiveUnitForResource(type, record)
    const key = `${type}\u0000${unit}\u0000${record.id}`
    if (seen.has(key)) continue
    seen.add(key)
    records.push({ type, record, unit })
  }

  const database = openDatabase(dataDir)
  const copiedFiles = []
  try {
    const missing = records.filter(({ type, record, unit }) => !database.getRecord(type, record.id, unit))
    const attachments = new Map()
    const sourceDirectory = filesDir ? path.resolve(filesDir) : null
    for (const { type, record } of missing) {
      if (type !== 'notes') continue
      for (const file of record.files || []) {
        if (!file.id || attachments.has(file.id)) continue
        if (!validAttachmentId(file.id)) throw new Error(`Invalid attachment id in note ${record.id}`)
        if (!file.name || !Number.isFinite(Number(file.size)) || !file.type) throw new Error(`Incomplete attachment metadata for ${file.id}`)
        const target = path.join(dataDir, 'note-files', `${file.id}.bin`)
        let source = null
        if (sourceDirectory && fs.existsSync(sourceDirectory)) {
          source = fs.readdirSync(sourceDirectory, { withFileTypes: true })
            .find((entry) => entry.isFile() && entry.name.startsWith(`${file.id}-`))
          source = source ? path.join(sourceDirectory, source.name) : null
        }
        if (!source && !fs.existsSync(target)) throw new Error(`Backup file for attachment ${file.id} is missing`)
        attachments.set(file.id, {
          source,
          target,
          meta: {
            id: file.id,
            name: file.name,
            size: Number(file.size),
            type: file.type,
            by: file.by || record.by || 'unknown',
            at: Number(file.at || record.createdAt) || Date.now(),
          },
        })
      }
    }

    fs.mkdirSync(path.join(dataDir, 'note-files'), { recursive: true })
    for (const attachment of attachments.values()) {
      if (!fs.existsSync(attachment.target) && attachment.source) {
        fs.copyFileSync(attachment.source, attachment.target, fs.constants.COPYFILE_EXCL)
        copiedFiles.push(attachment.target)
      }
    }

    try {
      database.transaction(() => {
        for (const attachment of attachments.values()) database.insertAttachment(attachment.meta)
        for (const { type, record, unit } of missing) database.saveRecord(type, record, unit)
      })()
    } catch (error) {
      for (const file of copiedFiles) fs.rmSync(file, { force: true })
      throw error
    }
    return {
      restored: missing.length,
      skippedExisting: records.length - missing.length,
      restoredAttachments: attachments.size,
      recordsInExport: exported.length,
    }
  } finally {
    database.handle.close()
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath && pathToFileURL(invokedPath).href === import.meta.url) {
  const [, , dataFile, filesDir] = process.argv
  if (!dataFile) {
    console.error('Usage: node server/restore-backup-json.mjs <extracted-data.json> [extracted-files-directory]')
    process.exitCode = 2
  } else {
    try {
      const report = restoreExport(dataFile, filesDir)
      console.log(JSON.stringify({ status: 'restored', ...report }, null, 2))
    } catch (error) {
      console.error(JSON.stringify({ status: 'failed', error: String(error?.message || error) }, null, 2))
      process.exitCode = 1
    }
  }
}
