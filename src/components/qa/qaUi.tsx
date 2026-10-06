// Shared building blocks for the QA dashboard — card chrome, the ruled data grid and
// the two chart shapes. Kept in one place so the Executive Summary and the analysis
// tabs stay visually identical.
import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { INK } from '../../lib/palette'
import { useT } from '../../lib/i18n'
import { fmtInt } from '../../lib/qa'

/* ---------- theme ----------
   Solid brand colours only. Anything that must read on BOTH themes goes through the
   `qa-heading` class or the CSS tokens below — never a raw hex on a surface. */
export const C = {
  bar: '#3a7bd5',
  barDark: '#2f6fbf',
  green: '#2e9e5b',
  red: '#d9534f',
  heading: '#1e4e8c',
}

export const PLOT = { line: '#1f4e8c', dot: '#1f4e8c', barFrom: '#3d7cc9', barTo: '#1f4e8c' }

/** Series colours for grouped bars — return / good / defect reading left to right. */
export const SERIES = {
  qty: { from: '#5b9bf0', to: '#2a78d6', flat: '#3a7bd5' },
  good: { from: '#3fd39b', to: '#1baf7a', flat: '#2e9e5b' },
  bad: { from: '#ff8f8f', to: '#d9534f', flat: '#d9534f' },
  warn: { from: '#ffd166', to: '#e0a416', flat: '#d9a400' },
}

/* ---------- theme-aware table surfaces ----------
   Hardcoded #fff / slate rows stay white in dark mode (the index.css overrides key off
   utility classes, and an inline colour has no class to match), so these mix against the
   live surface token instead and read correctly in both themes. */
export const ROW_BG = ['var(--surface)', 'color-mix(in srgb, var(--ink) 5%, var(--surface))'] as const
export const FOOT_BG = 'color-mix(in srgb, #3a7bd5 14%, var(--surface))'
/** The "–" placeholder in an empty cell. --ink-muted only reaches 3.1:1 on white, so this
 *  mixes its own subordinate grey that still clears 4.5:1 on both themes. */
export const EMPTY_INK = 'color-mix(in srgb, var(--ink) 62%, var(--surface))'
/** Pull a brand colour toward the current foreground so it stays legible on both themes. */
export const onSurface = (c: string, pct = 76) => `color-mix(in srgb, ${c} ${pct}%, var(--ink))`

/* ---------- card ---------- */
export function Card({
  title,
  hint,
  note,
  children,
  className = '',
}: {
  title: string
  /** Small muted note on the right of the title (e.g. "click a row for detail"). */
  hint?: string
  /** A caveat printed under the title — used where the two sheets cannot be joined directly. */
  note?: string
  children: ReactNode
  className?: string
}) {
  const t = useT()
  return (
    <div className={`bg-white rounded-lg border border-slate-200 shadow-sm p-3 md:p-4 min-w-0 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="qa-heading text-[13px] md:text-sm font-extrabold uppercase tracking-wide">{t(title)}</h3>
        {hint && <span className="text-[10.5px] font-semibold text-slate-400 shrink-0">{t(hint)}</span>}
      </div>
      {note && (
        <div className="text-[11px] mt-1 mb-2" style={{ color: 'var(--ink-muted)' }}>
          {t(note)}
        </div>
      )}
      <div className={note ? '' : 'mt-2'}>{children}</div>
    </div>
  )
}

/** Shown in place of a table/chart when the filters leave nothing to render. */
export function NoRows({ label = 'Nothing to show for the current filters.' }: { label?: string }) {
  const t = useT()
  return <div className="py-10 text-center text-sm text-slate-400">{t(label)}</div>
}

/* ---------- ruled data grid ---------- */
export interface GridCol<T> {
  key: string
  label: string
  align?: 'left' | 'right'
  width?: number
  /** Pin the column while the rest scrolls horizontally. */
  sticky?: 'left' | 'right'
  render: (row: T) => ReactNode
  /** Cell shown in the TOTAL footer. Omit for a blank footer cell. */
  total?: ReactNode
}

/**
 * The ruled table used everywhere in this dashboard: navy header, 1px grid on every cell,
 * sticky header + pinned first/last columns, optional TOTAL footer and row click-through.
 * Borders come from the `.qa-grid` rules in index.css (border-collapse stays SEPARATE so
 * sticky cells keep their rules while scrolling).
 */
export function GridTable<T>({
  cols,
  rows,
  rowKey,
  onRow,
  maxH = 430,
  showTotal = true,
  empty,
}: {
  cols: GridCol<T>[]
  rows: T[]
  rowKey: (row: T, i: number) => string
  onRow?: (row: T) => void
  maxH?: number
  showTotal?: boolean
  empty?: string
}) {
  const t = useT()
  if (rows.length === 0) return <NoRows label={empty} />

  const th = 'px-2 py-2 text-[10.5px] font-bold uppercase tracking-wide whitespace-nowrap'
  const td = 'px-2 py-[7px] text-[12px] whitespace-nowrap'
  const hasTotal = showTotal && cols.some((c) => c.total !== undefined)
  const minWidth = cols.reduce((s, c) => s + (c.width ?? 96), 0)
  const pin = (c: GridCol<T>, z: number, bg?: string) =>
    c.sticky ? ({ position: 'sticky' as const, [c.sticky]: 0, zIndex: z, ...(bg ? { background: bg } : {}) } as const) : undefined

  return (
    <div className="scroll-area overflow-auto" style={{ maxHeight: maxH }}>
      <table className="qa-grid" style={{ minWidth }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.key}
                className={`${th} ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                style={{ minWidth: c.width ?? 96, ...(pin(c, c.sticky ? 5 : 3) || {}) }}
              >
                {t(c.label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const bg = ROW_BG[i % 2]
            return (
              <tr
                key={rowKey(r, i)}
                onClick={onRow ? () => onRow(r) : undefined}
                className={onRow ? 'cursor-pointer hover:brightness-105 transition' : ''}
                style={{ background: bg }}
                title={onRow ? t('View detail') : undefined}
              >
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className={`${td} ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}
                    style={{ color: 'var(--ink-2)', ...(pin(c, 2, bg) || {}) }}
                  >
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
        {hasTotal && (
          <tfoot>
            <tr style={{ background: FOOT_BG }}>
              {cols.map((c) => (
                <td
                  key={c.key}
                  className={`${td} font-extrabold ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}
                  style={{ color: 'var(--ink)', ...(pin(c, 2, FOOT_BG) || {}) }}
                >
                  {c.total !== undefined ? c.total : c.key === cols[0].key ? t('TOTAL') : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

/* ---------- cell helpers ---------- */
export const num = (n: number) => (n ? fmtInt(n) : <span style={{ color: EMPTY_INK }}>–</span>)
export const strong = (n: number, colour: string) =>
  n ? (
    <span className="font-bold" style={{ color: onSurface(colour) }}>
      {fmtInt(n)}
    </span>
  ) : (
    <span style={{ color: EMPTY_INK }}>–</span>
  )
export const name = (s: string) => (
  <span className="font-bold" style={{ color: 'var(--ink)' }} title={s}>
    {s || '—'}
  </span>
)
/** Long free text (defect names, item descriptions) — clipped with the full value on hover. */
export const clip = (s: string, w = 190) => (
  <span className="block truncate" style={{ maxWidth: w, color: 'var(--ink-2)' }} title={s}>
    {s || '—'}
  </span>
)

/* ---------- charts ---------- */
export function ChartTip({ title, items, footer }: { title: string; items: { label: string; value: string; color: string }[]; footer?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg" style={{ minWidth: 160, maxWidth: 260 }}>
      <div className="text-[12.5px] font-bold text-slate-900 mb-1.5 break-words">{title}</div>
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2 py-[2px] text-[12px]">
          <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: it.color }} />
          <span className="flex-1 min-w-0 truncate text-slate-500">{it.label}</span>
          <span className="font-semibold tabular-nums text-slate-900">{it.value}</span>
        </div>
      ))}
      {footer && <div className="mt-1.5 border-t border-slate-100 pt-1.5 text-[11.5px] font-bold text-slate-600">{footer}</div>}
    </div>
  )
}

/* ---------- wrapped VERTICAL axis labels ----------
   Category names here are long ("DANFOSS POWER SOLUTIONS", "Od Chamfer Less Than
   Specification"). They are drawn rotated 90° (reading bottom-to-top) so a long name
   costs axis height rather than colliding with its neighbours, and each name is wrapped
   over a couple of parallel columns so it does not have to be cut to an ellipsis. */

/** Break `raw` into at most `maxLines` lines of ~`chars` characters, on word boundaries
 *  where possible and mid-token when a single word (an item code) is longer than a line. */
export function wrapLabel(raw: string, chars: number, maxLines: number): string[] {
  const s = String(raw ?? '').trim()
  if (!s) return ['—']
  const lines: string[] = []
  let cur = ''
  const flush = () => {
    if (cur) {
      lines.push(cur)
      cur = ''
    }
  }
  outer: for (const word of s.split(/\s+/)) {
    let w = word
    while (w.length > chars) {
      flush()
      if (lines.length >= maxLines) break outer
      lines.push(w.slice(0, chars))
      w = w.slice(chars)
    }
    if (lines.length >= maxLines) break
    if (!cur) cur = w
    else if (cur.length + 1 + w.length <= chars) cur = `${cur} ${w}`
    else {
      flush()
      if (lines.length >= maxLines) break
      cur = w
    }
  }
  flush()
  if (lines.length > maxLines) lines.length = maxLines
  // Mark the last line when the label did not fit, so a clipped name is never mistaken
  // for the whole name. (Full text is always in the tooltip.)
  const shownChars = lines.join('').replace(/\s/g, '').length
  if (shownChars < s.replace(/\s/g, '').length) {
    const last = lines[lines.length - 1] ?? ''
    lines[lines.length - 1] = (last.length >= chars ? last.slice(0, chars - 1) : last) + '…'
  }
  return lines
}

/** Spacing between the parallel columns of one wrapped label. */
const LINE_H = 11
/** Approximate advance width of one character, as a fraction of the font size. */
const CHAR_W = 0.58

/**
 * Recharts custom tick: the label is wrapped, then the whole group is rotated -90° so it
 * reads bottom-to-top. After the rotation the wrapped lines stack sideways, so they are
 * centred on the tick. The untruncated value stays available as an SVG <title> tooltip.
 */
export function WrapTick(props: {
  x?: number
  y?: number
  payload?: { value?: string | number }
  chars?: number
  maxLines?: number
  fontSize?: number
}) {
  const { x = 0, y = 0, payload, chars = 17, maxLines = 2, fontSize = 10 } = props
  const full = String(payload?.value ?? '')
  const lines = wrapLabel(full, chars, maxLines)
  const offset = -((lines.length - 1) * LINE_H) / 2
  return (
    <g transform={`translate(${x},${y}) rotate(-90)`}>
      <title>{full}</title>
      {lines.map((line, i) => (
        <text
          key={i}
          x={-8}
          y={offset + i * LINE_H}
          dy={fontSize * 0.35}
          textAnchor="end"
          fill={INK.primary}
          fontSize={fontSize}
          fontWeight={700}
        >
          {line}
        </text>
      ))}
    </g>
  )
}

/** Axis height a vertical label needs: the longest line runs DOWN the axis, so height is
 *  driven by the character count, not by how many lines the label wrapped onto. The +26
 *  covers the 8px gap under the axis line plus per-font rounding — at +18 a full-width
 *  label overshot the plot by a pixel and got clipped. */
export const wrapAxisHeight = (chars: number, fontSize = 10) => Math.round(chars * fontSize * CHAR_W) + 26

export interface BarSeries {
  key: string
  name: string
  tone: keyof typeof SERIES
}

/** Vertical labels: three columns of 17 characters (51 total) covers the longest names in
 *  this data — "CG Power And Industrial Solutions Limited", "Od Chamfer Less Than
 *  Specification" — without truncating. Three columns are 33px wide, well inside a slot. */
const LABEL_CHARS = 17
const LABEL_LINES = 3

/**
 * One grouped bar chart for every "by category" view. `data` rows carry a `name` plus one
 * numeric field per series. Scrolls horizontally once there are more categories than fit.
 */
export function CategoryBars({
  data,
  series,
  // Vertical labels take ~117px of axis, so the box is taller than a plain bar chart.
  height = 400,
  slotWidth = 76,
  onBar,
}: {
  /** One row per category: a `name` plus one numeric field per series key. */
  data: { name: string; [series: string]: string | number }[]
  series: BarSeries[]
  height?: number
  slotWidth?: number
  onBar?: (name: string) => void
}) {
  const t = useT()
  // A category whose every plotted series is 0 draws an invisible bar that still takes an
  // axis slot and answers hover with "0" — drop it rather than render dead space.
  const plotted = data.filter((d) => series.some((s) => Number(d[s.key]) !== 0))
  if (plotted.length === 0) return <NoRows />
  const minWidth = Math.max(420, plotted.length * slotWidth)

  return (
    <div className="scroll-area" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
      <div style={{ minWidth, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={plotted} margin={{ top: 16, right: 12, left: 0, bottom: 4 }} barCategoryGap="26%">
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`qaGrad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES[s.tone].from} />
                  <stop offset="100%" stopColor={SERIES[s.tone].to} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke={INK.grid} strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="name"
              tick={<WrapTick chars={LABEL_CHARS} maxLines={LABEL_LINES} />}
              tickLine={false}
              axisLine={{ stroke: INK.axis }}
              interval={0}
              height={wrapAxisHeight(LABEL_CHARS)}
            />
            <YAxis tick={{ fontSize: 11, fill: INK.secondary }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => fmtInt(v)} />
            <Tooltip
              cursor={{ fill: 'rgba(31,78,140,0.08)' }}
              wrapperStyle={{ zIndex: 40 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const row = payload[0].payload as Record<string, number>
                return (
                  <ChartTip
                    title={String(label)}
                    items={series.map((s) => ({ label: t(s.name), value: fmtInt(Number(row[s.key]) || 0), color: SERIES[s.tone].flat }))}
                  />
                )
              }}
            />
            {series.length > 1 && <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12, color: INK.secondary, paddingTop: 4 }} />}
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={t(s.name)}
                fill={`url(#qaGrad-${s.key})`}
                radius={[3, 3, 0, 0]}
                maxBarSize={38}
                isAnimationActive={false}
                onClick={onBar ? (d: { name?: string }) => d?.name && onBar(d.name) : undefined}
                cursor={onBar ? 'pointer' : undefined}
              >
                {onBar && plotted.map((d) => <Cell key={d.name} />)}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
