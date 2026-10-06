import { useMemo, useState } from 'react'
import { Check, Eye, Lock, Pencil, ShieldCheck, Trash2, TriangleAlert, X } from 'lucide-react'
import { LEVEL_HINT, LEVEL_INK, LEVEL_LABEL, LEVELS, NEW_USER_ACCESS, type AccessMap, type Level } from '../lib/access'
import { UNIT_LABEL, UNITS, type Unit } from '../lib/unit'
import { adminApi, type HistoryUser } from '../lib/auth'

/**
 * Who may do what, workspace by workspace.
 *
 * One row per workspace and four steps along it, because the levels are a ladder rather
 * than a set of switches — you cannot delete what you may not change. A row of segmented
 * buttons says that shape at a glance and makes an impossible combination unreachable,
 * where three checkboxes would invite one.
 *
 * Nothing is sent until Save, so an admin can look at the whole picture before committing.
 */

const LEVEL_ICON: Record<Level, typeof Eye> = { none: Lock, view: Eye, update: Pencil, delete: Trash2 }

/** The accent each workspace carries elsewhere in the app, so a row is recognisable. */
const UNIT_TINT: Record<Unit, string> = {
  U1: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
  U2: 'linear-gradient(135deg,#0ea5e9,#2563eb)',
  U3: 'linear-gradient(135deg,#0d9488,#059669)',
  ASS: 'linear-gradient(135deg,#f59e0b,#ea580c)',
}

export function UserAccessModal({
  user,
  onClose,
  onSaved,
}: {
  user: HistoryUser
  onClose: () => void
  onSaved: (access: AccessMap) => void
}) {
  const [draft, setDraft] = useState<AccessMap>(() => ({ ...user.access }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const dirty = useMemo(() => UNITS.some((u) => draft[u] !== user.access[u]), [draft, user.access])
  const managed = user.role === 'user'
  const openCount = UNITS.filter((u) => draft[u] !== 'none').length

  const set = (unit: Unit, level: Level) => {
    setErr('')
    setDraft((d) => ({ ...d, [unit]: level }))
  }

  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      const saved = await adminApi.setAccess(user.username, draft)
      onSaved(saved)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save access.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center p-4 overflow-auto scroll-area"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden my-6"
        style={{ animation: 'rise 0.18s ease both' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center gap-3 p-5" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
          <div className="w-12 h-12 rounded-2xl grid place-items-center bg-white/15 text-white shrink-0">
            <ShieldCheck size={24} />
          </div>
          <div className="min-w-0 flex-1 text-white">
            <div className="text-lg font-extrabold truncate">Access · {user.fullName}</div>
            <div className="text-sm text-white/70 truncate">
              @{user.username} · {managed ? `${openCount} of ${UNITS.length} workspaces open` : 'Full access'}
            </div>
          </div>
          <button className="text-white/70 hover:text-white shrink-0" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>

        <div className="p-4 md:p-5 flex flex-col gap-3">
          {!managed ? (
            <div className="rounded-xl px-3.5 py-3 text-[13px] font-semibold flex items-start gap-2.5 bg-indigo-50 text-indigo-700">
              <ShieldCheck size={17} className="shrink-0 mt-px" />
              <span>
                {user.role === 'admin' ? 'Admins' : 'QA accounts'} have full access to every workspace by design, so there is
                nothing to hand out here.
              </span>
            </div>
          ) : (
            <>
              {!user.accessSet && (
                <div className="rounded-xl px-3.5 py-3 text-[13px] font-semibold flex items-start gap-2.5 bg-amber-50 text-amber-800 border border-amber-200">
                  <TriangleAlert size={17} className="shrink-0 mt-px" />
                  <span>
                    This account was created before access control, so it still holds everything. Saving here sets its access
                    for the first time.
                  </span>
                </div>
              )}

              {UNITS.map((unit) => {
                const level = draft[unit]
                const changed = level !== user.access[unit]
                return (
                  <div
                    key={unit}
                    className="rounded-2xl border p-3 md:p-3.5 transition"
                    style={{
                      borderColor: changed ? '#a5b4fc' : 'var(--hairline)',
                      background: changed ? 'rgba(99,102,241,0.045)' : 'var(--surface)',
                    }}
                  >
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <div
                        className="w-9 h-9 rounded-xl grid place-items-center text-white font-extrabold text-[13px] shrink-0"
                        style={{ background: UNIT_TINT[unit] }}
                      >
                        {unit}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-bold text-slate-800 leading-tight">{UNIT_LABEL[unit]}</div>
                        <div className="text-[11.5px] leading-tight" style={{ color: 'var(--ink-hint)' }}>
                          {LEVEL_HINT[level]}
                        </div>
                      </div>
                      <span
                        className="shrink-0 text-[11px] font-bold rounded-lg px-2 py-1"
                        style={{ background: LEVEL_INK[level].bg, color: LEVEL_INK[level].fg }}
                      >
                        {LEVEL_LABEL[level]}
                      </span>
                    </div>

                    {/* The ladder. Every step to the left of the chosen one is filled in, so
                        "update also means view" is visible instead of something to be told. */}
                    <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={`${unit} access`}>
                      {LEVELS.map((lv) => {
                        const Icon = LEVEL_ICON[lv]
                        const on = lv === level
                        const included = LEVELS.indexOf(lv) < LEVELS.indexOf(level)
                        return (
                          <button
                            key={lv}
                            role="radio"
                            aria-checked={on}
                            onClick={() => set(unit, lv)}
                            title={LEVEL_HINT[lv]}
                            className="rounded-xl px-1.5 py-2 text-[11.5px] font-bold transition flex flex-col items-center gap-1 border"
                            style={{
                              borderColor: on ? LEVEL_INK[lv].fg : included ? '#cbd5e1' : 'var(--hairline)',
                              background: on ? LEVEL_INK[lv].bg : included ? 'rgba(148,163,184,0.13)' : 'var(--surface)',
                              color: on ? LEVEL_INK[lv].fg : included ? '#475569' : 'var(--ink-hint)',
                              boxShadow: on ? `inset 0 0 0 1px ${LEVEL_INK[lv].fg}` : undefined,
                            }}
                          >
                            <Icon size={15} />
                            <span className="leading-none text-center">{LEVEL_LABEL[lv]}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              <button
                onClick={() => setDraft({ ...NEW_USER_ACCESS })}
                className="self-start text-[12.5px] font-bold text-indigo-600 hover:text-indigo-800 underline underline-offset-2"
              >
                Reset to a new user's access (U1 view only)
              </button>
            </>
          )}

          {err && (
            <div className="rounded-xl px-3.5 py-2.5 text-[13px] font-semibold bg-red-50 text-red-700 border border-red-200">{err}</div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center gap-2 p-4 md:p-5 pt-0">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-[var(--hairline)] py-2.5 text-[13.5px] font-bold text-slate-600 hover:bg-slate-50"
          >
            {managed ? 'Cancel' : 'Close'}
          </button>
          {managed && (
            <button
              onClick={save}
              disabled={!dirty || busy}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13.5px] font-bold text-white disabled:opacity-40 transition"
              style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
            >
              <Check size={16} /> {busy ? 'Saving…' : dirty ? 'Save access' : 'No changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
