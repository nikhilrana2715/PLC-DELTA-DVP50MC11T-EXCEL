// The notification centre's store. Lives on the device (localStorage) so history survives
// reloads and works offline; a server-backed history can later hydrate it through `merge`.
//
// Design notes:
// • Newest-first, capped at MAX so a long-running kiosk cannot grow without bound.
// • `id` is the dedupe key — re-delivering the same id updates the entry instead of
//   stacking duplicates, which is what stops a retrying push from spamming the list.
// • Reads/writes go through a tiny pub-sub so `useSyncExternalStore` can drive React.
import { CATEGORY_BY_ID, type AppNotif, type CategoryId, type NotifInput, type Priority } from './types'

const KEY = 'mm.notify.items.v1'
/** Plenty for months of history; older entries fall off the end. */
const MAX = 2000

let items: AppNotif[] = load()
const listeners = new Set<() => void>()

function load(): AppNotif[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as AppNotif[]
    return Array.isArray(list) ? list.slice(0, MAX) : []
  } catch {
    return []
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)))
  } catch {
    // Quota hit — drop the oldest half rather than losing every notification.
    try {
      items = items.slice(0, Math.floor(items.length / 2))
      localStorage.setItem(KEY, JSON.stringify(items))
    } catch {
      /* give up silently */
    }
  }
}

function emit() {
  persist()
  listeners.forEach((f) => f())
}

export function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Stable snapshot for useSyncExternalStore — the same array identity until something changes. */
export function getAll(): AppNotif[] {
  return items
}

let seq = 0
const newId = () => `n_${Date.now().toString(36)}_${(seq++).toString(36)}`

/** Add (or update, when the id already exists). Returns the stored record. */
export function add(input: NotifInput): AppNotif {
  const cat = CATEGORY_BY_ID[input.category] ?? CATEGORY_BY_ID.system
  const rec: AppNotif = {
    id: input.id ?? newId(),
    category: input.category,
    priority: input.priority ?? cat.defaultPriority,
    title: input.title,
    subtitle: input.subtitle,
    body: input.body,
    at: input.at ?? Date.now(),
    read: false,
    image: input.image,
    progress: input.progress,
    actions: input.actions,
    href: input.href,
    source: input.source,
    data: input.data,
  }
  const i = items.findIndex((x) => x.id === rec.id)
  if (i >= 0) {
    // Same id again → update in place, keeping whether it was already read.
    items[i] = { ...rec, read: items[i].read }
    items = [...items]
  } else {
    items = [rec, ...items].slice(0, MAX)
  }
  emit()
  return rec
}

/** Bulk insert (e.g. history pulled from a server). Existing ids are updated, not doubled. */
export function merge(list: AppNotif[]) {
  if (list.length === 0) return
  const byId = new Map(items.map((n) => [n.id, n]))
  for (const n of list) {
    const prev = byId.get(n.id)
    byId.set(n.id, prev ? { ...n, read: prev.read || n.read } : n)
  }
  items = [...byId.values()].sort((a, b) => b.at - a.at).slice(0, MAX)
  emit()
}

export function markRead(id: string, read = true) {
  const i = items.findIndex((x) => x.id === id)
  if (i < 0 || items[i].read === read) return
  items = items.map((n, k) => (k === i ? { ...n, read } : n))
  emit()
}

export function markAllRead() {
  if (!items.some((n) => !n.read)) return
  items = items.map((n) => (n.read ? n : { ...n, read: true }))
  emit()
}

export function remove(id: string) {
  const next = items.filter((x) => x.id !== id)
  if (next.length === items.length) return
  items = next
  emit()
}

export function clearAll() {
  if (items.length === 0) return
  items = []
  emit()
}

/** Drop everything older than `days` — pairs with the app's 30-day retention. */
export function purgeOlderThan(days: number): number {
  const cutoff = Date.now() - days * 864e5
  const next = items.filter((n) => n.at >= cutoff)
  const removed = items.length - next.length
  if (removed) {
    items = next
    emit()
  }
  return removed
}

export const unreadCount = (list: AppNotif[] = items): number => list.reduce((n, x) => n + (x.read ? 0 : 1), 0)

export interface Query {
  category?: CategoryId | 'all'
  priority?: Priority | 'all'
  unreadOnly?: boolean
  search?: string
}

export function filterItems(list: AppNotif[], q: Query): AppNotif[] {
  const text = (q.search ?? '').trim().toLowerCase()
  return list.filter((n) => {
    if (q.category && q.category !== 'all' && n.category !== q.category) return false
    if (q.priority && q.priority !== 'all' && n.priority !== q.priority) return false
    if (q.unreadOnly && n.read) return false
    if (text && !`${n.title} ${n.subtitle ?? ''} ${n.body ?? ''} ${n.source ?? ''}`.toLowerCase().includes(text)) return false
    return true
  })
}

/** Per-category unread tallies, for the filter chips. */
export function countsByCategory(list: AppNotif[] = items): Record<string, number> {
  const out: Record<string, number> = {}
  for (const n of list) if (!n.read) out[n.category] = (out[n.category] ?? 0) + 1
  return out
}
