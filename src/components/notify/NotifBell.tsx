import { useEffect, useRef, useState } from 'react'
import { Bell, BellOff, CheckCheck, Settings2 } from 'lucide-react'
import { NotifCard } from './NotifCard'
import { useNotifications, useNotifPrefs } from '../../lib/notify/useNotifications'
import type { AppNotif, NotifAction } from '../../lib/notify/types'

/**
 * Bell + unread badge + dropdown. The dropdown is a preview (latest 8); the full history,
 * filters and search live on the Notification Centre page.
 */
export function NotifBell({
  onAction,
  onOpenCentre,
}: {
  onAction: (n: AppNotif, action: NotifAction | { id: 'open' }) => void
  onOpenCentre: () => void
}) {
  const { items, unread, markRead, markAllRead, remove } = useNotifications()
  const [prefs] = useNotifPrefs()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const latest = items.slice(0, 8)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`relative shrink-0 w-9 h-9 grid place-items-center rounded-xl bg-white border border-[var(--hairline)] text-slate-700 hover:bg-slate-50 transition ${
          unread > 0 ? 'ring-2 ring-red-200' : ''
        }`}
        title={prefs.enabled ? `${unread} unread` : 'Notifications are off'}
        aria-label={`Notifications, ${unread} unread`}
        aria-expanded={open}
      >
        {prefs.enabled ? <Bell size={17} /> : <BellOff size={17} />}
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[19px] h-[19px] px-1 rounded-full bg-red-600 text-white text-[10.5px] font-extrabold grid place-items-center shadow-sm notif-pop">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[min(94vw,25rem)] rounded-2xl border shadow-2xl overflow-hidden z-50 notif-drop"
          style={{ background: 'var(--surface)', borderColor: 'var(--hairline)' }}
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center gap-2 px-3.5 py-2.5 border-b" style={{ borderColor: 'var(--hairline)' }}>
            <span className="font-extrabold text-[14px]" style={{ color: 'var(--ink)' }}>
              Notifications
            </span>
            {unread > 0 && (
              <span className="text-[10.5px] font-bold rounded-full px-1.5 py-[1px] bg-red-500 text-white">{unread}</span>
            )}
            <div className="ml-auto flex items-center gap-1">
              <button onClick={markAllRead} disabled={unread === 0} className="icon-btn !px-2 disabled:opacity-40" title="Mark all as read">
                <CheckCheck size={14} />
              </button>
              <button
                onClick={() => {
                  setOpen(false)
                  onOpenCentre()
                }}
                className="icon-btn !px-2"
                title="Notification Centre"
              >
                <Settings2 size={14} />
              </button>
            </div>
          </div>

          <div className="max-h-[min(60vh,26rem)] overflow-y-auto scroll-area p-2 flex flex-col gap-1.5">
            {latest.length === 0 ? (
              <div className="py-12 text-center">
                <Bell size={26} className="mx-auto mb-2" style={{ color: 'var(--ink-muted)' }} />
                <div className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
                  You are all caught up
                </div>
                <div className="text-[12px] mt-0.5" style={{ color: 'var(--ink-hint)' }}>
                  New alerts will appear here.
                </div>
              </div>
            ) : (
              latest.map((n) => (
                <NotifCard
                  key={n.id}
                  n={n}
                  compact
                  onAction={(x, a) => {
                    setOpen(false)
                    onAction(x, a)
                  }}
                  onRead={markRead}
                  onDelete={remove}
                />
              ))
            )}
          </div>

          <button
            onClick={() => {
              setOpen(false)
              onOpenCentre()
            }}
            className="w-full py-2.5 text-[12.5px] font-bold border-t hover:brightness-95 transition"
            style={{ borderColor: 'var(--hairline)', color: '#4f46e5' }}
          >
            View all notifications{items.length > latest.length ? ` (${items.length})` : ''}
          </button>
        </div>
      )}
    </div>
  )
}
