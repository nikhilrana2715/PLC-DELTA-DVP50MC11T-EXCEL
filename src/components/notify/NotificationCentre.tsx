import { useMemo, useState } from 'react'
import { Bell, CheckCheck, Filter, Search, Trash2 } from 'lucide-react'
import { NotifCard } from './NotifCard'
import { NotifSettings } from './NotifSettings'
import { useNotifications } from '../../lib/notify/useNotifications'
import { countsByCategory, filterItems } from '../../lib/notify/store'
import { CATEGORIES, PRIORITIES, type AppNotif, type CategoryId, type NotifAction, type Priority } from '../../lib/notify/types'

const PAGE = 30

/**
 * Notification Centre — full history with filters, search and settings.
 *
 * The list is paged rather than virtualised: it renders PAGE at a time and grows on
 * demand, which keeps thousands of stored notifications cheap without a dependency.
 */
export function NotificationCentre({ onAction }: { onAction: (n: AppNotif, action: NotifAction | { id: 'open' }) => void }) {
  const { items, unread, markRead, markAllRead, remove, clearAll } = useNotifications()
  const [tab, setTab] = useState<'all' | 'settings'>('all')
  const [category, setCategory] = useState<CategoryId | 'all'>('all')
  const [priority, setPriority] = useState<Priority | 'all'>('all')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const filtered = useMemo(
    () => filterItems(items, { category, priority, unreadOnly, search }),
    [items, category, priority, unreadOnly, search],
  )
  const shown = filtered.slice(0, limit)
  const perCat = useMemo(() => countsByCategory(items), [items])

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold border transition ${
      active ? 'text-white border-transparent' : 'hover:brightness-95'
    }`

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      {/* header */}
      <div className="bento bento-pad flex items-center gap-3 flex-wrap">
        <div className="w-9 h-9 rounded-xl grid place-items-center grad-violet text-white shrink-0">
          <Bell size={18} />
        </div>
        <div className="flex-1 min-w-[180px]">
          <div className="font-bold text-slate-800">Notification Centre</div>
          <div className="text-xs text-slate-500">
            {items.length} total · <b>{unread}</b> unread
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="icon-btn" onClick={markAllRead} disabled={unread === 0}>
            <CheckCheck size={14} /> Mark all read
          </button>
          <button
            className="icon-btn hover:!text-red-600"
            onClick={() => {
              if (items.length && confirm(`Delete all ${items.length} notification(s)? This cannot be undone.`)) clearAll()
            }}
            disabled={items.length === 0}
          >
            <Trash2 size={14} /> Clear all
          </button>
        </div>
      </div>

      {/* tabs */}
      <div className="bento bento-pad !py-2 flex items-center gap-1.5">
        {(['all', 'settings'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'all' ? 'All notifications' : 'Settings'}
          </button>
        ))}
      </div>

      {tab === 'settings' ? (
        <NotifSettings />
      ) : (
        <>
          {/* filters */}
          <div className="bento bento-pad flex flex-col gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter size={15} className="text-indigo-500 shrink-0" />
              <div className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 flex-1 min-w-[180px]" style={{ borderColor: 'var(--hairline)' }}>
                <Search size={14} className="shrink-0" style={{ color: 'var(--ink-muted)' }} />
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setLimit(PAGE)
                  }}
                  placeholder="Search notifications…"
                  className="w-full text-[13px] outline-none bg-transparent"
                  style={{ color: 'var(--ink)' }}
                />
              </div>
              <label className="flex items-center gap-1.5 text-[12.5px] font-semibold shrink-0" style={{ color: 'var(--ink-2)' }}>
                <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                Unread only
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority | 'all')}
                className="rounded-lg border px-2 py-1.5 text-[12.5px] font-semibold bg-white text-slate-700 outline-none shrink-0"
                style={{ borderColor: 'var(--hairline)' }}
              >
                <option value="all">All priorities</option>
                {PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-1.5 overflow-x-auto scroll-area pb-0.5">
              <button
                onClick={() => {
                  setCategory('all')
                  setLimit(PAGE)
                }}
                className={chip(category === 'all')}
                style={category === 'all' ? { background: '#4f46e5' } : { borderColor: 'var(--hairline)', color: 'var(--ink-2)' }}
              >
                All
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCategory(c.id)
                    setLimit(PAGE)
                  }}
                  className={chip(category === c.id)}
                  style={category === c.id ? { background: c.color } : { borderColor: 'var(--hairline)', color: 'var(--ink-2)' }}
                >
                  {c.label}
                  {perCat[c.id] ? ` (${perCat[c.id]})` : ''}
                </button>
              ))}
            </div>
          </div>

          {/* list */}
          <div className="bento bento-pad flex flex-col gap-2">
            {shown.length === 0 ? (
              <div className="py-16 text-center">
                <Bell size={30} className="mx-auto mb-3" style={{ color: 'var(--ink-muted)' }} />
                <div className="text-lg font-bold text-slate-700">
                  {items.length === 0 ? 'No notifications yet' : 'Nothing matches these filters'}
                </div>
                <div className="text-sm text-slate-400 mt-1">
                  {items.length === 0 ? 'Alerts, reminders and production updates will collect here.' : 'Try clearing the search or category filter.'}
                </div>
              </div>
            ) : (
              <>
                {shown.map((n) => (
                  <NotifCard key={n.id} n={n} onAction={onAction} onRead={markRead} onDelete={remove} />
                ))}
                {filtered.length > shown.length && (
                  <button onClick={() => setLimit((l) => l + PAGE)} className="mt-1 w-full rounded-xl border py-2.5 text-[13px] font-bold hover:brightness-95" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-2)' }}>
                    Load {Math.min(PAGE, filtered.length - shown.length)} more · {filtered.length - shown.length} left
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
