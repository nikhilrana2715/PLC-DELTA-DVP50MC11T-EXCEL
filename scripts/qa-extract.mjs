// Extracts the two QA return workbooks into one compact JSON the dashboard fetches.
// Run: node scripts/qa-extract.mjs   (re-run whenever the source Excel files change)
import XLSX from 'xlsx'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const num = (v) => {
  if (v == null || v === '-' || v === '') return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}
// Excel serial (or dd.mm.yyyy string) -> ISO date (YYYY-MM-DD).
const toISO = (v) => {
  if (typeof v === 'number' && v > 20000) return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10)
  const m = String(v ?? '').match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/)
  if (m) {
    const [, d, mo, y] = m
    const yr = y.length === 2 ? `20${y}` : y
    return `${yr}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return ''
}
// Find a row key whose normalised name matches a predicate (handles \r\n in headers).
const keyOf = (row, pred) => Object.keys(row).find((k) => pred(k.replace(/\s+/g, ' ').trim().toLowerCase()))

// ---- Customer Goods Return 25-26 ----
const skfCandidates = ['QA/Customer Goods Return.xlsx', 'QA/SKF.xlsx']
const skfPath = skfCandidates.map((p) => join(ROOT, p)).find((p) => existsSync(p))
if (!skfPath) throw new Error(`Customer Goods Return file not found (tried: ${skfCandidates.join(', ')})`)
const skfWb = XLSX.readFile(skfPath)
const skfRaw = XLSX.utils.sheet_to_json(skfWb.Sheets[skfWb.SheetNames[0]], { defval: null })
const skf = skfRaw
  .map((r) => {
    const kDate = keyOf(r, (h) => h.includes('received date'))
    const kMonth = keyOf(r, (h) => h === 'month')
    const kCust = keyOf(r, (h) => h.includes('customer'))
    const kItem = keyOf(r, (h) => h === 'item')
    const kQty = keyOf(r, (h) => h === 'quantity')
    const kOk = keyOf(r, (h) => h === 'ok')
    const kRej = keyOf(r, (h) => h.includes('reject'))
    const kChallan = keyOf(r, (h) => h.includes('challan no'))
    const kInv = keyOf(r, (h) => h.includes('invoice no'))
    const iso = toISO(r[kMonth]) || toISO(r[kDate])
    return {
      date: toISO(r[kDate]),
      month: iso ? iso.slice(0, 7) : '',
      customer: String(r[kCust] ?? '').trim().replace(/\s+/g, ' ').toUpperCase(),
      item: String(r[kItem] ?? '').trim(),
      qty: num(r[kQty]),
      ok: num(r[kOk]),
      rejection: num(r[kRej]),
      challan: String(r[kChallan] ?? '').trim(),
      invoice: String(r[kInv] ?? '').trim(),
    }
  })
  .filter((r) => r.item || r.qty)

// ---- MRS Observation Return good ----
const obsWb = XLSX.readFile(join(ROOT, 'QA/MRS Observation Return good.xlsx'))
const obsRaw = XLSX.utils.sheet_to_json(obsWb.Sheets[obsWb.SheetNames[0]], { defval: null })
const obs = obsRaw
  .map((r) => {
    const kDate = keyOf(r, (h) => h.includes('return date'))
    const kMonth = keyOf(r, (h) => h.includes('received month'))
    const kItem = keyOf(r, (h) => h.includes('item name'))
    const kRecv = keyOf(r, (h) => h.includes('received') && h.includes('qty'))
    const kSkfObs = keyOf(r, (h) => h.includes('skf observation'))
    const kMrsObs = keyOf(r, (h) => h.includes('mrs observation'))
    const kOk = keyOf(r, (h) => h.includes('ok') && h.includes('qty') && !h.includes('re-work') && !h.includes('rework'))
    const kRework = keyOf(r, (h) => h.includes('rework qty') || (h.includes('rework') && h.includes('qty')))
    const kArwOk = keyOf(r, (h) => h.includes('after') && h.includes('ok') && !h.includes('n-ok'))
    const kArwNok = keyOf(r, (h) => h.includes('after') && h.includes('n-ok'))
    const iso = toISO(r[kMonth]) || toISO(r[kDate])
    const observation = String(r[kMrsObs] ?? r[kSkfObs] ?? '').trim()
    return {
      date: toISO(r[kDate]),
      month: iso ? iso.slice(0, 7) : '',
      item: String(r[kItem] ?? '').trim(),
      received: num(r[kRecv]),
      observation,
      ok: num(r[kOk]),
      rework: num(r[kRework]),
      afterReworkOk: num(r[kArwOk]),
      afterReworkNok: num(r[kArwNok]),
    }
  })
  .filter((r) => r.observation || r.received)

mkdirSync(join(ROOT, 'public/qa'), { recursive: true })
const out = { generatedAt: new Date().toISOString(), skf, obs }
writeFileSync(join(ROOT, 'public/qa/data.json'), JSON.stringify(out))
console.log(`qa/data.json written — skf: ${skf.length} rows, obs: ${obs.length} rows`)
