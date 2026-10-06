import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { MachineRow } from '../types'
import type { CpkEntry } from '../lib/cpk'
import { efficiencyColor } from '../lib/palette'
import { MachineDetailBody, MachineDetailHead } from './MachineDetailModal'
import { useT } from '../lib/i18n'

/** One day of a machine: the date it belongs to and every shift row recorded on it. */
export interface CompareDay {
  date: string
  rows: MachineRow[]
}

const fmtDate = (d: string) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
const weekday = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })

const shiftNo = (s: string) => (/2/.test(String(s)) ? 2 : 1)

/** Band colour, darkened/lightened toward the page ink so small text still clears WCAG AA. */
const effInk = (e: number | null) => `color-mix(in srgb, ${efficiencyColor(e)} 46%, var(--ink))`

/** The worst shift of the day — that is the one the repeat flag was raised on. */
const worstRow = (rows: MachineRow[]) =>
  rows.slice().sort((a, b) => (a.efficiency ?? 999) - (b.efficiency ?? 999))[0]

/** Card width in the scroller. Wide enough for the detail card's 3-up stat grid. */
const CARD_W = 372

/** One day's card: the machine's own detail, with the date and a shift switcher on top. */
function DayCard({ day, cpk, label }: { day: CompareDay; cpk: CpkEntry[]; label?: string }) {
  const t = useT()
  const rows = day.rows.slice().sort((a, b) => shiftNo(a.shift) - shiftNo(b.shift))
  // Open on the shift that actually had the problem, not simply the first one.
  const [pick, setPick] = useState(() => {
    const w = worstRow(rows)
    return Math.max(0, rows.findIndex((r) => r === w))
  })
  const row = rows[pick]

  return (
    <div className="flex flex-col rounded-2xl border border-[var(--hairline)] overflow-hidden bg-[var(--surface)] w-full">
      <div className="shrink-0 px-4 py-2 flex items-center gap-2 border-b border-[var(--hairline)] bg-slate-50">
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
          {label ?? weekday(day.date)}
        </span>
        <span className="ml-auto text-base font-extrabold tabular-nums text-slate-800">{fmtDate(day.date)}</span>
      </div>

      {!row ? (
        <div className="py-16 text-center text-sm text-slate-400">{t('No report for this machine on this day.')}</div>
      ) : (
        <>
          <MachineDetailHead row={row} />
          {rows.length > 1 && (
            // Both shifts ran — let the user flip between them without leaving the comparison.
            <div className="shrink-0 flex gap-1.5 px-5 pt-3">
              {rows.map((r, i) => (
                <button
                  key={r.id ?? i}
                  onClick={() => setPick(i)}
                  className={`px-2.5 py-1 rounded-lg text-[11.5px] font-bold transition ${
                    i === pick ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {shiftNo(r.shift) === 1 ? t('Shift 1') : t('Shift 2')}
                  <span className="ml-1.5 tabular-nums" style={{ color: i === pick ? undefined : effInk(r.efficiency) }}>
                    {r.efficiency === null ? '—' : `${r.efficiency}%`}
                  </span>
                </button>
              ))}
            </div>
          )}
          <MachineDetailBody row={row} cpk={cpk} />
        </>
      )}
    </div>
  )
}

/**
 * A repeating issue is a claim across days — "still not fixed since the 10th". Showing only
 * the selected day left the user to remember the rest, so every day in scope sits here side
 * by side, each rendering the very same machine detail card in full.
 *
 * With no date range that is two days (the earlier one and the selected one). With a range
 * active it is EVERY reported day in the range, scrolled horizontally.
 */
export function MachineCompareModal({
  mc,
  days,
  cpk,
  onClose,
}: {
  mc: string
  /** Oldest first. Two entries without a range; every reported day of the range with one. */
  days: CompareDay[]
  cpk: CpkEntry[]
  onClose: () => void
}) {
  const t = useT()
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const first = days[0]
  const last = days[days.length - 1]
  // The trend has to run between days that actually produced. An idle day at either end
  // carries no efficiency, and letting it win would hide the trend entirely.
  const effOf = (d?: CompareDay) => (d?.rows.length ? worstRow(d.rows).efficiency : null)
  const worked = days.filter((d) => effOf(d) !== null)
  const pEff = effOf(worked[0])
  const cEff = effOf(worked[worked.length - 1])
  const delta = worked.length > 1 && pEff !== null && cEff !== null ? cEff - pEff : null
  // Two days read as "earlier vs selected"; more than that and the dates speak for themselves.
  const pair = days.length === 2

  const scrollBy = (dir: number) => scroller.current?.scrollBy({ left: dir * (CARD_W + 16), behavior: 'smooth' })

  return (
    <div
      className="fixed inset-0 z-[65] grid place-items-center p-3 md:p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${mc} day comparison`}
    >
      <div
        className="bento w-full flex flex-col overflow-hidden"
        style={{ maxWidth: 1240, maxHeight: 'min(94vh, 94dvh)', animation: 'rise 0.18s ease both' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center gap-3 px-4 md:px-5 py-3 border-b border-[var(--hairline)]">
          <div className="min-w-0 flex-1">
            <div className="font-extrabold text-slate-800 text-lg leading-tight">{mc}</div>
            <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
              <span>{t('Still unresolved')}</span>
              <b className="tabular-nums">{fmtDate(first?.date)}</b>
              <ArrowRight size={12} />
              <b className="tabular-nums">{fmtDate(last?.date)}</b>
              <span>
                · {days.length} {t('day(s)')}
              </span>
              {delta !== null && (
                <span className="font-bold" style={{ color: effInk(cEff) }}>
                  · {t('Efficiency')} {pEff}% → {cEff}% ({delta >= 0 ? '+' : ''}
                  {delta}%)
                </span>
              )}
            </div>
          </div>
          {/* More days than fit on screen — give the scroller real buttons, not just a drag. */}
          {days.length > 2 && (
            <div className="hidden md:flex items-center gap-1 shrink-0">
              <button
                onClick={() => scrollBy(-1)}
                aria-label="Scroll left"
                className="w-8 h-8 grid place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
              >
                <ChevronLeft size={17} />
              </button>
              <button
                onClick={() => scrollBy(1)}
                aria-label="Scroll right"
                className="w-8 h-8 grid place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
              >
                <ChevronRight size={17} />
              </button>
            </div>
          )}
          <button className="text-slate-400 hover:text-slate-700 p-1 shrink-0" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* One column per day. Two days split the width; more than two scroll sideways.
            On a phone it is always a single stacked column. */}
        <div
          ref={scroller}
          className={`flex-1 min-h-0 overflow-auto overscroll-contain scroll-area p-3 md:p-4 flex flex-col md:flex-row gap-3 md:gap-4 md:items-start ${
            pair ? '' : 'md:snap-x md:snap-mandatory'
          }`}
        >
          {days.map((d, i) => (
            <div
              key={d.date}
              className={`min-w-0 md:snap-start ${pair ? 'md:flex-1' : 'md:shrink-0'}`}
              style={pair ? undefined : { width: `min(100%, ${CARD_W}px)` }}
            >
              <DayCard
                day={d}
                cpk={cpk}
                label={pair ? (i === 0 ? t('Earlier day') : t('Selected day')) : undefined}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
