import { useState } from 'react'
import {
  ShieldCheck,
  User,
  Lock,
  Mail,
  Phone,
  BadgeCheck,
  KeyRound,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  LogIn,
  UserPlus,
  Loader2,
} from 'lucide-react'
import { adminApi, setToken, type AuthUser } from '../../lib/auth'
import { QrCode } from './QrCode'

const GRAD = 'linear-gradient(150deg,#0f172a,#1e1b4b 55%,#4c1d95)'

function Field({
  icon,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  inputMode,
}: {
  icon: React.ReactNode
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  inputMode?: 'text' | 'numeric' | 'email' | 'tel'
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-white/85">{label}</span>
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-3 focus-within:border-white/50 focus-within:bg-white/15 focus-within:ring-2 focus-within:ring-white/20 transition">
        <span className="text-white/60 shrink-0">{icon}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={type}
          placeholder={placeholder}
          inputMode={inputMode}
          className="flex-1 min-w-0 bg-transparent outline-none py-2.5 text-sm text-white placeholder-white/45"
        />
      </div>
    </label>
  )
}

function PwField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false)
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-white/85">{label}</span>
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-3 focus-within:border-white/50 focus-within:bg-white/15 focus-within:ring-2 focus-within:ring-white/20 transition">
        <Lock size={16} className="text-white/60 shrink-0" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={show ? 'text' : 'password'}
          className="flex-1 min-w-0 bg-transparent outline-none py-2.5 text-sm text-white placeholder-white/45"
        />
        <button type="button" onClick={() => setShow((s) => !s)} className="text-white/60 hover:text-white shrink-0">
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </label>
  )
}

/**
 * The separate Admin door (#admin-login). Kept apart from the user login so admin
 * credentials never share a screen with everyday sign-ins.
 */
export function AdminAuthScreen({ onAuthed }: { onAuthed: (u: AuthUser) => void }) {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Same plant photo as the user door; falls back to the dark gradient if absent.
  const [photoOk, setPhotoOk] = useState(true)

  const [lu, setLu] = useState('')
  const [lp, setLp] = useState('')
  const [lEmail, setLEmail] = useState('')
  const [lOtp, setLOtp] = useState('')

  const [rFull, setRFull] = useState('')
  const [rUser, setRUser] = useState('')
  const [rPw, setRPw] = useState('')
  const [rPw2, setRPw2] = useState('')
  const [rEmail, setREmail] = useState('')
  const [rPhone, setRPhone] = useState('')
  const [rEmp, setREmp] = useState('')
  const [rOtp, setROtp] = useState('')
  const [rStep, setRStep] = useState<'form' | 'otp'>('form')
  const [rSecret, setRSecret] = useState('')
  const [rQr, setRQr] = useState('')

  const wrap = async (fn: () => Promise<void>) => {
    setErr('')
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  /** Enter submits the step you're on (same behaviour as the user/QA login). */
  const onEnter = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    const el = e.target as HTMLElement
    if (el.tagName === 'TEXTAREA' || el.tagName === 'BUTTON' || el.tagName === 'A') return
    e.preventDefault()
    if (!busy) fn()
  }

  const doLogin = () =>
    wrap(async () => {
      const res = await adminApi.login({ username: lu, password: lp, email: lEmail, otp: lOtp })
      setToken(res.token)
      onAuthed(res.user)
    })

  const startTotp = () =>
    wrap(async () => {
      if (!rFull.trim()) throw new Error('Please enter the full name.')
      if (rPw !== rPw2) throw new Error('Passwords do not match.')
      if (rPw.length < 10) throw new Error('Admin password must be at least 10 characters.')
      if (!rEmail.trim()) throw new Error('Please enter an email.')
      const res = await adminApi.registerTotp({ username: rUser, email: rEmail })
      setRSecret(res.secret)
      setRQr(res.otpauthUrl)
      setRStep('otp')
    })

  const doRegister = () =>
    wrap(async () => {
      const res = await adminApi.register({
        fullName: rFull,
        username: rUser,
        password: rPw,
        email: rEmail,
        phone: rPhone,
        otp: rOtp,
        employeeId: rEmp,
      })
      setToken(res.token)
      onAuthed(res.user)
    })

  return (
    <div className="min-h-screen w-full relative" style={{ background: GRAD }}>
      {/* Same full-screen plant photo as the user door, but under a much darker scrim so
          this still reads as the restricted entrance. */}
      {photoOk && (
        <>
          <img
            src="/company.jpg"
            alt=""
            aria-hidden="true"
            className="fixed inset-0 w-full h-full object-cover"
            style={{ objectPosition: "50% 62%" }}
            onError={() => setPhotoOk(false)}
          />
          <div
            className="fixed inset-0"
            style={{
              background:
                'linear-gradient(100deg, rgba(10,12,32,0.94) 0%, rgba(22,18,62,0.82) 38%, rgba(40,25,95,0.62) 62%, rgba(60,30,110,0.55) 100%),' +
                'linear-gradient(180deg, rgba(5,5,18,0.45) 0%, rgba(5,5,18,0.30) 40%, rgba(5,5,18,0.72) 100%)',
            }}
          />
        </>
      )}

      <div className="relative min-h-screen w-full grid lg:grid-cols-2">
      {/* Branding (desktop) */}
      <div className="hidden lg:flex flex-col justify-between p-10 xl:p-14 text-white relative">
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl grid place-items-center bg-white/15 backdrop-blur ring-1 ring-white/20">
            <ShieldCheck size={26} />
          </div>
          <div>
            <div className="text-xl font-extrabold leading-tight drop-shadow-sm">Admin Console</div>
            <div className="text-sm text-white/70">Morning Meeting</div>
          </div>
        </div>
        <div className="relative z-10">
          <h1 className="text-4xl xl:text-5xl font-extrabold leading-tight" style={{ textShadow: '0 2px 18px rgba(0,0,0,0.5)' }}>
            Restricted access.
          </h1>
          <p className="mt-4 text-white/85 text-lg max-w-md" style={{ textShadow: '0 1px 10px rgba(0,0,0,0.5)' }}>
            Admins can edit the machine register, correct shift data and remove reports. Everyone else stays read-only.
          </p>
          <div className="mt-8 flex flex-col gap-2.5">
            {['Separate door from the user login', '10-character password minimum', '2-factor: email + Authenticator code'].map((f) => (
              <div
                key={f}
                className="inline-flex items-center gap-2 self-start rounded-lg bg-white/10 backdrop-blur-sm ring-1 ring-white/15 px-3 py-1.5"
              >
                <ShieldCheck size={15} className="shrink-0" /> <span className="text-sm font-medium">{f}</span>
              </div>
            ))}
          </div>
        </div>
        <a href="#login" className="relative z-10 text-xs text-white/60 hover:text-white">
          ← Back to user login
        </a>
      </div>

      {/* Form — liquid-glass card */}
      <div className="flex items-center justify-center p-4 sm:p-6 md:p-8">
        <div
          className="relative w-full max-w-md rounded-3xl overflow-hidden ring-1 ring-white/25 my-6"
          style={{
            background:
              'linear-gradient(160deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 45%, rgba(255,255,255,0.11) 100%)',
            backdropFilter: 'blur(28px) saturate(160%)',
            WebkitBackdropFilter: 'blur(28px) saturate(160%)',
            boxShadow: '0 20px 60px rgba(5,5,18,0.55), inset 0 1px 0 rgba(255,255,255,0.32)',
          }}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-28"
            style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.20), transparent)' }}
          />

          <div className="relative p-6 sm:p-7 md:p-8">
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-2xl grid place-items-center text-white shrink-0 ring-1 ring-white/25" style={{ background: GRAD }}>
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="font-extrabold text-white leading-tight">Admin Console</div>
              <div className="text-xs text-white/70">Restricted access</div>
            </div>
          </div>

          <div className="inline-flex rounded-xl bg-white/10 ring-1 ring-white/20 p-1 mb-5">
            {(['login', 'register'] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t)
                  setErr('')
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  tab === t ? 'bg-white/90 text-slate-900 shadow-sm' : 'text-white/75 hover:text-white'
                }`}
              >
                {t === 'login' ? <LogIn size={14} /> : <UserPlus size={14} />}
                {t === 'login' ? 'Admin Login' : 'Register Admin'}
              </button>
            ))}
          </div>

          {err && <div className="text-sm text-red-50 bg-red-500/25 ring-1 ring-red-300/35 rounded-lg px-3 py-2 mb-3">{err}</div>}

          {tab === 'login' && (
            <div className="rise flex flex-col gap-4" onKeyDown={onEnter(doLogin)}>
              <Field icon={<User size={16} />} label="User Name" value={lu} onChange={setLu} placeholder="admin123" />
              <PwField label="Password" value={lp} onChange={setLp} />
              <Field icon={<Mail size={16} />} label="Email" value={lEmail} onChange={setLEmail} type="email" inputMode="email" placeholder="admin@gmail.com" />
              <Field icon={<KeyRound size={16} />} label="OTP (from Authenticator)" value={lOtp} onChange={setLOtp} inputMode="numeric" placeholder="123456" />
              <button
                onClick={doLogin}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900/70 hover:bg-slate-900/85 ring-1 ring-white/25 disabled:opacity-60 text-white font-semibold px-4 py-3 shadow-lg shadow-black/40 transition"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />} Admin Login
              </button>
              <a href="#login" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/60 hover:text-white">
                <ArrowLeft size={16} /> Back to user login
              </a>
            </div>
          )}

          {tab === 'register' && rStep === 'form' && (
            <div className="rise flex flex-col gap-3.5" onKeyDown={onEnter(startTotp)}>
              <Field icon={<User size={16} />} label="Full Name" value={rFull} onChange={setRFull} placeholder="Nikhil Rana" />
              <Field icon={<User size={16} />} label="Admin User Name" value={rUser} onChange={setRUser} placeholder="admin123" />
              <PwField label="Create Password (min 10 chars)" value={rPw} onChange={setRPw} />
              <PwField label="Re-enter Password" value={rPw2} onChange={setRPw2} />
              <Field icon={<Mail size={16} />} label="Email" value={rEmail} onChange={setREmail} type="email" inputMode="email" placeholder="admin@gmail.com" />
              <Field icon={<Phone size={16} />} label="Phone Number" value={rPhone} onChange={setRPhone} inputMode="tel" placeholder="9876543210" />
              <Field icon={<BadgeCheck size={16} />} label="Employee ID (optional)" value={rEmp} onChange={setREmp} placeholder="ADM-001" />
              <button
                onClick={startTotp}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900/70 hover:bg-slate-900/85 ring-1 ring-white/25 disabled:opacity-60 text-white font-semibold px-4 py-3 shadow-lg shadow-black/40 transition"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />} Continue
              </button>
              <a href="#login" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/60 hover:text-white">
                <ArrowLeft size={16} /> Back to user login
              </a>
            </div>
          )}

          {tab === 'register' && rStep === 'otp' && (
            <div className="rise flex flex-col gap-4" onKeyDown={onEnter(doRegister)}>
              <p className="text-white/75 text-sm">Scan the QR code, then enter the 6-digit code.</p>
              <div className="flex gap-4 items-start">
                <QrCode value={rQr} />
                <div className="min-w-0 text-sm text-white/80 flex flex-col gap-2">
                  <div className="text-xs text-white/65">Can't scan? Add the key manually:</div>
                  <code className="text-[11px] font-bold text-white bg-white/12 ring-1 ring-white/20 rounded-lg px-2 py-1.5 break-all leading-relaxed">
                    {rSecret}
                  </code>
                  <div className="text-xs text-white/55">Account: {rEmail}</div>
                </div>
              </div>
              <Field icon={<KeyRound size={16} />} label="Enter OTP (from Authenticator)" value={rOtp} onChange={setROtp} inputMode="numeric" placeholder="123456" />
              <button
                onClick={doRegister}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900/70 hover:bg-slate-900/85 ring-1 ring-white/25 disabled:opacity-60 text-white font-semibold px-4 py-3 shadow-lg shadow-black/40 transition"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />} Register Admin
              </button>
              <button onClick={() => setRStep('form')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/60 hover:text-white self-start">
                <ArrowLeft size={16} /> Edit details
              </button>
            </div>
          )}
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
