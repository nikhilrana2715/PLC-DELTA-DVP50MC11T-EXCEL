import { useEffect, useState } from 'react'
import { Pause } from 'lucide-react'
import type { LoopStep } from '../lib/loop'
import { useT } from '../lib/i18n'

/**
 * The loop's whole presence on screen: one small dial in the header, the size of the
 * refresh button beside it.
 *
 * A banner across the top of a looping dashboard costs the room the very thing the loop is
 * for — the card. So all that stays is the countdown: a ring that drains, the seconds left
 * inside it, and the current group and card on its tooltip for anyone who wants them. Click
 * pauses, because a meeting stops on whatever someone wants to talk about; Loop itself is
 * turned off in Settings.
 */
export function LoopTimer({
  step,
  index,
  total,
  paused,
  seconds,
  groups,
  onPause,
}: {
  step: LoopStep
  index: number
  total: number
  paused: boolean
  seconds: number
  /** False when this workspace has no machine groups to cycle (Assembly). */
  groups: boolean
  onPause: () => void
}) {
  const t = useT()
  // The number in the middle. Restarted by the key on `index`, so it always matches the ring.
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    setLeft(seconds)
    if (paused) return
    const id = window.setInterval(() => setLeft((n) => (n > 1 ? n - 1 : n)), 1000)
    return () => window.clearInterval(id)
  }, [index, seconds, paused])

  const where = groups
    ? `${step.group === 'ALL' ? t('All Machines') : `${step.group} ${t('Machine')}`} · ${t(step.section.label)}`
    : t(step.section.label)

  return (
    <button
      onClick={onPause}
      className="shrink-0 relative w-9 h-9 grid place-items-center rounded-xl bg-white border border-[var(--hairline)] hover:bg-slate-50 transition"
      title={`${where} — ${index + 1}/${total} · ${paused ? t('paused') : `${seconds}s ${t('each')}`} · ${t('click to pause')}`}
      aria-label={`Loop: ${where}. ${paused ? 'Paused' : 'Playing'}. Click to ${paused ? 'play' : 'pause'}.`}
    >
      {/* pathLength normalises the circle to 100 units, so one keyframe fits any radius. */}
      <svg width="30" height="30" viewBox="0 0 30 30" className="absolute inset-0 m-auto -rotate-90">
        <circle cx="15" cy="15" r="12.5" fill="none" stroke="var(--hairline)" strokeWidth="2.5" />
        <circle
          key={`${index}-${paused}-${seconds}`}
          cx="15"
          cy="15"
          r="12.5"
          fill="none"
          stroke="#7c3aed"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset={paused ? 0 : undefined}
          style={paused ? undefined : { animation: `loop-ring ${seconds}s linear forwards` }}
        />
      </svg>
      {paused ? (
        <Pause size={13} className="relative" style={{ color: '#7c3aed' }} />
      ) : (
        <span className="relative text-[11px] font-extrabold tabular-nums" style={{ color: '#7c3aed' }}>
          {left}
        </span>
      )}
    </button>
  )
}
