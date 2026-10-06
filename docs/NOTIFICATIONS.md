# Notifications — architecture and backend contract

The notification system shipped in this app is **frontend + service worker only**. Everything
below the "Backend contract" heading is *not built yet* — it is the specification the client
already codes against, so a backend can be added later without touching the UI.

- Client code: `src/lib/notify/*`, `src/components/notify/*`
- Service worker push handlers: `public/push-sw.js` (pulled into the generated SW via
  `workbox.importScripts` in `vite.config.ts`)

---

## 1. What works today, with no backend

| Capability | Where |
| --- | --- |
| In-app notification store (persisted, 2000 max) | `src/lib/notify/store.ts` |
| Bell + unread badge + dropdown | `src/components/notify/NotifBell.tsx` |
| Notification centre (filter, search, pagination) | `src/components/notify/NotificationCentre.tsx` |
| User settings (mute, priority floor, sound, DND…) | `src/components/notify/NotifSettings.tsx` |
| OS notifications, sound, vibration, app badge | `src/lib/notify/local.ts` |
| Scheduled/future notifications | `schedule()` / `restoreScheduled()` in `local.ts` |
| Delivery rules (mute / DND / priority / silent) | `decide()` in `src/lib/notify/prefs.ts` |
| Push subscribe/unsubscribe/test client | `src/lib/notify/push.ts` |

Push is the only piece that needs a server: a browser can only receive a push while the tab is
closed if something server-side signs and sends it.

---

## 2. The notification model

Mirrors `AppNotif` in `src/lib/notify/types.ts`. Send this shape, unchanged, as the push payload.

```jsonc
{
  "id": "cpk-2026-08-06-M12",   // stable dedupe key: re-sending the same id updates in place
  "category": "quality",        // see the category table below
  "priority": "high",           // "low" | "normal" | "high" | "critical"
  "title": "Cpk below 1.33",
  "subtitle": "Machine M12",    // optional — one line under the title
  "body": "Cpk 1.08 on OP-30. Third shift in a row.",
  "image": "https://…/chart.png", // optional — big picture in the expanded notification
  "icon": "./pwa-192x192.png",    // optional — defaults to the app icon
  "href": "#/cpk",                // where clicking the notification lands
  "source": "server",             // "app" | "server" | "push"
  "createdAt": 1754438400000,     // epoch ms
  "progress": { "value": 40, "max": 100 }, // optional determinate progress bar
  "actions": [                    // optional, max 2 render on most platforms
    { "id": "view",    "title": "View" },
    { "id": "dismiss", "title": "Dismiss" }
  ],
  "data": { "machine": "M12" }    // optional free-form payload echoed back on action click
}
```

### Categories

| id | Label | Default priority |
| --- | --- | --- |
| `system` | System Alerts | normal |
| `message` | Messages | normal |
| `production` | Production Updates | normal |
| `machine` | Machine Alerts | high |
| `maintenance` | Maintenance | normal |
| `quality` | Quality | high |
| `rework` | Rework | normal |
| `rejection` | Rejection | high |
| `order` | Order Updates | normal |
| `activity` | User Activity | low |
| `reminder` | Reminders | normal |
| `warning` | Warnings | high |
| `critical` | Critical Alerts | critical |

Source of truth: `CATEGORIES` in `src/lib/notify/types.ts` (also carries each category's colour).
An unrecognised id falls back to `system` rather than being dropped, so a payload from a newer
server still lands in the centre. Keep the ids stable — a rename silently un-mutes the category
for every user who had muted it (the client drops unknown ids from `muted` on load, by design).

### Priorities

| Priority | Client behaviour |
| --- | --- |
| `low` | Stored; shown only if the user's minimum is `low`. No `requireInteraction`. |
| `normal` | Default. Sound + vibration if enabled. |
| `high` | `requireInteraction: true` — the OS notification stays until dismissed. |
| `critical` | As `high`, **and pierces category mute, Do-Not-Disturb and silent mode.** |

`critical` is deliberately unblockable, so reserve it for things like machine-down. Do not use it
for routine imports; users cannot turn it off.

---

## 3. Backend contract

Four endpoints. The client calls them from `src/lib/notify/push.ts`; base path is the same origin
as the app (`/api/...`), matching the existing `server/index.mjs` convention.

### `GET /api/push/public-key`

Returns the VAPID public key so the browser can subscribe.

```json
{ "key": "BEl62iUYgUiv…" }
```

Return `404` (or `{"key": null}`) when push is not configured — the client then hides the push
controls instead of erroring.

### `POST /api/push/subscribe`

Body is the browser's `PushSubscription.toJSON()` plus a little context:

```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/…",
    "expirationTime": null,
    "keys": { "p256dh": "BN…", "auth": "k9…" }
  },
  "user": "nikhil168",
  "userAgent": "Mozilla/5.0 …"
}
```

Store keyed on `subscription.endpoint` (it is unique per browser+device). Upsert — the same
endpoint re-subscribing must not create a duplicate row. Respond `{ "ok": true }`.

### `POST /api/push/unsubscribe`

```json
{ "endpoint": "https://fcm.googleapis.com/fcm/send/…" }
```

Delete the row. Respond `{ "ok": true }`. Treat "not found" as success.

### `POST /api/push/test`

Sends one push back to the calling subscription so the user can confirm the whole chain works.

```json
{ "endpoint": "https://fcm.googleapis.com/fcm/send/…" }
```

Respond `{ "ok": true }` or `{ "ok": false, "error": "…" }` — the client shows `error` verbatim.

### Generating VAPID keys

VAPID is free and needs no third-party account — it is just a keypair you own.

```bash
npx web-push generate-vapid-keys
```

Keep the private key server-side only (env var), never in the bundle. The public key is what
`/api/push/public-key` serves.

### Sending a push (Node reference)

```js
import webpush from 'web-push'

webpush.setVapidDetails('mailto:you@example.com', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE)

await webpush.sendNotification(sub, JSON.stringify(payload)) // payload = the model in §2
```

**Handle `410 Gone` and `404`** — that means the subscription is dead (browser uninstalled, user
cleared data). Delete the row; do not keep retrying it. Any other 4xx is a bug in the payload;
5xx and 429 should be retried with backoff.

Payload limit is roughly 4 KB after encryption. Never inline an image — send a URL.

---

## 4. Server responsibilities beyond the four endpoints

These are the parts of the original spec a backend would own. None are needed for the app to run.

- **Fan-out** — one event → every subscription for the affected users. Do the sends
  concurrently but bounded (a few dozen at a time), and never let one dead endpoint fail the batch.
- **Queue + retry** — push sends are network calls; put them on a queue with exponential backoff
  so a Push-service outage does not lose alerts. Cap retries and drop on `410`.
- **De-duplication** — the client already dedupes on `id`, so make ids deterministic
  (`<kind>-<date>-<subject>`). Re-sending an id updates the existing entry rather than piling up.
- **Scheduling** — for reminders more than a few hours out, schedule server-side. The client's
  `schedule()` only fires while a tab is open, so it is a convenience, not a guarantee.
- **Per-user preferences** — today prefs are per-device in `localStorage`. If they should follow a
  user across devices, mirror `NotifPrefs` server-side and apply `decide()`'s rules before sending,
  so a muted category never even reaches the device.
- **Read state sync** — read/unread is per-device today. Syncing needs a
  `POST /api/notifications/read` and a `GET /api/notifications?since=` history endpoint.

---

## 5. Security notes

- The subscription endpoint is a **capability**: anyone holding it can push to that browser.
  Treat the subscription table as sensitive, and never return endpoints to the client.
- Authenticate `subscribe` / `unsubscribe` / `test` with the app's existing session, and check on
  `unsubscribe` that the endpoint belongs to the calling user — otherwise one user can silence
  another.
- Never put credentials, tokens, or personal data in a push payload. Push payloads pass through
  a third-party push service (FCM/Mozilla/Apple); they are encrypted in transit, but the payload
  also lands in the OS notification tray and on the lock screen.
- `userVisibleOnly: true` is required by Chrome and is what the client requests — every push must
  result in a visible notification, so do not use push as a silent data channel.

---

## 6. Adding a notification from app code

```ts
import { notify } from './lib/notify/local'

notify({
  id: `import-${date}`,
  category: 'import',
  priority: 'normal',
  title: 'Production data imported',
  body: `${rows} rows for ${date}.`,
  href: '#/dashboard',
})
```

`notify()` runs the payload through `decide()`, stores it, updates the badge, plays the sound and
raises the OS notification — so callers never need to check preferences themselves.
