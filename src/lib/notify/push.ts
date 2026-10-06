// Web Push (VAPID) — permission, subscribe/unsubscribe, and the handshake with the
// backend. Chosen over FCM because it needs no third-party account and no API keys you
// have to obtain: the server signs with its own VAPID key pair and talks straight to the
// browser's push service. Free, self-hosted, and the same code path on every browser.
//
// The exact request/response shapes the backend must implement are in
// docs/NOTIFICATIONS.md — this file is the client half of that contract.

export type PermissionState = 'unsupported' | 'default' | 'granted' | 'denied'

export function permissionState(): PermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission as PermissionState
}

export const pushSupported = (): boolean =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** Ask once. Browsers only show the prompt from a user gesture, so call this from a click. */
export async function requestPermission(): Promise<PermissionState> {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission as PermissionState
  try {
    return (await Notification.requestPermission()) as PermissionState
  } catch {
    return Notification.permission as PermissionState
  }
}

// VAPID keys travel as base64url; PushManager wants raw bytes.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

const authHeaders = (json = true): Record<string, string> => {
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  try {
    const tok = localStorage.getItem('mm.auth.token')
    if (tok) h.Authorization = `Bearer ${tok}`
  } catch {
    /* ignore */
  }
  return h
}

/** The server's VAPID public key. Returns '' when push is not configured yet. */
export async function getVapidKey(): Promise<string> {
  try {
    const r = await fetch('/api/push/public-key', { headers: authHeaders(false) })
    if (!r.ok) return ''
    const j = (await r.json()) as { publicKey?: string }
    return j.publicKey ?? ''
  } catch {
    return ''
  }
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    return (await reg?.pushManager.getSubscription()) ?? null
  } catch {
    return null
  }
}

export interface SubscribeResult {
  ok: boolean
  /** Present when it failed, in words the settings page can show as-is. */
  error?: string
  subscription?: PushSubscription
}

/**
 * Subscribe this device and register it with the backend.
 *
 * The subscription object IS the delivery address — it is stored server-side against the
 * signed-in user so notifications can be targeted at a person, a group, or everyone.
 */
export async function subscribe(): Promise<SubscribeResult> {
  if (!pushSupported()) return { ok: false, error: 'This browser does not support push notifications.' }
  const perm = await requestPermission()
  if (perm !== 'granted') {
    return {
      ok: false,
      error:
        perm === 'denied'
          ? 'Notifications are blocked for this site. Allow them in the browser’s site settings, then try again.'
          : 'Permission was not granted.',
    }
  }
  const key = await getVapidKey()
  if (!key) return { ok: false, error: 'Push is not configured on the server yet (no VAPID key). Local notifications still work.' }

  try {
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    // A key rotation invalidates old subscriptions — drop and re-subscribe.
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true, // required by Chrome; every push must show something
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      }))

    const r = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        subscription: sub.toJSON(),
        userAgent: navigator.userAgent,
        // Lets the server group devices, e.g. "all tablets on the shop floor".
        platform: navigator.platform,
      }),
    })
    if (!r.ok) return { ok: false, error: `Server rejected the subscription (${r.status}).`, subscription: sub }
    return { ok: true, subscription: sub }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function unsubscribe(): Promise<boolean> {
  try {
    const sub = await currentSubscription()
    if (!sub) return true
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {})
    return await sub.unsubscribe()
  } catch {
    return false
  }
}

/** Ask the server to push a test notification back to this device. */
export async function sendTestPush(): Promise<{ ok: boolean; error?: string }> {
  try {
    const sub = await currentSubscription()
    if (!sub) return { ok: false, error: 'This device is not subscribed yet.' }
    const r = await fetch('/api/push/test', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ endpoint: sub.endpoint }),
    })
    if (!r.ok) return { ok: false, error: `Server returned ${r.status}. Is the push endpoint implemented?` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
