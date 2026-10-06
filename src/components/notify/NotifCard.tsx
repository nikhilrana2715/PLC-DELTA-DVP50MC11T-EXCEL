import { useState } from 'react'
import { Bell, Check, ChevronDown, Trash2 } from 'lucide-react'
import { CATEGORY_BY_ID, PRIORITIES, type AppNotif, type NotifAction } from '../../lib/notify/types'

const timeAgo = (ts: number): string => {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

const prio = (p: AppNotif['priority']) => PRIORITIES.find((x) => x.id === p) ?? PRIORITIES[1]

/**
 * One notification. Collapsed it shows title + subtitle; expanding reveals the full body,
 * the image and the action buttons — the "expandable / rich" behaviour, in-app.
 */
export function NotifCard({
  n,
  compact = false,
  onAction,
  onRead,
  onDelete,
}: {
  n: AppNotif
  /** Dropdown mode: tighter padding, no image. */
  compact?: boolean
  onAction: (n: AppNotif, action: NotifAction | { id: 'open' }) => void
  onRead: (id: string, read: boolean) => void
  onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const cat = CATEGORY_BY_ID[n.category] ?? CATEGORY_BY_ID.system
  const p = prio(n.priority)
  const expandable = !!(n.body || n.image || (n.actions && n.actions.length))

  return (
    <div
      className={`relative rounded-xl border transition ${compact ? 'p-2.5' : 'p-3 md:p-3.5'} ${
        n.read ? 'border-[var(--hairline)]' : 'border-transparent'
      }`}
      style={{
        // Unread carries a wash of its category colour so a glance sorts the list.
        background: n.read ? 'var(--surface)' : `color-mix(in srgb, ${cat.color} 9%, var(--surface))`,
        borderColor: n.read ? undefined : `color-mix(in srgb, ${cat.color} 32%, var(--surface))`,
      }}
    >
      {/* priority stripe */}
      <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" style={{ background: p.color }} aria-hidden />

      <div className="flex items-start gap-2.5 pl-2">
        {/* app logo / category dot */}
        <div
          className="shrink-0 w-8 h-8 rounded-lg grid place-items-center text-white shadow-sm"
          style={{ background: cat.color }}
          title={cat.label}
        >
          <Bell size={15} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              {/* The title is the click target when the notification has a destination.
                  A full-card overlay would have swallowed the action / read / delete
                  buttons sitting inside it. */}
              {n.href ? (
                <button
                  onClick={() => onAction(n, { id: 'open' })}
                  className={`text-left w-full text-[13.5px] leading-snug hover:underline ${n.read ? 'font-semibold' : 'font-extrabold'}`}
                  style={{ color: 'var(--ink)' }}
                >
                  {n.title}
                </button>
              ) : (
                <div className={`text-[13.5px] leading-snug ${n.read ? 'font-semibold' : 'font-extrabold'}`} style={{ color: 'var(--ink)' }}>
                  {n.title}
                </div>
              )}
              {n.subtitle && (
                <div className="text-[12px] leading-snug mt-0.5 truncate" style={{ color: 'var(--ink-2)' }}>
                  {n.subtitle}
                </div>
              )}
            </div>
            {!n.read && <span className="mt-1 shrink-0 w-2 h-2 rounded-full" style={{ background: p.color }} aria-label="unread" />}
          </div>

          {/* meta line: category · priority · source · time */}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[10.5px]">
            <span className="rounded-full px-1.5 py-[1px] font-bold" style={{ background: `color-mix(in srgb, ${cat.color} 18%, var(--surface))`, color: `color-mix(in srgb, ${cat.color} 72%, var(--ink))` }}>
              {cat.label}
            </span>
            {n.priority !== 'normal' && (
              <span className="rounded-full px-1.5 py-[1px] font-bold" style={{ background: `color-mix(in srgb, ${p.color} 18%, var(--surface))`, color: `color-mix(in srgb, ${p.color} 72%, var(--ink))` }}>
                {p.label}
              </span>
            )}
            {n.source && <span style={{ color: 'var(--ink-hint)' }}>{n.source}</span>}
            <span style={{ color: 'var(--ink-hint)' }}>· {timeAgo(n.at)}</span>
            <span className="ml-auto flex items-center gap-0.5">
              <button
                onClick={() => onRead(n.id, !n.read)}
                className="p-1 rounded hover:brightness-95"
                title={n.read ? 'Mark unread' : 'Mark read'}
                style={{ color: 'var(--ink-muted)' }}
              >
                <Check size={13} />
              </button>
              <button onClick={() => onDelete(n.id)} className="p-1 rounded hover:text-red-600" title="Delete" style={{ color: 'var(--ink-muted)' }}>
                <Trash2 size={13} />
              </button>
            </span>
          </div>

          {/* progress */}
          {typeof n.progress === 'number' && (
            <div className="mt-2">
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--ink) 12%, var(--surface))' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, n.progress))}%`, background: cat.color }} />
              </div>
              <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--ink-hint)' }}>
                {Math.round(n.progress)}%
              </div>
            </div>
          )}

          {/* expandable body */}
          {expandable && (
            <>
              <button
                onClick={() => setOpen((v) => !v)}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold"
                style={{ color: `color-mix(in srgb, ${cat.color} 72%, var(--ink))` }}
                aria-expanded={open}
              >
                {open ? 'Show less' : 'Show more'}
                <ChevronDown size={12} className={`transition ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="mt-2 space-y-2">
                  {n.body && (
                    <p className="text-[12.5px] leading-relaxed whitespace-pre-line" style={{ color: 'var(--ink-2)' }}>
                      {n.body}
                    </p>
                  )}
                  {n.image && !compact && (
                    <img src={n.image} alt="" className="rounded-lg max-h-52 w-full object-cover border" style={{ borderColor: 'var(--hairline)' }} loading="lazy" />
                  )}
                  {n.actions && n.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {n.actions.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => onAction(n, a)}
                          className={`rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition ${
                            a.tone === 'primary'
                              ? 'text-white'
                              : a.tone === 'danger'
                                ? 'text-red-600 border border-red-200 hover:bg-red-50'
                                : 'border hover:brightness-95'
                          }`}
                          style={
                            a.tone === 'primary'
                              ? { background: cat.color }
                              : a.tone === 'danger'
                                ? undefined
                                : { borderColor: 'var(--hairline)', color: 'var(--ink-2)' }
                          }
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

    </div>
  )
}

export { timeAgo }
