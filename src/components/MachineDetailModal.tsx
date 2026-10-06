import { X, Wrench, MessageSquareWarning, Target } from 'lucide-react'
import type { MachineRow } from '../types'
import type { CpkEntry } from '../lib/cpk'
import { cpkColor, CPK_TARGET } from '../lib/cpk'
import { efficiencyColor } from '../lib/palette'
import { efficiencyBand, ppm, ppmColor } from '../lib/aggregate'
import { categoryLabel, downtimeColor, reasonLabel, isPreDowntimeReason } from '../lib/downtime'
import { withTarget } from '../lib/unit'
import { getUnit, hasRunningPlan } from '../lib/unit'

const BAND_LABEL: Record<string, string> = {
  critical: 'Below 75%', // the 75 is swapped for the unit's target at render
  warning: 'Watch (75–90%)',
  good: 'On target',
  na: 'No plan',
}
const BAND_PILL: Record<string, string> = {
  critical: 'pill pill-critical',
  warning: 'pill pill-warning',
  good: 'pill pill-good',
  na: 'pill pill-na',
}

/**
 * Accent colour for a stat tile. The raw amber/orange brand hues sit at roughly 3:1 on the
 * tile's pale background — mixing toward `--ink` keeps the hue recognisable while clearing
 * WCAG AA, and works in both themes because `--ink` flips with them.
 */
const accent = (hue: string) => `color-mix(in srgb, ${hue} 46%, var(--ink))`
const effInk = (e: number | null) => accent(efficiencyColor(e))

// A machine that made nothing has no rate to report — a 0 there would read as "perfect",
// so show a dash and leave it in the default ink.
const ppmText = (count: number, made: number) => (made ? ppm(count, made).toLocaleString('en-IN') : '—')
const ppmInk = (count: number, made: number) => (made ? ppmColor(ppm(count, made)) : undefined)

function Stat({ label, value, color, tint }: { label: string; value: string; color?: string; tint?: string }) {
  return (
    <div className={`rounded-xl p-3 text-center ${tint ?? 'bg-slate-50'}`}>
      <div className="text-lg font-extrabold tabular-nums" style={{ color: color ?? 'var(--ink)' }}>
        {value}
      </div>
      <div className="text-[11px] mt-0.5" style={{ color: 'var(--ink-hint)' }}>{label}</div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-[var(--hairline)] last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800 text-right">{value || '—'}</span>
    </div>
  )
}

/**
 * The machine's title line — name, efficiency band, group/shift/operator.
 * `trailing` is whatever the caller wants on the right (a close button, a date, …).
 */
export function MachineDetailHead({ row, trailing }: { row: MachineRow; trailing?: React.ReactNode }) {
  const band = efficiencyBand(row.efficiency)
  return (
    <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-[var(--hairline)]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl font-extrabold text-slate-800">{row.mc}</h2>
          <span className={BAND_PILL[band]}>{withTarget(BAND_LABEL[band])}</span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {row.group} Machine · {row.shift || '1st Shift'} · {row.operator || 'no operator'}
        </div>
      </div>
      {trailing}
    </div>
  )
}

/** Everything about one machine, across all KPIs — the card's contents, without the shell. */
export function MachineDetailBody({ row, cpk }: { row: MachineRow; cpk: CpkEntry[] }) {
  const downtimeEntries = Object.entries(row.downtime).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  // Setup/management items (New Setting, No Material, No Operator) sit ABOVE the
  // "Downtime" list; everything else is the machine's actual downtime below it.
  const preDowntime = downtimeEntries.filter(([reason]) => isPreDowntimeReason(reason))
  const realDowntime = downtimeEntries.filter(([reason]) => !isPreDowntimeReason(reason))
  // Cp-Cpk belongs to this machine ONLY when BOTH the machine AND the item code match
  // the item currently running on it. Same machine + different item, or same item on a
  // different machine → no Cp-Cpk shown (the batch isn't this machine's current work).
  const norm = (s: string | undefined) => String(s ?? '').trim().toUpperCase().replace(/[\s-]/g, '')
  const machineCpk = cpk.filter((c) => norm(c.machine) === norm(row.mc) && norm(c.itemCode) === norm(row.itemCode))

  return (
    <div className="p-4 md:p-5 overflow-auto scroll-area flex flex-col gap-4">
      {/* production stats */}
      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="8hrs Plan" value={String(row.planQty || 0)} tint="tint-blue" />
        {hasRunningPlan(getUnit()) && (
          <Stat label="Actual Running" value={String(row.runningPlan || 0)} tint="tint-blue" />
        )}
        <Stat label="Achievement" value={String(row.achQty || 0)} tint="tint-emerald" />
        <Stat label="Backlog" value={String(row.backlog || 0)} color={accent('#ea580c')} tint="tint-orange" />
        <Stat
          label="Efficiency"
          value={row.efficiency === null ? '—' : `${row.efficiency}%`}
          color={effInk(row.efficiency)}
          tint="tint-violet"
        />
        <Stat label="Cycle Time" value={row.cycleTime === null ? '—' : String(row.cycleTime)} />
      </div>

      {/* quality */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--ink-hint)' }}>Quality</div>
        {/* Counts on one row, the two rates on the next — keeping them apart stops a PPM
            being misread as another piece count. */}
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Rework" value={String(row.rework || 0)} color={accent('#d97706')} tint="tint-yellow" />
          <Stat label="Rejection" value={String(row.rejection || 0)} color={accent('#dc2626')} tint="tint-red" />
          <Stat label="Turning Rej" value={String(row.turningRejection || 0)} color={accent('#ea580c')} tint="tint-red" />
        </div>
        <div className="grid grid-cols-2 gap-2.5 mt-2.5">
          <Stat label="Rework PPM" value={ppmText(row.rework, row.achQty)} color={ppmInk(row.rework, row.achQty)} tint="tint-yellow" />
          <Stat label="Rejection PPM" value={ppmText(row.rejection, row.achQty)} color={ppmInk(row.rejection, row.achQty)} tint="tint-red" />
        </div>
      </div>

      {/* info */}
      <div className="rounded-xl border border-[var(--hairline)] px-3.5 py-1">
        <Info label="Item Code" value={row.itemCode} />
        <Info label="Operator" value={row.operator} />
        <Info label="Setter" value={row.setter} />
        <Info label="Shift" value={row.shift} />
      </div>

      {/* remark */}
      {row.remark && (
        <div className="flex items-start gap-2 text-sm text-slate-700 bg-amber-50 rounded-xl px-3 py-2.5 border border-amber-100">
          <MessageSquareWarning size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <span className="font-medium">{row.remark}</span>
        </div>
      )}

      {/* downtime — setup/management items (New Setting, No Material, No Operator)
          first, then the "Downtime" header + the machine's actual downtime */}
      {downtimeEntries.length > 0 && (
        <div>
          {preDowntime.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-2.5">
              {preDowntime.map(([reason, mins]) => (
                <div key={reason} className="flex items-center gap-2 text-sm">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: downtimeColor(reason) }} />
                  <span className="text-slate-700 flex-1">{reasonLabel(reason)}</span>
                  <span className="text-[11px]" style={{ color: 'var(--ink-hint)' }}>{categoryLabel(reason)}</span>
                  <span className="font-semibold text-slate-800 tabular-nums">{mins} min</span>
                </div>
              ))}
            </div>
          )}
          {realDowntime.length > 0 && (
            <>
              <div className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--ink-hint)' }}>Downtime</div>
              <div className="flex flex-col gap-1.5">
                {realDowntime.map(([reason, mins]) => (
                  <div key={reason} className="flex items-center gap-2 text-sm">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: downtimeColor(reason) }} />
                    <span className="text-slate-700 flex-1">{reasonLabel(reason)}</span>
                    <span className="text-[11px]" style={{ color: 'var(--ink-hint)' }}>{categoryLabel(reason)}</span>
                    <span className="font-semibold text-slate-800 tabular-nums">{mins} min</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* cp-cpk */}
      {machineCpk.length > 0 && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide mb-2 flex items-center gap-1" style={{ color: 'var(--ink-hint)' }}>
            <Target size={12} /> Cp-Cpk
          </div>
          <div className="flex flex-col gap-1.5">
            {machineCpk.map((c) => (
              <div key={c.id} className="flex items-center gap-3 text-sm rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-slate-500 flex-1">
                  {c.batchNo || 'batch'} · {c.itemCode || row.itemCode}
                </span>
                <span className="text-slate-600">Cp {c.cp ?? '—'}</span>
                <span className="font-bold" style={{ color: cpkColor(c.cpk) }}>
                  Cpk {c.cpk ?? '—'}
                  {c.cpk !== null && c.cpk < CPK_TARGET ? ' ▼' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {machineCpk.length === 0 && downtimeEntries.length === 0 && !row.remark && (
        <div className="text-xs text-center py-1" style={{ color: 'var(--ink-hint)' }}>
          <Wrench size={13} className="inline mr-1" /> No downtime, remark or Cp-Cpk recorded for this machine.
        </div>
      )}
    </div>
  )
}

/** Everything about one machine, in its own modal. */
export function MachineDetailModal({
  row,
  cpk,
  onClose,
}: {
  row: MachineRow
  cpk: CpkEntry[]
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '88vh', animation: 'rise 0.18s ease both' }}
        onClick={(e) => e.stopPropagation()}
      >
        <MachineDetailHead
          row={row}
          trailing={
            <button className="text-slate-400 hover:text-slate-700 shrink-0" onClick={onClose} aria-label="Close">
              <X size={22} />
            </button>
          }
        />
        <MachineDetailBody row={row} cpk={cpk} />
      </div>
    </div>
  )
}
