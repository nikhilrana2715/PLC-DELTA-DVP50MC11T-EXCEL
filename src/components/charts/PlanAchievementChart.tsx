import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { MachineRow } from '../../types'
import { INK, SERIES } from '../../lib/palette'
import { TooltipCard } from './ChartTooltip'
import { getUnit, hasRunningPlan } from '../../lib/unit'
import { chartFit } from '../../lib/chartFit'

/**
 * Grouped bars: plan vs Achievement vs Backlog, per machine. The plan bar is the Actual
 * Running Plan where the sheet has one, and plain Plan Qty where it does not.
 *
 * Includes comfortable, prominent Left / Right navigation buttons with smooth scroll
 * and press-to-scroll support.
 */
export function PlanAchievementChart({ rows }: { rows: MachineRow[] }) {
  const runningPlan = hasRunningPlan(getUnit())
  const planName = runningPlan ? 'Running Plan' : 'Plan Qty'
  const data = rows.map((r) => ({
    mc: r.mc,
    plan: runningPlan ? r.runningPlan : r.planQty,
    achievement: r.achQty,
    backlog: r.backlog,
  }))

  const fit = chartFit(data.length, { perItem: 62 })

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
          <div style={{ minWidth: fit.minWidth, height: fit.axis.angle ? 330 : 286 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 4 }} barCategoryGap="22%">
                <defs>
                  <linearGradient id="barPlan" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5b9bf0" />
                    <stop offset="100%" stopColor="#2a78d6" />
                  </linearGradient>
                  <linearGradient id="barAch" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3fd39b" />
                    <stop offset="100%" stopColor="#1baf7a" />
                  </linearGradient>
                  <linearGradient id="barBacklog" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff9a63" />
                    <stop offset="100%" stopColor="#eb6834" />
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
                  tick={{ fontSize: 11, fill: INK.muted }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(42,120,214,0.06)' }}
                  wrapperStyle={{ zIndex: 40 }}
                  allowEscapeViewBox={{ x: false, y: true }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <TooltipCard
                        title={String(label)}
                        items={[
                          { label: planName, value: payload[0]?.payload.plan, color: SERIES.plan },
                          { label: 'Achievement', value: payload[0]?.payload.achievement, color: SERIES.achievement },
                          { label: 'Backlog', value: payload[0]?.payload.backlog, color: SERIES.backlog },
                        ]}
                      />
                    )
                  }}
                />
                <Bar dataKey="plan" name={planName} fill="url(#barPlan)" radius={[4, 4, 0, 0]} maxBarSize={fit.barSize} isAnimationActive={false} />
                <Bar dataKey="achievement" name="Achievement" fill="url(#barAch)" radius={[4, 4, 0, 0]} maxBarSize={fit.barSize} isAnimationActive={false} />
                <Bar dataKey="backlog" name="Backlog" fill="url(#barBacklog)" radius={[4, 4, 0, 0]} maxBarSize={fit.barSize} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Floating Left Button on Chart Edge */}
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

        {/* Floating Right Button on Chart Edge */}
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

      {/* Bottom Controls Bar: Left / Right Navigation Buttons + Machine Count + Legend */}
      <div className="flex items-center justify-between gap-3 pt-1.5 px-1 border-t border-slate-100 flex-wrap">
        {/* Navigation Buttons */}
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

        {/* Legend (permanent and unclipped) */}
        <div className="flex items-center gap-3 text-xs text-slate-600 font-medium ml-auto">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2a78d6] shrink-0" />
            <span>{planName}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1baf7a] shrink-0" />
            <span>Achievement</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#eb6834] shrink-0" />
            <span>Backlog</span>
          </span>
        </div>
      </div>
    </div>
  )
}
