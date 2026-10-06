import { clientId } from './realtime'

/** App-wide settings shared across every device (id = 'app'). */
export interface AppSettings {
  /** When false, the Cp-Cpk card + machine-detail section hide everywhere. */
  cpkEnabled: boolean
  /** When false, the Cumulative card hides from the dashboard everywhere. */
  cumulativeEnabled: boolean
}
export interface SettingsRecord extends AppSettings {
  id: 'app'
  savedAt: number
  by?: string
}

const API = '/api/settings'
const KEY = 'mm.appsettings.v1'
const DEFAULTS: AppSettings = { cpkEnabled: true, cumulativeEnabled: true }

/** Last-known settings from this device's cache (used offline / for instant first paint). */
export function readLocalSettings(): AppSettings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<AppSettings>) }
  } catch {
    return { ...DEFAULTS }
  }
}
function writeLocal(s: AppSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

/** Resolve the shared settings from a server list; defaults when nothing saved yet. */
export function settingsOf(list: SettingsRecord[] | undefined): AppSettings {
  const rec = (list ?? []).find((x) => x.id === 'app')
  const s: AppSettings = rec
    ? { cpkEnabled: rec.cpkEnabled !== false, cumulativeEnabled: rec.cumulativeEnabled !== false }
    : { ...DEFAULTS }
  writeLocal(s)
  return s
}

/** Pull the shared settings from the server (falls back to the local cache offline). */
export async function fetchSettings(): Promise<AppSettings> {
  try {
    const r = await fetch(API, { cache: 'no-store' })
    if (!r.ok) throw new Error('bad')
    return settingsOf((await r.json()) as SettingsRecord[])
  } catch {
    return readLocalSettings()
  }
}

/** Publish settings so every device updates live (via SSE). */
export async function saveSettings(s: AppSettings): Promise<void> {
  writeLocal(s) // optimistic + offline cache
  const rec: SettingsRecord = { id: 'app', ...s, savedAt: Date.now(), by: clientId() }
  try {
    await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rec),
    })
  } catch {
    /* offline — the local copy still persists */
  }
}
