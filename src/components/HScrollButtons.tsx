import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useT } from '../lib/i18n'

/**
 * Left / right paging for a table too wide to fit.
 *
 * The pace is the whole point. A tap moves about two columns — a near-full-width jump skips
 * past whatever the reader was following, and a few pixels feels broken. Holding the button
 * keeps it moving, so crossing thirty columns costs one press instead of twenty taps, and the
 * first repeat waits a moment so a plain click never turns into a run.
 *
 * Shared by every wide table in the app so they all feel the same under the finger on both desktop and mobile.
 */

/** Pixels one tap moves — roughly two to three columns. */
const STEP = 260
/** How long a press is held before it starts repeating. */
const HOLD_DELAY = 320
/** Gap between repeats while held. */
const REPEAT = 50

type Target = React.RefObject<HTMLElement | null> | React.MutableRefObject<HTMLElement | null>

export function HScrollButtons({ scrollRef }: { scrollRef: Target | Target[] }) {
  const t = useT()
  const timer = useRef<number>(0)
  // Refs whose element is not on screen right now simply drop out.
  const targets = () =>
    (Array.isArray(scrollRef) ? scrollRef : [scrollRef])
      .map((r) => r?.current)
      .filter((el): el is HTMLElement => !!el)

  const stop = () => {
    clearTimeout(timer.current)
    clearInterval(timer.current)
    timer.current = 0
  }
  useEffect(() => stop, [])

  const start = (dir: -1 | 1) => {
    for (const el of targets()) el.scrollBy({ left: dir * STEP, behavior: 'smooth' })
    stop()
    timer.current = window.setTimeout(() => {
      timer.current = window.setInterval(() => {
        for (const el of targets()) el.scrollBy({ left: dir * 45 })
      }, REPEAT)
    }, HOLD_DELAY)
  }

  const handleClick = (e: React.MouseEvent, dir: -1 | 1) => {
    e.preventDefault()
    for (const el of targets()) el.scrollBy({ left: dir * STEP, behavior: 'smooth' })
  }

  const btn =
    'w-9 h-9 sm:w-8 sm:h-8 grid place-items-center rounded-xl border border-slate-200 bg-white hover:bg-slate-100 active:scale-95 transition shadow-xs text-slate-700 cursor-pointer select-none touch-manipulation'

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        onPointerDown={() => start(-1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onClick={(e) => handleClick(e, -1)}
        className={btn}
        aria-label={t('Scroll columns left')}
        title={t('Scroll columns left — hold to keep going')}
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        onPointerDown={() => start(1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onClick={(e) => handleClick(e, 1)}
        className={btn}
        aria-label={t('Scroll columns right')}
        title={t('Scroll columns right — hold to keep going')}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
