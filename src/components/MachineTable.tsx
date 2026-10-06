import { useRef } from 'react'
import { TriangleAlert, Trash2, Wrench } from 'lucide-react'
import type { MachineRow } from '../types'
import { efficiencyBand } from '../lib/aggregate'
import { isSetup, setterLabel, settersFor } from '../lib/setters'
import { useT } from '../lib/i18n'
import { HScrollButtons } from './HScrollButtons'
import { withTarget } from '../lib/unit'
import { getUnit, hasRunningPlan } from '../lib/unit'

const BAND_PILL: Record<string, string> = {
  critical: 'pill pill-critical',
  warning: 'pill pill-warning',
  good: 'pill pill-good',
  na: 'pill pill-na',
}
const BAND_LABEL: Record<string, string> = {
  critical: 'Below 75%', // the 75 is swapped for the unit's target at render
  warning: 'Watch',
  good: 'On target',
  na: 'No plan',
}

/** Hover text: every downtime reason and its value, one per line. */
function downtimeBreakdown(dt: Record<string, number>): string {
  const lines = Object.entries(dt || {})
    .filter(([, v]) => v > 0)
    .map(([reason, v]) => `${reason}: ${v}`)
  return lines.length ? lines.join('\n') : 'Downtime'
}

/** Fields that can be edited inline and their input kind. */
export type EditableField =
  | 'mc'
  | 'itemCode'
  | 'operator'
  | 'cycleTime'
  | 'planQty'
  | 'runningPlan'
  | 'achQty'
  | 'backlog'
  | 'efficiency'
  | 'rework'
  | 'rejection'
  | 'turningRejection'
  | 'remark'
  | 'setter'

export type OnEdit = (id: number, field: EditableField, value: string) => void

/** Setter picker — options come from the machine's own section (no confusion). */
export function SetterCell({ row, onEdit }: { row: MachineRow; onEdit?: OnEdit }) {
  const setup = isSetup(row.remark)
  const setter = row.setter || ''
  if (!setup && !setter) return <span className="text-slate-300">—</span>

  const options = settersFor(row.group)
  if (!onEdit) {
    return (
      <span className={setter ? 'text-slate-700 font-medium' : 'text-amber-600'}>
        {setter || 'pick setter'}
      </span>
    )
  }
  return (
    <select
      className={`cell-input txt ${!setter ? 'text-amber-600' : ''}`}
      value={setter}
      onChange={(e) => onEdit(row.id, 'setter', e.target.value)}
      title="Who did the setup?"
    >
      <option value="">— setter —</option>
      {options.map((s) => (
        <option key={s.name} value={s.name}>
          {setterLabel(s)}
        </option>
      ))}
      {setter && !options.some((s) => s.name === setter) && <option value={setter}>{setter}</option>}
    </select>
  )
}

function Num({
  value,
  id,
  field,
  onEdit,
  className = '',
}: {
  value: number | null
  id: number
  field: EditableField
  onEdit?: OnEdit
  className?: string
}) {
  if (!onEdit) {
    return <span className={className}>{value === null || value === 0 ? '—' : value}</span>
  }
  return (
    <input
      className={`cell-input num ${className}`}
      inputMode="decimal"
      value={value === null ? '' : String(value)}
      onFocus={(e) => e.target.select()}
      onChange={(e) => onEdit(id, field, e.target.value)}
    />
  )
}

function Txt({
  value,
  id,
  field,
  onEdit,
  className = '',
}: {
  value: string
  id: number
  field: EditableField
  onEdit?: OnEdit
  className?: string
}) {
  if (!onEdit) return <span className={className}>{value || '—'}</span>
  return (
    <input
      className={`cell-input txt ${className}`}
      value={value}
      onChange={(e) => onEdit(id, field, e.target.value)}
    />
  )
}

/**
 * Left-side machine register. Rows are pre-sorted so critical (under target) machines
 * appear first. When `onEdit` is supplied every value cell becomes editable and
 * the whole dashboard recomputes live.
 */
export function MachineTable({
  rows,
  dense = false,
  onEdit,
  onDelete,
  scrollRef,
}: {
  rows: MachineRow[]
  dense?: boolean
  onEdit?: OnEdit
  onDelete?: (id: number) => void
  /**
   * Hand in a ref and the caller's own arrows drive this table — that is how the Machine
   * Register pages one pair of buttons across both shifts. Left out, the table shows its
   * own pair, which is what the preview modals need.
   */
  scrollRef?: React.MutableRefObject<HTMLDivElement | null>
}) {
  const t = useT()
  // The Shell and Roller sheets have no Actual Running Plan, so the column is left out there.
  const runningPlan = hasRunningPlan(getUnit())
  const ownRef = useRef<HTMLDivElement | null>(null)
  const ref = scrollRef ?? ownRef
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 pb-2">
        <span className="text-[11.5px] font-semibold" style={{ color: 'var(--ink-hint)' }}>
          {rows.length} {t(rows.length === 1 ? 'machine' : 'machines')}
        </span>
        {!scrollRef && <HScrollButtons scrollRef={ownRef} />}
      </div>
      <div ref={ref} className="scroll-area" style={{ overflow: 'auto', maxHeight: dense ? 520 : undefined }}>
      <table className="tbl tbl--grid">
        <thead>
          <tr>
            <th>{t('M/C')}</th>
            <th>{t('Item Code')}</th>
            <th>{t('Operator')}</th>
            <th className="text-right">{t('Cycle')}</th>
            <th className="text-right">{t('Plan')}</th>
            {runningPlan && <th className="text-right">{t('Running')}</th>}
            <th className="text-right">{t('Ach Qty')}</th>
            <th className="text-right">{t('Backlog')}</th>
            <th className="text-right">{t('Eff %')}</th>
            <th className="text-right">{t('Rework')}</th>
            <th className="text-right">{t('Reject')}</th>
            <th className="text-right">{t('Turn.Rej')}</th>
            <th className="text-right dt-col">{t('Downtime')}</th>
            <th>{t('Status')}</th>
            <th>{t('Remark')}</th>
            <th>
              <span className="inline-flex items-center gap-1">
                <Wrench size={12} /> {t('Setter')}
              </span>
            </th>
            {onDelete && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const band = efficiencyBand(r.efficiency)
            return (
              <tr key={r.id} className={r.isCritical ? 'row-critical' : ''}>
                <td className="font-semibold text-slate-800 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    {r.isCritical && <TriangleAlert size={13} className="text-red-500 shrink-0" />}
                    <Txt value={r.mc} id={r.id} field="mc" onEdit={onEdit} className="font-semibold" />
                  </span>
                </td>
                <td className="text-slate-500 whitespace-nowrap">
                  <Txt value={r.itemCode} id={r.id} field="itemCode" onEdit={onEdit} />
                </td>
                <td className="text-slate-600 whitespace-nowrap">
                  <Txt value={r.operator} id={r.id} field="operator" onEdit={onEdit} />
                </td>
                <td className="text-right text-slate-500">
                  <Num value={r.cycleTime} id={r.id} field="cycleTime" onEdit={onEdit} />
                </td>
                <td className="text-right">
                  <Num value={r.planQty} id={r.id} field="planQty" onEdit={onEdit} />
                </td>
                {runningPlan && (
                  <td className="text-right">
                    <Num value={r.runningPlan} id={r.id} field="runningPlan" onEdit={onEdit} />
                  </td>
                )}
                <td className="text-right font-medium">
                  <Num value={r.achQty} id={r.id} field="achQty" onEdit={onEdit} />
                </td>
                <td className="text-right text-orange-600 font-medium">
                  <Num value={r.backlog} id={r.id} field="backlog" onEdit={onEdit} />
                </td>
                <td className="text-right font-bold tabular-nums">
                  <Num value={r.efficiency} id={r.id} field="efficiency" onEdit={onEdit} />
                </td>
                <td className="text-right text-amber-600">
                  <Num value={r.rework} id={r.id} field="rework" onEdit={onEdit} />
                </td>
                <td className="text-right text-red-600">
                  <Num value={r.rejection} id={r.id} field="rejection" onEdit={onEdit} />
                </td>
                <td className="text-right text-orange-600">
                  <Num value={r.turningRejection} id={r.id} field="turningRejection" onEdit={onEdit} />
                </td>
                <td className="text-right whitespace-nowrap dt-col">
                  {r.totalDowntime > 0 ? (
                    <span
                      title={downtimeBreakdown(r.downtime)}
                      className="inline-flex items-center gap-1 rounded-md bg-violet-100 text-violet-700 font-semibold px-1.5 py-0.5 cursor-help"
                    >
                      {r.totalDowntime}
                      <span className="text-[10px] font-normal opacity-70">min</span>
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td>
                  <span className={BAND_PILL[band]}>{withTarget(t(BAND_LABEL[band]))}</span>
                </td>
                <td className="text-slate-500" style={{ minWidth: dense ? undefined : 180 }}>
                  <Txt value={r.remark} id={r.id} field="remark" onEdit={onEdit} className="wide" />
                </td>
                <td className={r.isCritical && isSetup(r.remark) && !r.setter ? 'bg-amber-50/60' : ''}>
                  <SetterCell row={r} onEdit={onEdit} />
                </td>
                {onDelete && (
                  <td>
                    <button
                      className="text-slate-300 hover:text-red-600 transition p-1"
                      title={`Delete ${r.mc || 'this row'}`}
                      onClick={() => onDelete(r.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    </div>
  )
}
