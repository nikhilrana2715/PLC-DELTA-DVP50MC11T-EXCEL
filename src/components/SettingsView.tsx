import { useEffect, useState } from 'react'
import {
  Bell,
  Monitor,
  Repeat,
  Sun,
  Moon,
  Laptop,
  Languages,
  Users,
  Maximize2,
  Minimize2,
  LogOut,
  Mail,
  BadgeCheck,
  KeyRound,
  ShieldCheck,
  Loader2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Save,
  ArrowRight,
  Pencil,
  Check,
} from 'lucide-react'
import type { ThemePref, LangPref } from '../lib/prefs'
import { authApi, type AuthUser } from '../lib/auth'
import { useT } from '../lib/i18n'
import { DEFAULT_LOOP_SECONDS, LOOP_SECONDS } from '../lib/loop'

type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void }
type FsDoc = Document & { webkitExitFullscreen?: () => void; webkitFullscreenElement?: Element | null }
const isFs = () => !!((document as FsDoc).fullscreenElement || (document as FsDoc).webkitFullscreenElement)
const enterFs = () => {
  const el = document.documentElement as FsEl
  if (el.requestFullscreen) void el.requestFullscreen()
  else el.webkitRequestFullscreen?.()
}
const exitFs = () => {
  const d = document as FsDoc
  if (d.exitFullscreen) void d.exitFullscreen()
  else d.webkitExitFullscreen?.()
}

function Section({
  icon,
  title,
  desc,
  children,
  right,
  collapsible = false,
  defaultOpen = true,
}: {
  icon: React.ReactNode
  title: React.ReactNode
  desc?: string
  children: React.ReactNode
  right?: React.ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const t = useT()
  const show = collapsible ? open : true
  return (
    <div className="bento overflow-hidden rise">
      <div
        className={`flex items-center gap-3 px-4 md:px-5 pt-4 pb-3 ${
          show ? 'border-b border-[var(--hairline)]' : ''
        } ${collapsible ? 'cursor-pointer select-none hover:bg-slate-50/60 transition' : ''}`}
        onClick={collapsible ? () => setOpen((o) => !o) : undefined}
        role={collapsible ? 'button' : undefined}
        aria-expanded={collapsible ? open : undefined}
      >
        <div className="w-9 h-9 rounded-xl grid place-items-center grad-violet text-white shrink-0 font-bold">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-slate-800 truncate">{typeof title === 'string' ? t(title) : title}</div>
          {desc && <div className="text-xs text-slate-500 truncate">{t(desc)}</div>}
        </div>
        {right}
        {collapsible && (
          <ChevronDown size={18} className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </div>
      {show && <div className="p-4 md:p-5 flex flex-col gap-4">{children}</div>}
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { val: T; label: string; icon?: React.ReactNode }[]
  onChange: (v: T) => void
}) {
  const t = useT()
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1 flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.val}
          onClick={() => onChange(o.val)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
            value === o.val ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {o.icon}
          {t(o.label)}
        </button>
      ))}
    </div>
  )
}

/** Premium language picker — native script, active highlight, check icon. */
const LANGS: { val: LangPref; native: string; name: string }[] = [
  { val: 'en', native: 'English', name: 'English' },
  { val: 'hi', native: 'हिन्दी', name: 'Hindi' },
  { val: 'gu', native: 'ગુજરાતી', name: 'Gujarati' },
]
function LanguageSelector({ value, onChange }: { value: LangPref; onChange: (v: LangPref) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
      {LANGS.map((l) => {
        const active = value === l.val
        return (
          <button
            key={l.val}
            onClick={() => onChange(l.val)}
            aria-pressed={active}
            className={`relative flex items-center gap-3 rounded-2xl border-2 px-3.5 py-3 text-left transition-all duration-200 ${
              active
                ? 'border-indigo-500 bg-indigo-50/70 shadow-sm'
                : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
            }`}
          >
            <div
              className={`w-10 h-10 rounded-xl grid place-items-center text-xs font-extrabold shrink-0 transition-colors ${
                active ? 'grad-violet text-white shadow-sm' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {l.val.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`font-bold leading-tight truncate ${active ? 'text-indigo-700' : 'text-slate-800'}`}>{l.native}</div>
              <div className="text-[11px] text-slate-500 truncate">{l.name}</div>
            </div>
            <span
              className={`grid place-items-center w-5 h-5 rounded-full shrink-0 transition-all duration-200 ${
                active ? 'bg-indigo-600 text-white scale-100 opacity-100' : 'scale-50 opacity-0'
              }`}
            >
              <Check size={13} strokeWidth={3} />
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  const t = useT()
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex-1 min-w-[140px]">
        <div className="font-semibold text-slate-800 text-sm">{t(title)}</div>
        {desc && <div className="text-xs text-slate-500">{t(desc)}</div>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative w-12 h-7 rounded-full transition shrink-0 ${on ? 'bg-indigo-600' : 'bg-slate-300'}`}
      role="switch"
      aria-checked={on}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-5' : ''
        }`}
      />
    </button>
  )
}

function ProfileItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  const t = useT()
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 border border-[var(--hairline)] px-3 py-2 min-w-0">
      <span className="text-slate-400 shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] text-slate-500">{t(label)}</div>
        <div className="text-sm font-semibold text-slate-800 truncate">{value}</div>
      </div>
    </div>
  )
}

function AuthInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  upper,
  inputMode,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  upper?: boolean
  inputMode?: 'text' | 'numeric' | 'email' | 'tel'
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
        type={type}
        placeholder={placeholder}
        inputMode={inputMode}
        className={`mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 ${
          upper ? 'uppercase tracking-wider' : ''
        }`}
      />
    </label>
  )
}

function ChangePasswordForm() {
  const [open, setOpen] = useState(false)
  const [cur, setCur] = useState('')
  const [nw, setNw] = useState('')
  const [nw2, setNw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const submit = async () => {
    setMsg(null)
    if (nw !== nw2) return setMsg({ ok: false, text: 'New passwords do not match.' })
    setBusy(true)
    try {
      await authApi.changePassword({ currentPassword: cur, newPassword: nw })
      setMsg({ ok: true, text: 'Password updated successfully.' })
      setCur('')
      setNw('')
      setNw2('')
      window.setTimeout(() => {
        setOpen(false)
        setMsg(null)
      }, 1400)
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not change password.' })
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 self-start rounded-xl bg-white border border-[var(--hairline)] text-slate-700 text-sm font-semibold px-3.5 py-2 hover:bg-slate-50 transition"
      >
        <KeyRound size={15} /> Change password
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--hairline)] p-3 flex flex-col gap-2.5 bg-slate-50/50">
      <AuthInput label="Current password" value={cur} onChange={setCur} type="password" />
      <AuthInput label="New password" value={nw} onChange={setNw} type="password" />
      <AuthInput label="Re-enter new password" value={nw2} onChange={setNw2} type="password" />
      {msg && (
        <div className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
          {msg.text}
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold px-3.5 py-2"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Update
        </button>
        <button onClick={() => setOpen(false)} className="icon-btn">
          Cancel
        </button>
      </div>
    </div>
  )
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{children}</div>
  )
}

/** Full Name / Phone / Employee ID — saved instantly, no OTP needed. */
function ProfileEditForm({ account, onUpdate }: { account: AuthUser; onUpdate: (u: AuthUser) => void }) {
  const [fullName, setFullName] = useState(account.fullName)
  const [phone, setPhone] = useState(account.phone)
  const [employeeId, setEmployeeId] = useState(account.employeeId)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    setFullName(account.fullName)
    setPhone(account.phone)
    setEmployeeId(account.employeeId)
  }, [account.fullName, account.phone, account.employeeId])

  const dirty = fullName !== account.fullName || phone !== account.phone || employeeId !== account.employeeId

  const save = async () => {
    setMsg(null)
    if (!fullName.trim()) return setMsg({ ok: false, text: 'Full name cannot be empty.' })
    setBusy(true)
    try {
      const res = await authApi.updateProfile({ fullName, phone, employeeId })
      onUpdate(res.user)
      setMsg({ ok: true, text: 'Profile updated ✓' })
      window.setTimeout(() => setMsg(null), 1800)
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not update profile.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid sm:grid-cols-2 gap-2.5">
        <AuthInput label="Full Name" value={fullName} onChange={setFullName} />
        <AuthInput label="Phone Number" value={phone} onChange={setPhone} inputMode="tel" />
        <AuthInput label="Employee ID" value={employeeId} onChange={setEmployeeId} />
      </div>
      {msg && (
        <div className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
          {msg.text}
        </div>
      )}
      {dirty && (
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold px-3.5 py-2"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save changes
        </button>
      )}
    </div>
  )
}

/** Changing the email needs proof you own the NEW inbox — an OTP mailed to it. */
function EmailChangeForm({ account, onUpdate }: { account: AuthUser; onUpdate: (u: AuthUser) => void }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'edit' | 'otp'>('edit')
  const [newEmail, setNewEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [devOtp, setDevOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const reset = () => {
    setOpen(false)
    setStep('edit')
    setNewEmail('')
    setOtp('')
    setDevOtp('')
    setMsg(null)
  }

  const sendOtp = async () => {
    setMsg(null)
    setBusy(true)
    try {
      const res = await authApi.emailChangeOtp({ newEmail })
      setDevOtp(res.devOtp || '')
      setStep('otp')
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not send OTP.' })
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    setMsg(null)
    setBusy(true)
    try {
      const res = await authApi.emailChangeConfirm({ newEmail, otp })
      onUpdate(res.user)
      setMsg({ ok: true, text: 'Email updated ✓' })
      window.setTimeout(reset, 1400)
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Incorrect OTP.' })
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 self-start rounded-xl bg-white border border-[var(--hairline)] text-slate-700 text-sm font-semibold px-3.5 py-2 hover:bg-slate-50 transition"
      >
        <Pencil size={14} /> Change email
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--hairline)] p-3 flex flex-col gap-2.5 bg-slate-50/50">
      {step === 'edit' ? (
        <>
          <div className="text-xs text-slate-500">
            Current: <b className="text-slate-700">{account.email || '—'}</b>
          </div>
          <AuthInput label="New email" value={newEmail} onChange={setNewEmail} type="email" inputMode="email" placeholder="you@gmail.com" />
          {msg && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{msg.text}</div>}
          <div className="flex gap-2">
            <button
              onClick={sendOtp}
              disabled={busy || !newEmail.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold px-3.5 py-2"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />} Send OTP
            </button>
            <button onClick={reset} className="icon-btn">
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="text-xs text-slate-500">
            OTP sent to <b className="text-slate-700">{newEmail}</b>
          </div>
          {devOtp && (
            <InfoBox>
              Demo OTP: <b className="tracking-widest">{devOtp}</b> — email service not configured yet.
            </InfoBox>
          )}
          <AuthInput label="Enter OTP" value={otp} onChange={setOtp} inputMode="numeric" placeholder="123456" />
          {msg && (
            <div className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
              {msg.text}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={confirm}
              disabled={busy || otp.length < 6}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold px-3.5 py-2"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Confirm
            </button>
            <button onClick={() => setStep('edit')} className="icon-btn">
              Back
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function SettingsView({
  themePref,
  onThemePref,
  notifEnabled,
  onNotifEnabled,
  loopOn,
  onLoopOn,
  loopSeconds,
  onLoopSeconds,
  lang,
  onLang,
  deviceId,
  account,
  onAccountUpdate,
  onLogout,
  isAdmin,
  onOpenHistory,
  onOpenAbout,
}: {
  themePref: ThemePref
  onThemePref: (t: ThemePref) => void
  notifEnabled: boolean
  onNotifEnabled: (v: boolean) => void
  /** Omitted by the QA app, which has no dashboard to loop. */
  loopOn?: boolean
  onLoopOn?: (v: boolean) => void
  loopSeconds?: number
  onLoopSeconds?: (v: number) => void
  lang: LangPref
  onLang: (l: LangPref) => void
  deviceId: string
  account: AuthUser
  onAccountUpdate: (u: AuthUser) => void
  onLogout: () => void
  isAdmin: boolean
  onOpenHistory: () => void
  onOpenAbout: () => void
}) {
  const [fs, setFs] = useState(isFs())
  const t = useT()

  useEffect(() => {
    const sync = () => setFs(isFs())
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  return (
    <div className="flex flex-col gap-4 md:gap-5 max-w-3xl">
      <Section
        icon={(account.fullName || account.username || '?').slice(0, 1).toUpperCase()}
        title={
          <span className="inline-flex items-center gap-2">
            {account.fullName || account.username}
            {isAdmin && (
              <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded-md px-1.5 py-0.5 inline-flex items-center gap-1">
                <ShieldCheck size={11} /> ADMIN
              </span>
            )}
          </span>
        }
        desc={`@${account.username} · ${t('tap to view profile')}`}
        collapsible
        defaultOpen={false}
      >
        <ProfileEditForm account={account} onUpdate={onAccountUpdate} />

        <div className="grid sm:grid-cols-2 gap-2.5">
          <ProfileItem icon={<BadgeCheck size={15} />} label="User Name" value={`@${account.username}`} />
          <ProfileItem icon={<Mail size={15} />} label="Email" value={account.email || '-'} />
        </div>
        <EmailChangeForm account={account} onUpdate={onAccountUpdate} />

        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-[var(--hairline)] mt-1">
          <ChangePasswordForm />
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-red-200 text-red-600 text-sm font-semibold px-3.5 py-2 hover:bg-red-50 transition"
          >
            <LogOut size={15} /> {t('Sign out')}
          </button>
        </div>
        <div className="text-[11px] text-slate-400">Device ID: {deviceId}</div>
      </Section>

      <Section icon={<Bell size={20} />} title="Notifications" desc="Alerts for uploads, notes & meetings">
        <Row title="App notifications" desc="Sound, vibration and bell alerts when something changes.">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">{notifEnabled ? t('On') : t('Off')}</span>
            <Toggle on={notifEnabled} onChange={onNotifEnabled} />
          </div>
        </Row>
      </Section>

      {/* The meeting screen. One card at a time, advancing on its own — see lib/loop.ts. */}
      {onLoopOn && (
        <Section icon={<Repeat size={20} />} title="Loop" desc="Play the dashboard like a slideshow">
          <Row
            title="Loop the dashboard"
            desc="Shows one card at a time — Summary, Priority, Plan, Efficiency, Downtime, Machines — and moves through FG, CG, EG, IG, HO as it goes. Works in U1, U2, U3 and Assembly."
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">{loopOn ? t('On') : t('Off')}</span>
              <Toggle on={!!loopOn} onChange={onLoopOn} />
            </div>
          </Row>
          <Row title="Time on each card" desc="How long one card holds the screen before the next.">
            <Segmented<string>
              value={String(loopSeconds ?? DEFAULT_LOOP_SECONDS)}
              onChange={(v) => onLoopSeconds?.(Number(v))}
              options={LOOP_SECONDS.map((sec) => ({ val: String(sec), label: `${sec}s` }))}
            />
          </Row>
        </Section>
      )}

      <Section icon={<Monitor size={20} />} title="Appearance" desc="Theme and screen">
        <Row title="Theme">
          <Segmented<ThemePref>
            value={themePref}
            onChange={onThemePref}
            options={[
              { val: 'system', label: 'System', icon: <Laptop size={14} /> },
              { val: 'light', label: 'Light', icon: <Sun size={14} /> },
              { val: 'dark', label: 'Dark', icon: <Moon size={14} /> },
            ]}
          />
        </Row>
        <Row title="Full screen view" desc="Hide the browser bars for a bigger dashboard.">
          <button
            className={`inline-flex items-center gap-1.5 rounded-xl text-sm font-semibold px-3.5 py-2 shadow-sm transition shrink-0 ${
              fs
                ? 'bg-white border border-[var(--hairline)] text-slate-700 hover:bg-slate-50'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
            onClick={() => (fs ? exitFs() : enterFs())}
          >
            {fs ? (
              <>
                <Minimize2 size={15} /> {t('Exit')}
              </>
            ) : (
              <>
                <Maximize2 size={15} /> {t('Enter')}
              </>
            )}
          </button>
        </Row>
      </Section>

      <Section icon={<Languages size={20} />} title={t('Language')} desc={t('Choose your app language')}>
        <LanguageSelector value={lang} onChange={onLang} />
      </Section>

      <button
        onClick={onOpenAbout}
        className="bento rise flex items-center gap-3 px-4 md:px-5 py-4 text-left hover:bg-slate-50/60 transition w-full"
      >
        <div className="w-9 h-9 rounded-xl grid place-items-center grad-violet text-white shrink-0">
          <Sparkles size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-slate-800">{t('About Application')}</div>
          <div className="text-xs text-slate-500 truncate">
            {t('Open a detailed page with app overview, features and usage information')}
          </div>
        </div>
        <ChevronRight size={18} className="text-slate-400 shrink-0" />
      </button>

      {isAdmin && (
        <button
          onClick={onOpenHistory}
          className="bento rise flex items-center gap-3 px-4 md:px-5 py-4 text-left hover:bg-slate-50/60 transition w-full"
        >
          <div className="w-9 h-9 rounded-xl grid place-items-center grad-violet text-white shrink-0">
            <Users size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-slate-800">{t('User Activity')}</div>
            <div className="text-xs text-slate-500 truncate">{t('Users, logins, imports, deletes, to-dos and meetings')}</div>
          </div>
          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-md px-1.5 py-0.5 shrink-0">
            ADMIN
          </span>
          <ChevronRight size={18} className="text-slate-400 shrink-0" />
        </button>
      )}

      <div className="text-[11px] text-slate-400 px-1">Morning Meeting · v1.0 · Bento UI</div>
    </div>
  )
}
