/**
 * Reading a date out of an Excel cell.
 *
 * These workbooks store dates as serials that are a hair short of midnight — SheetJS hands
 * back `2026-06-30T18:29:50.000Z` for a cell Excel itself displays as `01/07/2026`. In IST
 * that instant is 30 June 23:59:50, ten seconds before the day turns. Taking the calendar
 * parts of it therefore reports the WRONG DAY, one behind the sheet, for every single row.
 *
 * Rounding to the nearest midnight instead of truncating to it fixes that: 23:59:50 snaps
 * forward to the 1st, while a date that really is midnight stays put. The rounding happens in
 * local time, because that is the clock the plant's dates were typed against.
 */

const pad = (n: number) => String(n).padStart(2, '0')
const DAY = 86_400_000

/** yyyy-mm-dd from a Date, an Excel serial, or dd/mm/yyyy text. Empty string when unreadable. */
export function isoFromExcel(v: unknown): string {
  if (v instanceof Date) return snap(v.getTime() - v.getTimezoneOffset() * 60_000)

  // Excel serial: days since 1899-12-30, so this lands on UTC midnight already.
  if (typeof v === 'number' && v > 20_000) return snap((v - 25569) * DAY)

  const s = String(v ?? '').trim()
  const m = s.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/)
  if (m) {
    const [, d, mo, y] = m
    const yy = y.length === 2 ? `20${y}` : y
    return `${yy}-${pad(Number(mo))}-${pad(Number(d))}`
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

/** Round a "local midnight" timestamp to the nearest whole day and format it. */
function snap(localMs: number): string {
  const d = new Date(Math.round(localMs / DAY) * DAY)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
