// React binding for the notification system. Mount `useNotificationRuntime()` once at the
// app root; use `useNotifications()` anywhere that needs to read or act on the list.
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { getAll, markAllRead, markRead, remove, clearAll, subscribe as subscribeStore, unreadCount, add } from './store'
import { notify, restoreScheduled, syncBadge, watchConnectivity, primeAudio } from './local'
import { getPrefs, setPrefs, subscribePrefs, type NotifPrefs } from './prefs'
import type { AppNotif, NotifInput } from './types'

/** Live view of the notification list. */
export function useNotifications() {
  const items = useSyncExternalStore(subscribeStore, getAll, getAll)
  const unread = useMemo(() => unreadCount(items), [items])
  return {
    items,
    unread,
    markRead,
    markAllRead,
    remove,
    clearAll,
    push: (n: NotifInput) => notify(n),
  }
}

/** Live view of the preferences. */
export function useNotifPrefs(): [NotifPrefs, (p: Partial<NotifPrefs>) => void] {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getPrefs)
  const update = useCallback((patch: Partial<NotifPrefs>) => setPrefs({ ...getPrefs(), ...patch }), [])
  return [prefs, update]
}

interface SwMessage {
  type: 'push-notification' | 'notification-action' | 'notification-closed'
  id?: string
  action?: string
  href?: string
  payload?: AppNotif
}

/**
 * Wires the runtime once: service-worker messages, scheduled reminders, connectivity
 * alerts and the app-icon badge.
 *
 * `onAction` receives clicks that came from an OS notification (including its action
 * buttons) so the app can route to the right screen.
 */
export function useNotificationRuntime(onAction?: (id: string | undefined, action: string, href?: string) => void) {
  useEffect(() => {
    // A push that arrived while the app was open: record it in the centre. The service
    // worker already showed the OS popup, so this must not raise a second one.
    const onMessage = (e: MessageEvent<SwMessage>) => {
      const m = e.data
      if (!m || typeof m !== 'object') return
      if (m.type === 'push-notification' && m.payload) {
        add(m.payload)
        syncBadge()
      } else if (m.type === 'notification-action') {
        if (m.id) markRead(m.id)
        syncBadge()
        onAction?.(m.id, m.action ?? 'open', m.href)
      } else if (m.type === 'notification-closed' && m.id) {
        markRead(m.id)
        syncBadge()
      }
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)

    restoreScheduled()
    const stopNet = watchConnectivity()
    syncBadge()

    // Browsers need a gesture before audio may play; the first one unlocks it.
    const prime = () => primeAudio()
    window.addEventListener('pointerdown', prime, { once: true })
    window.addEventListener('keydown', prime, { once: true })

    return () => {
      navigator.serviceWorker?.removeEventListener('message', onMessage)
      stopNet()
      window.removeEventListener('pointerdown', prime)
      window.removeEventListener('keydown', prime)
    }
  }, [onAction])
}
