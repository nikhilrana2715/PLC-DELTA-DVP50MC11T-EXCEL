// Notification preferences — everything the user controls. Stored per device in
// localStorage; no server round-trip, so the checks below are cheap enough to run on
// every incoming notification.
import { CATEGORIES, priorityRank, type CategoryId, type Priority } from './types'

const KEY = 'mm.notify.prefs.v1'

export interface DndWindow {
  enabled: boolean
  /** 'HH:MM' 24h. `from` may be later than `to` — that means the window crosses midnight. */
  from: string
  to: string
}

export interface NotifPrefs {
  /** Master switch. Off = nothing shows, nothing is stored. */
  enabled: boolean
  /** Categories the user muted. Muted = still recorded in the centre, but silent + no OS popup. */
  muted: CategoryId[]
  /** Anything below this priority is dropped entirely. */
  minPriority: Priority
  sound: string
  /** Silent mode: keep popups, drop sound + vibration. */
  silent: boolean
  vibrate: boolean
  /** Show the OS/system notification (needs browser permission). */
  system: boolean
  dnd: DndWindow
}

/** `file: ''` with a `tone` means "synthesise it" — the app ships only one audio asset,
 *  so the sharper options are generated rather than referencing files that do not exist. */
export const SOUNDS: { id: string; label: string; file: string; tone?: number[] }[] = [
  { id: 'chime', label: 'Chime (default)', file: './notify.wav' },
  { id: 'beep', label: 'Beep', file: '', tone: [880, 1170] },
  { id: 'alert', label: 'Alert (two-tone)', file: '', tone: [660, 990, 660] },
  { id: 'none', label: 'No sound', file: '' },
]

export const DEFAULT_PREFS: NotifPrefs = {
  enabled: true,
  muted: [],
  minPriority: 'low',
  sound: 'chime',
  silent: false,
  vibrate: true,
  system: true,
  dnd: { enabled: false, from: '21:00', to: '07:00' },
}

function read(): NotifPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const p = JSON.parse(raw) as Partial<NotifPrefs>
    return {
      ...DEFAULT_PREFS,
      ...p,
      // Drop category ids from older builds so a rename cannot mute something forever.
      muted: (p.muted ?? []).filter((m) => CATEGORIES.some((c) => c.id === m)),
      dnd: { ...DEFAULT_PREFS.dnd, ...(p.dnd ?? {}) },
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

// `useSyncExternalStore` compares snapshots by identity and re-renders whenever it changes, so
// this must hand back the *same* object until prefs actually change — rebuilding it per call
// would loop forever.
let cache: NotifPrefs | null = null

export function getPrefs(): NotifPrefs {
  if (!cache) cache = read()
  return cache
}

export function setPrefs(p: NotifPrefs) {
  cache = p
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* quota — ignore */
  }
  listeners.forEach((f) => f())
}

const listeners = new Set<() => void>()
export function subscribePrefs(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

// Another tab changed the prefs — drop the cache so the next read picks them up.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    cache = null
    listeners.forEach((f) => f())
  })
}

const minutes = (hhmm: string) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Is `now` inside the Do-Not-Disturb window? Handles windows that cross midnight. */
export function inDnd(p: NotifPrefs, now = new Date()): boolean {
  if (!p.dnd.enabled) return false
  const cur = now.getHours() * 60 + now.getMinutes()
  const from = minutes(p.dnd.from)
  const to = minutes(p.dnd.to)
  return from <= to ? cur >= from && cur < to : cur >= from || cur < to
}

export interface Verdict {
  /** false = drop it completely (not even recorded). */
  keep: boolean
  /** Show an OS/system notification. */
  system: boolean
  /** Play the sound. */
  sound: boolean
  /** Buzz the device. */
  vibrate: boolean
  reason?: string
}

/**
 * One place that decides what a given notification is allowed to do.
 *
 * Critical notifications deliberately pierce mute, silent mode and DND — the whole point
 * of the level is that a machine-down alert still reaches someone at night.
 */
export function decide(p: NotifPrefs, category: CategoryId, priority: Priority, now = new Date()): Verdict {
  if (!p.enabled) return { keep: false, system: false, sound: false, vibrate: false, reason: 'notifications off' }
  if (priorityRank(priority) < priorityRank(p.minPriority)) return { keep: false, system: false, sound: false, vibrate: false, reason: 'below minimum priority' }

  const isCritical = priority === 'critical'
  const muted = p.muted.includes(category)
  const quiet = inDnd(p, now)

  if (muted && !isCritical) return { keep: true, system: false, sound: false, vibrate: false, reason: 'category muted' }
  if (quiet && !isCritical) return { keep: true, system: false, sound: false, vibrate: false, reason: 'do not disturb' }

  const silent = p.silent && !isCritical
  return {
    keep: true,
    system: p.system,
    sound: !silent && p.sound !== 'none',
    vibrate: !silent && p.vibrate,
    reason: isCritical && (muted || quiet || p.silent) ? 'critical — overrides mute/DND/silent' : undefined,
  }
}

export const soundFile = (p: NotifPrefs): string => SOUNDS.find((s) => s.id === p.sound)?.file ?? ''
export const soundTone = (p: NotifPrefs): number[] | undefined => SOUNDS.find((s) => s.id === p.sound)?.tone
