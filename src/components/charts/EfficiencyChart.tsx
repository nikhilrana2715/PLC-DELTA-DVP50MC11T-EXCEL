import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Dot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { MachineRow } from '../../types'
import { INK, SERIES, STATUS, efficiencyColor } from '../../lib/palette'
import { TooltipCard } from './ChartTooltip'
import { efficiencyGoodLine, efficiencyTarget } from '../../lib/unit'
import { chartFit } from '../../lib/chartFit'

/** Gradient area chart of efficiency per machine, with the unit's target & good markers. */
export function EfficiencyChart({ rows }: { rows: MachineRow[] }) {
  // Both marker lines follow the active unit: Unit 1 reads 75 / 90, Shell 90 / 96, Roller 95 / 98.
  const target = efficiencyTarget()
  const goodLine = efficiencyGoodLine()
  const data = rows
    .filter((r) => r.efficiency !== null)
    .map((r) => ({ mc: r.mc, efficiency: r.efficiency as number }))

  const fit = chartFit(data.length, { perItem: 50 })

  const scrollerRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)
  const [hasOverflow, setHasOverflow] = useState(false)
  const holdTimer = useRef<number>(0)

  const checkScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    const maxScroll = scrollWidth - clientWidth
    const overflow = maxScroll > 4
    setHasOverflow(overflow)
    setCanLeft(scrollLeft > 4)
    setCanRight(overflow && scrollLeft < maxScroll - 4)
  }, [])

  useEffect(() => {
    checkScroll()
    const el = scrollerRef.current
    if (!el) return
    const ro = new ResizeObserver(checkScroll)
    ro.observe(el)
    window.addEventListener('resize', checkScroll)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', checkScroll)
    }
  }, [checkScroll, data.length])

  const STEP = 260
  const step = (dir: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: dir * STEP, behavior: 'smooth' })
    setTimeout(checkScroll, 320)
  }

  const stopHold = () => {
    clearTimeout(holdTimer.current)
    clearInterval(holdTimer.current)
    holdTimer.current = 0
    checkScroll()
  }

  const startHold = (dir: -1 | 1) => {
    step(dir)
    stopHold()
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = window.setInterval(() => {
        const el = scrollerRef.current
        if (!el) return
        el.scrollBy({ left: dir * 45 })
        checkScroll()
      }, 50)
    }, 350)
  }

  useEffect(() => stopHold, [])

  return (
    <div className="flex flex-col gap-2">
      {/* Chart container with floating buttons */}
      <div className="relative group">
        <div
          ref={scrollerRef}
          className="scroll-area"
          style={{ overflowX: 'auto', overflowY: 'hidden' }}
          onScroll={checkScroll}
        >
          <div style={{ minWidth: fit.minWidth, height: fit.axis.angle ? 320 : 276 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 4 }}>
                <defs>
                  {/* reference-style violet -> blue vertical gradient */}
                  <linearGradient id="effArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c6cf0" stopOpacity={0.5} />
                    <stop offset="45%" stopColor="#5b7cf0" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#4a3aa7" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="effLine" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#4a3aa7" />
                    <stop offset="100%" stopColor="#2a78d6" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={INK.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="mc"
                  tick={{ fontSize: 11, fill: INK.primary, fontWeight: 600 }}
                  tickLine={false}
                  axisLine={{ stroke: INK.axis }}
                  interval={0}
                  {...fit.axis}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, target, goodLine, 100].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b)}
                  tick={{ fontSize: 11, fill: INK.muted }}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                  unit="%"
                />
                <ReferenceLine
                  y={target}
                  stroke={STATUS.critical}
                  strokeDasharray="5 4"
                  label={{ value: `Target ${target}%`, position: 'insideTopRight', fill: STATUS.critical, fontSize: 10, fontWeight: 700, dy: -4 }}
                />
                <ReferenceLine y={goodLine} stroke={STATUS.good} strokeDasharray="2 4" />
                <Tooltip
                  cursor={{ stroke: INK.axis, strokeWidth: 1 }}
                  wrapperStyle={{ zIndex: 40 }}
                  allowEscapeViewBox={{ x: false, y: true }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const v = payload[0]?.value as number
                    return (
                      <TooltipCard
                        title={String(label)}
                        items={[{ label: 'Efficiency', value: `${v}%`, color: efficiencyColor(v) }]}
                      />
                    )
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="efficiency"
                  name="Efficiency"
                  stroke="url(#effLine)"
                  strokeWidth={2.5}
                  fill="url(#effArea)"
                  isAnimationActive={false}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff', fill: SERIES.efficiency }}
                  dot={(props) => {
                    const { cx, cy, payload, key } = props as unknown as {
                      cx: number
                      cy: number
                      key: string
                      payload: { efficiency: number }
                    }
                    return (
                      <Dot
                        key={key}
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill={efficiencyColor(payload.efficiency)}
                        stroke="#fff"
                        strokeWidth={1.5}
                      />
                    )
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Floating Left Button */}
        {hasOverflow && canLeft && (
          <button
            type="button"
            onClick={() => step(-1)}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white/95 hover:bg-white text-slate-800 shadow-md border border-slate-200/80 flex items-center justify-center transition-transform hover:scale-110 active:scale-95 cursor-pointer backdrop-blur-xs"
            title="Scroll Left"
          >
            <ChevronLeft size={18} />
          </button>
        )}

        {/* Floating Right Button */}
        {hasOverflow && canRight && (
          <button
            type="button"
            onClick={() => step(1)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white/95 hover:bg-white text-slate-800 shadow-md border border-slate-200/80 flex items-center justify-center transition-transform hover:scale-110 active:scale-95 cursor-pointer backdrop-blur-xs"
            title="Scroll Right"
          >
            <ChevronRight size={18} />
          </button>
        )}
      </div>

      {/* Bottom Controls Bar */}
      <div className="flex items-center justify-between gap-3 pt-1.5 px-1 border-t border-slate-100 flex-wrap">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onPointerDown={() => startHold(-1)}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onClick={() => step(-1)}
            disabled={!canLeft}
            className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${
              canLeft
                ? 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 shadow-xs active:scale-95 cursor-pointer'
                : 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
            }`}
            title="Scroll Left"
          >
            <ChevronLeft size={18} />
          </button>

          <button
            type="button"
            onPointerDown={() => startHold(1)}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onClick={() => step(1)}
            disabled={!canRight}
            className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${
              canRight
                ? 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 shadow-xs active:scale-95 cursor-pointer'
                : 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
            }`}
            title="Scroll Right"
          >
            <ChevronRight size={18} />
          </button>

          <span className="text-[11px] font-semibold text-slate-400 ml-1">
            {data.length} machines
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500 font-medium ml-auto">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-rose-500" />
            Target ({target}%)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-emerald-500" />
            Good ({goodLine}%)
          </span>
        </div>
      </div>
    </div>
  )
}
