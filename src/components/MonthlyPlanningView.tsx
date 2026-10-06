import { useMemo, useRef, useState } from 'react'
import { CalendarCheck, CalendarRange, ChevronLeft, ChevronRight, Hammer, Ban, Layers, Search } from 'lucide-react'
import { monthlyPlanKpis, monthLabelOf, type MonthActuals, type MonthlyPlan } from '../lib/monthlyPlan'
import { useT } from '../lib/i18n'
import { HScrollButtons } from './HScrollButtons'

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN')
const dayNum = (iso: string) => +iso.slice(8, 10)
/** The "–" placeholder in an empty cell. --ink-muted only reaches 3.1:1 on white, so
 *  this mixes its own subordinate grey that still clears 4.5:1 on both themes. */
const EMPTY_INK = 'color-mix(in srgb, var(--ink) 62%, var(--surface))'
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/**
 * A stable colour per machine tab.
 *
 * Excel's own tab colours are not in the file format SheetJS reads, so the name decides —
 * the same machine keeps the same colour on every upload, which is what makes a tab
 * findable by eye rather than by reading every label.
 */
const TAB_COLOURS = ['#2f9e5e', '#7c5cd6', '#2b7fd4', '#d98324', '#8a8f2e', '#c0466b', '#3f8f8f', '#a8563a']
const tabColour = (name: string): string => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return TAB_COLOURS[h % TAB_COLOURS.length]
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tint,
  grad,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  tint: string
  grad: string
}) {
  const t = useT()
  return (
    <div className={`stat-card ${tint} rise`}>
      <div className="p-3 md:p-4">
        <div className={`stat-icon ${grad}`}>{icon}</div>
        <div className="mt-2 text-[11px] md:text-xs font-semibold uppercase tracking-wide text-slate-600 leading-tight">{t(label)}</div>
        <div className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 leading-tight">{value}</div>
        {sub && <div className="text-[11px] font-semibold text-slate-500 leading-tight mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

/**
 * Monthly Planning — the Plan Confirmation sheet rendered as it looks in Excel, with the
 * month's headline numbers on top.
 *
 * The sheet carries planning only (Plan / Confirmation / Pending per item, then a quantity
 * per day). Rework and Rejection are NOT in it, so those two cards are summed from the
 * saved daily production reports of the same month — see `actuals`.
 */
export function MonthlyPlanningView({ plan, actuals, todayISO }: { plan: MonthlyPlan; actuals: MonthActuals; todayISO: string }) {
  const t = useT()
  const [q, setQ] = useState('')
  /** Which workbook sheet is on screen: '' is the plan, otherwise a machine's name. */
  const [sheetTab, setSheetTab] = useState('')
  const machineTab = plan.machines?.find((m) => m.machine === sheetTab) ?? null
  /** The machine sheet scrolls sideways too, so it gets the same arrows as everything else. */
  const machineScroll = useRef<HTMLDivElement | null>(null)
  const k = useMemo(() => monthlyPlanKpis(plan, todayISO), [plan, todayISO])

  const query = q.trim().toLowerCase()
  const rows = useMemo(
    () => (query ? plan.rows.filter((r) => `${r.itemCode} ${r.itemName} ${r.sapCode}`.toLowerCase().includes(query)) : plan.rows),
    [plan.rows, query],
  )

  const todayCol = plan.dayDates.indexOf(todayISO)
  const sum = (get: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + get(r), 0)

  const scrollRef = useRef<HTMLDivElement>(null)
  /** Nudge the sheet sideways by roughly a week of day columns. */
  const scrollBy = (dir: -1 | 1) => scrollRef.current?.scrollBy({ left: dir * 7 * 62, behavior: 'smooth' })

  const th = 'px-2 py-2 text-[10.5px] font-bold uppercase tracking-wide text-white whitespace-nowrap'
  /** The same heading, free to wrap — for sheets whose column names the app does not choose. */
  const thWrap = 'px-2 py-2 text-[10.5px] font-bold uppercase tracking-wide text-white align-bottom leading-[1.25]'
  const td = 'px-2 py-[7px] text-[12px] whitespace-nowrap'
  // The four identity columns are pinned while the day columns scroll. Their widths are
  // fixed (not just min-width) because each one's `left` offset is the sum of the widths
  // before it — a column that could grow would push the others out of alignment.
  const FREEZE = [
    { w: 52, left: 0 },
    { w: 92, left: 52 },
    { w: 96, left: 144 },
    { w: 210, left: 240 },
  ]
  const frozen = (i: number, extra = '') => ({
    className: `mp-freeze ${i === FREEZE.length - 1 ? 'mp-freeze-last ' : ''}${extra}`,
    style: { left: FREEZE[i].left, width: FREEZE[i].w, minWidth: FREEZE[i].w, maxWidth: FREEZE[i].w },
  })

  return (
    <>
      {/* ---- KPI cards ---- */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
        <Kpi
          icon={<CalendarCheck size={20} />}
          label="Today Planning"
          value={k.todayInMonth ? fmt(k.todayPlan) : '—'}
          sub={
            k.todayInMonth
              ? `${new Date(todayISO + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} · ${DOW[new Date(todayISO + 'T00:00:00').getDay()]}`
              : `${t('outside')} ${plan.title}`
          }
          tint="tint-blue"
          grad="grad-blue"
        />
        <Kpi
          icon={<CalendarRange size={20} />}
          label="Total Planning"
          value={fmt(k.totalPlan)}
          sub={`${t('Confirmed')} ${fmt(k.totalConfirm)}`}
          tint="tint-violet"
          grad="grad-violet"
        />
        <Kpi
          icon={<Layers size={20} />}
          label="Total Backlog"
          value={fmt(k.totalPending)}
          sub={t('Pending Qty (Plan − Confirmed)')}
          tint="tint-orange"
          grad="grad-orange"
        />
        <Kpi
          icon={<Hammer size={20} />}
          label="Total Rework"
          value={actuals.dates.length ? fmt(actuals.rework) : '—'}
          sub={actuals.dates.length ? `${t('from')} ${actuals.dates.length} ${t('saved day(s)')}` : t('no saved daily reports')}
          tint="tint-yellow"
          grad="grad-yellow"
        />
        <Kpi
          icon={<Ban size={20} />}
          label="Total Rejection"
          value={actuals.dates.length ? fmt(actuals.rejection) : '—'}
          sub={actuals.dates.length ? `${t('from')} ${actuals.dates.length} ${t('saved day(s)')}` : t('no saved daily reports')}
          tint="tint-red"
          grad="grad-red"
        />
      </div>

      {/* ---- The workbook's sheets, exactly as Excel lists them ---- */}
      <div className="bento overflow-hidden min-w-0">
        {plan.machines && plan.machines.length > 0 && (
          <div className="flex items-stretch gap-1 px-2 pt-2 overflow-x-auto scroll-area">
            {[{ key: '', name: plan.sheetName || t('Plan'), idle: false }].concat(
              plan.machines.map((m) => ({ key: m.machine, name: m.machine, idle: m.cells.length === 0 })),
            ).map((tab) => {
              const on = sheetTab === tab.key
              return (
                <button
                  key={tab.key || '__plan__'}
                  onClick={() => setSheetTab(tab.key)}
                  className="shrink-0 px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap transition"
                  style={{
                    // The active tab drops its bottom border so it joins the sheet below —
                    // the join is what makes a strip of buttons read as spreadsheet tabs.
                    borderRadius: '8px 8px 0 0',
                    border: '1px solid var(--hairline)',
                    borderBottomColor: on ? 'var(--surface)' : 'var(--hairline)',
                    marginBottom: -1,
                    background: on ? 'var(--surface)' : 'var(--surface-2)',
                    color: on ? 'var(--ink)' : tab.idle ? 'var(--ink-hint)' : 'var(--ink-2)',
                  }}
                  title={tab.idle ? tab.name + ' — ' + t('no batches') : tab.name}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {tab.key && (
                      <span
                        className="inline-block rounded-sm"
                        style={{ width: 8, height: 8, background: tab.idle ? 'var(--hairline)' : tabColour(tab.name) }}
                      />
                    )}
                    {tab.name}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        <div className="border-t border-[var(--hairline)]" style={{ marginTop: plan.machines?.length ? 0 : undefined }} />
        {!machineTab && (
        <>
        <div className="px-4 md:px-5 pt-4 pb-3 border-b border-[var(--hairline)] flex items-center justify-between gap-3 flex-wrap">
          <div className="font-bold text-slate-800 text-[15px]">
            {t('Monthly Plan Detail')} — {plan.title}
          </div>
          <div className="flex items-center gap-2">
            {/* Sideways scrolling with a mouse is awkward on a desktop without a tilt wheel,
                so give the sheet explicit nudge buttons. One press moves about a week. */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => scrollBy(-1)}
                className="icon-btn !px-2 !py-1.5"
                title={t('Scroll left')}
                aria-label={t('Scroll left')}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => scrollBy(1)}
                className="icon-btn !px-2 !py-1.5"
                title={t('Scroll right')}
                aria-label={t('Scroll right')}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          <div className="flex items-center gap-2 rounded-lg border border-[var(--hairline)] px-2.5 py-1.5 bg-white">
            <Search size={14} className="shrink-0 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('Search item code or name…')}
              className="text-[13px] outline-none bg-transparent text-slate-700 w-44"
            />
            <span className="text-[11px] font-semibold text-slate-400 shrink-0">
              {rows.length}/{plan.rows.length}
            </span>
          </div>
          </div>
        </div>

        <div className="p-3 md:p-4">
          <div ref={scrollRef} className="scroll-area overflow-auto" style={{ maxHeight: 620 }}>
            <table className="qa-grid mp-table" style={{ minWidth: 1180 + plan.dayDates.length * 62 }}>
              <thead>
                <tr>
                  {[t('Sr.No.'), t('SAP Code'), t('Item Code'), t('Name of Item')].map((label, i) => {
                    const f = frozen(i, `${th} ${i === 0 ? 'text-center' : 'text-left'}`)
                    return (
                      <th key={label} className={f.className} style={f.style}>
                        {label}
                      </th>
                    )
                  })}
                  <th className={`${th} text-right`} style={{ minWidth: 88 }}>
                    {/* Roller plans in kilograms; records saved before that was known are pieces. */}
                    {plan.measure === 'kg' ? t('Plan (kg)') : t('Plan Qty.')}
                  </th>
                  <th className={`${th} text-right`} style={{ minWidth: 118 }}>
                    {t('Plan Confirmation Qty.')}
                  </th>
                  <th className={`${th} text-right`} style={{ minWidth: 92 }}>
                    {t('Pending Qty.')}
                  </th>
                  <th className={`${th} text-left`} style={{ minWidth: 96 }}>
                    {t('Planing status')}
                  </th>
                  <th className={`${th} text-center`} style={{ minWidth: 92 }}>
                    {t('Date From')}
                  </th>
                  <th className={`${th} text-center`} style={{ minWidth: 92 }}>
                    {t('Date To')}
                  </th>
                  {plan.dayDates.map((d, i) => (
                    <th
                      key={d}
                      className={`${th} text-center`}
                      style={{ minWidth: 62, ...(i === todayCol ? { background: '#0f7b3d' } : {}) }}
                      title={new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    >
                      {dayNum(d)}
                      <div className="text-[9px] font-semibold opacity-80">{DOW[new Date(d + 'T00:00:00').getDay()]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const bg = i % 2 ? 'color-mix(in srgb, var(--ink) 5%, var(--surface))' : 'var(--surface)'
                  return (
                    <tr key={`${r.itemCode}-${r.srNo}-${i}`} style={{ background: bg }}>
                      {/* pinned cells need their own opaque background, or the scrolling
                          columns show through them */}
                      {[
                        { v: r.srNo, cls: `${td} text-center`, colour: 'var(--ink-2)' },
                        { v: r.sapCode || '—', cls: td, colour: 'var(--ink-2)' },
                        { v: r.itemCode || '—', cls: `${td} font-semibold`, colour: 'var(--ink)' },
                        { v: r.itemName || '—', cls: `${td} font-semibold truncate`, colour: 'var(--ink)' },
                      ].map((c, ci) => {
                        const f = frozen(ci, c.cls)
                        return (
                          <td key={ci} className={f.className} style={{ ...f.style, background: bg, color: c.colour }} title={String(c.v)}>
                            {c.v}
                          </td>
                        )
                      })}
                      <td className={`${td} text-right font-bold tabular-nums`} style={{ color: 'color-mix(in srgb, #3a7bd5 76%, var(--ink))' }}>
                        {fmt(r.planQty)}
                      </td>
                      <td className={`${td} text-right font-semibold tabular-nums`} style={{ color: 'color-mix(in srgb, #2e9e5b 76%, var(--ink))' }}>
                        {fmt(r.confirmQty)}
                      </td>
                      <td
                        className={`${td} text-right font-semibold tabular-nums`}
                        style={{ color: r.pendingQty ? 'color-mix(in srgb, #e8952f 70%, var(--ink))' : EMPTY_INK }}
                      >
                        {r.pendingQty ? fmt(r.pendingQty) : '–'}
                      </td>
                      <td className={td} style={{ color: 'var(--ink-2)' }}>
                        {r.status || '–'}
                      </td>
                      <td className={`${td} text-center`} style={{ color: 'var(--ink-2)' }}>
                        {r.dateFrom || '–'}
                      </td>
                      <td className={`${td} text-center`} style={{ color: 'var(--ink-2)' }}>
                        {r.dateTo || '–'}
                      </td>
                      {r.days.map((v, j) => (
                        <td
                          key={plan.dayDates[j]}
                          className={`${td} text-right tabular-nums`}
                          style={{
                            color: v ? 'var(--ink)' : EMPTY_INK,
                            fontWeight: v ? 700 : 400,
                            ...(j === todayCol ? { background: 'color-mix(in srgb, #0f7b3d 14%, var(--surface))' } : {}),
                          }}
                        >
                          {v ? fmt(v) : '–'}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'color-mix(in srgb, #3a7bd5 14%, var(--surface))' }}>
                  <td
                    className={`${td} font-extrabold mp-freeze mp-freeze-last`}
                    style={{
                      left: 0,
                      width: 450,
                      minWidth: 450,
                      background: 'color-mix(in srgb, #3a7bd5 14%, var(--surface))',
                      color: 'var(--ink)',
                    }}
                    colSpan={4}
                  >
                    {t('TOTAL')}
                  </td>
                  <td className={`${td} text-right font-extrabold tabular-nums`} style={{ color: 'var(--ink)' }}>
                    {fmt(sum((r) => r.planQty))}
                  </td>
                  <td className={`${td} text-right font-extrabold tabular-nums`} style={{ color: 'var(--ink)' }}>
                    {fmt(sum((r) => r.confirmQty))}
                  </td>
                  <td className={`${td} text-right font-extrabold tabular-nums`} style={{ color: 'var(--ink)' }}>
                    {fmt(sum((r) => r.pendingQty))}
                  </td>
                  <td className={td} colSpan={3} />
                  {plan.dayDates.map((d, j) => (
                    <td key={d} className={`${td} text-right font-extrabold tabular-nums`} style={{ color: 'var(--ink)' }}>
                      {fmt(rows.reduce((s, r) => s + r.days[j], 0))}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        </>
        )}

        {machineTab && (machineTab.cells.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <div className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>{machineTab.machine}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--ink-hint)' }}>
              {t('Nothing is queued on this machine in this plan.')}
            </div>
          </div>
        ) : (
          <>
            <div className="px-4 md:px-5 pt-4 pb-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-bold text-slate-800 text-[15px]">
                  {machineTab.machine} — {plan.title}
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: 'var(--ink-hint)' }}>
                  {machineTab.cells.length} {t('batch(es)')} · {fmt(machineTab.qtyToProcess)} {t('to process')} · {machineTab.hoursRequired.toFixed(1)} {t('hrs')}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="text-[12.5px] font-semibold rounded-lg px-2.5 py-1.5"
                  style={{
                    // More than a month of work on one machine is the thing worth seeing here.
                    background: machineTab.daysRequired > 31 ? 'color-mix(in srgb, #d03b3b 12%, var(--surface))' : 'var(--surface-2)',
                    color: machineTab.daysRequired > 31 ? '#d03b3b' : 'var(--ink-2)',
                  }}
                >
                  {machineTab.daysRequired.toFixed(1)} {t('days needed')}
                </div>
                <HScrollButtons scrollRef={machineScroll} />
              </div>
            </div>
            <div ref={machineScroll} className="scroll-area px-3 md:px-4 pb-4" style={{ overflowX: 'auto' }}>
              {/* The tab's own columns, in its own order — this is the sheet, not a summary of it. */}
              <table className="qa-grid" style={{ minWidth: Math.max(900, machineTab.columns.length * 96) }}>
                <thead>
                  <tr>
                    {machineTab.columns.map((h, i) => (
                      <th
                        key={`${h}-${i}`}
                        // These headings come from the sheet and some run long ("PPH Output
                        // Consideration at Present"). Let them wrap onto two or three lines
                        // instead of stretching the column to fit one — the figures under a
                        // heading are short, so the width should follow them, not the label.
                        className={`${thWrap} ${machineTab.numericCols.includes(i) ? 'text-right' : 'text-left'}`}
                        style={{ maxWidth: 150, minWidth: 72 }}
                        title={h}
                      >
                        {h || '—'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {machineTab.cells.map((row, r) => (
                    <tr key={r} style={{ background: r % 2 ? 'color-mix(in srgb, var(--ink) 5%, var(--surface))' : 'var(--surface)' }}>
                      {machineTab.columns.map((_, c) => {
                        const v = row[c] ?? ''
                        const numeric = machineTab.numericCols.includes(c)
                        return (
                          <td
                            key={c}
                            className={`${td} ${numeric ? 'text-right tabular-nums' : ''} ${c === 0 ? 'font-semibold' : ''}`}
                            style={{ color: c === 0 ? 'var(--ink)' : 'var(--ink-2)' }}
                            title={v}
                          >
                            {v || <span style={{ color: EMPTY_INK }}>–</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ))}
      </div>
    </>
  )
}

export { monthLabelOf }
