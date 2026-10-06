import { useEffect, useMemo, useState } from 'react'
import {
  Users,
  LogIn,
  LogOut,
  Trash2,
  UploadCloud,
  History,
  RefreshCw,
  ShieldCheck,
  Loader2,
  Search,
  ChevronRight,
  X,
  User,
  Mail,
  Phone,
  BadgeCheck,
  CalendarClock,
  FlaskConical,
  Download,
  HardDrive,
  type LucideIcon,
} from 'lucide-react'
import { adminApi, type HistoryEvent, type HistoryUser } from '../lib/auth'
import { LEVEL_INK, LEVEL_LABEL, type AccessMap } from '../lib/access'
import { UNITS } from '../lib/unit'
import { UserAccessModal } from './UserAccessModal'
import { BackupCleanModal } from './BackupCleanModal'
import { StorageModal } from './StorageModal'

type Tab = 'users' | 'session' | 'delete' | 'import' | 'meeting'

const TABS: {
  id: Tab
  label: string
  short: string
  icon: LucideIcon
  types?: HistoryEvent['type'][]
  color: string
  /** Dashboard card vocabulary — pale card tint + solid gradient icon. */
  tint: string
  grad: string
}[] = [
  { id: 'users', label: 'Users', short: 'Users', icon: Users, color: '#7c6cf0', tint: 'tint-violet', grad: 'grad-violet' },
  { id: 'session', label: 'Login / Logout', short: 'Login', icon: LogIn, types: ['login', 'logout'], color: '#22c88a', tint: 'tint-emerald', grad: 'grad-emerald' },
  { id: 'delete', label: 'Deletes', short: 'Deletes', icon: Trash2, types: ['delete'], color: '#f26464', tint: 'tint-red', grad: 'grad-red' },
  { id: 'import', label: 'Excel Imports', short: 'Imports', icon: UploadCloud, types: ['import'], color: '#ff8a4c', tint: 'tint-orange', grad: 'grad-orange' },
  { id: 'meeting', label: 'Meetings', short: 'Meetings', icon: History, types: ['meeting'], color: '#eda100', tint: 'tint-yellow', grad: 'grad-yellow' },
]

const fullWhen = (ms: number) =>
  new Date(ms).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

/** "2m ago" / "3h ago" — easier to scan than a timestamp. */
function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

const EVENT_META: Record<HistoryEvent['type'], { Icon: LucideIcon; color: string }> = {
  login: { Icon: LogIn, color: '#10b981' },
  logout: { Icon: LogOut, color: '#64748b' },
  delete: { Icon: Trash2, color: '#ef4444' },
  import: { Icon: UploadCloud, color: '#3b82f6' },
  meeting: { Icon: History, color: '#f59e0b' },
  access: { Icon: ShieldCheck, color: '#f97316' },
  note: { Icon: History, color: '#94a3b8' },
  cpk: { Icon: History, color: '#94a3b8' },
  cumulative: { Icon: History, color: '#94a3b8' },
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-[var(--hairline)] px-3 py-2.5 min-w-0">
      <span className="w-8 h-8 rounded-lg grid place-items-center bg-white border border-[var(--hairline)] text-slate-400 shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[11px] text-slate-500">{label}</div>
        <div className="text-sm font-semibold text-slate-800 break-words">{value || '—'}</div>
      </div>
    </div>
  )
}

/**
 * What one account may do, at a glance: one chip per workspace, greyed where it has none.
 *
 * Four chips read faster than a sentence, and they are the same four labels the Access
 * panel uses — so what an admin sets is what they see back on the card.
 */
function AccessChips({ access, dim = false }: { access: AccessMap; dim?: boolean }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {UNITS.map((u) => {
        const lv = access?.[u] ?? 'none'
        const ink = LEVEL_INK[lv]
        return (
          <span
            key={u}
            className="text-[10px] font-bold rounded-md px-1.5 py-0.5 whitespace-nowrap"
            style={{ background: ink.bg, color: ink.fg, opacity: dim && lv === 'none' ? 0.55 : 1 }}
            title={`${u} — ${LEVEL_LABEL[lv]}`}
          >
            {u} · {lv === 'none' ? '—' : lv === 'view' ? 'View' : lv === 'update' ? 'Update' : 'Del'}
          </span>
        )
      })}
    </div>
  )
}

/** Everything a user entered at registration — opened from the Users list. */
function UserDetailModal({ user, onClose, onAccess }: { user: HistoryUser; onClose: () => void; onAccess: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 overflow-auto scroll-area"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden my-6"
        style={{ animation: 'rise 0.18s ease both' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center gap-3 p-5" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
          <div className="w-14 h-14 rounded-2xl grid place-items-center bg-white/15 text-white font-extrabold text-2xl shrink-0">
            {(user.fullName || user.username).slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 text-white">
            <div className="text-xl font-extrabold truncate flex items-center gap-2">
              {user.fullName}
              {user.role === 'admin' && (
                <span className="text-[10px] font-bold bg-white/20 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
                  <ShieldCheck size={11} /> ADMIN
                </span>
              )}
              {user.role === 'qa' && (
                <span className="text-[10px] font-bold bg-white/20 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
                  <FlaskConical size={11} /> QA
                </span>
              )}
            </div>
            <div className="text-sm text-white/70 truncate">@{user.username}</div>
          </div>
          <button className="text-white/70 hover:text-white shrink-0" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>

        {/* details */}
        <div className="p-4 md:p-5 flex flex-col gap-3">
          <div
            className={`inline-flex self-start items-center gap-1.5 text-xs font-bold rounded-lg px-2.5 py-1 ${
              user.disabled ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
            }`}
          >
            {user.disabled ? '⛔ Login disabled' : '✓ Login enabled'}
          </div>
          <div className="grid sm:grid-cols-2 gap-2.5">
            <DetailRow icon={<User size={15} />} label="Full Name" value={user.fullName} />
            <DetailRow icon={<BadgeCheck size={15} />} label="User Name" value={'@' + user.username} />
            <DetailRow icon={<BadgeCheck size={15} />} label="Employee ID" value={user.employeeId} />
            <DetailRow icon={<ShieldCheck size={15} />} label="Role" value={user.role === 'admin' ? 'Admin' : user.role === 'qa' ? 'QA' : 'User'} />
            <DetailRow icon={<Mail size={15} />} label="Email" value={user.email} />
            <DetailRow icon={<Phone size={15} />} label="Phone Number" value={user.phone} />
            <DetailRow
              icon={<CalendarClock size={15} />}
              label="Joined"
              value={user.createdAt > 0 ? fullWhen(user.createdAt) : '—'}
            />
          </div>

          {/* What they may do, and the way in to change it. */}
          <div className="rounded-xl border border-[var(--hairline)] p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--ink-hint)' }}>
                  Workspace access
                </div>
                <AccessChips access={user.access} />
              </div>
              <button
                onClick={onAccess}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-bold text-white shadow-sm"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
              >
                <ShieldCheck size={15} /> Access
              </button>
            </div>
            {!user.accessSet && user.role === 'user' && (
              <div className="text-[11.5px] mt-2 font-semibold text-amber-700">
                Never set — this account predates access control and still holds everything.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Admin-only page: who signed in, imported, deleted — everything the team did. */
export function UserHistoryPage({ me, isAdmin = false, onBackup }: { me: string; isAdmin?: boolean; onBackup?: () => void }) {
  const [tab, setTab] = useState<Tab>('users')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [users, setUsers] = useState<HistoryUser[]>([])
  const [events, setEvents] = useState<HistoryEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [q, setQ] = useState('')
  const [showClean, setShowClean] = useState(false)
  const [showStorage, setShowStorage] = useState(false)
  const [detail, setDetail] = useState<HistoryUser | null>(null)
  /** The user whose access panel is open. */
  const [accessFor, setAccessFor] = useState<HistoryUser | null>(null)

  const load = async () => {
    setLoading(true)
    const r = await adminApi.history()
    if (!r) setDenied(true)
    else {
      setUsers(r.users)
      setEvents(r.events)
      setDenied(false)
    }
    setLoading(false)
  }
  useEffect(() => {
    void load()
  }, [])

  /** Flip a user's login access, then refresh so the list stays truthful. */
  const toggleUser = async (u: HistoryUser) => {
    setErr('')
    setBusy(u.username)
    try {
      await adminApi.setEnabled(u.username, !!u.disabled) // disabled -> enable, enabled -> disable
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not change access.')
    } finally {
      setBusy('')
    }
  }

  const removeUser = async (u: HistoryUser) => {
    if (!confirm(`Remove @${u.username} (${u.fullName})?\n\nThey will not be able to log in, and their history entries are cleared. This cannot be undone.`))
      return
    setErr('')
    setBusy(u.username)
    try {
      await adminApi.removeUser(u.username)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not remove the account.')
    } finally {
      setBusy('')
    }
  }


  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const e of events) c[e.type] = (c[e.type] || 0) + 1
    return c
  }, [events])
  const countFor = (t: (typeof TABS)[number]) =>
    t.id === 'users' ? users.length : (t.types || []).reduce((s, ty) => s + (counts[ty] || 0), 0)

  const shownEvents = useMemo(() => {
    const t = TABS.find((x) => x.id === tab)
    if (!t?.types) return []
    const needle = q.trim().toLowerCase()
    return events
      .filter((e) => t.types!.includes(e.type))
      .filter((e) => !needle || e.detail.toLowerCase().includes(needle) || e.username.toLowerCase().includes(needle))
  }, [events, tab, q])

  const shownUsers = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return users.filter(
      (u) =>
        !needle ||
        u.fullName.toLowerCase().includes(needle) ||
        u.username.toLowerCase().includes(needle) ||
        (u.employeeId || '').toLowerCase().includes(needle),
    )
  }, [users, q])

  if (denied) {
    return (
      <div className="bento bento-pad text-center py-14">
        <div className="w-14 h-14 mx-auto rounded-2xl grid place-items-center bg-red-50 text-red-500 mb-3">
          <ShieldCheck size={26} />
        </div>
        <div className="font-extrabold text-slate-800">Admins only</div>
        <p className="text-sm text-slate-500 mt-1">Sign in through the Admin page to view user history.</p>
      </div>
    )
  }

  const active = TABS.find((t) => t.id === tab)!

  return (
    <div className="flex flex-col gap-4 md:gap-5 min-w-0">
      {/* Summary tiles — also switch the tab */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 md:gap-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`stat-card ${t.tint} p-3 md:p-3.5 text-left transition min-w-0 ${
              tab === t.id ? 'ring-2 ring-indigo-500' : 'hover:shadow-sm'
            }`}
            title={t.label}
          >
            <div className={`stat-icon stat-icon-sm ${t.grad}`}>
              <t.icon size={16} />
            </div>
            <div className="mt-2 text-xs md:text-[13px] font-semibold text-slate-700 leading-tight truncate">{t.label}</div>
            <div className="text-xl md:text-2xl font-extrabold tracking-tight leading-tight" style={{ color: 'var(--ink)' }}>
              {countFor(t)}
            </div>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bento overflow-hidden min-w-0">
        <div className="flex items-center gap-3 px-4 md:px-5 pt-4 pb-3 border-b border-[var(--hairline)] flex-wrap">
          <div
            className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
            style={{ background: active.color + '1a', color: active.color }}
          >
            <active.icon size={18} />
          </div>
          <div className="flex-1 min-w-[120px]">
            <div className="font-bold text-slate-800">{active.label}</div>
            <div className="text-xs" style={{ color: 'var(--ink-hint)' }}>
              {tab === 'users' ? `${shownUsers.length} user(s)` : `${shownEvents.length} record(s)`} · newest first
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2 bg-white rounded-xl border border-[var(--hairline)] px-3 py-1.5 flex-1 sm:w-48">
              <Search size={14} className="text-slate-400 shrink-0" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className="flex-1 min-w-0 text-sm bg-transparent outline-none text-slate-700"
              />
            </div>
            <button className="icon-btn shrink-0" onClick={load} disabled={loading} title="Refresh">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="p-3 md:p-4">
          {err && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{err}</div>
          )}
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-sm py-10" style={{ color: 'var(--ink-hint)' }}>
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          ) : tab === 'users' ? (
            <div className="grid sm:grid-cols-2 gap-2.5">
              {shownUsers.map((u) => (
                <div
                  key={u.username}
                  className={`rounded-xl border px-3 py-2.5 min-w-0 transition ${
                    u.disabled ? 'border-red-200 bg-red-50/40' : 'border-[var(--hairline)] bg-white'
                  }`}
                >
                  {/* identity — click for full details */}
                  <button
                    onClick={() => setDetail(u)}
                    className="flex items-center gap-3 min-w-0 w-full text-left group"
                    title="View full details"
                  >
                    <div
                      className={`w-10 h-10 rounded-full grid place-items-center text-white font-bold shrink-0 ${
                        u.disabled ? 'bg-slate-500' : 'grad-violet'
                      }`}
                    >
                      {(u.fullName || u.username).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-800 truncate flex items-center gap-1.5 group-hover:text-indigo-600 transition">
                        <span className={u.disabled ? 'line-through' : ''} style={u.disabled ? { color: 'var(--ink-hint)' } : undefined}>{u.fullName}</span>
                        {u.role === 'admin' && (
                          <span className="text-[9px] font-bold bg-indigo-100 text-indigo-700 rounded px-1 py-0.5 inline-flex items-center gap-0.5 shrink-0">
                            <ShieldCheck size={9} /> ADMIN
                          </span>
                        )}
                        {u.role === 'qa' && (
                          <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded px-1 py-0.5 inline-flex items-center gap-0.5 shrink-0">
                            <FlaskConical size={9} /> QA
                          </span>
                        )}
                        {u.disabled && (
                          <span className="text-[9px] font-bold bg-red-100 text-red-700 rounded px-1 py-0.5 shrink-0">
                            DISABLED
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        @{u.username}
                        {u.employeeId ? ` · ${u.employeeId}` : ''}
                      </div>
                      <div className="text-[11px] truncate" style={{ color: 'var(--ink-hint)' }}>{u.email || '—'}</div>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-500 shrink-0 transition" />
                  </button>

                  {/* what they may do, workspace by workspace */}
                  <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-[var(--hairline)] flex-wrap">
                    <div className="flex-1 min-w-0">
                      <AccessChips access={u.access} dim />
                    </div>
                    <button
                      onClick={() => setAccessFor(u)}
                      title={`Set what @${u.username} may do in each workspace`}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2.5 py-1.5 text-[12px] font-bold transition"
                    >
                      <ShieldCheck size={13} /> Access
                    </button>
                  </div>

                  {/* login controls */}
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[var(--hairline)] flex-wrap">
                    <span className="text-[11px] font-semibold text-slate-500 flex-1 min-w-0">
                      {u.username === me ? 'This is you' : u.disabled ? 'Login blocked' : 'Login allowed'}
                    </span>
                    <button
                      onClick={() => toggleUser(u)}
                      disabled={u.username === me || busy === u.username}
                      title={u.username === me ? "You can't disable your own account" : u.disabled ? 'Enable login' : 'Disable login'}
                      className={`relative w-11 h-6 rounded-full transition shrink-0 disabled:opacity-40 ${
                        u.disabled ? 'bg-slate-300' : 'bg-emerald-500'
                      }`}
                      role="switch"
                      aria-checked={!u.disabled}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                          u.disabled ? '' : 'translate-x-5'
                        }`}
                      />
                    </button>
                    <span className="text-[11px] font-bold w-12" style={{ color: u.disabled ? 'var(--ink-hint)' : undefined }}>
                      {u.disabled ? 'Disabled' : 'Enabled'}
                    </span>
                    <button
                      onClick={() => removeUser(u)}
                      disabled={u.username === me || busy === u.username}
                      title={u.username === me ? "You can't remove your own account" : 'Remove account'}
                      className="w-8 h-8 grid place-items-center rounded-lg border border-[var(--hairline)] text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition disabled:opacity-40 shrink-0"
                    >
                      {busy === u.username ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
              ))}
              {shownUsers.length === 0 && <div className="text-sm text-center py-8 sm:col-span-2" style={{ color: 'var(--ink-hint)' }}>No users found.</div>}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {shownEvents.map((e) => {
                const m = EVENT_META[e.type] ?? EVENT_META.note
                return (
                  <div
                    key={e.id}
                    className="flex items-start gap-2.5 rounded-xl border border-[var(--hairline)] bg-white px-3 py-2.5 min-w-0"
                  >
                    <span
                      className="w-8 h-8 rounded-lg grid place-items-center shrink-0"
                      style={{ background: m.color + '1a', color: m.color }}
                    >
                      <m.Icon size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-700 break-words">{e.detail}</div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className="text-[11px] font-semibold text-slate-500">@{e.username}</span>
                        {e.role === 'admin' && (
                          <span className="text-[9px] font-bold bg-indigo-100 text-indigo-700 rounded px-1 py-0.5">ADMIN</span>
                        )}
                        {e.role === 'qa' && (
                          <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded px-1 py-0.5">QA</span>
                        )}
                        <span className="text-[11px]" style={{ color: 'var(--ink-hint)' }}>· {fullWhen(e.at)}</span>
                      </div>
                    </div>
                    <div className="text-[11px] shrink-0 whitespace-nowrap" style={{ color: 'var(--ink-hint)' }}>{ago(e.at)}</div>
                  </div>
                )
              })}
              {shownEvents.length === 0 && (
                <div className="text-sm text-center py-8" style={{ color: 'var(--ink-hint)' }}>Nothing recorded here yet.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Admin data tools — back up first, then clean. */}
      {onBackup && (
        <div className="bento bento-pad flex items-center gap-3 flex-wrap">
          <div className="w-9 h-9 rounded-xl grid place-items-center grad-violet text-white shrink-0">
            <Download size={18} />
          </div>
          <div className="flex-1 min-w-[160px]">
            <div className="font-bold text-slate-800 text-sm">Backup</div>
            <div className="text-xs text-slate-500">
              Export any date range as date-wise CSV folders — take it before the 30-day cleanup runs.
            </div>
          </div>
          <button
            className="icon-btn !bg-violet-600 !text-white !border-violet-600 hover:!bg-violet-700"
            onClick={onBackup}
          >
            <Download size={14} /> Open Backup
          </button>
        </div>
      )}

      {isAdmin && (
        <div className="bento bento-pad flex items-center gap-3 flex-wrap">
          <div className="stat-icon stat-icon-sm grad-blue shrink-0">
            <HardDrive size={18} />
          </div>
          <div className="flex-1 min-w-[160px]">
            <div className="font-bold text-slate-800 text-sm">Storage</div>
            <div className="text-xs" style={{ color: 'var(--ink-hint)' }}>
              App size, data size, and every uploaded file — check before you clean
            </div>
          </div>
          <button
            className="icon-btn !text-white"
            style={{ background: '#2563eb', borderColor: '#2563eb' }}
            onClick={() => setShowStorage(true)}
          >
            <HardDrive size={14} /> Open Storage
          </button>
        </div>
      )}

      {/* CHANGED: "Retention" (which ran an automatic 30-day delete) is replaced by
          Backup Clean. Nothing is deleted on a timer any more — an admin does it here,
          after reviewing what is about to go. Admin-only; the server enforces that too. */}
      {isAdmin && (
        <div className="bento bento-pad flex items-center gap-3 flex-wrap">
          <div
            className="w-9 h-9 rounded-xl grid place-items-center text-white shrink-0"
            style={{ background: 'linear-gradient(135deg,#f59e0b,#dc2626)' }}
          >
            <Trash2 size={18} />
          </div>
          <div className="flex-1 min-w-[160px]">
            <div className="font-bold text-slate-800 text-sm">Backup Clean</div>
            <div className="text-xs" style={{ color: 'var(--ink-hint)' }}>Review and remove old uploaded data</div>
          </div>
          <button
            className="icon-btn !text-white"
            style={{ background: '#dc2626', borderColor: '#dc2626' }}
            onClick={() => setShowClean(true)}
          >
            <Trash2 size={14} /> Open Backup Clean
          </button>
        </div>
      )}

      {showClean && <BackupCleanModal onClose={() => setShowClean(false)} />}
      {showStorage && <StorageModal onClose={() => setShowStorage(false)} />}

      {detail && (
        <UserDetailModal
          user={detail}
          onClose={() => setDetail(null)}
          onAccess={() => {
            setAccessFor(detail)
            setDetail(null)
          }}
        />
      )}
      {accessFor && (
        <UserAccessModal
          user={accessFor}
          onClose={() => setAccessFor(null)}
          onSaved={(access) => {
            // Patch in place rather than reloading — the list keeps its scroll and search.
            setUsers((prev) => prev.map((x) => (x.username === accessFor.username ? { ...x, access, accessSet: true } : x)))
          }}
        />
      )}
    </div>
  )
}
