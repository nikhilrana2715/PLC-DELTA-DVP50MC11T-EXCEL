import { useState } from 'react'
import { CalendarRange, X } from 'lucide-react'

export interface DateRange {
  from: string
  to: string
}

const PRESETS = [3, 7, 14, 30]

/** Header control: pick a date range to switch the Dashboard into trend-analysis mode. */
export function DateRangePicker({
  value,
  onApply,
  onClear,
  maxDate,
  align = 'left',
  allowFuture = false,
}: {
  value: DateRange | null
  onApply: (r: DateRange) => void
  onClear: () => void
  maxDate: string
  /** Which edge the popover opens from. Use 'right' when the trigger sits at the far right. */
  align?: 'left' | 'right'
  /** Allow picking dates beyond `maxDate` (e.g. future planning). Presets stay relative to maxDate. */
  allowFuture?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(value?.from ?? '')
  const [to, setTo] = useState(value?.to ?? maxDate)

  const preset = (days: number) => {
    const end = new Date(maxDate + 'T00:00:00')
    const start = new Date(end)
    start.setDate(start.getDate() - (days - 1))
    const f = start.toLocaleDateString('en-CA')
    setFrom(f)
    setTo(maxDate)
    onApply({ from: f, to: maxDate })
    setOpen(false)
  }

  const apply = () => {
    if (!from || !to) return
    const [f, t] = from <= to ? [from, to] : [to, from]
    onApply({ from: f, to: t })
    setOpen(false)
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[13px] font-semibold transition min-w-0 ${
          value
            ? 'bg-indigo-600 border-indigo-600 text-white'
            : 'bg-white border-[var(--hairline)] text-slate-700 hover:bg-slate-50'
        }`}
        title="Analyse a date range"
      >
        <CalendarRange size={14} className="shrink-0" />
        <span className="truncate">
          {value
            ? `${new Date(value.from + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} → ${new Date(
                value.to + 'T00:00:00',
              ).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
            : 'Date range'}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`absolute z-50 top-full ${
              align === 'right' ? 'right-0' : 'right-0 md:left-0'
            } mt-2 w-72 max-w-[90vw] bg-white rounded-2xl shadow-2xl border border-[var(--hairline)] p-3 flex flex-col gap-2.5`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-800">Select date range</span>
              <button onClick={() => setOpen(false)} aria-label="Close">
                <X size={16} className="text-slate-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-500">From</span>
                <input
                  type="date"
                  value={from}
                  max={allowFuture ? (to || undefined) : to || maxDate}
                  onChange={(e) => setFrom(e.target.value)}
                  className="mt-0.5 w-full rounded-lg border border-[var(--hairline)] bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-500">To</span>
                <input
                  type="date"
                  value={to}
                  min={from}
                  max={allowFuture ? undefined : maxDate}
                  onChange={(e) => setTo(e.target.value)}
                  className="mt-0.5 w-full rounded-lg border border-[var(--hairline)] bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((d) => (
                <button
                  key={d}
                  onClick={() => preset(d)}
                  className="text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg px-2 py-1"
                >
                  Last {d}d
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={apply}
                disabled={!from || !to}
                className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold py-2"
              >
                Apply
              </button>
              {value && (
                <button
                  onClick={() => {
                    onClear()
                    setOpen(false)
                  }}
                  className="rounded-xl border border-[var(--hairline)] text-slate-600 text-sm font-semibold px-3 py-2 hover:bg-slate-50"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
