import { TriangleAlert, MessageSquareWarning, Wrench } from 'lucide-react'
import type { MachineRow } from '../types'
import { efficiencyColor } from '../lib/palette'
import { dominantDowntimeColor } from '../lib/downtime'
import { isSetup, setterLabel, settersFor } from '../lib/setters'
import { useT } from '../lib/i18n'
import type { OnEdit } from './MachineTable'
import { withTarget } from '../lib/unit'

/**
 * A quality-loss figure. Zero is deliberately quiet so the eye lands on the machines that
 * actually lost pieces; the raw amber/red would only reach ~3:1 here, so each hue is mixed
 * toward `--ink` (which flips with the theme) to stay readable.
 */
function Loss({ n, hue }: { n: number; hue: string }) {
  return (
    <b style={{ color: n ? `color-mix(in srgb, ${hue} 46%, var(--ink))` : 'var(--ink-hint)' }}>{n || 0}</b>
  )
}

/**
 * The heart of the morning meeting: every machine below its unit's efficiency target,
 * worst first, each with its remark so the team can discuss root cause.
 */
export function PriorityAlerts({
  machines,
  onEdit,
  onSelect,
}: {
  machines: MachineRow[]
  onEdit?: OnEdit
  /** Click a card to open that machine's full detail. */
  onSelect?: (m: MachineRow) => void
}) {
  const t = useT()
  if (machines.length === 0) {
    return (
      <div className="bento bento-pad">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl grid place-items-center bg-emerald-100 text-emerald-600">
            <TriangleAlert size={20} />
          </div>
          <div>
            <div className="font-bold text-slate-800">{t('All machines on target 🎉')}</div>
            <div className="text-sm text-slate-500">{withTarget(t('No machine is running below 75% efficiency.'))}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bento overflow-hidden rise min-w-0">
      <div className="flex items-center gap-3 px-4 md:px-5 pt-4 pb-3 border-b border-[var(--hairline)]">
        <div className="w-10 h-10 rounded-xl grid place-items-center bg-red-100 text-red-600 shrink-0">
          <TriangleAlert size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800">{withTarget(t('Priority — Below 75% Efficiency'))}</div>
          <div className="text-sm text-slate-500">
            {machines.length} machine{machines.length > 1 ? 's' : ''} need discussion, worst first
          </div>
        </div>
        <span className="pill pill-critical shrink-0">
          <TriangleAlert size={13} /> <span className="hidden sm:inline">{t('Action needed')}</span>
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-2.5 md:gap-3 p-3 md:p-4">
        {machines.map((m) => {
          const remarkColor = m.remark ? dominantDowntimeColor(m.downtime) : undefined
          return (
          <div
            key={m.id}
            className={`rounded-xl border border-red-100 bg-gradient-to-br from-red-50/70 to-white p-3 md:p-3.5 min-w-0 ${
              onSelect ? 'cursor-pointer hover:border-red-200 hover:shadow-sm transition' : ''
            }`}
            onClick={onSelect ? () => onSelect(m) : undefined}
            role={onSelect ? 'button' : undefined}
            title={onSelect ? 'View full machine detail' : undefined}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-bold text-slate-800 shrink-0">{m.mc}</span>
                <span className="text-xs text-slate-400 shrink-0">·</span>
                <span className="text-xs text-slate-500 truncate">{m.operator || '—'}</span>
              </div>
              <span
                className="text-lg font-extrabold tabular-nums shrink-0"
                style={{ color: efficiencyColor(m.efficiency) }}
              >
                {m.efficiency}%
              </span>
            </div>

            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-slate-500">
              <span>Item: <b className="text-slate-700">{m.itemCode || '—'}</b></span>
              <span>Plan: <b className="text-slate-700">{m.runningPlan}</b></span>
              <span>Ach: <b className="text-slate-700">{m.achQty}</b></span>
              <span>Backlog: <b className="text-red-600">{m.backlog}</b></span>
              {/* Quality losses sit beside the output figures: a machine can be under target
                  because it made too little OR because what it made had to be redone. */}
              <span>{t('Rework')}: <Loss n={m.rework} hue="#d97706" /></span>
              <span>{t('Rejection')}: <Loss n={m.rejection} hue="#dc2626" /></span>
            </div>

            {/* efficiency progress bar */}
            <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, m.efficiency ?? 0)}%`,
                  background: efficiencyColor(m.efficiency),
                }}
              />
            </div>

            {m.remark && (
              <div
                className="mt-2.5 flex items-start gap-1.5 text-[12px] text-slate-600 rounded-lg px-2 py-1.5 border"
                style={{
                  background: `color-mix(in srgb, ${remarkColor} 8%, white)`,
                  borderColor: `color-mix(in srgb, ${remarkColor} 25%, white)`,
                }}
              >
                <MessageSquareWarning size={14} className="mt-0.5 shrink-0" style={{ color: remarkColor }} />
                <span className="font-medium">{m.remark}</span>
              </div>
            )}

            {isSetup(m.remark) && (
              <div
                className={`mt-2 flex items-center gap-1.5 text-[12px] rounded-lg px-2 py-1.5 border ${
                  m.setter ? 'bg-indigo-50/70 border-indigo-100' : 'bg-amber-50 border-amber-200'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <Wrench size={13} className="text-indigo-500 shrink-0" />
                <span className="text-slate-500 shrink-0">Setter:</span>
                {onEdit ? (
                  <select
                    className="flex-1 min-w-0 bg-transparent outline-none font-semibold text-slate-800"
                    value={m.setter || ''}
                    onChange={(e) => onEdit(m.id, 'setter', e.target.value)}
                  >
                    <option value="">— select setter —</option>
                    {settersFor(m.group).map((s) => (
                      <option key={s.name} value={s.name}>
                        {setterLabel(s)}
                      </option>
                    ))}
                    {m.setter && !settersFor(m.group).some((s) => s.name === m.setter) && (
                      <option value={m.setter}>{m.setter}</option>
                    )}
                  </select>
                ) : (
                  <b className="text-slate-800">{m.setter || '—'}</b>
                )}
              </div>
            )}
          </div>
          )
        })}
      </div>
    </div>
  )
}
