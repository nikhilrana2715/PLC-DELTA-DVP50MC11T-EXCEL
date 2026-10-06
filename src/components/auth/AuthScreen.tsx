import { useState } from 'react'
import {
  Factory,
  User,
  Lock,
  Mail,
  Phone,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  KeyRound,
  LogIn,
  UserPlus,
  ShieldCheck,
  Loader2,
  BadgeCheck,
} from 'lucide-react'
import { authApi, qaApi, setToken, type AuthUser } from '../../lib/auth'
import { useT } from '../../lib/i18n'

type Mode = 'start' | 'choose' | 'login' | 'register' | 'forgot'

const GRAD = 'linear-gradient(150deg,#4f46e5,#7c3aed 55%,#db2777)'

function newCaptcha() {
  const c = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 5 }, () => c[Math.floor(Math.random() * c.length)]).join('')
}

function Field({
  icon,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  autoComplete,
  inputMode,
}: {
  icon: React.ReactNode
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  autoComplete?: string
  inputMode?: 'text' | 'numeric' | 'email' | 'tel'
}) {
  const t = useT()
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-white/85">{t(label)}</span>
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-3 focus-within:border-white/50 focus-within:bg-white/15 focus-within:ring-2 focus-within:ring-white/20 transition">
        <span className="text-white/60 shrink-0">{icon}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          className="flex-1 min-w-0 bg-transparent outline-none py-2.5 text-sm text-white placeholder-white/45"
        />
      </div>
    </label>
  )
}

function PwField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
}) {
  const [show, setShow] = useState(false)
  const t = useT()
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-white/85">{t(label)}</span>
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-3 focus-within:border-white/50 focus-within:bg-white/15 focus-within:ring-2 focus-within:ring-white/20 transition">
        <Lock size={16} className="text-white/60 shrink-0" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          className="flex-1 min-w-0 bg-transparent outline-none py-2.5 text-sm text-white placeholder-white/45"
        />
        <button type="button" onClick={() => setShow((s) => !s)} className="text-white/60 hover:text-white shrink-0">
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </label>
  )
}

function Primary({
  children,
  onClick,
  loading,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  loading?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500/90 hover:bg-indigo-500 ring-1 ring-white/25 disabled:opacity-60 text-white font-semibold px-4 py-3 shadow-lg shadow-indigo-950/40 transition"
    >
      {loading ? <Loader2 size={18} className="animate-spin" /> : children}
    </button>
  )
}

function Alert({ msg }: { msg: string }) {
  return <div className="text-sm text-red-50 bg-red-500/25 ring-1 ring-red-300/35 rounded-lg px-3 py-2">{msg}</div>
}
function Info({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-amber-50 bg-amber-400/20 ring-1 ring-amber-200/35 rounded-lg px-3 py-2">{children}</div>
  )
}

export function AuthScreen({
  onAuthed,
  variant = 'user',
}: {
  onAuthed: (u: AuthUser) => void
  /** 'qa' swaps the login/register endpoints to the QA door (same UI, different accounts). */
  variant?: 'user' | 'qa'
}) {
  const isQa = variant === 'qa'
  const t = useT()
  const [mode, setMode] = useState<Mode>(isQa ? 'login' : 'start')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // Plant photo behind the branding panel; falls back to the plain gradient if absent.
  const [photoOk, setPhotoOk] = useState(true)

  // register
  const [rFull, setRFull] = useState('')
  const [rUser, setRUser] = useState('')
  const [rPw, setRPw] = useState('')
  const [rPw2, setRPw2] = useState('')
  const [rEmail, setREmail] = useState('')
  const [rPhone, setRPhone] = useState('')
  const [rEmp, setREmp] = useState('')
  const [rOtp, setROtp] = useState('')
  const [rStep, setRStep] = useState<'form' | 'otp'>('form')
  const [rDev, setRDev] = useState('')

  // login
  const [lUser, setLUser] = useState('')
  const [lPw, setLPw] = useState('')
  const [captcha, setCaptcha] = useState(newCaptcha)
  const [lCap, setLCap] = useState('')

  // forgot
  const [fUser, setFUser] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fOtp, setFOtp] = useState('')
  const [fPw, setFPw] = useState('')
  const [fStep, setFStep] = useState<'verify' | 'reset'>('verify')
  const [fMethod, setFMethod] = useState<'email' | 'totp'>('email')
  const [fDev, setFDev] = useState('')

  const go = (m: Mode) => {
    setErr('')
    setMode(m)
  }

  /**
   * Enter submits the step you're on (desktop convenience). Attached to each step's
   * wrapper so a keypress inside any of its inputs runs that step's primary action.
   */
  const onEnter = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    const el = e.target as HTMLElement
    if (el.tagName === 'TEXTAREA' || el.tagName === 'BUTTON' || el.tagName === 'A') return
    e.preventDefault()
    if (!busy) fn()
  }
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

  // ---- actions ----
  const sendRegOtp = () =>
    wrap(async () => {
      if (!rFull.trim()) throw new Error('Please enter your full name.')
      if (rPw !== rPw2) throw new Error('Passwords do not match.')
      if (rPw.length < 6) throw new Error('Password must be at least 6 characters.')
      if (!rEmail.trim()) throw new Error('Please enter your email.')
      const res = await authApi.registerOtp({ username: rUser, email: rEmail })
      setRDev(res.devOtp || '')
      setRStep('otp')
    })
  const doRegister = () =>
    wrap(async () => {
      const payload = {
        fullName: rFull,
        username: rUser,
        password: rPw,
        email: rEmail,
        phone: rPhone,
        otp: rOtp,
        employeeId: rEmp,
      }
      const res = isQa ? await qaApi.register(payload) : await authApi.register(payload)
      setToken(res.token)
      onAuthed(res.user)
    })
  const doLogin = () =>
    wrap(async () => {
      if (lCap.trim().toUpperCase() !== captcha) {
        setCaptcha(newCaptcha())
        setLCap('')
        throw new Error('Captcha does not match.')
      }
      const res = isQa
        ? await qaApi.login({ username: lUser, password: lPw })
        : await authApi.login({ username: lUser, password: lPw })
      setToken(res.token)
      onAuthed(res.user)
    })
  const sendForgotOtp = () =>
    wrap(async () => {
      const res = await authApi.forgotVerify({ username: fUser, email: fEmail })
      setFMethod(res.method)
      setFDev(res.devOtp || '')
      setFStep('reset')
    })
  const doReset = () =>
    wrap(async () => {
      await authApi.reset({ username: fUser, otp: fOtp, password: fPw })
      setFStep('verify')
      setFOtp('')
      setFPw('')
      go('login')
      setErr('')
      setLUser(fUser)
    })

  return (
    <div className="min-h-screen w-full relative" style={{ background: GRAD }}>
      {/* Full-screen plant photo behind BOTH halves, under a brand-tinted scrim: heavier
          on the left so the white copy reads, lighter on the right where the (frosted)
          form card supplies its own contrast. No photo → the brand gradient shows. */}
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
                'linear-gradient(100deg, rgba(49,29,122,0.90) 0%, rgba(76,45,158,0.66) 38%, rgba(124,58,237,0.34) 62%, rgba(219,39,119,0.28) 100%),' +
                'linear-gradient(180deg, rgba(9,7,28,0.34) 0%, rgba(9,7,28,0.18) 40%, rgba(9,7,28,0.62) 100%)',
            }}
          />
        </>
      )}

      <div className="relative min-h-screen w-full grid lg:grid-cols-2">
      {/* Branding panel (desktop) — sits directly on the shared background. */}
      <div className="hidden lg:flex flex-col justify-between p-10 xl:p-14 text-white relative">
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl grid place-items-center bg-white/15 backdrop-blur ring-1 ring-white/20">
            <Factory size={26} />
          </div>
          <div>
            <div className="text-xl font-extrabold leading-tight drop-shadow-sm">{t('Morning Meeting')}</div>
            <div className="text-sm text-white/80">{t('Production Dashboard')}</div>
          </div>
        </div>

        <div className="relative z-10">
          <h1 className="text-4xl xl:text-5xl font-extrabold leading-tight" style={{ textShadow: '0 2px 18px rgba(0,0,0,0.45)' }}>
            {t('Run a sharper morning meeting.')}
          </h1>
          <p className="mt-4 text-white/90 text-lg max-w-md" style={{ textShadow: '0 1px 10px rgba(0,0,0,0.45)' }}>
            {t('Upload the shift report, see every machine below target first, and act on the biggest losses — on any device.')}
          </p>
          <div className="mt-8 flex flex-col gap-2.5">
            {['Shift 1 & Shift 2 side by side', 'Priority machines & repeating issues', 'Notes, remarks & meeting history'].map(
              (f) => (
                <div
                  key={f}
                  className="inline-flex items-center gap-2 self-start rounded-lg bg-white/10 backdrop-blur-sm ring-1 ring-white/15 px-3 py-1.5"
                >
                  <CheckCircle2 size={16} className="shrink-0" /> <span className="text-sm font-medium">{t(f)}</span>
                </div>
              ),
            )}
          </div>
        </div>

        <div className="relative z-10 text-xs text-white/60">v1.0 · Bento UI</div>
      </div>

      {/* Form panel — liquid-glass card: the photo stays visible through it, a blurred
          + saturated backdrop keeps the text crisp, and a top specular sheen sells the glass. */}
      <div className="flex items-center justify-center p-4 sm:p-6 md:p-8">
        <div
          className="relative w-full max-w-md rounded-3xl overflow-hidden ring-1 ring-white/25 my-6"
          style={{
            background:
              'linear-gradient(160deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.07) 45%, rgba(255,255,255,0.13) 100%)',
            backdropFilter: 'blur(28px) saturate(160%)',
            WebkitBackdropFilter: 'blur(28px) saturate(160%)',
            boxShadow: '0 20px 60px rgba(9,7,28,0.45), inset 0 1px 0 rgba(255,255,255,0.35)',
          }}
        >
          {/* specular highlight along the top edge */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-28"
            style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.22), transparent)' }}
          />

          <div className="relative p-6 sm:p-7 md:p-8">
          {/* mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-2xl grid place-items-center text-white shrink-0 ring-1 ring-white/25" style={{ background: GRAD }}>
              <Factory size={22} />
            </div>
            <div>
              <div className="font-extrabold text-white leading-tight">{t('Morning Meeting')}</div>
              <div className="text-xs text-white/70">{t('Production Dashboard')}</div>
            </div>
          </div>

          {/* ---- START ---- */}
          {mode === 'start' && (
            <div className="rise" onKeyDown={onEnter(() => go('choose'))}>
              <h2 className="text-2xl md:text-3xl font-extrabold text-white">{t('Welcome 👋')}</h2>
              <p className="mt-2 text-white/70">{t("Your factory's morning meeting, organized. Let's get you signed in.")}</p>
              <div className="mt-8">
                <Primary onClick={() => go('choose')}>
                  {t('Get Started')} <ArrowRight size={18} />
                </Primary>
              </div>
            </div>
          )}

          {/* ---- CHOOSE ---- */}
          {mode === 'choose' && (
            <div className="rise" onKeyDown={onEnter(() => go('login'))}>
              <h2 className="text-2xl font-extrabold text-white">{t('Continue')}</h2>
              <p className="mt-2 text-white/70">{t('Log in to your account, or create a new one.')}</p>
              <div className="mt-8 flex flex-col gap-3">
                <Primary onClick={() => go('login')}>
                  <LogIn size={18} /> {t('Login')}
                </Primary>
                <button
                  onClick={() => go('register')}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white/12 ring-1 ring-white/25 hover:bg-white/20 text-white font-semibold px-4 py-3 shadow-lg shadow-indigo-950/30 transition"
                >
                  <UserPlus size={18} /> {t('Register')}
                </button>
              </div>
              <button onClick={() => go('start')} className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-white/75 hover:text-white">
                <ArrowLeft size={16} /> {t('Back')}
              </button>
            </div>
          )}

          {/* ---- LOGIN ---- */}
          {mode === 'login' && (
            <div className="rise flex flex-col gap-4" onKeyDown={onEnter(doLogin)}>
              <div>
                <h2 className="text-2xl font-extrabold text-white">{isQa ? t('QA Login') : t('Login')}</h2>
                <p className="mt-1 text-white/70 text-sm">
                  {isQa ? t('Quality portal — sign in to upload reports.') : t('Welcome back — enter your details.')}
                </p>
              </div>
              {err && <Alert msg={err} />}
              <Field icon={<User size={16} />} label="User Name" value={lUser} onChange={setLUser} autoComplete="username" placeholder="nikhil123" />
              <PwField label="Password" value={lPw} onChange={setLPw} autoComplete="current-password" />
              {/* captcha */}
              <div>
                <span className="text-[13px] font-semibold text-white/85">{t('Captcha')}</span>
                <div className="mt-1 flex items-center gap-2">
                  {/* Kept high-contrast on purpose — a captcha has to stay easy to read. */}
                  <div
                    className="select-none px-4 py-2.5 rounded-xl font-extrabold text-lg tracking-[0.35em] text-slate-800 ring-1 ring-white/40"
                    style={{
                      background: 'repeating-linear-gradient(45deg,rgba(255,255,255,0.92),rgba(255,255,255,0.92) 6px,rgba(224,231,255,0.92) 6px,rgba(224,231,255,0.92) 12px)',
                      fontStyle: 'italic',
                      textDecoration: 'line-through',
                    }}
                  >
                    {captcha}
                  </div>
                  <button
                    type="button"
                    onClick={() => setCaptcha(newCaptcha())}
                    className="w-10 h-10 grid place-items-center rounded-xl border border-white/25 bg-white/10 text-white/70 hover:bg-white/20 shrink-0"
                    title="New captcha"
                  >
                    <RefreshCw size={16} />
                  </button>
                  <input
                    value={lCap}
                    onChange={(e) => setLCap(e.target.value.toUpperCase())}
                    placeholder={t('Type it')}
                    className="flex-1 min-w-0 rounded-xl border border-white/25 bg-white/10 px-3 py-2.5 text-sm text-white placeholder-white/45 outline-none focus:border-white/50 focus:bg-white/15 focus:ring-2 focus:ring-white/20 uppercase tracking-wider"
                  />
                </div>
              </div>
              <Primary onClick={doLogin} loading={busy}>
                <LogIn size={18} /> {t('Login')}
              </Primary>
              <div className="flex items-center justify-between text-sm">
                <button onClick={() => go('forgot')} className="font-semibold text-indigo-200 hover:text-white">
                  {t('Forgot password?')}
                </button>
                <button onClick={() => go('register')} className="font-semibold text-white/75 hover:text-white">
                  {t('Create account')}
                </button>
              </div>
              <div className="pt-1 border-t border-white/20">
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => (isQa ? (window.location.hash = '') : go('choose'))}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/60 hover:text-white mt-3"
                  >
                    <ArrowLeft size={16} /> {t('Back')}
                  </button>
                  {!isQa && (
                    <a
                      href="#admin-login"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/75 hover:text-white mt-3"
                      title="Admins sign in on a separate page"
                    >
                      <ShieldCheck size={15} /> {t('Admin login')}
                    </a>
                  )}
                </div>
                {/* QA login — left side, below the Back button (user door only).
                    Kept plain & muted so it doesn't stand out. */}
                {!isQa && (
                  <div className="mt-2">
                    <a
                      href="#qa-login"
                      className="text-sm font-semibold text-white/60 hover:text-white"
                      title="Quality (QA) team signs in on a separate page"
                    >
                      QA
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---- REGISTER ---- */}
          {mode === 'register' && rStep === 'form' && (
            <div className="rise flex flex-col gap-3.5" onKeyDown={onEnter(sendRegOtp)}>
              <div>
                <h2 className="text-2xl font-extrabold text-white">{t('Create account')}</h2>
                <p className="mt-1 text-white/70 text-sm">{t("We'll send an OTP to your phone to verify.")}</p>
              </div>
              {err && <Alert msg={err} />}
              <Field icon={<User size={16} />} label="Full Name" value={rFull} onChange={setRFull} placeholder="Nikhil Rana" autoComplete="name" />
              <Field icon={<User size={16} />} label="Unique User Name" value={rUser} onChange={setRUser} placeholder="nikhil123" autoComplete="username" />
              <PwField label="Create Password" value={rPw} onChange={setRPw} autoComplete="new-password" />
              <PwField label="Re-enter Password" value={rPw2} onChange={setRPw2} autoComplete="new-password" />
              <Field icon={<Mail size={16} />} label="Email" value={rEmail} onChange={setREmail} type="email" placeholder="abcd@gmail.com" inputMode="email" autoComplete="email" />
              <Field icon={<Phone size={16} />} label="Phone Number" value={rPhone} onChange={setRPhone} inputMode="tel" placeholder="9876543210" autoComplete="tel" />
              <Field icon={<BadgeCheck size={16} />} label="Employee ID (optional)" value={rEmp} onChange={setREmp} placeholder="EMP-001" />
              <Primary onClick={sendRegOtp} loading={busy}>
                {t('Send OTP')} <ArrowRight size={18} />
              </Primary>
              <button onClick={() => go(isQa ? 'login' : 'choose')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/60 hover:text-white">
                <ArrowLeft size={16} /> {t('Back')}
              </button>
            </div>
          )}
          {mode === 'register' && rStep === 'otp' && (
            <div className="rise flex flex-col gap-4" onKeyDown={onEnter(doRegister)}>
              <div>
                <h2 className="text-2xl font-extrabold text-white">{t('Verify your email')}</h2>
                <p className="mt-1 text-white/70 text-sm">
                  {t('Enter the 6-digit OTP sent to')} <b>{rEmail}</b>.
                </p>
              </div>
              {err && <Alert msg={err} />}
              {rDev && (
                <Info>
                  Demo OTP: <b className="tracking-widest">{rDev}</b> — email service not configured yet, so it's shown
                  here.
                </Info>
              )}
              <Field icon={<KeyRound size={16} />} label="Enter OTP" value={rOtp} onChange={setROtp} inputMode="numeric" placeholder="123456" />
              <Primary onClick={doRegister} loading={busy}>
                <ShieldCheck size={18} /> {t('Register')}
              </Primary>
              <div className="flex items-center justify-between text-sm">
                <button onClick={() => setRStep('form')} className="inline-flex items-center gap-1.5 font-semibold text-white/60 hover:text-white">
                  <ArrowLeft size={16} /> {t('Edit details')}
                </button>
                <button onClick={sendRegOtp} className="font-semibold text-indigo-200 hover:text-white" disabled={busy}>
                  {t('Resend OTP')}
                </button>
              </div>
            </div>
          )}

          {/* ---- FORGOT ---- */}
          {mode === 'forgot' && fStep === 'verify' && (
            <div className="rise flex flex-col gap-4" onKeyDown={onEnter(sendForgotOtp)}>
              <div>
                <h2 className="text-2xl font-extrabold text-white">{t('Forgot password')}</h2>
                <p className="mt-1 text-white/70 text-sm">{t('Verify your account to reset the password.')}</p>
              </div>
              {err && <Alert msg={err} />}
              <Field icon={<User size={16} />} label="User Name" value={fUser} onChange={setFUser} placeholder="nikhil123" />
              <Field icon={<Mail size={16} />} label="Email ID" value={fEmail} onChange={setFEmail} type="email" inputMode="email" placeholder="abcd@gmail.com" />
              <Primary onClick={sendForgotOtp} loading={busy}>
                {t('Verify')} <ArrowRight size={18} />
              </Primary>
              <button onClick={() => go('login')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/60 hover:text-white">
                <ArrowLeft size={16} /> {t('Back to login')}
              </button>
            </div>
          )}
          {mode === 'forgot' && fStep === 'reset' && (
            <div className="rise flex flex-col gap-4" onKeyDown={onEnter(doReset)}>
              <div>
                <h2 className="text-2xl font-extrabold text-white">{t('Reset password')}</h2>
                <p className="mt-1 text-white/70 text-sm">
                  {fMethod === 'totp' ? (
                    <>Open your <b>Authenticator app</b>, enter the current 6-digit code and a new password.</>
                  ) : (
                    <>Enter the 6-digit OTP sent to <b>{fEmail}</b> and a new password.</>
                  )}
                </p>
              </div>
              {err && <Alert msg={err} />}
              {fDev && (
                <Info>
                  Demo OTP: <b className="tracking-widest">{fDev}</b> — email service not configured yet.
                </Info>
              )}
              <Field icon={<KeyRound size={16} />} label="Enter OTP" value={fOtp} onChange={setFOtp} inputMode="numeric" placeholder="123456" />
              <PwField label="Create New Password" value={fPw} onChange={setFPw} autoComplete="new-password" />
              <Primary onClick={doReset} loading={busy}>
                <CheckCircle2 size={18} /> {t('Reset & Login')}
              </Primary>
              <button onClick={() => setFStep('verify')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/60 hover:text-white">
                <ArrowLeft size={16} /> {t('Back')}
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
