import { useEffect, useMemo, useState } from 'react'
import { Target, Save, CheckCircle2, Trash2, History, ShieldAlert } from 'lucide-react'
import {
  CPK_TARGET,
  cpkColor,
  cpkSummary,
  sortExpanded,
  type CpkEntry,
  type CpkInput,
  type ExpandedCpk,
  type CpkQualityAlert,
} from '../lib/cpk'
import { setterLabel, settersFor } from '../lib/setters'
import { CpkMatrix } from './CpkMatrix'

function todayISO() {
  // Local calendar date (en-CA = YYYY-MM-DD). toISOString() gives the UTC day, which in
  // IST (+5:30) is still YESTERDAY between 00:00 and 05:30 — the form would default wrong.
  return new Date().toLocaleDateString('en-CA')
}
function fmtDate(d: string) {
  const dt = new Date(d + 'T00:00:00')
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

export interface IgMachine {
  mc: string
  itemCode: string
  operator: string
}

const inputCls =
  'mt-1 w-full rounded-xl border border-[var(--hairline)] px-3 py-2 text-sm outline-none focus:border-indigo-500'

export function CpkView({
  entries,
  expanded,
  alerts,
  igMachinesForDate,
  dateFilter = '',
  machineFilter = 'ALL',
  onSave,
  onDelete,
}: {
  entries: CpkEntry[]
  /** Each entry expanded across every date it's carried forward for (same item, no re-entry). */
  expanded: ExpandedCpk[]
  /** Good Cpk yet rework/rejection happened that day — surfaced inline per row. */
  alerts: CpkQualityAlert[]
  /** IG machines + their item code/operator AS OF a given date — not just today's. */
  igMachinesForDate: (date: string) => IgMachine[]
  /** Header filters for the recorded list. '' = every day, 'ALL' = every machine. */
  dateFilter?: string
  machineFilter?: string
  onSave: (c: CpkInput) => Promise<void> | void
  onDelete?: (id: string) => void
}) {
  const [date, setDate] = useState(todayISO())
  const [machine, setMachine] = useState('')
  const [itemCode, setItemCode] = useState('')
  const [batchNo, setBatchNo] = useState('')
  const [batchQty, setBatchQty] = useState('')
  const [setter, setSetter] = useState('')
  const [operator, setOperator] = useState('')
  const [cp, setCp] = useState('')
  const [cpk, setCpk] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Recomputed every time the form's own Date changes — so the Machine list and its
  // auto-filled Item Code always reflect what was actually running on THAT day, not today.
  const igMachines = useMemo(() => igMachinesForDate(date), [igMachinesForDate, date])

  /*
   * The header's Date / Machine filters, applied once.
   *
   * The four figures at the top and the list under them have to describe the same readings —
   * a machine-filtered table under a plant-wide average is two answers to one question. So
   * the rows are filtered first and everything above is counted off what survived.
   *
   * Rows are filtered by the date they are SHOWN for, carried-forward ones included: asking
   * for a day means "what was the process doing that day", which is exactly what a carried
   * row answers. The summary still counts one entry per measurement, not per day it covers.
   */
  const shownRows = useMemo(
    () =>
      expanded.filter(
        (c) => (!dateFilter || c.forDate === dateFilter) && (machineFilter === 'ALL' || c.machine === machineFilter),
      ),
    [expanded, dateFilter, machineFilter],
  )
  const shownEntries = useMemo(() => {
    const ids = new Set(shownRows.map((c) => c.id))
    return entries.filter((e) => ids.has(e.id))
  }, [entries, shownRows])
  const shownAlerts = useMemo(() => {
    const keys = new Set(shownRows.map((c) => `${c.id}-${c.forDate}`))
    return alerts.filter((a) => keys.has(a.id))
  }, [alerts, shownRows])
  const filterOn = !!dateFilter || machineFilter !== 'ALL'

  const sum = cpkSummary(shownEntries)
  const setters = settersFor('IG')
  const num = (s: string) => (s.trim() === '' ? null : Number(s))
  const canAdd = machine.trim() !== '' && (cp.trim() !== '' || cpk.trim() !== '')

  // auto-fill item code + operator when a known machine is picked
  const onMachine = (v: string) => {
    setMachine(v)
    const m = igMachines.find((x) => x.mc === v)
    if (m) {
      setItemCode(m.itemCode)
      setOperator(m.operator)
    }
  }

  // If the Date is changed AFTER a machine is already picked, re-sync the
  // "auto" fields to that new date too — otherwise they'd keep showing
  // whichever day's item code happened to be filled in first.
  useEffect(() => {
    if (!machine) return
    const m = igMachines.find((x) => x.mc === machine)
    if (m) {
      setItemCode(m.itemCode)
      setOperator(m.operator)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const add = async () => {
    if (!canAdd || saving) return
    setSaving(true)
    setSaveError('')
    try {
      await onSave({
        date,
        machine: machine.trim(),
        itemCode: itemCode.trim(),
        batchNo: batchNo.trim(),
        batchQty: num(batchQty),
        setter: setter.trim(),
        operator: operator.trim(),
        cp: num(cp),
        cpk: num(cpk),
      })
      setMachine('')
      setItemCode('')
      setBatchNo('')
      setBatchQty('')
      setSetter('')
      setOperator('')
      setCp('')
      setCpk('')
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1600)
    } catch (error) {
      setSaveError(String((error as Error)?.message || error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      {/* summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-4">
        <Stat label="Entries" value={String(sum.count)} />
        <Stat label="Avg Cpk" value={sum.avgCpk === null ? '—' : sum.avgCpk.toFixed(2)} color={cpkColor(sum.avgCpk)} />
        <Stat label={`Below ${CPK_TARGET}`} value={String(sum.below)} color={sum.below ? '#d03b3b' : '#0ca30c'} />
        <Stat label="Quality Alerts" value={String(shownAlerts.length)} color={shownAlerts.length ? '#d03b3b' : '#0ca30c'} />
      </div>

      {/* add form */}
      <div className="bento">
        <div className="flex items-center gap-3 px-4 md:px-5 pt-4 pb-3 border-b border-[var(--hairline)]">
          <div className="w-9 h-9 rounded-xl grid place-items-center grad-blue text-white">
            <Target size={18} />
          </div>
          <div className="flex-1">
            <div className="font-bold text-slate-800">Add Cp-Cpk (IG machines)</div>
            <div className="text-xs text-slate-500">Record process capability whenever it is measured</div>
          </div>
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Machine</span>
            <input list="ig-machines" value={machine} onChange={(e) => onMachine(e.target.value)} placeholder="IG-01" className={inputCls} />
            <datalist id="ig-machines">
              {igMachines.map((m) => (
                <option key={m.mc} value={m.mc}>
                  {m.itemCode}
                </option>
              ))}
            </datalist>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Item Code</span>
            <input value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder="auto" className={inputCls} />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Batch No.</span>
            <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="e.g. B-102" className={inputCls} />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Batch Qty</span>
            <input inputMode="numeric" value={batchQty} onChange={(e) => setBatchQty(e.target.value)} placeholder="0" className={`${inputCls} text-right`} />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Setter Name</span>
            <input list="ig-setters" value={setter} onChange={(e) => setSetter(e.target.value)} placeholder="setter" className={inputCls} />
            <datalist id="ig-setters">
              {setters.map((s) => (
                <option key={s.name} value={s.name}>
                  {setterLabel(s)}
                </option>
              ))}
            </datalist>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Operator Name</span>
            <input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="operator" className={inputCls} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Cp</span>
              <input inputMode="decimal" value={cp} onChange={(e) => setCp(e.target.value)} placeholder="1.50" className={`${inputCls} text-right`} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Cpk</span>
              <input inputMode="decimal" value={cpk} onChange={(e) => setCpk(e.target.value)} placeholder="1.33" className={`${inputCls} text-right`} />
            </label>
          </div>

          {saveError && <div role="alert" className="col-span-2 md:col-span-4 text-sm font-semibold text-red-700">{saveError}</div>}
          <button
            className={`col-span-2 md:col-span-4 justify-self-end inline-flex items-center gap-2 rounded-xl text-white text-sm font-semibold px-4 py-2 shadow-sm transition disabled:opacity-50 ${
              saved ? 'bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
            onClick={add}
            disabled={!canAdd || saving}
            title="Save this Cp-Cpk entry"
          >
            {saving ? (
              <>
                <Save size={16} /> Saving to database…
              </>
            ) : saved ? (
              <>
                <CheckCircle2 size={16} /> Saved
              </>
            ) : (
              <>
                <Save size={16} /> Save Cp-Cpk
              </>
            )}
          </button>
        </div>
      </div>

      {/* The month's grid — machine down the side, the dates measured across the top.
          Self-contained: it carries its own month picker, and unlike everything else on this
          page it reads only entered readings, never the carried-forward ones. */}
      <CpkMatrix entries={entries} />

      {/* list — worst first (lowest Cpk on top); each entry expands across every date
          the same item kept running, so a single measurement covers the whole batch */}
      <div className="bento">
        <div className="px-4 md:px-5 pt-4 pb-3 border-b border-[var(--hairline)]">
          <div className="font-bold text-slate-800">Recorded Cp-Cpk ({shownEntries.length})</div>
          <div className="text-xs text-slate-500">
            Sorted by priority — lowest Cpk first · carried forward while the item keeps running
            {filterOn && (
              <>
                {' · '}
                <b style={{ color: '#4f46e5' }}>
                  {dateFilter ? fmtDate(dateFilter) : 'all days'}
                  {machineFilter !== 'ALL' ? ` · ${machineFilter}` : ''}
                </b>
              </>
            )}
          </div>
        </div>
        <div className="p-3 md:p-4">
          {shownRows.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-8">
              {expanded.length === 0 ? 'No Cp-Cpk recorded yet.' : 'No reading matches these filters.'}
            </div>
          ) : (
            <div className="scroll-area" style={{ overflow: 'auto' }}>
              <table className="tbl" style={{ minWidth: 1020 }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Machine</th>
                    <th>Item Code</th>
                    <th>Batch No.</th>
                    <th className="text-right">Batch Qty</th>
                    <th>Setter</th>
                    <th>Operator</th>
                    <th className="text-right">Cp</th>
                    <th className="text-right">Cpk</th>
                    <th className="text-right">Rework</th>
                    <th className="text-right">Rejection</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sortExpanded(shownRows).map((c) => {
                    const isAlert = alerts.some((a) => a.id === `${c.id}-${c.forDate}`)
                    return (
                      <tr key={`${c.id}-${c.forDate}`} style={isAlert ? { background: 'rgba(208,59,59,0.06)' } : undefined}>
                        <td className="whitespace-nowrap text-slate-500">
                          {fmtDate(c.forDate)}
                          {c.carried && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold text-indigo-500" title="Same item still running — carried forward automatically">
                              <History size={10} /> carried
                            </span>
                          )}
                        </td>
                        <td className="font-semibold text-slate-800 whitespace-nowrap">{c.machine}</td>
                        <td className="text-slate-500 whitespace-nowrap">{c.itemCode || '—'}</td>
                        <td className="text-slate-600 whitespace-nowrap">{c.batchNo || '—'}</td>
                        <td className="text-right tabular-nums">{c.batchQty ?? '—'}</td>
                        <td className="text-slate-600 whitespace-nowrap">{c.setter || '—'}</td>
                        <td className="text-slate-600 whitespace-nowrap">{c.operator || '—'}</td>
                        <td className="text-right tabular-nums">{c.cp ?? '—'}</td>
                        <td className="text-right font-bold tabular-nums" style={{ color: cpkColor(c.cpk) }}>
                          {c.cpk ?? '—'}
                        </td>
                        <td className="text-right tabular-nums" style={{ color: c.rework ? '#ea580c' : undefined }}>
                          {c.rework || '—'}
                        </td>
                        <td className="text-right tabular-nums" style={{ color: c.rejection ? '#ea580c' : undefined }}>
                          {c.rejection || '—'}
                        </td>
                        <td>
                          {isAlert ? (
                            <span className="pill" style={{ background: '#d03b3b1a', color: '#d03b3b' }} title="Good Cpk yet rework/rejection happened">
                              <ShieldAlert size={12} /> Alert
                            </span>
                          ) : (
                            <span className="pill" style={{ background: `${cpkColor(c.cpk)}1a`, color: cpkColor(c.cpk) }}>
                              {c.cpk === null ? '—' : c.cpk < CPK_TARGET ? 'Below target' : c.cpk < 1.67 ? 'OK' : 'Good'}
                            </span>
                          )}
                        </td>
                        <td>
                          {onDelete && !c.carried && (
                            <button className="text-slate-300 hover:text-red-600 p-1" onClick={() => onDelete(c.id)} title="Delete">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bento p-3 md:p-4 text-center">
      <div className="text-xl md:text-2xl font-extrabold tabular-nums" style={{ color: color ?? 'var(--ink)' }}>
        {value}
      </div>
      <div className="text-[11px] md:text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  )
}
