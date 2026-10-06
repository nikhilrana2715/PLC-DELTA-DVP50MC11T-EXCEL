import type { ReactNode } from 'react'
import { Sun, Moon } from 'lucide-react'

/** A small coloured pill that labels a Shift 1 / Shift 2 panel. */
export function ShiftBadge({ n }: { n: 1 | 2 }) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm font-bold self-start ${
        n === 1 ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'
      }`}
    >
      {n === 1 ? <Sun size={14} /> : <Moon size={14} />} Shift {n}
    </div>
  )
}

/**
 * When `enabled` (i.e. "Shift 1 & 2 Both" is selected and both shifts have data),
 * shows two labelled panels so the team can tell which shift each issue is from.
 * Otherwise renders the single combined view. `layout='stack'` stacks the two
 * panels vertically (used for wide tables); default is side-by-side columns.
 */
export function ShiftSplit({
  enabled,
  first,
  second,
  single,
  layout = 'cols',
}: {
  enabled: boolean
  first: ReactNode
  second: ReactNode
  single: ReactNode
  layout?: 'cols' | 'stack'
}) {
  if (!enabled) return <>{single}</>
  return (
    <div className={`grid ${layout === 'cols' ? 'lg:grid-cols-2' : 'grid-cols-1'} gap-4 md:gap-5 min-w-0`}>
      <div className="flex flex-col gap-3 min-w-0">
        <ShiftBadge n={1} />
        {first}
      </div>
      <div className="flex flex-col gap-3 min-w-0">
        <ShiftBadge n={2} />
        {second}
      </div>
    </div>
  )
}
