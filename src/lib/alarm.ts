// ---- Looping alarm engine (Web Audio API) ----
// A two-tone "klaxon" that keeps beeping until stop() is called, so a task
// alarm rings continuously (loop) the way a phone alarm does — not a one-shot.

let ctx: AudioContext | null = null
let master: GainNode | null = null
let beepTimer: ReturnType<typeof setTimeout> | null = null
let vibTimer: ReturnType<typeof setInterval> | null = null
let playing = false
let hi = false

const K_VOL = 'mm.alarmVolume'

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

/** Resume the audio context on a user gesture so the alarm can sound later. */
export function unlockAlarm() {
  const c = ensureCtx()
  if (c && c.state === 'suspended') void c.resume().catch(() => {})
}

export function getAlarmVolume(): number {
  try {
    const raw = localStorage.getItem(K_VOL)
    if (raw === null) return 0.85
    const v = Number(raw)
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.85
  } catch {
    return 0.85
  }
}

export function setAlarmVolume(v: number) {
  const clamped = Math.min(1, Math.max(0, v))
  try {
    localStorage.setItem(K_VOL, String(clamped))
  } catch {
    /* ignore */
  }
  if (master && ctx) master.gain.setTargetAtTime(clamped, ctx.currentTime, 0.02)
}

function scheduleBeep() {
  if (!playing || !ctx || !master) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'square'
  osc.frequency.value = hi ? 988 : 784 // alternate two tones for an insistent klaxon
  hi = !hi
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(1, t + 0.02)
  g.gain.setValueAtTime(1, t + 0.26)
  g.gain.linearRampToValueAtTime(0, t + 0.32)
  osc.connect(g)
  g.connect(master)
  osc.start(t)
  osc.stop(t + 0.34)
  beepTimer = setTimeout(scheduleBeep, 430) // gap between beeps → "beep … beep … beep"
}

/** Start the looping alarm. Safe to call repeatedly (no double-start). */
export function startAlarm(volume = getAlarmVolume()) {
  const c = ensureCtx()
  if (!c) return
  if (c.state === 'suspended') void c.resume().catch(() => {})
  if (playing) {
    setAlarmVolume(volume)
    return
  }
  playing = true
  master = c.createGain()
  master.gain.value = Math.min(1, Math.max(0, volume))
  master.connect(c.destination)
  scheduleBeep()
  // Vibrate in a loop on phones that support it.
  try {
    navigator.vibrate?.([600, 300])
    vibTimer = setInterval(() => {
      try {
        navigator.vibrate?.([600, 300])
      } catch {
        /* ignore */
      }
    }, 1000)
  } catch {
    /* not supported */
  }
}

/** Stop the alarm and any vibration. */
export function stopAlarm() {
  playing = false
  if (beepTimer) {
    clearTimeout(beepTimer)
    beepTimer = null
  }
  if (vibTimer) {
    clearInterval(vibTimer)
    vibTimer = null
  }
  try {
    navigator.vibrate?.(0)
  } catch {
    /* ignore */
  }
  if (master) {
    try {
      master.disconnect()
    } catch {
      /* ignore */
    }
    master = null
  }
}

export function isAlarming(): boolean {
  return playing
}

/** Short two-beep preview so the user can hear/verify the volume. */
export function testAlarm() {
  if (playing) return
  startAlarm()
  setTimeout(() => stopAlarm(), 1200)
}
