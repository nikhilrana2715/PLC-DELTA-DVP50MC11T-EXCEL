import type { SavedMeeting } from './history'
import type { Note } from './notes'
import type { CpkEntry } from './cpk'
import type { CumulativeEntry } from './cumulative'
import type { UploadRecord } from './uploads'
import type { ActiveRecord } from './active'
import type { SettingsRecord } from './settings'
import type { AssemblyRecord } from './assembly'
import { apiUrl } from './unit'

export interface Activity {
  id: string
  kind: 'note' | 'import' | 'meeting' | 'cpk' | 'cumulative' | 'upload' | 'info'
  title: string
  at: number
  priority?: string
  by?: string
}

const CID_KEY = 'mm.clientId'

/** Stable per-browser id so a device can tell apart its own actions. */
export function clientId(): string {
  try {
    let id = localStorage.getItem(CID_KEY)
    if (!id) {
      id = `c-${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem(CID_KEY, id)
    }
    return id
  } catch {
    return 'c-anon'
  }
}

interface Handlers {
  onMeetings?: (list: SavedMeeting[]) => void
  onNotes?: (list: Note[]) => void
  onCpk?: (list: CpkEntry[]) => void
  onCumulative?: (list: CumulativeEntry[]) => void
  onUploads?: (list: UploadRecord[]) => void
  onActive?: (list: ActiveRecord[]) => void
  onSettings?: (list: SettingsRecord[]) => void
  onAssembly?: (list: AssemblyRecord[]) => void
  onActivity?: (a: Activity) => void
}

/** One EventSource for everything: meetings, notes, cpk, cumulative + notifications. */
export function subscribeRealtime(h: Handlers): () => void {
  let es: EventSource | null = null
  try {
    es = new EventSource(apiUrl('/api/events'))
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; data: unknown }
        if (msg.type === 'meetings') h.onMeetings?.(msg.data as SavedMeeting[])
        else if (msg.type === 'notes') h.onNotes?.(msg.data as Note[])
        else if (msg.type === 'cpk') h.onCpk?.(msg.data as CpkEntry[])
        else if (msg.type === 'cumulative') h.onCumulative?.(msg.data as CumulativeEntry[])
        else if (msg.type === 'uploads') h.onUploads?.(msg.data as UploadRecord[])
        else if (msg.type === 'active') h.onActive?.(msg.data as ActiveRecord[])
        else if (msg.type === 'settings') h.onSettings?.(msg.data as SettingsRecord[])
        else if (msg.type === 'assembly') h.onAssembly?.(msg.data as AssemblyRecord[])
        else if (msg.type === 'activity') h.onActivity?.(msg.data as Activity)
      } catch {
        /* ignore malformed frame */
      }
    }
  } catch {
    es = null
  }
  return () => es?.close()
}

/** Tell the server an activity happened (e.g. an Excel was uploaded here). */
export function postActivity(kind: Activity['kind'], title: string, priority?: string) {
  try {
    void fetch('/api/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, title, priority, by: clientId() }),
    })
  } catch {
    /* offline — no notification */
  }
}

// ---- Notification sound + vibration (Web Audio API = reliable playback) ----
let ctx: AudioContext | null = null
let buffer: AudioBuffer | null = null
let loading = false
let htmlAudio: HTMLAudioElement | null = null

function ensureCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    return ctx
  } catch {
    return null
  }
}

async function loadBuffer() {
  const c = ensureCtx()
  if (!c || buffer || loading) return
  loading = true
  try {
    const res = await fetch('./notify.wav')
    const arr = await res.arrayBuffer()
    buffer = await c.decodeAudioData(arr)
  } catch {
    /* ignore */
  } finally {
    loading = false
  }
}

/**
 * Browsers block audio/vibration until a user gesture. Call this from the first
 * user interaction to unlock the AudioContext and preload the sound.
 */
export function unlockAudio() {
  const c = ensureCtx()
  if (c) void c.resume().catch(() => {})
  void loadBuffer()
  // warm up the HTMLAudio fallback within the gesture too
  try {
    if (!htmlAudio) {
      htmlAudio = new Audio('./notify.wav')
      htmlAudio.preload = 'auto'
    }
    htmlAudio.volume = 0
    void htmlAudio
      .play()
      .then(() => {
        htmlAudio!.pause()
        htmlAudio!.currentTime = 0
        htmlAudio!.volume = 1
      })
      .catch(() => {})
  } catch {
    /* ignore */
  }
}

/** Play the notification sound and vibrate the device. */
export function playNotify() {
  let played = false
  try {
    const c = ensureCtx()
    if (c && buffer) {
      if (c.state === 'suspended') void c.resume()
      const src = c.createBufferSource()
      src.buffer = buffer
      src.connect(c.destination)
      src.start(0)
      played = true
    } else {
      void loadBuffer()
    }
  } catch {
    /* ignore */
  }
  if (!played) {
    try {
      if (!htmlAudio) htmlAudio = new Audio('./notify.wav')
      htmlAudio.volume = 1
      htmlAudio.currentTime = 0
      void htmlAudio.play().catch(() => {})
    } catch {
      /* ignore */
    }
  }
  try {
    navigator.vibrate?.([200, 100, 200])
  } catch {
    /* not supported (desktop / iOS) */
  }
}
