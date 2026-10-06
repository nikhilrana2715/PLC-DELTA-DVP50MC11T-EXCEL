// Local notifications — everything that fires from the device itself: reminders,
// scheduled tasks, offline alerts, timers and app-generated events. No backend needed.
//
// `notify()` is the single entry point. It records the notification in the centre, then
// (subject to the user's preferences) plays the sound, buzzes, updates the app-icon badge
// and raises the OS notification through the service worker.
import { CATEGORY_BY_ID, priorityRank, type AppNotif, type NotifInput } from './types'
import { decide, getPrefs, soundFile, soundTone } from './prefs'
import { add, unreadCount, getAll } from './store'

// ---- sound ----------------------------------------------------------------
// Web Audio gives reliable, low-latency playback and survives rapid re-triggering;
// a plain <audio> is kept as the fallback for browsers that block AudioContext.
let ctx: AudioContext | null = null
const buffers = new Map<string, AudioBuffer>()
let htmlAudio: HTMLAudioElement | null = null

function ensureCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (AC) ctx = new AC()
    }
    return ctx
  } catch {
    return null
  }
}

/** Play a short sequence of notes. Used for the sound choices that have no audio file. */
function playTone(tone: number[]) {
  const c = ensureCtx()
  if (!c) return
  if (c.state === 'suspended') void c.resume().catch(() => {})
  const step = 0.11
  tone.forEach((hz, i) => {
    const at = c.currentTime + i * step
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(hz, at)
    // Fade each note in and out so it clicks neither on nor off.
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + step - 0.01)
    osc.connect(gain)
    gain.connect(c.destination)
    osc.start(at)
    osc.stop(at + step)
  })
}

async function playSound(file: string, tone?: number[]) {
  if (!file) {
    if (tone?.length) playTone(tone)
    return
  }
  try {
    const c = ensureCtx()
    if (c) {
      if (c.state === 'suspended') await c.resume().catch(() => {})
      let buf = buffers.get(file)
      if (!buf) {
        const res = await fetch(file)
        buf = await c.decodeAudioData(await res.arrayBuffer())
        buffers.set(file, buf)
      }
      const src = c.createBufferSource()
      src.buffer = buf
      src.connect(c.destination)
      src.start(0)
      return
    }
  } catch {
    /* fall through to <audio> */
  }
  try {
    if (!htmlAudio || htmlAudio.src.indexOf(file) < 0) htmlAudio = new Audio(file)
    htmlAudio.currentTime = 0
    void htmlAudio.play().catch(() => {})
  } catch {
    /* ignore */
  }
}

/** Warm the audio pipeline on the first user gesture so the first alert is not silent. */
export function primeAudio() {
  const c = ensureCtx()
  if (c?.state === 'suspended') void c.resume().catch(() => {})
}

// ---- app icon badge -------------------------------------------------------

type BadgeNav = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }

/** Installed-PWA icon badge. A no-op where the Badging API is unsupported. */
export function setAppBadge(count: number) {
  try {
    const nav = navigator as BadgeNav
    if (count > 0) void nav.setAppBadge?.(count).catch(() => {})
    else void nav.clearAppBadge?.().catch(() => {})
  } catch {
    /* ignore */
  }
}

export const syncBadge = () => setAppBadge(unreadCount(getAll()))

// ---- OS notification ------------------------------------------------------

/** Vibration patterns get longer as the priority climbs, so urgency is felt not just seen. */
const VIBRATE: Record<string, number[]> = {
  low: [80],
  normal: [140],
  high: [200, 90, 200],
  critical: [400, 150, 400, 150, 400],
}

async function showSystem(n: AppNotif, vibrate: boolean, silent: boolean) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const cat = CATEGORY_BY_ID[n.category]
    const options: NotificationOptions = {
      body: [n.subtitle, n.body].filter(Boolean).join('\n') || undefined,
      icon: './pwa-192x192.png',
      badge: './favicon-64.png',
      // One tag per notification id: re-delivering the same id replaces the popup
      // instead of stacking a second one.
      tag: n.id,
      silent,
      // `critical` stays on screen until the operator acts on it.
      requireInteraction: priorityRank(n.priority) >= 2,
      data: { id: n.id, href: n.href, category: n.category, data: n.data },
      ...({
        // Not in the TS DOM lib, but honoured by browsers.
        timestamp: n.at,
        renotify: true,
        vibrate: vibrate ? VIBRATE[n.priority] ?? VIBRATE.normal : undefined,
        image: n.image,
        actions: (n.actions ?? []).slice(0, 2).map((a) => ({ action: a.id, title: a.label })),
      } as Record<string, unknown>),
    }
    const reg = await navigator.serviceWorker?.getRegistration()
    // showNotification via the SW is the only path that supports actions and survives
    // the page being closed; `new Notification()` is the desktop-only fallback.
    if (reg) await reg.showNotification(`${cat?.label ? '' : ''}${n.title}`, options)
    else new Notification(n.title, options)
  } catch {
    /* ignore — the in-app centre still has it */
  }
}

// ---- the entry point ------------------------------------------------------

/** Raise a notification now. Returns the stored record, or null when prefs dropped it. */
export function notify(input: NotifInput): AppNotif | null {
  const prefs = getPrefs()
  const cat = CATEGORY_BY_ID[input.category] ?? CATEGORY_BY_ID.system
  const priority = input.priority ?? cat.defaultPriority
  const v = decide(prefs, input.category, priority)
  if (!v.keep) return null

  const rec = add({ ...input, priority })
  if (v.sound) void playSound(soundFile(prefs), soundTone(prefs))
  if (v.vibrate) {
    try {
      navigator.vibrate?.(VIBRATE[priority] ?? VIBRATE.normal)
    } catch {
      /* ignore */
    }
  }
  if (v.system) void showSystem(rec, v.vibrate, !v.sound)
  syncBadge()
  return rec
}

// ---- scheduled / timer notifications --------------------------------------

interface Scheduled extends NotifInput {
  /** Epoch ms when it should fire. */
  fireAt: number
  schedId: string
}

const SCHED_KEY = 'mm.notify.scheduled.v1'
const timers = new Map<string, ReturnType<typeof setTimeout>>()

const readSched = (): Scheduled[] => {
  try {
    return JSON.parse(localStorage.getItem(SCHED_KEY) || '[]') as Scheduled[]
  } catch {
    return []
  }
}
const writeSched = (l: Scheduled[]) => {
  try {
    localStorage.setItem(SCHED_KEY, JSON.stringify(l))
  } catch {
    /* ignore */
  }
}

function arm(s: Scheduled) {
  const delay = s.fireAt - Date.now()
  clearTimeout(timers.get(s.schedId))
  // setTimeout caps at ~24.8 days; re-arm in chunks for anything longer.
  const MAX_DELAY = 2_000_000_000
  if (delay > MAX_DELAY) {
    timers.set(s.schedId, setTimeout(() => arm(s), MAX_DELAY))
    return
  }
  timers.set(
    s.schedId,
    setTimeout(() => {
      notify(s)
      cancelScheduled(s.schedId)
    }, Math.max(0, delay)),
  )
}

/** Fire `input` at `fireAt`. Survives reloads; anything already due fires on restore. */
export function schedule(input: NotifInput, fireAt: number): string {
  const schedId = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  const s: Scheduled = { ...input, fireAt, schedId }
  writeSched([...readSched().filter((x) => x.schedId !== schedId), s])
  arm(s)
  return schedId
}

export function cancelScheduled(schedId: string) {
  clearTimeout(timers.get(schedId))
  timers.delete(schedId)
  writeSched(readSched().filter((x) => x.schedId !== schedId))
}

export const listScheduled = (): Scheduled[] => readSched().sort((a, b) => a.fireAt - b.fireAt)

/**
 * Re-arm everything after a reload. Anything whose time passed while the app was closed
 * fires immediately (once), so a missed reminder is not silently lost.
 */
export function restoreScheduled() {
  const now = Date.now()
  for (const s of readSched()) {
    if (s.fireAt <= now) {
      notify(s)
      cancelScheduled(s.schedId)
    } else arm(s)
  }
}

// ---- connectivity alerts --------------------------------------------------

let offlineSince = 0

/** Wire online/offline to the notification centre. Returns an unsubscribe. */
export function watchConnectivity(): () => void {
  const onOffline = () => {
    offlineSince = Date.now()
    notify({
      id: 'net-offline',
      category: 'system',
      priority: 'high',
      title: 'You are offline',
      subtitle: 'Working from the last saved data',
      body: 'Changes you make will sync when the connection returns.',
      source: 'Connection',
    })
  }
  const onOnline = () => {
    const mins = offlineSince ? Math.round((Date.now() - offlineSince) / 60000) : 0
    notify({
      id: 'net-online',
      category: 'system',
      priority: 'normal',
      title: 'Back online',
      subtitle: mins > 0 ? `Was offline for ${mins} min` : 'Connection restored',
      source: 'Connection',
    })
    offlineSince = 0
  }
  window.addEventListener('offline', onOffline)
  window.addEventListener('online', onOnline)
  return () => {
    window.removeEventListener('offline', onOffline)
    window.removeEventListener('online', onOnline)
  }
}
