import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

/**
 * A small dropdown that looks like the rest of the app.
 *
 * The header filters used native `<select>`s, which the browser paints itself — a hard blue
 * highlight bar, the system font, no rounding, and no idea the app has a dark theme. This
 * renders the list as ordinary markup instead, so the filters sit in the toolbar as one piece
 * with everything around them.
 *
 * Keyboard and screen readers still work: it is a real button, the list is a listbox, arrow
 * keys move through it, Enter picks, Escape closes.
 */

export interface SelectOption {
  value: string
  label: string
}

export function SelectMenu({
  value,
  options,
  onChange,
  icon,
  title,
  align = 'left',
  minWidth = 150,
}: {
  value: string
  options: SelectOption[]
  onChange: (v: string) => void
  icon?: React.ReactNode
  title?: string
  align?: 'left' | 'right'
  minWidth?: number
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const [shift, setShift] = useState(0)

  const current = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    const away = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open, options, value])

  // Nudge back on screen — in a crowded toolbar the menu can hang off the right edge.
  useLayoutEffect(() => {
    if (!open) {
      setShift(0)
      return
    }
    const el = listRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const pad = 8
    if (r.right > window.innerWidth - pad) setShift(window.innerWidth - pad - r.right)
    else if (r.left < pad) setShift(pad - r.left)
  }, [open])

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative shrink-0 min-w-0">
      <button
        type="button"
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className="flex items-center gap-1.5 rounded-lg border px-2 py-1.5 min-w-0 transition"
        style={{
          background: 'var(--surface)',
          borderColor: open ? '#818cf8' : 'var(--hairline)',
          color: 'var(--ink-2)',
        }}
      >
        {icon}
        <span className="text-[13px] font-semibold truncate min-w-0">{current?.label ?? ''}</span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--ink-hint)' }} />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => Math.min(options.length - 1, i + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => Math.max(0, i - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              pick(options[active].value)
            }
          }}
          className={`absolute z-50 top-full mt-1.5 ${align === 'right' ? 'right-0' : 'left-0'} rounded-xl border shadow-2xl py-1 max-h-[300px] overflow-y-auto scroll-area outline-none`}
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--hairline)',
            minWidth,
            maxWidth: 'calc(100vw - 16px)',
            transform: shift ? `translateX(${shift}px)` : undefined,
          }}
        >
          {options.map((o, i) => {
            const on = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o.value)}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-left text-[13px] font-semibold transition"
                style={{
                  background: i === active ? 'color-mix(in srgb, #6366f1 12%, var(--surface))' : 'transparent',
                  color: on ? '#4f46e5' : 'var(--ink-2)',
                }}
              >
                <Check size={14} className="shrink-0" style={{ opacity: on ? 1 : 0 }} />
                <span className="truncate min-w-0">{o.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
