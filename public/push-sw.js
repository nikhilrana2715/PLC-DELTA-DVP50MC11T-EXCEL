/* eslint-disable no-undef */
/**
 * Push service worker.
 *
 * Loaded by the Workbox-generated service worker via `workbox.importScripts`, so the
 * app's existing offline caching is untouched — this file only adds push handling.
 *
 * Handles:
 *   push              → show the OS notification (rich: image, actions, vibration)
 *   notificationclick → focus/open the app and tell it which action was pressed
 *   notificationclose → let the app record the dismissal
 *
 * The payload shape mirrors src/lib/notify/types.ts — see docs/NOTIFICATIONS.md.
 */

const APP_ICON = './pwa-192x192.png'
const APP_BADGE = './favicon-64.png'

// Longer buzz as the priority climbs, matching src/lib/notify/local.ts.
const VIBRATE = {
  low: [80],
  normal: [140],
  high: [200, 90, 200],
  critical: [400, 150, 400, 150, 400],
}

const RANK = { low: 0, normal: 1, high: 2, critical: 3 }

function parsePayload(event) {
  // A push with no body still has to show something (userVisibleOnly), so fall back.
  if (!event.data) return { title: 'Morning Meeting', category: 'system', priority: 'normal' }
  try {
    return event.data.json()
  } catch {
    return { title: event.data.text() || 'Morning Meeting', category: 'system', priority: 'normal' }
  }
}

self.addEventListener('push', (event) => {
  const p = parsePayload(event)
  const priority = p.priority || 'normal'
  const body = [p.subtitle, p.body].filter(Boolean).join('\n') || undefined

  const options = {
    body,
    icon: p.icon || APP_ICON,
    badge: APP_BADGE,
    image: p.image || undefined,
    // The id doubles as the tag: a retried push replaces its popup instead of stacking.
    tag: p.id || `push_${Date.now()}`,
    renotify: true,
    timestamp: p.at || Date.now(),
    silent: !!p.silent,
    requireInteraction: (RANK[priority] ?? 1) >= 2,
    vibrate: p.silent ? undefined : VIBRATE[priority] || VIBRATE.normal,
    // Browsers show at most two action buttons.
    actions: (p.actions || []).slice(0, 2).map((a) => ({ action: a.id, title: a.label })),
    data: {
      id: p.id,
      href: p.href,
      category: p.category,
      priority,
      actions: p.actions || [],
      payload: p,
    },
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(p.title || 'Morning Meeting', options)
      // Hand it to any open tab so the in-app centre and badge update immediately.
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of clientList) c.postMessage({ type: 'push-notification', payload: p })
      // Keep the app-icon badge honest even when no tab is open.
      if (typeof self.registration.setAppBadge === 'function' && typeof p.unread === 'number') {
        try {
          await self.registration.setAppBadge(p.unread)
        } catch {
          /* unsupported */
        }
      }
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  const d = event.notification.data || {}
  const actionId = event.action || 'open'
  event.notification.close()

  // "dismiss" is handled entirely by closing the popup.
  if (actionId === 'dismiss') {
    event.waitUntil(notifyClients({ type: 'notification-action', id: d.id, action: 'dismiss' }))
    return
  }

  // An action can carry its own destination; otherwise use the notification's.
  const chosen = (d.actions || []).find((a) => a.id === actionId)
  const href = chosen?.href || d.href || './'

  event.waitUntil(
    (async () => {
      const url = new URL(href, self.location.origin).href
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = clientList.find((c) => 'focus' in c)
      if (open) {
        await open.focus()
        open.postMessage({ type: 'notification-action', id: d.id, action: actionId, href, payload: d.payload })
        // Same-origin navigation for the hash route the action points at.
        if ('navigate' in open && href) {
          try {
            await open.navigate(url)
          } catch {
            /* some browsers disallow navigate() — the postMessage above still routes it */
          }
        }
      } else {
        await self.clients.openWindow(url)
      }
    })(),
  )
})

self.addEventListener('notificationclose', (event) => {
  const d = event.notification.data || {}
  event.waitUntil(notifyClients({ type: 'notification-closed', id: d.id }))
})

async function notifyClients(msg) {
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const c of clientList) c.postMessage(msg)
}

// The push service can rotate a subscription; re-register so delivery keeps working.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const old = event.oldSubscription || (await self.registration.pushManager.getSubscription())
        const key = event.oldSubscription?.options?.applicationServerKey
        if (!key) return
        const fresh = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
        await fetch('./api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: fresh.toJSON(), replaces: old ? old.endpoint : null }),
        })
      } catch {
        /* nothing more we can do from here */
      }
    })(),
  )
})
