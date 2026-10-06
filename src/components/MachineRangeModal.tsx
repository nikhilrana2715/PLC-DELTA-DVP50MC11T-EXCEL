import { useEffect, useMemo } from 'react'
import { CalendarRange, Moon, Sun, X } from 'lucide-react'
import type { MachineRow } from '../types'
import { ppm, ppmColor } from '../lib/aggregate'
import { efficiencyColor } from '../lib/palette'
import { useT } from '../lib/i18n'
import { getUnit, hasRunningPlan } from '../lib/unit'

/**
 * One machine, day by day, across the selected date range.
 *
 * This used to be a twelve-column table. On a range of a week or two that becomes a wall of
 * numbers you have to read sideways, and the eye cannot tell a good day from a bad one. So the
 * period is laid out as one CARD PER DAY instead: the day's efficiency leads, the shifts sit
 * inside it, and the losses only appear when there are any. Nothing scrolls sideways, and the
 * same layout works on a phone.
 */
export function MachineRangeModal({
  mc,
  range,
  rowsForDate,
  dates,
  onClose,
}: {
  mc: string
  range: { from: string; to: string }
  /** All machine rows for one date — already parsed, not yet filtered. */
  rowsForDate: (d: string) => MachineRow[]
  /** Dates inside the range that have a report. */
  dates: string[]
  onClose: () => void
}) {
  const t = useT()
  const shiftNo = (s: string) => (/2/.test(String(s)) ? 2 : 1)

  /** One entry per day, with its shifts inside and the day's own totals. */
  const byDay = useMemo(() => {
    const map = new Map<string, MachineRow[]>()
    for (const d of dates) {
      const mine = rowsForDate(d).filter((r) => r.mc === mc)
      if (mine.length) map.set(d, mine.sort((a, b) => shiftNo(a.shift) - shiftNo(b.shift)))
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, shifts]) => {
        const sum = shifts.reduce(
          (a, r) => ({
            planQty: a.planQty + r.planQty,
            runningPlan: a.runningPlan + r.runningPlan,
            achQty: a.achQty + r.achQty,
            backlog: a.backlog + r.backlog,
            rework: a.rework + r.rework,
            rejection: a.rejection + r.rejection,
          }),
          { planQty: 0, runningPlan: 0, achQty: 0, backlog: 0, rework: 0, rejection: 0 },
        )
        // No running plan on this sheet? Measure against plan qty, as every other view does.
        const effBase = sum.runningPlan > 0 ? sum.runningPlan : sum.planQty
        const eff = effBase > 0 ? Math.round((sum.achQty / effBase) * 100) : null
        const idle = sum.runningPlan === 0 && sum.achQty === 0 && sum.planQty === 0
        return { date, shifts, ...sum, eff, idle }
      })
  }, [mc, dates, rowsForDate])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const fmt = (n: number) => Math.round(n).toLocaleString('en-IN')
  const fmtDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  const weekday = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })

  const total = byDay.reduce(
    (a, d) => ({
      planQty: a.planQty + d.planQty,
      runningPlan: a.runningPlan + d.runningPlan,
      achQty: a.achQty + d.achQty,
      backlog: a.backlog + d.backlog,
      rework: a.rework + d.rework,
      rejection: a.rejection + d.rejection,
    }),
    { planQty: 0, runningPlan: 0, achQty: 0, backlog: 0, rework: 0, rejection: 0 },
  )
  const totalBase = total.runningPlan > 0 ? total.runningPlan : total.planQty
  const totalEff = totalBase > 0 ? Math.round((total.achQty / totalBase) * 100) : null
  const workedDays = byDay.filter((d) => !d.idle).length

  // Raw brand hues read at ~3:1 on a dark surface; mixing toward --ink keeps the meaning and
  // the legibility, without touching the shared palette the rest of the app depends on.
  const ink = (hue: string) => `color-mix(in srgb, ${hue} 46%, var(--ink))`
  const QUIET = 'color-mix(in srgb, var(--ink) 72%, var(--surface))'
  const effInk = (e: number | null) => (e === null ? QUIET : ink(efficiencyColor(e)))
  const tint = (hue: string, pct = 10) => `color-mix(in srgb, ${hue} ${pct}%, var(--surface))`

  const ppmText = (count: number, made: number) => (made ? `${ppm(count, made).toLocaleString('en-IN')} PPM` : '—')

  /** A figure in the top summary strip. */
  const Stat = ({ label, value, sub, colour }: { label: string; value: string; sub?: string; colour?: string }) => (
    // 96px lets five of these sit two rows deep on a phone instead of three, which keeps the
    // day cards above the fold where they belong.
    <div className="min-w-[96px] flex-1 px-2.5 py-1.5 md:px-4 md:py-2.5 rounded-xl" style={{ background: tint('var(--ink)', 4) }}>
      <div className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide" style={{ color: QUIET }}>{label}</div>
      <div className="text-lg md:text-2xl font-extrabold tabular-nums leading-tight" style={{ color: colour ?? 'var(--ink)' }}>{value}</div>
      {sub && <div className="text-[10.5px] md:text-xs font-semibold tabular-nums" style={{ color: QUIET }}>{sub}</div>}
    </div>
  )

  /** Plan → Achievement, with the shortfall underneath. */
  const Flow = ({ plan, running, ach, backlog }: { plan: number; running: number; ach: number; backlog: number }) => (
    <div className="flex items-center gap-3 flex-wrap">
      <Figure label={t('Plan')} value={fmt(running || plan)} note={running && plan && running !== plan ? `${t('of')} ${fmt(plan)}` : undefined} />
      <span className="text-lg leading-none" style={{ color: QUIET }}>→</span>
      <Figure label={t('Achievement')} value={fmt(ach)} strong />
      {backlog > 0 && <Figure label={t('Backlog')} value={fmt(backlog)} colour={ink('#ea580c')} />}
    </div>
  )

  const Figure = ({ label, value, note, strong, colour }: { label: string; value: string; note?: string; strong?: boolean; colour?: string }) => (
    <div className="min-w-0">
      <div className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide" style={{ color: QUIET }}>{label}</div>
      <div className={`tabular-nums leading-tight ${strong ? 'text-lg md:text-xl font-extrabold' : 'text-[15px] md:text-base font-bold'}`} style={{ color: colour ?? 'var(--ink)' }}>
        {value}
        {note && <span className="ml-1 text-[11px] md:text-xs font-semibold" style={{ color: QUIET }}>{note}</span>}
      </div>
    </div>
  )

  /** A loss with its rate — only rendered when there is something to report. */
  const Loss = ({ label, count, made, hue }: { label: string; count: number; made: number; hue: string }) => (
    <span
      className="inline-flex items-baseline gap-1.5 rounded-lg px-2 py-1 md:px-2.5 md:py-1.5"
      style={{ background: tint(hue, 12) }}
      title={`${label} ${fmt(count)} · ${ppmText(count, made)}`}
    >
      <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-wide" style={{ color: QUIET }}>{label}</span>
      <b className="text-[14px] md:text-base tabular-nums" style={{ color: ink(hue) }}>{fmt(count)}</b>
      <span className="text-[11px] md:text-xs font-bold tabular-nums" style={{ color: ppmColor(ppm(count, made)) }}>{ppmText(count, made)}</span>
    </span>
  )

  /** Efficiency as a ring-less bar + number — the day's headline. */
  const Eff = ({ value, big }: { value: number | null; big?: boolean }) => (
    <div className={`flex items-center gap-2 ${big ? '' : 'shrink-0'}`}>
      <span className={`tabular-nums font-extrabold leading-none ${big ? 'text-2xl md:text-3xl' : 'text-[15px] md:text-base'}`} style={{ color: effInk(value) }}>
        {value === null ? '—' : `${value}%`}
      </span>
      <span className={`rounded-full overflow-hidden ${big ? 'h-2 md:h-2.5 w-20 md:w-28' : 'h-1.5 w-12 md:w-16'}`} style={{ background: tint('var(--ink)', 12) }}>
        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, value ?? 0)}%`, background: effInk(value) }} />
      </span>
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center p-3 md:p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${mc} day by day`}
    >
      <div
        className="bento w-full flex flex-col overflow-hidden"
        style={{ maxWidth: 1080, maxHeight: 'min(94vh, 94dvh)', animation: 'rise 0.18s ease both' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---- header ---- */}
        <div className="shrink-0 flex items-center gap-3 px-4 md:px-5 py-3 border-b border-[var(--hairline)]">
          <div className="w-10 h-10 rounded-xl grid place-items-center grad-blue text-white shrink-0">
            <CalendarRange size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-extrabold text-slate-800 text-lg leading-tight">{mc}</div>
            <div className="text-xs" style={{ color: QUIET }}>
              {fmtDay(range.from)} – {fmtDay(range.to)} · {workedDays} {t('working day(s)')} {t('of')} {byDay.length}
            </div>
          </div>
          <button className="text-slate-400 hover:text-slate-700 p-1 shrink-0" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* ---- the period's answer, before the day detail ---- */}
        <div className="shrink-0 flex gap-2 px-4 md:px-5 py-3 border-b border-[var(--hairline)] flex-wrap">
          <Stat
            label={t('Plan Qty')}
            value={fmt(total.planQty)}
            sub={hasRunningPlan(getUnit()) ? `${t('running')} ${fmt(total.runningPlan)}` : undefined}
          />
          <Stat label={t('Achievement')} value={fmt(total.achQty)} sub={`${t('backlog')} ${fmt(total.backlog)}`} colour={ink('#2e9e5b')} />
          <Stat label={t('Efficiency')} value={totalEff === null ? '—' : `${totalEff}%`} colour={effInk(totalEff)} />
          <Stat label={t('Rework')} value={fmt(total.rework)} sub={ppmText(total.rework, total.achQty)} colour={total.rework ? ink('#d97706') : undefined} />
          <Stat label={t('Rejection')} value={fmt(total.rejection)} sub={ppmText(total.rejection, total.achQty)} colour={total.rejection ? ink('#dc2626') : undefined} />
        </div>

        {/* ---- one card per day ---- */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-area px-4 md:px-5 py-3 flex flex-col gap-2.5">
          {byDay.length === 0 && (
            <div className="py-14 text-center text-sm" style={{ color: QUIET }}>
              {t('No entries for this machine in this range.')}
            </div>
          )}

          {byDay.map((d) =>
            d.idle ? (
              // A day with nothing on it needs one quiet line, not a card of dashes.
              <div key={d.date} className="shrink-0 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: tint('var(--ink)', 3) }}>
                <span className="font-bold text-[13px]" style={{ color: QUIET }}>
                  {fmtDay(d.date)} <span className="font-semibold">{weekday(d.date)}</span>
                </span>
                <span className="text-[12.5px] italic" style={{ color: QUIET }}>
                  {t('No production recorded')}
                </span>
              </div>
            ) : (
              <div
                key={d.date}
                // shrink-0 matters: this list is a flex column inside a scroller, and without it
                // the cards are squeezed and their figures clipped once the range gets long.
                className="shrink-0 rounded-xl border overflow-hidden"
                style={{ borderColor: 'var(--hairline)' }}
              >
                {/* day header: the verdict first */}
                <div
                  className="flex items-center gap-3 px-3 md:px-4 py-2 md:py-2.5 border-b"
                  style={{ borderColor: 'var(--hairline)', background: tint(efficiencyColor(d.eff), 7) }}
                >
                  <div className="min-w-0">
                    <div className="font-extrabold text-[15px] md:text-base leading-tight" style={{ color: 'var(--ink)' }}>
                      {fmtDay(d.date)}{' '}
                      <span className="text-[12px] md:text-[13px] font-semibold" style={{ color: QUIET }}>{weekday(d.date)}</span>
                    </div>
                    <div className="text-[11px] md:text-xs font-semibold" style={{ color: QUIET }}>
                      {fmt(d.achQty)} {t('of')} {fmt(d.runningPlan || d.planQty)} {t('pcs')}
                    </div>
                  </div>
                  <div className="ml-auto">
                    <Eff value={d.eff} big />
                  </div>
                </div>

                {/* one block per shift */}
                {d.shifts.map((r, i) => {
                  const sh = shiftNo(r.shift)
                  const blank = r.runningPlan === 0 && r.achQty === 0 && r.planQty === 0
                  return (
                    <div
                      key={`${r.shift}-${i}`}
                      className="px-3 md:px-4 py-2.5 md:py-3 flex flex-col gap-2"
                      style={{ borderTop: i > 0 ? '1px solid var(--hairline)' : undefined, background: i % 2 ? tint('var(--ink)', 2) : undefined }}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 md:px-2.5 py-0.5 text-[10.5px] md:text-[11.5px] font-bold shrink-0"
                          style={
                            sh === 1
                              ? { background: tint('#eda100', 16), color: ink('#b07800') }
                              : { background: tint('#4a3aa7', 16), color: ink('#4a3aa7') }
                          }
                        >
                          {sh === 1 ? <Sun size={11} /> : <Moon size={11} />} {sh === 1 ? t('Shift 1') : t('Shift 2')}
                        </span>
                        {blank ? (
                          <span className="text-[12.5px] italic" style={{ color: QUIET }}>{t('No production recorded')}</span>
                        ) : (
                          <>
                            <span className="font-bold text-[13px] md:text-sm truncate" style={{ color: 'var(--ink)' }} title={r.itemCode}>
                              {r.itemCode || '—'}
                            </span>
                            <span className="text-[12px] md:text-[13px] truncate" style={{ color: QUIET }} title={r.operator}>
                              {r.operator || '—'}
                            </span>
                            <span className="ml-auto">
                              <Eff value={r.efficiency} />
                            </span>
                          </>
                        )}
                      </div>

                      {!blank && (
                        <div className="flex items-center gap-x-5 gap-y-2 flex-wrap">
                          <Flow plan={r.planQty} running={r.runningPlan} ach={r.achQty} backlog={r.backlog} />
                          {(r.rework > 0 || r.rejection > 0) && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {r.rework > 0 && <Loss label={t('Rework')} count={r.rework} made={r.achQty} hue="#d97706" />}
                              {r.rejection > 0 && <Loss label={t('Rejection')} count={r.rejection} made={r.achQty} hue="#dc2626" />}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  )
}
