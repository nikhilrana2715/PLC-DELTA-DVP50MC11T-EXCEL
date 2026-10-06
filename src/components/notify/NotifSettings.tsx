import { useEffect, useState } from 'react'
import { Bell, BellRing, Clock, Loader2, Moon, Volume2 } from 'lucide-react'
import { useNotifPrefs, useNotifications } from '../../lib/notify/useNotifications'
import { SOUNDS, inDnd } from '../../lib/notify/prefs'
import { CATEGORIES, PRIORITIES, type CategoryId } from '../../lib/notify/types'
import { currentSubscription, permissionState, pushSupported, sendTestPush, subscribe, unsubscribe } from '../../lib/notify/push'

// --ink-muted is too light for 11.5px body copy (3.1:1). Mixing back toward --ink keeps the
// text visibly secondary while clearing the 4.5:1 WCAG AA threshold in both themes.
const HINT_INK = 'var(--ink-hint)'

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2.5 flex-wrap">
      <div className="flex-1 min-w-[170px]">
        <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
          {title}
        </div>
        {hint && (
          <div className="text-[11.5px] leading-snug mt-0.5" style={{ color: HINT_INK }}>
            {hint}
          </div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`w-11 h-6 rounded-full transition relative disabled:opacity-40 ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

/** Every user control the notification system exposes. */
export function NotifSettings() {
  const [prefs, update] = useNotifPrefs()
  const { push } = useNotifications()
  const [perm, setPerm] = useState(permissionState())
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    void currentSubscription().then((s) => setSubscribed(!!s))
  }, [])

  const quiet = inDnd(prefs)

  const toggleCategory = (id: CategoryId) =>
    update({ muted: prefs.muted.includes(id) ? prefs.muted.filter((m) => m !== id) : [...prefs.muted, id] })

  const enablePush = async () => {
    setBusy(true)
    setMsg(null)
    const r = await subscribe()
    setPerm(permissionState())
    setSubscribed(r.ok)
    setMsg({ ok: r.ok, text: r.ok ? 'This device will now receive push notifications.' : r.error ?? 'Could not subscribe.' })
    setBusy(false)
  }

  const disablePush = async () => {
    setBusy(true)
    await unsubscribe()
    setSubscribed(false)
    setMsg({ ok: true, text: 'Push turned off for this device.' })
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      {/* master + delivery */}
      <div className="bento bento-pad">
        <div className="flex items-center gap-2 mb-1">
          <Bell size={16} className="text-indigo-500" />
          <span className="font-bold text-slate-800 text-sm">Delivery</span>
          {quiet && (
            <span className="ml-auto text-[11px] font-bold rounded-full px-2 py-[2px] bg-violet-100 text-violet-700 inline-flex items-center gap-1">
              <Moon size={11} /> Do Not Disturb active
            </span>
          )}
        </div>
        <div className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
          <Row title="Notifications" hint="Master switch. Off means nothing is shown or recorded.">
            <Toggle on={prefs.enabled} onChange={(v) => update({ enabled: v })} />
          </Row>
          <Row title="System notifications" hint="Show the popup outside the app — status bar, heads-up banner and lock screen where the device supports it.">
            <Toggle on={prefs.system} onChange={(v) => update({ system: v })} disabled={!prefs.enabled} />
          </Row>
          <Row title="Silent mode" hint="Keep the popups, drop the sound and vibration.">
            <Toggle on={prefs.silent} onChange={(v) => update({ silent: v })} disabled={!prefs.enabled} />
          </Row>
          <Row title="Vibration" hint="Buzz on mobile. Longer pattern as the priority rises.">
            <Toggle on={prefs.vibrate} onChange={(v) => update({ vibrate: v })} disabled={!prefs.enabled || prefs.silent} />
          </Row>
        </div>
      </div>

      {/* sound + priority */}
      <div className="bento bento-pad">
        <div className="flex items-center gap-2 mb-1">
          <Volume2 size={16} className="text-indigo-500" />
          <span className="font-bold text-slate-800 text-sm">Sound &amp; priority</span>
        </div>
        <div className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
          <Row title="Notification sound">
            <div className="flex items-center gap-1.5">
              <select
                value={prefs.sound}
                onChange={(e) => update({ sound: e.target.value })}
                disabled={!prefs.enabled}
                className="rounded-lg border px-2 py-1.5 text-[13px] font-semibold bg-white text-slate-700 outline-none disabled:opacity-40"
                style={{ borderColor: 'var(--hairline)' }}
              >
                {SOUNDS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                className="icon-btn"
                disabled={!prefs.enabled}
                onClick={() =>
                  push({
                    category: 'system',
                    priority: 'normal',
                    title: 'Test notification',
                    subtitle: 'This is how an alert will look and sound',
                    body: 'Sound, vibration and the popup all follow the settings on this page.',
                    source: 'Settings',
                    actions: [{ id: 'dismiss', label: 'Dismiss' }],
                  })
                }
              >
                Test
              </button>
            </div>
          </Row>
          <Row title="Minimum priority" hint="Anything below this level is dropped and never reaches the centre.">
            <select
              value={prefs.minPriority}
              onChange={(e) => update({ minPriority: e.target.value as typeof prefs.minPriority })}
              disabled={!prefs.enabled}
              className="rounded-lg border px-2 py-1.5 text-[13px] font-semibold bg-white text-slate-700 outline-none disabled:opacity-40"
              style={{ borderColor: 'var(--hairline)' }}
            >
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} and above
                </option>
              ))}
            </select>
          </Row>
        </div>
      </div>

      {/* do not disturb */}
      <div className="bento bento-pad">
        <div className="flex items-center gap-2 mb-1">
          <Clock size={16} className="text-indigo-500" />
          <span className="font-bold text-slate-800 text-sm">Do Not Disturb</span>
        </div>
        <div className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
          <Row title="Quiet hours" hint="During this window notifications are still recorded, but stay silent. Critical alerts always come through.">
            <Toggle on={prefs.dnd.enabled} onChange={(v) => update({ dnd: { ...prefs.dnd, enabled: v } })} disabled={!prefs.enabled} />
          </Row>
          {prefs.dnd.enabled && (
            <div className="flex items-center gap-3 py-2.5 flex-wrap">
              <label className="text-[12.5px] font-semibold" style={{ color: 'var(--ink-2)' }}>
                From{' '}
                <input
                  type="time"
                  value={prefs.dnd.from}
                  onChange={(e) => update({ dnd: { ...prefs.dnd, from: e.target.value } })}
                  className="ml-1 rounded-lg border px-2 py-1 text-[13px] font-semibold bg-white text-slate-800 outline-none"
                  style={{ borderColor: 'var(--hairline)' }}
                />
              </label>
              <label className="text-[12.5px] font-semibold" style={{ color: 'var(--ink-2)' }}>
                To{' '}
                <input
                  type="time"
                  value={prefs.dnd.to}
                  onChange={(e) => update({ dnd: { ...prefs.dnd, to: e.target.value } })}
                  className="ml-1 rounded-lg border px-2 py-1 text-[13px] font-semibold bg-white text-slate-800 outline-none"
                  style={{ borderColor: 'var(--hairline)' }}
                />
              </label>
              <span className="text-[11.5px]" style={{ color: HINT_INK }}>
                Crossing midnight is fine (e.g. 21:00 → 07:00).
              </span>
            </div>
          )}
        </div>
      </div>

      {/* categories */}
      <div className="bento bento-pad">
        <div className="flex items-center gap-2 mb-1">
          <BellRing size={16} className="text-indigo-500" />
          <span className="font-bold text-slate-800 text-sm">Categories</span>
          <span className="text-xs text-slate-500">muted categories stay in the centre, just silent</span>
          <div className="ml-auto flex gap-1.5">
            <button className="icon-btn" onClick={() => update({ muted: [] })}>
              Unmute all
            </button>
            <button className="icon-btn" onClick={() => update({ muted: CATEGORIES.map((c) => c.id) })}>
              Mute all
            </button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2 mt-3">
          {CATEGORIES.map((c) => {
            const on = !prefs.muted.includes(c.id)
            return (
              <label
                key={c.id}
                className="flex items-center gap-2.5 rounded-xl border p-2.5 cursor-pointer transition hover:brightness-95"
                style={{ borderColor: 'var(--hairline)', background: on ? `color-mix(in srgb, ${c.color} 8%, var(--surface))` : 'var(--surface)' }}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                <span className="flex-1 text-[13px] font-semibold" style={{ color: on ? 'var(--ink)' : 'var(--ink-hint)' }}>
                  {c.label}
                </span>
                <Toggle on={on} onChange={() => toggleCategory(c.id)} disabled={!prefs.enabled} />
              </label>
            )
          })}
        </div>
      </div>

      {/* push */}
      <div className="bento bento-pad">
        <div className="flex items-center gap-2 mb-1">
          <BellRing size={16} className="text-indigo-500" />
          <span className="font-bold text-slate-800 text-sm">Push notifications</span>
        </div>
        <p className="text-[12px] leading-relaxed mb-2" style={{ color: 'var(--ink-2)' }}>
          Push lets the server reach this device even when the app is closed. It uses Web Push with VAPID — no third-party
          account and no cost. On iPhone it only works after you add the app to the Home Screen.
        </p>
        {!pushSupported() ? (
          <div className="text-[12.5px] font-semibold text-amber-600">This browser does not support push notifications. Local notifications still work.</div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-semibold" style={{ color: 'var(--ink-2)' }}>
              Permission: <b style={{ color: 'var(--ink)' }}>{perm}</b> · This device:{' '}
              <b style={{ color: 'var(--ink)' }}>{subscribed === null ? '…' : subscribed ? 'subscribed' : 'not subscribed'}</b>
            </span>
            <div className="ml-auto flex gap-1.5">
              {subscribed ? (
                <>
                  <button
                    className="icon-btn"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true)
                      const r = await sendTestPush()
                      setMsg({ ok: r.ok, text: r.ok ? 'Test push requested.' : r.error ?? 'Failed.' })
                      setBusy(false)
                    }}
                  >
                    Send test push
                  </button>
                  <button className="icon-btn hover:!text-red-600" disabled={busy} onClick={disablePush}>
                    Turn off
                  </button>
                </>
              ) : (
                <button
                  className="icon-btn !bg-indigo-600 !text-white !border-indigo-600 hover:!bg-indigo-700 disabled:opacity-60"
                  disabled={busy || !prefs.enabled}
                  onClick={enablePush}
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} />} Enable push on this device
                </button>
              )}
            </div>
          </div>
        )}
        {msg && (
          <div className={`mt-2 text-[12px] font-semibold ${msg.ok ? 'text-emerald-600' : 'text-amber-600'}`}>{msg.text}</div>
        )}
      </div>
    </div>
  )
}
