import { useEffect, useRef, useState } from 'react'
import { CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useT } from '../lib/i18n'

/**
 * A from/to picker that works in months, not days.
 *
 * The KPI dashboard compares whole months against each other, so a day-level range would
 * ask a question it cannot answer — half of June against all of July is not a trend. Only
 * the months the report actually holds are offered, so a range can never come back empty.
 */

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** '2026-06' → 'June 2026'. */
export const monthLong = (m: string): string => {
  const x = /^(\d{4})-(\d{2})$/.exec(m)
  if (!x) return m
  const d = new Date(Number(x[1]), Number(x[2]) - 1, 1)
  return `${d.toLocaleDateString('en-IN', { month: 'long' })} ${x[1]}`
}
/** '2026-06' → 'Jun 2026'. */
export const monthShort = (m: string): string => {
  const x = /^(\d{4})-(\d{2})$/.exec(m)
  return x ? `${MONTH_SHORT[Number(x[2]) - 1]} ${x[1]}` : m
}
/** Every month from `from` to `to`, inclusive. */
export const monthsBetween = (from: string, to: string): string[] => {
  const out: string[] = []
  let [y, m] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) {
      m = 1
      y++
    }
  }
  return out
}

/** The earliest and latest year the stepper will walk to — wide enough to never be a wall. */
const YEAR_MIN = 2000
const YEAR_MAX = 2100

/**
 * A month + year picker: one pill that opens a year stepper over a grid of months.
 *
 * It replaced a pair of native dropdowns, which raised the fair question "so nothing after
 * 2027 can be uploaded?" — a list has to end somewhere, and wherever it ends it reads as a
 * limit. Arrows do not: they walk to any year, so the control makes no claim about which
 * years the app accepts. The grid also puts all twelve months on screen at once, which is
 * one glance instead of a scroll.
 */
export function MonthYearSelect({
  value,
  onChange,
  disabled,
}: {
  /** 'YYYY-MM'. */
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [y] = value.split('-')
  /** The year on the panel, which can be walked without committing a month yet. */
  const [year, setYear] = useState(y)
  useEffect(() => setYear(y), [y])

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const step = (by: number) => {
    const next = Math.min(YEAR_MAX, Math.max(YEAR_MIN, Number(year) + by))
    setYear(String(next))
  }
  const thisMonth = new Date().toISOString().slice(0, 7)
  const arrow =
    'w-7 h-7 grid place-items-center rounded-lg border border-[var(--hairline)] hover:bg-black/5 disabled:opacity-35 transition shrink-0'

  return (
    <div className="relative shrink-0" ref={boxRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-xl border border-[var(--hairline)] text-[13px] font-bold shadow-sm transition disabled:opacity-50 hover:border-indigo-300"
        style={{ background: 'var(--surface)', color: 'var(--ink)' }}
        aria-label={t('Month')}
        aria-expanded={open}
      >
        <CalendarRange size={15} className="shrink-0" style={{ color: '#4f46e5' }} />
        {monthShort(value)}
        <ChevronDown size={14} className="shrink-0" style={{ color: 'var(--ink-hint)' }} />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1 z-50 rounded-xl border border-[var(--hairline)] shadow-2xl p-2.5"
          style={{ background: 'var(--surface)', width: 244 }}
        >
          {/* Year: arrows, not a list — a list would have to end somewhere. */}
          <div className="flex items-center gap-2 pb-2 mb-2 border-b border-[var(--hairline)]">
            <button type="button" onClick={() => step(-1)} disabled={Number(year) <= YEAR_MIN} className={arrow} aria-label={t('Previous')}>
              <ChevronLeft size={15} style={{ color: 'var(--ink-2)' }} />
            </button>
            <div className="flex-1 text-center text-[15px] font-extrabold tabular-nums" style={{ color: 'var(--ink)' }}>
              {year}
            </div>
            <button type="button" onClick={() => step(1)} disabled={Number(year) >= YEAR_MAX} className={arrow} aria-label={t('Next')}>
              <ChevronRight size={15} style={{ color: 'var(--ink-2)' }} />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1">
            {MONTH_SHORT.map((label, i) => {
              const mm = String(i + 1).padStart(2, '0')
              const key = `${year}-${mm}`
              const on = key === value
              const now = key === thisMonth
              return (
                <button
                  type="button"
                  key={label}
                  onClick={() => {
                    onChange(key)
                    setOpen(false)
                  }}
                  className="rounded-lg py-1.5 text-[12.5px] font-bold transition"
                  style={{
                    // The current month keeps a quiet outline when it is not the choice —
                    // useful when the panel has been walked years away from today.
                    background: on ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : 'transparent',
                    color: on ? '#fff' : 'var(--ink-2)',
                    boxShadow: !on && now ? 'inset 0 0 0 1px var(--hairline)' : undefined,
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export function MonthRangePicker({
  months,
  from,
  to,
  onChange,
}: {
  /** Months the report holds, ascending. */
  months: string[]
  from: string
  to: string
  onChange: (from: string, to: string) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  /** Picking a start after the end (or an end before the start) drags the other with it,
   *  so the range can never be back to front. */
  const pickFrom = (m: string) => onChange(m, m > to ? m : to)
  const pickTo = (m: string) => onChange(m < from ? m : from, m)

  const col = (title: string, value: string, pick: (m: string) => void, disabledBefore?: string) => (
    <div className="min-w-0">
      <div className="text-[11px] font-bold uppercase tracking-wide px-1 pb-1" style={{ color: 'var(--ink-hint)' }}>
        {title}
      </div>
      <div className="max-h-[210px] overflow-y-auto scroll-area flex flex-col gap-0.5 pr-1">
        {months.map((m) => {
          const on = m === value
          const dim = disabledBefore !== undefined && m < disabledBefore
          return (
            <button
              key={m}
              onClick={() => pick(m)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-left transition"
              style={{
                background: on ? 'color-mix(in srgb, #4f46e5 14%, var(--surface))' : 'transparent',
                color: on ? '#4338ca' : dim ? 'var(--ink-hint)' : 'var(--ink-2)',
              }}
            >
              {on ? <Check size={13} className="shrink-0" /> : <span className="w-[13px] shrink-0" />}
              {monthShort(m)}
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="relative shrink-0" ref={boxRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-xl bg-white border border-[var(--hairline)] text-slate-700 hover:bg-slate-50 text-[13px] font-semibold shadow-sm transition"
        title={t('Months the KPI Dashboard covers')}
      >
        <CalendarRange size={15} className="text-indigo-600 shrink-0" />
        <span className="truncate max-w-[190px]">
          {from === to ? monthLong(from) : `${monthLong(from)} to ${monthLong(to)}`}
        </span>
        <ChevronDown size={14} className="text-slate-400 shrink-0" />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1 z-40 rounded-xl border border-[var(--hairline)] shadow-2xl p-3"
          style={{ background: 'var(--surface)', width: 300, maxWidth: 'calc(100vw - 16px)' }}
        >
          <div className="grid grid-cols-2 gap-3">
            {col(t('From'), from, pickFrom)}
            {col(t('To'), to, pickTo, from)}
          </div>
          {/* One month is not a range. Say why rather than leaving two lists of one. */}
          {months.length < 2 && (
            <div
              className="mt-2 rounded-lg px-2.5 py-2 text-[11.5px] font-semibold leading-snug"
              style={{ background: 'color-mix(in srgb, #f59e0b 14%, var(--surface))', color: '#a16207' }}
            >
              {t('Only one month has been imported. Import another PD Report to compare months.')}
            </div>
          )}
          <div className="flex items-center gap-2 pt-2.5 mt-2.5 border-t border-[var(--hairline)]">
            <button
              onClick={() => onChange(months[0], months[months.length - 1])}
              className="flex-1 rounded-lg border border-[var(--hairline)] py-1.5 text-[12.5px] font-bold text-slate-600 hover:bg-slate-50"
            >
              {t('All months')}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="flex-1 rounded-lg py-1.5 text-[12.5px] font-bold text-white"
              style={{ background: '#0f172a' }}
            >
              {t('Done')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
