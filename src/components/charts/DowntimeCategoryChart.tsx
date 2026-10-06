import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ReasonDetail } from '../../lib/aggregate'
import { INK } from '../../lib/palette'
import { DT_CATEGORY_META, categoryLabel, downtimeColor } from '../../lib/downtime'
import { TooltipCard } from './ChartTooltip'
import { chartFit } from '../../lib/chartFit'

/** Vertical downtime-by-reason bars, coloured by the 3 downtime categories. */
export function DowntimeCategoryChart({ data }: { data: ReasonDetail[] }) {
  if (data.length === 0) {
    return (
      <div className="text-sm text-slate-400 text-center py-10">
        No downtime recorded yet — fill the downtime columns in the report to see the breakdown.
      </div>
    )
  }

  const cut = (s: string, n = 15) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
  // Reason names are long, so they turn sooner than a machine list would.
  const fit = chartFit(data.length, { perItem: 0, rotateOver: 5, longLabels: true })

  return (
    <div className="flex flex-col gap-2">
      {/* legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
        {Object.values(DT_CATEGORY_META).map((c) => (
          <span key={c.label} className="inline-flex items-center gap-1.5 text-[12px] text-slate-600">
            <span className="w-3 h-3 rounded-sm" style={{ background: c.color }} />
            {c.label}
          </span>
        ))}
      </div>

      {/* chart fits the container width so the tooltip never runs off the screen edge */}
      <div style={{ width: '100%', height: fit.axis.angle ? 340 : 268 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }} barCategoryGap="18%">
            <CartesianGrid stroke={INK.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="reason"
              tickFormatter={(v: string) => cut(v)}
              tick={{ fontSize: 11, fill: INK.primary, fontWeight: 600 }}
              tickLine={false}
              axisLine={{ stroke: INK.axis }}
              interval={0}
              {...fit.axis}
            />
            <YAxis tick={{ fontSize: 11, fill: INK.muted }} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              cursor={{ fill: 'rgba(42,120,214,0.06)' }}
              wrapperStyle={{ zIndex: 40 }}
              allowEscapeViewBox={{ x: false, y: true }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0]?.payload as ReasonDetail
                const color = downtimeColor(p.reason)
                const top = p.machines.slice(0, 6)
                const more = p.machines.length - top.length
                return (
                  <TooltipCard
                    title={`${p.reason} · ${categoryLabel(p.reason)}`}
                    items={[
                      { label: 'Total', value: `${p.value} min`, color },
                      ...top.map((m) => ({ label: m.mc, value: `${m.value} min`, color })),
                      ...(more > 0 ? [{ label: `+${more} more machines`, value: '', color }] : []),
                    ]}
                  />
                )
              }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={Math.max(30, fit.barSize)} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={i} fill={downtimeColor(d.reason)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
