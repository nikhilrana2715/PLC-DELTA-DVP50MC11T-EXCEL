import { useMemo, useState } from 'react'
import { Grid3x3 } from 'lucide-react'
import { CPK_TARGET, cpkColor, type CpkEntry } from '../lib/cpk'
import { MonthYearSelect, monthLong } from './MonthRangePicker'

/**
 * Machine-wise Cp-Cpk for one month — the grid the meeting reads off the wall.
 *
 * Readings are not taken in any order: IG 04 today, IG 20 the day after, IG 04 again a week
 * later. Averaging every reading in the month together would therefore weight the machines
 * that happened to be measured most, so the month is worked out in two steps, the way the
 * plant does it on paper:
 *
 *   1. each machine's own average, across only the dates it was actually measured on
 *   2. the Total Average — the average OF THOSE AVERAGES, one vote per machine
 *
 * A machine never measured that month is not a zero; it is simply not in the grid, and takes
 * no part in the total.
 *
 * Only entered readings count. The Cp-Cpk page carries a measurement forward through every
 * later day the same item keeps running — useful for "what was the process doing on Tuesday",
 * and wrong here: it would repeat one number down a row and drag that machine's average
 * towards whichever reading happened to be carried furthest.
 */

/**
 * Two decimals, rounding halves up.
 *
 * (0.99 + 1.9) / 2 is 1.4449999999999998 in binary, so plain rounding prints 1.44 where the
 * plant's own sheet prints 1.45. The nudge sits far below any figure this page reports and
 * only reaches values already on the boundary.
 */
const round2 = (v: number) => Math.round((v + (v < 0 ? -1e-9 : 1e-9)) * 100) / 100
const show2 = (v: number) => round2(v).toFixed(2)
/** '2026-09-01' to '01/09/2026' — the way the sheet writes its column headings. */
const fmtDay = (d: string) => {
  const [y, m, dd] = d.split('-')
  return y && m && dd ? `${dd}/${m}/${y}` : d
}

interface Row {
  machine: string
  /** Every Cpk read on a given date — more than one when a machine was measured twice. */
  byDate: Map<string, number[]>
  avg: number
  n: number
}

export function CpkMatrix({ entries }: { entries: CpkEntry[] }) {
  // A reading with no Cpk has nothing to average; one with no real date cannot be placed.
  const withCpk = useMemo(
    () =>
      entries.filter(
        (e) => e.cpk !== null && Number.isFinite(e.cpk) && /^\d{4}-\d{2}-\d{2}$/.test(String(e.date)),
      ),
    [entries],
  )
  const months = useMemo(() => [...new Set(withCpk.map((e) => e.date.slice(0, 7)))].sort(), [withCpk])

  // Unpicked, the grid follows the newest month there is a reading for — so a fresh entry in
  // a new month shows up without anyone touching the picker.
  const [picked, setPicked] = useState<string | null>(null)
  const month = picked ?? months[months.length - 1] ?? new Date().toLocaleDateString('en-CA').slice(0, 7)

  const inMonth = useMemo(() => withCpk.filter((e) => e.date.slice(0, 7) === month), [withCpk, month])
  /** Only the dates something was actually measured on — a blank column says nothing. */
  const dates = useMemo(() => [...new Set(inMonth.map((e) => e.date))].sort(), [inMonth])

  const rows = useMemo<Row[]>(() => {
    const byMachine = new Map<string, CpkEntry[]>()
    for (const e of inMonth) {
      const key = e.machine || '—'
      const list = byMachine.get(key)
      if (list) list.push(e)
      else byMachine.set(key, [e])
    }
    return [...byMachine.entries()]
      // 'IG 01' before 'IG 04' before 'IG 11' — plain string order would put IG 11 second.
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([machine, list]) => {
        const byDate = new Map<string, number[]>()
        for (const e of list) {
          const at = byDate.get(e.date)
          if (at) at.push(e.cpk as number)
          else byDate.set(e.date, [e.cpk as number])
        }
        return {
          machine,
          byDate,
          // Every reading of the month counts once — a machine measured twice on one date
          // gets both, which is what "IG 01's average" means on the floor.
          avg: list.reduce((s, e) => s + (e.cpk as number), 0) / list.length,
          n: list.length,
        }
      })
  }, [inMonth])

  const totalAvg = rows.length ? rows.reduce((s, r) => s + r.avg, 0) / rows.length : null

  const cell: React.CSSProperties = {
    border: '1px solid var(--hairline)',
    padding: '6px 10px',
    whiteSpace: 'nowrap',
  }
  const bandTint = 'color-mix(in srgb, #3b82f6 14%, var(--surface))'
  const avgTint = 'color-mix(in srgb, #f59e0b 14%, var(--surface))'
  const totalTint = 'color-mix(in srgb, #10b981 16%, var(--surface))'
  const headBand: React.CSSProperties = { ...cell, background: bandTint, fontWeight: 800, textAlign: 'center' }
  // The two columns worth keeping in view while a month of dates scrolls between them.
  const stickyL: React.CSSProperties = {
    ...cell,
    position: 'sticky',
    left: 0,
    zIndex: 2,
    background: 'var(--surface)',
    fontWeight: 700,
  }
  const stickyR: React.CSSProperties = {
    ...cell,
    position: 'sticky',
    right: 0,
    zIndex: 2,
    background: avgTint,
    textAlign: 'right',
    fontWeight: 800,
  }

  return (
    <div className="bento">
      <div className="flex items-center gap-3 px-4 md:px-5 pt-4 pb-3 border-b border-[var(--hairline)] flex-wrap">
        <div
          className="w-9 h-9 rounded-xl grid place-items-center text-white shrink-0"
          style={{ background: 'linear-gradient(150deg,#b45309,#ea580c 55%,#e11d48)' }}
        >
          <Grid3x3 size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800">Machine-wise Cp-Cpk · {monthLong(month)}</div>
          <div className="text-xs text-slate-500">
            Each machine averaged over the dates it was measured, then the average of those averages · target{' '}
            {CPK_TARGET}
          </div>
        </div>
        <MonthYearSelect value={month} onChange={setPicked} />
      </div>

      <div className="p-3 md:p-4">
        {rows.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-8">
            {withCpk.length === 0 ? 'No Cp-Cpk recorded yet.' : `No reading in ${monthLong(month)}.`}
          </div>
        ) : (
          <div className="scroll-area" style={{ overflow: 'auto' }}>
            <table
              className="text-[12.5px] tabular-nums"
              style={{ borderCollapse: 'separate', borderSpacing: 0, color: 'var(--ink)' }}
            >
              <thead>
                <tr>
                  <th rowSpan={2} style={{ ...stickyL, textAlign: 'left', background: bandTint }}>
                    Machine
                  </th>
                  <th colSpan={dates.length} style={headBand}>
                    Date
                  </th>
                  <th rowSpan={2} style={stickyR}>
                    Average
                  </th>
                </tr>
                <tr>
                  {dates.map((d) => (
                    <th key={d} style={headBand}>
                      {fmtDay(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.machine}>
                    <td style={stickyL}>{r.machine}</td>
                    {dates.map((d) => {
                      const vals = r.byDate.get(d)
                      if (!vals) return <td key={d} style={{ ...cell, textAlign: 'right' }} />
                      const v = vals.reduce((s, x) => s + x, 0) / vals.length
                      const low = round2(v) < CPK_TARGET
                      return (
                        <td
                          key={d}
                          style={{
                            ...cell,
                            textAlign: 'right',
                            color: low ? '#d03b3b' : undefined,
                            fontWeight: low ? 700 : 500,
                          }}
                          title={vals.length > 1 ? `${vals.length} readings that day, averaged` : undefined}
                        >
                          {show2(v)}
                        </td>
                      )
                    })}
                    <td style={{ ...stickyR, color: cpkColor(round2(r.avg)) }} title={`${r.n} reading(s)`}>
                      {show2(r.avg)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td
                    colSpan={dates.length + 1}
                    style={{ ...cell, textAlign: 'right', fontWeight: 800, background: totalTint }}
                  >
                    Total Average
                  </td>
                  <td
                    style={{
                      ...stickyR,
                      background: totalTint,
                      color: totalAvg === null ? undefined : cpkColor(round2(totalAvg)),
                    }}
                    title={`${rows.length} machine(s)`}
                  >
                    {totalAvg === null ? '—' : show2(totalAvg)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
