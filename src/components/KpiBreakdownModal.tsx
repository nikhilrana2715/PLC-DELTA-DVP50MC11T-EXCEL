import { Fragment, type ReactNode } from 'react'
import { useOverlayBack } from '../lib/useOverlayBack'
import { ArrowLeft, ChevronRight, X, Sun, Moon } from 'lucide-react'

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface BreakdownCol {
  key: string
  label: string
  align?: 'right'
  primary?: boolean
  /** Fixed column width (e.g. '64px', '9rem'). When any column sets this the table
   * switches to fixed layout so widths are respected instead of content-stretched. */
  width?: string
  /** Let long text wrap inside the cell instead of forcing the column wider. */
  wrap?: boolean
  /** The figure this popup exists to show. On a phone it is lifted out of the field list and
   *  printed large on the right of the card, so a list can be scanned without reading it. */
  lead?: boolean
  render?: (row: any) => ReactNode
}

/** A Shift 1 / Shift 2 section with its own rows and subtotal. */
export interface ShiftGroup {
  shift: 1 | 2
  rows: any[]
  total?: Record<string, ReactNode>
}

/** A generic labelled section (e.g. one per date) with its own rows and subtotal. */
export interface SectionGroup {
  label: string
  rows: any[]
  total?: Record<string, ReactNode>
  /** What the subtotal row calls itself. Defaults to "<label> Total", which reads badly
   *  once the label already carries a count ("AUG-26 · 65 open Total"). */
  totalLabel?: string
}

/** One figure on the summary board above the table. */
export interface BoardFigure {
  label: string
  value: string
  /** Small caption under the figure — the date it belongs to, or how it was worked out. */
  sub?: string
  /** plan = blue, ach = green, gap = orange, lead = the headline of the block. */
  tone?: 'plan' | 'ach' | 'gap' | 'lead'
}
/** Blocks of headline figures shown above the table — the morning meeting's whiteboard. */
export interface BreakdownBoard {
  groups: {
    title: string
    /** Where these figures come from — two blocks may not share a source. */
    sub?: string
    /** An amber line under the figures: stale sheet, missing row, anything worth a second look. */
    warn?: string
    /**
     * A way out of an empty block. When a block reads "—" because a sheet has not been
     * uploaded, the fix is one click away and belongs here rather than in a note the
     * reader has to act on somewhere else.
     */
    action?: { label: string; onClick: () => void }
    items: BoardFigure[]
  }[]
}

export interface BreakdownData {
  title: string
  note?: string
  /**
   * The figures the meeting reads off the board before it looks at any row. Rendered above
   * the table, grouped the way the board itself is written.
   */
  board?: BreakdownBoard
  columns: BreakdownCol[]
  rows: any[]
  /** Optional totals row rendered as a bold footer (keyed by column key). */
  total?: Record<string, ReactNode>
  /** If set, rows are grouped into Shift 1 / Shift 2 sections (each with a subtotal). */
  shiftGroups?: ShiftGroup[]
  /** If set, rows are grouped into labelled sections (e.g. per date), each with a subtotal. */
  sectionGroups?: SectionGroup[]
  /** If set, each row is clickable (e.g. to open that machine's detail). */
  onRowClick?: (row: any) => void
  /** If set, the header shows a back arrow — this view was drilled into from another. */
  onBack?: () => void
  /**
   * The colour this breakdown belongs to — the same one its card wears on the dashboard, so
   * opening Downtime gives you the amber screen and Rejection the red one. It runs the
   * header, the row stripes, the section pills and the totals from one place: everything
   * below reads it as `--accent` rather than being told a colour of its own.
   */
  accent?: { from: string; to: string }
}

/** Indigo — the app's own colour, for a breakdown that has not claimed one. */
const DEFAULT_ACCENT = { from: '#4f46e5', to: '#7c3aed' }

/**
 * A breakdown wears the colour of the card that opened it.
 *
 * The dashboard already teaches these: Downtime is the amber card, Rejection the red one,
 * Achievement the green one. Carrying that colour into the screen behind it means the person
 * who tapped knows they landed where they meant to before reading a word — and on a phone,
 * where the popup now fills the screen and the card is no longer visible behind it, that is
 * the only thing left saying which card this was.
 */
const ACCENTS: Record<string, { from: string; to: string }> = {
  todayPlanning: { from: '#059669', to: '#10b981' },
  plan: { from: '#2563eb', to: '#3b82f6' },
  achievement: { from: '#059669', to: '#10b981' },
  backlog: { from: '#ea580c', to: '#fb923c' },
  efficiency: { from: '#7c3aed', to: '#a855f7' },
  downtime: { from: '#d97706', to: '#f59e0b' },
  belowTarget: { from: '#dc2626', to: '#f87171' },
  rework: { from: '#d97706', to: '#f59e0b' },
  rejection: { from: '#dc2626', to: '#f87171' },
  cpk: { from: '#2563eb', to: '#3b82f6' },
  cumulative: { from: '#7c3aed', to: '#a855f7' },
  reporting: { from: '#dc2626', to: '#f87171' },
  routecard: { from: '#e11d48', to: '#fb7185' },
  // The three downtime factors keep the colours their dots already use.
  operator: { from: '#16a34a', to: '#22c55e' },
  maintenance: { from: '#dc2626', to: '#ef4444' },
  management: { from: '#7c3aed', to: '#8b5cf6' },
}

/** The colour for a metric, or the app's indigo when it has none of its own. */
export const accentFor = (metric: string) => ACCENTS[metric] ?? DEFAULT_ACCENT

const TONE: Record<NonNullable<BoardFigure['tone']>, string> = {
  plan: '#2a78d6',
  ach: '#0f9d58',
  gap: '#ea580c',
  lead: '#4f46e5',
}

/**
 * The whiteboard, typeset.
 *
 * The morning meeting already writes these seven figures on a board every day — today's
 * plan, yesterday's plan / achievement / shortfall, and the month so far. Printing them
 * above the item list means the popup answers "how are we doing" before anyone reads a
 * single row, which is the order the meeting actually asks in.
 */
function Board({ board }: { board: BreakdownBoard }) {
  return (
    <>
      {/* The blocks are side by side on a phone, and a peek of the next one is easy to miss
          on a small screen — so it is said out loud rather than left to be discovered. */}
      {board.groups.length > 1 && (
        <div className="sm:hidden text-[10.5px] font-semibold mb-1.5 px-0.5" style={{ color: 'var(--ink-hint)' }}>
          {board.groups.length} summaries · swipe →
        </div>
      )}
      {/* On a phone the blocks lie side by side and snap as you swipe: three stacked blocks
          put 537px of summary above the first row of the list, which is a whole screen of
          scrolling before the popup shows what it was opened for. A tablet gets the grid. */}
      <div className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory scroll-area -mx-1 px-1 pb-1 mb-3 sm:mb-4 sm:grid sm:gap-3 sm:overflow-visible sm:mx-0 sm:px-0 sm:grid-cols-2 lg:grid-cols-3">
      {board.groups.map((g) => (
        <div
          key={g.title}
          className="snap-start shrink-0 w-[86%] sm:w-auto rounded-2xl border border-[var(--hairline)] overflow-hidden"
          style={{ background: 'var(--surface-2)' }}
        >
          <div className="bd-thead px-3.5 py-2 border-b border-[var(--hairline)]">
            <div className="bd-title text-[11px] font-extrabold uppercase tracking-wide">{g.title}</div>
            {g.sub && (
              <div className="text-[10.5px] leading-tight mt-0.5" style={{ color: 'var(--ink-hint)' }}>
                {g.sub}
              </div>
            )}
          </div>
          <div className="px-3.5 py-2.5 flex flex-col gap-2">
            {g.items.map((it) => (
              <div key={it.label} className="flex items-baseline gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold leading-tight" style={{ color: 'var(--ink-2)' }}>
                    {it.label}
                  </div>
                  {it.sub && (
                    <div className="text-[10.5px] leading-tight" style={{ color: 'var(--ink-hint)' }}>
                      {it.sub}
                    </div>
                  )}
                </div>
                <div
                  className={`shrink-0 tabular-nums font-extrabold ${it.tone === 'lead' ? 'text-[22px]' : 'text-[16px]'}`}
                  // A figure that is not there is a hint, not a headline — "—" in full
                  // colour reads as a value at a glance, which is the one thing it is not.
                  style={{ color: it.value === '—' ? 'var(--ink-hint)' : it.tone ? TONE[it.tone] : 'var(--ink)' }}
                >
                  {it.value}
                </div>
              </div>
            ))}
            {g.warn && (
              <div className="board-warn rounded-lg px-2.5 py-1.5 text-[11px] font-semibold leading-snug">{g.warn}</div>
            )}
            {g.action && (
              <button
                onClick={g.action.onClick}
                className="w-full rounded-lg py-1.5 text-[12px] font-bold text-white shadow-sm hover:brightness-110 transition"
                style={{ background: 'linear-gradient(135deg,#0d9488,#0ea5e9)' }}
              >
                {g.action.label}
              </button>
            )}
          </div>
        </div>
      ))}
      </div>
    </>
  )
}

export function KpiBreakdownModal({ data, onClose }: { data: BreakdownData; onClose: () => void }) {
  // A flexible wrap column (wrap, no fixed width — e.g. Item Name) must take the leftover
  // space, so that table fills the modal (fixed layout). Otherwise the table is sized to
  // its content and the modal shrinks to fit — no dead gaps, no blank on the right.
  const hasFlexCol = data.columns.some((c) => c.wrap && !c.width)
  /** One step back: out of a drill-down if there is one, otherwise out of the breakdown. */
  const goBack = data.onBack ?? onClose
  const accent = data.accent ?? DEFAULT_ACCENT
  // The phone's Back button does the same thing as the arrow. See useOverlayBack.
  useOverlayBack(goBack)
  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center p-0 md:p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      {/* w-fit sizes the dialog to its table on desktop, but it must never grow past the
          viewport — on a phone that pushed the title and first columns off-screen. */}
      {/* A phone gets the WHOLE screen, not a sheet peeping up from the bottom: these lists
          run to a hundred rows, and a half-height sheet spends its space on the dashboard
          behind it. Full screen also makes the phone's Back button the obvious way out,
          which is what it now does. From a tablet up it goes back to a centred dialog. */}
      <div
        className="bg-white w-full h-full md:h-auto md:max-w-2xl lg:w-fit lg:max-w-[min(95vw,88rem)] lg:min-w-[400px] rounded-none md:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-none md:max-h-[min(92vh,92dvh)] pt-[env(safe-area-inset-top)] md:pt-0"
        style={{
          animation: 'rise 0.18s ease both',
          paddingBottom: 'env(safe-area-inset-bottom)',
          // Everything below tints itself off this one value.
          ['--bd-accent' as string]: accent.from,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The header carries the colour. A phone has no back arrow here: the phone's own
            Back button does that job, and a second one on screen was only taking the width
            the title needed. A drill-down still gets one on desktop, where there is no
            system Back to lean on. */}
        <div
          className="flex items-start gap-3 px-3 md:px-6 py-3 md:py-4 shrink-0"
          style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})` }}
        >
          {data.onBack && (
            <button
              onClick={goBack}
              className="hidden md:grid shrink-0 w-8 h-8 place-items-center rounded-lg bg-white/15 text-white hover:bg-white/25 active:scale-95 transition"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="flex-1 min-w-0 text-white">
            <h2 className="text-[16px] md:text-2xl font-extrabold leading-tight break-words">{data.title}</h2>
            {data.note && <div className="text-[11px] md:text-xs text-white/75 mt-0.5 leading-snug">{data.note}</div>}
          </div>
          <button className="text-white/70 hover:text-white shrink-0 mt-0.5" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="px-3 md:px-4 pb-4 md:pb-5 overflow-auto scroll-area">
          {data.board && <Board board={data.board} />}

          {data.rows.length === 0 && !data.board ? (
            <div className="text-sm text-slate-400 text-center py-10">No data to show.</div>
          ) : data.rows.length === 0 ? null : (
            <>
              {/* Cards up to a laptop, not just up to a phone: an eight-column breakdown still
                  needs sideways scrolling on a 768px tablet, and a table you have to drag is
                  no better held in two hands than it is in one. */}
              <div className="lg:hidden">
                <CardList data={data} />
              </div>
              <table
              className={`hidden lg:table ${hasFlexCol ? 'w-full' : 'w-max min-w-full'}`}
              style={{
                borderCollapse: 'separate',
                borderSpacing: 0,
                tableLayout: hasFlexCol ? 'fixed' : 'auto',
              }}
            >
              <thead>
                <tr>
                  {data.columns.map((c) => (
                    <th
                      key={c.key}
                      className={`bd-thead sticky top-0 text-[11px] md:text-xs font-bold uppercase tracking-wide text-slate-500 px-3 md:px-4 py-3 ${
                        c.wrap ? 'whitespace-normal' : 'whitespace-nowrap'
                      }`}
                      style={{ textAlign: c.align ?? 'left', width: c.width }}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.sectionGroups && data.sectionGroups.length > 0
                  ? data.sectionGroups.map((g, gi) => (
                      <Fragment key={'sec-' + gi}>
                        <tr>
                          <td colSpan={data.columns.length} className="px-3 pt-4 pb-2">
                            <span className="bd-pill inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold">
                              {g.label}
                            </span>
                          </td>
                        </tr>
                        {g.rows.length === 0 ? (
                          <tr>
                            <td colSpan={data.columns.length} className="px-3 py-2 text-xs text-slate-400">
                              No data for this date.
                            </td>
                          </tr>
                        ) : (
                          g.rows.map((row, i) => (
                            <Row key={gi + '-' + i} row={row} cols={data.columns} onClick={data.onRowClick} />
                          ))
                        )}
                        {g.total && (
                          <tr className="bg-slate-50">
                            {data.columns.map((c) => (
                              <td
                                key={c.key}
                                className="px-3 py-2.5 border-t border-slate-200 whitespace-nowrap tabular-nums font-bold text-slate-700"
                                style={{ textAlign: c.align ?? 'left' }}
                              >
                                {c.primary ? (g.totalLabel ?? `${g.label} Total`) : (g.total![c.key] ?? '')}
                              </td>
                            ))}
                          </tr>
                        )}
                      </Fragment>
                    ))
                  : data.shiftGroups && data.shiftGroups.length > 0
                  ? data.shiftGroups.map((g) => (
                      <Fragment key={g.shift}>
                        {/* shift section header */}
                        <tr>
                          <td colSpan={data.columns.length} className="px-3 pt-4 pb-2">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${
                                g.shift === 1 ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'
                              }`}
                            >
                              {g.shift === 1 ? <Sun size={12} /> : <Moon size={12} />} Shift {g.shift} · 8 Hrs ·{' '}
                              {g.rows.length} m/c
                            </span>
                          </td>
                        </tr>
                        {g.rows.map((row, i) => (
                          <Row key={g.shift + '-' + i} row={row} cols={data.columns} onClick={data.onRowClick} />
                        ))}
                        {/* per-shift subtotal */}
                        {g.total && (
                          <tr className="bg-slate-50">
                            {data.columns.map((c) => (
                              <td
                                key={c.key}
                                className="px-3 py-2.5 border-t border-slate-200 whitespace-nowrap tabular-nums font-bold text-slate-700"
                                style={{ textAlign: c.align ?? 'left' }}
                              >
                                {c.primary ? `Shift ${g.shift} Total` : (g.total![c.key] ?? '')}
                              </td>
                            ))}
                          </tr>
                        )}
                      </Fragment>
                    ))
                  : data.rows.map((row, i) => (
                      <Row key={i} row={row} cols={data.columns} onClick={data.onRowClick} />
                    ))}
              </tbody>
              {data.total && (
                <tfoot>
                  <tr className="bd-total">
                    {data.columns.map((c) => (
                      <td
                        key={c.key}
                        className="px-3 md:px-4 py-3 md:py-3.5 border-t-2 border-slate-300 whitespace-nowrap tabular-nums font-bold text-slate-900 text-[13px] md:text-sm"
                        style={{ textAlign: c.align ?? 'left' }}
                      >
                        {c.primary
                          ? data.sectionGroups && data.sectionGroups.length > 0
                            ? 'Grand Total'
                            : data.shiftGroups && data.shiftGroups.length > 0
                              ? 'Grand Total · 16 Hrs'
                              : 'Total'
                          : (data.total![c.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The same rows, as cards — what a phone gets instead of the table.
 *
 * A breakdown can carry nine columns. Squeezed into 400px the fixed-width table gave the
 * item-name column about ten pixels and wrapped "R.OR 433" down the screen one letter at a
 * time. Cards drop the grid instead of the data: the identifying column becomes the heading,
 * the long text sits under it, and every figure keeps its own label — so nothing is hidden
 * and nothing has to be scrolled sideways to be read.
 *
 * Built from the same `columns` the table uses, so every popup in the app gets this for free.
 */
function CardRow({ row, cols, onClick }: { row: any; cols: BreakdownCol[]; onClick?: (row: any) => void }) {
  const head = cols.find((c) => c.primary) ?? cols[0]
  const wrapCol = cols.find((c) => c.wrap && c !== head)
  const leadCol = cols.find((c) => c.lead && c !== head && c !== wrapCol)
  const rest = cols.filter((c) => c !== head && c !== wrapCol && c !== leadCol)
  const val = (c: BreakdownCol): ReactNode => (c.render ? c.render(row) : ((row[c.key] as ReactNode) ?? '—'))
  const filled = (c: BreakdownCol) => {
    const v = row[c.key]
    return c.render ? true : v !== undefined && v !== null && v !== '' && v !== '—'
  }
  return (
    <div
      className={`bd-stripe rounded-xl rounded-l-md border border-l-0 border-[var(--hairline)] px-3 py-2 ${onClick ? 'cursor-pointer active:scale-[0.99] transition' : ''}`}
      style={{ background: 'var(--surface)' }}
      onClick={onClick ? () => onClick(row) : undefined}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-extrabold text-slate-800 leading-tight break-words">{val(head)}</div>
          {wrapCol && (
            <div className="text-[12.5px] leading-snug mt-0.5 break-words" style={{ color: 'var(--ink-2)' }}>
              {val(wrapCol)}
            </div>
          )}
        </div>
        {/* The one figure the popup was opened for, kept on the right where the eye lands. */}
        {leadCol && (
          <div className="shrink-0 text-right">
            <div className="text-[9.5px] font-bold uppercase tracking-wide leading-none" style={{ color: 'var(--ink-hint)' }}>
              {leadCol.label}
            </div>
            <div className="bd-lead text-[16px] font-extrabold tabular-nums leading-tight">{val(leadCol)}</div>
          </div>
        )}
        {onClick && <ChevronRight size={16} className="shrink-0 mt-0.5 text-slate-300" />}
      </div>

      {/* Everything else as chips. They FLOW: a long value takes the width it needs and pushes
          the next one to a new line. The old two-column grid could not do that — "Management
          Downtime" ran straight over the label sitting beside it. */}
      {rest.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {rest.filter(filled).map((c) => (
            <span
              key={c.key}
              className="inline-flex items-baseline gap-1 rounded-md px-1.5 py-0.5 max-w-full min-w-0"
              style={{ background: 'var(--surface-2)' }}
            >
              <span className="text-[9.5px] font-bold uppercase tracking-wide shrink-0" style={{ color: 'var(--ink-hint)' }}>
                {c.label}
              </span>
              <span className="text-[12px] font-bold tabular-nums text-slate-700 break-words min-w-0">{val(c)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** A section heading (a date, or a shift) above the cards it owns. Sticks while you scroll
 *  past its rows, so "which shift am I looking at" never needs scrolling back up. */
function CardHeading({ children, tone }: { children: ReactNode; tone: string }) {
  return (
    <div className="sticky top-0 z-10 -mx-1 px-1 py-1" style={{ background: 'var(--surface)' }}>
      <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${tone}`}>{children}</span>
    </div>
  )
}

/** A subtotal or grand total, as its own tinted card. */
function CardTotal({ label, cols, total }: { label: string; cols: BreakdownCol[]; total: Record<string, ReactNode> }) {
  const shown = cols.filter((c) => !c.primary && total[c.key] !== undefined && total[c.key] !== '')
  return (
    <div className="bd-total rounded-xl px-3 py-2.5">
      <div className="text-[13px] font-extrabold text-slate-800 mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((c) => (
          <span key={c.key} className="inline-flex items-baseline gap-1 rounded-md px-1.5 py-0.5 bg-white/70 max-w-full min-w-0">
            <span className="text-[9.5px] font-bold uppercase tracking-wide shrink-0" style={{ color: 'var(--ink-hint)' }}>
              {c.label}
            </span>
            <span className="text-[13px] font-extrabold tabular-nums text-slate-800 break-words min-w-0">{total[c.key]}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function CardList({ data }: { data: BreakdownData }) {
  const cols = data.columns
  return (
    <div className="flex flex-col gap-1.5">
      {data.sectionGroups && data.sectionGroups.length > 0
        ? data.sectionGroups.map((g, gi) => (
            <Fragment key={'msec-' + gi}>
              <CardHeading tone="bd-pill">{g.label}</CardHeading>
              {g.rows.length === 0 ? (
                <div className="text-xs text-slate-400 px-1">No data for this date.</div>
              ) : (
                g.rows.map((row, i) => <CardRow key={gi + '-' + i} row={row} cols={cols} onClick={data.onRowClick} />)
              )}
              {g.total && <CardTotal label={g.totalLabel ?? `${g.label} Total`} cols={cols} total={g.total} />}
            </Fragment>
          ))
        : data.shiftGroups && data.shiftGroups.length > 0
          ? data.shiftGroups.map((g) => (
              <Fragment key={'msh-' + g.shift}>
                <CardHeading tone={g.shift === 1 ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}>
                  {g.shift === 1 ? <Sun size={12} /> : <Moon size={12} />} Shift {g.shift} · {g.rows.length} m/c
                </CardHeading>
                {g.rows.map((row, i) => (
                  <CardRow key={g.shift + '-' + i} row={row} cols={cols} onClick={data.onRowClick} />
                ))}
                {g.total && <CardTotal label={`Shift ${g.shift} Total`} cols={cols} total={g.total} />}
              </Fragment>
            ))
          : data.rows.map((row, i) => <CardRow key={i} row={row} cols={cols} onClick={data.onRowClick} />)}
      {data.total && <CardTotal label="Total" cols={cols} total={data.total} />}
    </div>
  )
}

function Row({
  row,
  cols,
  onClick,
}: {
  row: any
  cols: BreakdownCol[]
  onClick?: (row: any) => void
}) {
  return (
    <tr
      className={`hover:bg-slate-50/70 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick ? () => onClick(row) : undefined}
      title={onClick ? 'View machine detail' : undefined}
    >
      {cols.map((c) => (
        <td
          key={c.key}
          className={`px-3 md:px-4 py-3 md:py-3.5 border-t border-[var(--hairline)] tabular-nums text-[13px] md:text-sm ${
            c.wrap ? 'whitespace-normal break-words' : 'whitespace-nowrap'
          } ${c.primary ? 'font-bold text-slate-800' : 'text-slate-600'}`}
          style={{ textAlign: c.align ?? 'left', width: c.width }}
        >
          {c.render ? c.render(row) : ((row[c.key] as ReactNode) ?? '—')}
        </td>
      ))}
    </tr>
  )
}
