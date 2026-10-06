import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const resources = ['pdreport', 'routecard']
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

export function benchmarkSqlite(dataDir, runs = 5) {
  const databasePath = path.join(dataDir, 'morning-meeting.db')
  if (!fs.existsSync(databasePath)) throw new Error(`SQLite database not found: ${databasePath}`)
  const database = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    const query = database.prepare(`
      SELECT payload_json FROM records
      WHERE resource = ? AND unit = ? ORDER BY sort_at DESC
    `)
    const results = []
    for (const resource of resources) {
      const units = database.prepare(`
        SELECT unit, count(*) AS records, COALESCE(sum(length(payload_json)), 0) AS payload_bytes
        FROM records WHERE resource = ? GROUP BY unit ORDER BY unit
      `).all(resource)
      for (const unit of units) {
        const samplesMs = []
        let peakHeapDelta = 0
        let responseBytes = 0
        for (let run = 0; run < runs + 1; run++) {
          global.gc?.()
          const before = process.memoryUsage().heapUsed
          const started = performance.now()
          const payloads = query.all(resource, unit.unit).map((row) => JSON.parse(row.payload_json))
          const elapsed = performance.now() - started
          const heapDelta = process.memoryUsage().heapUsed - before
          const size = payloads.reduce((sum, record) => sum + Buffer.byteLength(JSON.stringify(record)), 0)
          if (run > 0) samplesMs.push(elapsed)
          peakHeapDelta = Math.max(peakHeapDelta, heapDelta)
          responseBytes = size
        }
        results.push({
          resource,
          unit: unit.unit,
          records: unit.records,
          payloadBytes: unit.payload_bytes,
          queryAndParseMsMedian: Number(median(samplesMs).toFixed(3)),
          responseBytes,
          peakHeapDeltaBytes: peakHeapDelta,
          runs: samplesMs.length,
        })
      }
    }
    return {
      database: databasePath,
      measuredAt: new Date().toISOString(),
      methodology: 'Read each resource/unit payload in sort order, parse JSON as the current API does; median excludes one warm-up run.',
      results,
    }
  } finally {
    database.close()
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath && pathToFileURL(invokedPath).href === import.meta.url) {
  const dataDir = process.env.MM_DATA_DIR ? path.resolve(process.env.MM_DATA_DIR) : path.join(__dirname, 'data')
  const runs = Math.max(2, Number(process.argv[2]) || 5)
  try {
    console.log(JSON.stringify(benchmarkSqlite(dataDir, runs), null, 2))
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', error: String(error?.message || error) }, null, 2))
    process.exitCode = 1
  }
}
