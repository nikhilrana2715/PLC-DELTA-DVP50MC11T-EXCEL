// ---- Local user preferences (per device) ----

export type ThemePref = 'system' | 'light' | 'dark'
export type LangPref = 'en' | 'hi' | 'gu'

const K_THEME = 'mm.theme'
const K_NOTIF = 'mm.notif'
const K_NAME = 'mm.userName'
const K_LANG = 'mm.lang'

function get(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}
function set(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

// ---- Theme ----
export function getThemePref(): ThemePref {
  const v = get(K_THEME, 'system')
  return v === 'light' || v === 'dark' ? v : 'system'
}
export function setThemePref(p: ThemePref) {
  set(K_THEME, p)
}
export function resolveTheme(p: ThemePref): 'light' | 'dark' {
  if (p === 'light' || p === 'dark') return p
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
/** Apply the resolved theme to <html data-theme>. */
export function applyTheme(p: ThemePref) {
  document.documentElement.dataset.theme = resolveTheme(p)
}

// ---- Notifications (sound + vibration + toast) ----
export function getNotifEnabled(): boolean {
  return get(K_NOTIF, '1') !== '0'
}
export function setNotifEnabled(on: boolean) {
  set(K_NOTIF, on ? '1' : '0')
}

// ---- User display name ----
export function getUserName(): string {
  return get(K_NAME, '')
}
export function setUserName(name: string) {
  set(K_NAME, name)
}

// ---- Language (selection stored; full translation is a follow-up) ----
export function getLangPref(): LangPref {
  const v = get(K_LANG, 'en')
  return v === 'hi' || v === 'gu' ? v : 'en'
}
export function setLangPref(l: LangPref) {
  set(K_LANG, l)
}
